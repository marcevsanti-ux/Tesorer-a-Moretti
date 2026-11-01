import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { syncReclamos } from './sync-reclamos.js';

const PORT = Number(process.env.PORT || 3100);
const TOKEN = process.env.MCP_API_TOKEN || '';
const ACCOUNT_TOKEN = process.env.MCP_ACCOUNT_TOKEN || '';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PROTOCOL_VERSION = '2025-03-26';

const tools = [
  { name: 'moretti_buscar_ot', description: 'Consulta órdenes de trabajo de Mesa de Ayuda por número de OS o nombre de cliente. Solo lectura; nunca accede a usuarios ni contraseñas.', annotations: { readOnlyHint: true }, inputSchema: { type:'object', properties:{ numero:{type:'string'}, cliente:{type:'string'}, limite:{type:'integer',minimum:1,maximum:30} }, additionalProperties:false } },
  { name: 'moretti_listar_ot', description: 'Lista órdenes de trabajo con filtros opcionales de estado y subestado, solo lectura.', annotations:{readOnlyHint:true}, inputSchema:{type:'object',properties:{estado:{type:'string'},subestado:{type:'string'},limite:{type:'integer',minimum:1,maximum:50}},additionalProperties:false} },
  { name: 'moretti_reclamos_ot', description: 'Consulta reclamos asociados a órdenes de trabajo por ID de OT, estado o prioridad, solo lectura.',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{ot_id:{type:'string'},estado:{type:'string'},prioridad:{type:'string'},limite:{type:'integer',minimum:1,maximum:50}},additionalProperties:false} },
  { name: 'moretti_seguimientos_ot', description: 'Consulta seguimientos por ot_id (UUID o número de OS, ej. 71541, OS-00071541) o reclamo_id (UUID). Resuelve automáticamente el número de OS a su ID interno. Solo lectura.',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{ot_id:{type:'string'},reclamo_id:{type:'string'},limite:{type:'integer',minimum:1,maximum:50}},additionalProperties:false} },
  { name: 'moretti_estado_conexion', description: 'Verifica disponibilidad del conector Moretti sin revelar credenciales.', annotations: { readOnlyHint: true }, _meta: { puentes: { account: false } }, inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'moretti_contar_reclamos', description: 'Devuelve la cantidad total de reclamos CRM registrados en Supabase; permite filtrar por estado.', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: { estado: { type: 'string' } }, additionalProperties: false } },
  { name: 'moretti_listar_reclamos', description: 'Consulta reclamos CRM sincronizados desde Google Sheets (solo lectura). Admite estado y límite de resultados.', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: { estado: { type: 'string' }, limite: { type: 'integer', minimum: 1, maximum: 50 } }, additionalProperties: false } }
];

function json(res, status, body, extra = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra });
  res.end(JSON.stringify(body));
}
function rpc(id, result) { return { jsonrpc: '2.0', id, result }; }
function error(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }
function equalSecret(supplied, expected) {
  if (!expected || !supplied) return false;
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}
function authorized(req) {
  return equalSecret(req.headers['x-api-key'], TOKEN) || equalSecret(bearer(req), TOKEN);
}
function accountAuthorized(req) {
  // An account credential is required separately from the server connector key.
  return equalSecret(bearer(req), ACCOUNT_TOKEN);
}
async function supabaseReclamos(args) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase no configurado');
  const limit = Number.isInteger(args.limite) ? Math.min(50, Math.max(1, args.limite)) : 20;
  const url = new URL(SUPABASE_URL + '/rest/v1/crm_reclamos');
  url.searchParams.set('select', 'reclamo_id,cliente,motivo,tipo,urgencia,estado,producto,responsable,dias_sin_respuesta,observaciones,fecha_ingreso');
  url.searchParams.set('order', 'reclamo_id.desc');
  url.searchParams.set('limit', String(limit));
  if (args.estado) {
    url.searchParams.set('estado', 'eq.' + args.estado);
  }
  const response = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Error consultando reclamos (' + response.status + ')');
  return await response.json();
}
async function supabaseContarReclamos(args) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase no configurado');
  const url = new URL(SUPABASE_URL + '/rest/v1/crm_reclamos');
  url.searchParams.set('select', 'reclamo_id');
  if (args.estado) url.searchParams.set('estado', 'eq.' + args.estado);
  const response = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, Prefer: 'count=exact', Range: '0-0' }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Error contando reclamos (' + response.status + ')');
  const range = response.headers.get('content-range') || '';
  const total = Number(range.split('/').pop());
  if (!range.includes('/') || !Number.isSafeInteger(total)) throw new Error('Supabase no devolvió el total');
  return { total_reclamos: total, ...(args.estado ? { estado: args.estado } : {}) };
}

const MESA_URL=(process.env.MESA_SUPABASE_URL||SUPABASE_URL).replace(/\/$/,'');
const MESA_KEY=process.env.MESA_SUPABASE_SERVICE_ROLE_KEY||SUPABASE_KEY;
// Explicit table and column allowlist. Never expose auth, mesa_usuarios or other tables.
const MESA_TABLES={
  mesa_ot:'id,numero,cliente,estado,subestado,updated_at',
  mesa_reclamos:'id,ot_id,asunto,estado,prioridad,updated_at',
  mesa_seguimientos:'id,ot_id,reclamo_id,contenido,created_at'
};
async function mesaRead(table,args,filters) {
  if(!MESA_URL||!MESA_KEY)throw Error('Base de Mesa de Ayuda no configurada');
  const url=new URL(MESA_URL+'/rest/v1/'+table);
  url.searchParams.set('select',MESA_TABLES[table]);
  const limit=Number.isInteger(args.limite)?Math.max(1,Math.min(50,args.limite)):20;
  url.searchParams.set('limit',String(limit));
  url.searchParams.set('order',table==='mesa_seguimientos'?'created_at.desc':'updated_at.desc');
  for(const [arg,column,mode] of filters){
    const raw=args[arg];
    if(raw===undefined||raw===null||raw==='')continue;
    if(typeof raw!=='string'||raw.length>150)throw Error('Filtro inválido: '+arg);
    const clean=raw.replace(/[*,()%]/g,'').trim();
    if(!clean)throw Error('Filtro vacío: '+arg);
    // OT numbers may be stored as OS.-00071595 but searched as OS-00071595.
    // Match the numeric suffix rather than relying on punctuation.
    const term=(table==='mesa_ot'&&column==='numero')
      ? (clean.match(/(\d{4,})$/)?.[1]||clean)
      : clean;
    url.searchParams.set(column,mode==='like'?'ilike.*'+term+'*':'eq.'+term);
  }
  const response=await fetch(url,{headers:{apikey:MESA_KEY,Authorization:'Bearer '+MESA_KEY},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('No se pudo consultar '+table+' ('+response.status+')');
  return await response.json();
}

async function resolveOtId(value) {
  const raw = String(value || '').trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) return raw;
  const suffix = raw.match(/(\\d{4,})$/)?.[1];
  if (!suffix) throw Error('Número de OS inválido. Usá OS-00071541 o el ID interno.');
  const matches = await mesaRead('mesa_ot', { numero: suffix, limite: 30 }, [['numero','numero','like']]);
  const exact = matches.filter(x => {
    const stored = String(x.numero || '').match(/(\\d{4,})$/)?.[1];
    return stored && Number(stored) === Number(suffix);
  });
  if (exact.length === 0) throw Error('No se encontró la OS ' + raw);
  if (exact.length > 1) throw Error('Hay más de una OS con ese número; necesitás el ID interno.');
  return exact[0].id;
}

async function dispatch(msg, req) {
  const id = msg?.id ?? null;
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return error(id, -32600, 'Solicitud JSON-RPC inválida');
  if (msg.method === 'notifications/initialized') return null;
  if (msg.method === 'initialize') return rpc(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'mcp-moretti', version: '0.1.0' } });
  if (msg.method === 'ping') return rpc(id, {});
  if (msg.method === 'tools/list') return rpc(id, { tools });
  if (msg.method === 'tools/call') {
    const name = msg.params?.name;
    const args = msg.params?.arguments || {};
    if (!args || typeof args !== 'object' || Array.isArray(args)) return error(id, -32602, 'Argumentos inválidos');
    try {
      let value;
      if (name === 'moretti_estado_conexion') value = { estado: 'OK', supabase_configurado: Boolean(SUPABASE_URL && SUPABASE_KEY) };
      else if (name === 'moretti_contar_reclamos') {
        if (!accountAuthorized(req)) return rpc(id, { content: [{ type: 'text', text: 'Cuenta Moretti no autorizada' }], isError: true });
        value = await supabaseContarReclamos(args);
      }
      else if (name === 'moretti_listar_reclamos') {
        if (!accountAuthorized(req)) return rpc(id, { content: [{ type: 'text', text: 'Cuenta Moretti no autorizada' }], isError: true });
        value = await supabaseReclamos(args);
      }
      else if (['moretti_buscar_ot','moretti_listar_ot','moretti_reclamos_ot','moretti_seguimientos_ot'].includes(name)) {
        if (!accountAuthorized(req)) return rpc(id,{content:[{type:'text',text:'Cuenta Moretti no autorizada'}],isError:true});
        if(name==='moretti_buscar_ot')value=await mesaRead('mesa_ot',args,[['numero','numero','like'],['cliente','cliente','like']]);
        if(name==='moretti_listar_ot')value=await mesaRead('mesa_ot',args,[['estado','estado','eq'],['subestado','subestado','eq']]);
        if(name==='moretti_reclamos_ot')value=await mesaRead('mesa_reclamos',args,[['ot_id','ot_id','eq'],['estado','estado','eq'],['prioridad','prioridad','eq']]);
        if(name==='moretti_seguimientos_ot'){
          if(Boolean(args.ot_id)===Boolean(args.reclamo_id))throw Error('Indicá exactamente ot_id o reclamo_id');
          const resolved = args.ot_id ? { ...args, ot_id: await resolveOtId(args.ot_id) } : args;
          value=await mesaRead('mesa_seguimientos',resolved,[['ot_id','ot_id','eq'],['reclamo_id','reclamo_id','eq']]);
        }
      }
      else return error(id, -32602, 'Herramienta desconocida');
      return rpc(id, { content: [{ type: 'text', text: JSON.stringify(value) }], isError: false });
    } catch (e) {
      return rpc(id, { content: [{ type: 'text', text: e.message }], isError: true });
    }
  }
  return error(id, -32601, 'Método no implementado');
}
const server = http.createServer(async (req, res) => {
  if (req.url === '/health' && req.method === 'GET') return json(res, 200, { ok: true, service: 'mcp-moretti' });
  if (req.url === '/sync/reclamos' && req.method === 'POST') {
    if (!equalSecret(req.headers['x-api-key'], TOKEN)) return json(res, 401, { error: 'Unauthorized' });
    try { return json(res, 200, await syncReclamos()); }
    catch (e) { console.error('sync reclamos:', e.message); return json(res, 502, { ok: false, error: e.message }); }
  }
  if (req.url !== '/mcp') return json(res, 404, { error: 'Not found' });
  if (!authorized(req)) return json(res, 401, { error: 'Unauthorized' });
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' });
  if (!req.headers['content-type']?.includes('application/json')) return json(res, 415, { error: 'JSON required' });
  let body = '';
  try {
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 65536) return json(res, 413, { error: 'Request too large' });
    }
    const request = JSON.parse(body);
    if (Array.isArray(request)) return json(res, 400, error(null, -32600, 'Batch no soportado'));
    const response = await dispatch(request, req);
    if (response === null) { res.writeHead(202); return res.end(); }
    return json(res, 200, response);
  } catch { return json(res, 400, error(null, -32700, 'JSON inválido')); }
});
server.listen(PORT, '0.0.0.0', () => console.log('mcp-moretti listening on ' + PORT));

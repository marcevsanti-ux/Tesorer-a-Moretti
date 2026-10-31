import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.PORT || 3100);
const TOKEN = process.env.MCP_API_TOKEN || '';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PROTOCOL_VERSION = '2025-03-26';

const tools = [
  { name: 'moretti_estado_conexion', description: 'Verifica disponibilidad del conector Moretti sin revelar credenciales.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'moretti_listar_reclamos', description: 'Consulta reclamos de Mesa de Ayuda (solo lectura). Admite estado y límite de resultados.', inputSchema: { type: 'object', properties: { estado: { type: 'string', enum: ['ABIERTO', 'EN_PROCESO', 'CERRADO'] }, limite: { type: 'integer', minimum: 1, maximum: 50 } }, additionalProperties: false } }
];

function json(res, status, body, extra = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra });
  res.end(JSON.stringify(body));
}
function rpc(id, result) { return { jsonrpc: '2.0', id, result }; }
function error(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }
function authorized(req) {
  if (!TOKEN) return false;
  const header = req.headers.authorization || '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(supplied), b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function supabaseReclamos(args) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase no configurado');
  const limit = Number.isInteger(args.limite) ? Math.min(50, Math.max(1, args.limite)) : 20;
  const url = new URL(SUPABASE_URL + '/rest/v1/mesa_reclamos');
  url.searchParams.set('select', 'id,asunto,estado,prioridad,created_at,updated_at');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', String(limit));
  if (args.estado) {
    if (!['ABIERTO','EN_PROCESO','CERRADO'].includes(args.estado)) throw new Error('Estado inválido');
    url.searchParams.set('estado', 'eq.' + args.estado);
  }
  const response = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Error consultando reclamos (' + response.status + ')');
  return await response.json();
}
async function dispatch(msg) {
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
      else if (name === 'moretti_listar_reclamos') value = await supabaseReclamos(args);
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
    const response = await dispatch(request);
    if (response === null) { res.writeHead(202); return res.end(); }
    return json(res, 200, response);
  } catch { return json(res, 400, error(null, -32700, 'JSON inválido')); }
});
server.listen(PORT, '0.0.0.0', () => console.log('mcp-moretti listening on ' + PORT));

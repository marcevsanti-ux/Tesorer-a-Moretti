import http from 'node:http';
import { timingSafeEqual, createSign } from 'node:crypto';

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.MCP_AUTH_TOKEN;
const SB_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1Q-QnJmgVvknBbvqZMVFWUOy7kBIzN4Yv';
const SHEET_RANGE = process.env.GOOGLE_SHEET_RANGE || '';
const MAX_ROWS = 50;
if (!TOKEN || !SB_URL || !SB_KEY) {
  console.error('Faltan MCP_AUTH_TOKEN, SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
function authorized(req) {
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
  const a = Buffer.from(supplied), b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a,b);
}
function json(res, code, body) {
  res.writeHead(code, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  let data='';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 65536) throw new Error('Solicitud demasiado grande');
  }
  return JSON.parse(data || '{}');
}
function textResult(value) {
  return {content:[{type:'text',text:JSON.stringify(value,null,2)}]};
}
async function sb(table, params) {
  const url = new URL(SB_URL+'/rest/v1/'+table);
  Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
  const response = await fetch(url,{headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,Accept:'application/json'}});
  if (!response.ok) throw new Error('Error consultando Supabase ('+response.status+')');
  return response.json();
}
function limit(n) {return Math.max(1,Math.min(MAX_ROWS,Number.isFinite(+n)?Math.floor(+n):20));}
function safeOT(n) {
  if(typeof n!=='string' || !/^OS\.-?\d{5,}$/i.test(n.trim())) throw new Error('Número de OT inválido');
  return n.trim();
}
const tools = [
  {name:'buscar_ot',description:'Consulta una orden de trabajo Moretti por su número.',inputSchema:{type:'object',properties:{numero:{type:'string'}},required:['numero']}},
  {name:'listar_ot_pendientes',description:'Lista órdenes de trabajo pendientes en Moretti.',inputSchema:{type:'object',properties:{limite:{type:'integer',minimum:1,maximum:50}}}},
  {name:'consultar_reclamos',description:'Consulta reclamos de la Mesa de Ayuda. No presupone relaciones entre tablas.',inputSchema:{type:'object',properties:{limite:{type:'integer',minimum:1,maximum:50}}}},
  {name:'consultar_seguimientos',description:'Consulta seguimientos de la Mesa de Ayuda.',inputSchema:{type:'object',properties:{limite:{type:'integer',minimum:1,maximum:50}}}},
  {name:'resumen_mesa_ayuda',description:'Resumen de órdenes de trabajo por estado.',inputSchema:{type:'object',properties:{}}},
  {name:'leer_planilla',description:'Lee un rango de Google Sheets de Moretti. Requiere credenciales y GOOGLE_SHEET_RANGE.',inputSchema:{type:'object',properties:{rango:{type:'string'}}}},
  {name:'actualizar_celda_planilla',description:'Modifica una única celda de Google Sheets. Requiere GOOGLE_SHEETS_WRITE_ENABLED=true y confirmación explícita.',inputSchema:{type:'object',properties:{celda:{type:'string'},valor:{type:'string'},confirmado:{type:'boolean'}},required:['celda','valor','confirmado']}}
];
async function googleToken() {
  const email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key=process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n');
  if(!email || !key) throw new Error('Faltan credenciales de cuenta de servicio Google');
  const now=Math.floor(Date.now()/1000);
  const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
  const input=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const signer=createSign('RSA-SHA256');signer.update(input);signer.end();
  const assertion=input+'.'+signer.sign(key,'base64url');
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
  if(!response.ok) throw new Error('No se pudo autenticar Google Sheets ('+response.status+')');
  return (await response.json()).access_token;
}
function sheetRange(raw, cell=false) {
  const value=raw || SHEET_RANGE;
  if (!value || value.length>150 || /[!]/.test(value) && !/^[^!]{1,80}![A-Z]{1,3}\d+(?::[A-Z]{1,3}\d+)?$/i.test(value)) throw new Error('Rango no permitido');
  if(cell && !/^(?:[^!]{1,80}!)?[A-Z]{1,3}\d+$/i.test(value)) throw new Error('Debe indicar una sola celda A1');
  if(!cell && !/^(?:[^!]{1,80}!)?[A-Z]{1,3}\d+(?::[A-Z]{1,3}\d+)?$/i.test(value)) throw new Error('Rango A1 inválido');
  return value;
}
async function sheets(path,method='GET',body) {
  const token=await googleToken();
  const response=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SHEET_ID)+'/values/'+encodeURIComponent(path)+(method==='PUT'?'?valueInputOption=RAW':''),{method,headers:{Authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(!response.ok) throw new Error('Error Google Sheets ('+response.status+')');
  return response.json();
}
async function invoke(name,args={}) {
  switch(name) {
    case 'buscar_ot': return textResult(await sb('mesa_ot',{select:'id,numero,cliente,estado,subestado,clarity_snapshot,updated_at',numero:'eq.'+safeOT(args.numero),limit:'1'}));
    case 'listar_ot_pendientes': return textResult(await sb('mesa_ot',{select:'id,numero,cliente,estado,subestado,updated_at',estado:'ilike.Pendiente',order:'updated_at.desc',limit:String(limit(args.limite))}));
    case 'consultar_reclamos': return textResult(await sb('mesa_reclamos',{select:'*',limit:String(limit(args.limite))}));
    case 'consultar_seguimientos': return textResult(await sb('mesa_seguimientos',{select:'*',limit:String(limit(args.limite))}));
    case 'resumen_mesa_ayuda': {
      const rows=await sb('mesa_ot',{select:'estado',limit:'10000'});
      const counts={};for(const row of rows) counts[row.estado]=(counts[row.estado]||0)+1;
      return textResult({total_muestra:rows.length,por_estado:counts,advertencia:rows.length===10000?'Resumen limitado a 10000 registros':undefined});
    }
    case 'leer_planilla': return textResult(await sheets(sheetRange(args.rango)));
    case 'actualizar_celda_planilla': {
      if(process.env.GOOGLE_SHEETS_WRITE_ENABLED!=='true') throw new Error('Escritura de Google Sheets deshabilitada');
      if(args.confirmado!==true) throw new Error('Se requiere confirmación explícita');
      if(typeof args.valor!=='string' || args.valor.length>5000) throw new Error('Valor inválido');
      return textResult(await sheets(sheetRange(args.celda,true),'PUT',{range:args.celda,majorDimension:'ROWS',values:[[args.valor]]}));
    }
    default: throw new Error('Herramienta no permitida');
  }
}
async function rpc(msg) {
  const {id,method,params={}}=msg;
  if(method==='notifications/initialized') return null;
  if(method==='initialize') return {jsonrpc:'2.0',id,result:{protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'moretti-mesa-ayuda',version:'0.1.0'}}};
  if(method==='ping') return {jsonrpc:'2.0',id,result:{}};
  if(method==='tools/list') return {jsonrpc:'2.0',id,result:{tools}};
  if(method==='tools/call') {
    try {return {jsonrpc:'2.0',id,result:await invoke(params.name,params.arguments)};}
    catch(e) {return {jsonrpc:'2.0',id,result:{isError:true,content:[{type:'text',text:e.message}]}};}
  }
  return {jsonrpc:'2.0',id,error:{code:-32601,message:'Método no soportado'}};
}
http.createServer(async(req,res)=>{
  if(req.url==='/health' && req.method==='GET') return json(res,200,{status:'ok'});
  if(req.url!=='/mcp') return json(res,404,{error:'Not found'});
  if(!authorized(req)) return json(res,401,{error:'Unauthorized'});
  if(req.method!=='POST') return json(res,405,{error:'Method not allowed'});
  try {
    const msg=await readBody(req);
    if(!msg || msg.jsonrpc!=='2.0' || typeof msg.method!=='string') return json(res,400,{error:'Invalid JSON-RPC request'});
    const result=await rpc(msg);
    if(result===null) {res.writeHead(202);return res.end();}
    return json(res,200,result);
  } catch(e) {return json(res,400,{error:e.message});}
}).listen(PORT,'0.0.0.0',()=>console.log('MCP Moretti escuchando en puerto '+PORT));

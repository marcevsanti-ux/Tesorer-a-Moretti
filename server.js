'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const PORT = Number(process.env.PORT || 3000);
const URL = process.env.SUPABASE_URL || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const valid = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(URL) && ANON_KEY.length > 20;
const headers = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};
function json(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(payload));}
async function sb(endpoint,key,options={}){
 const response=await fetch(URL.replace(/\\/$/,'')+endpoint,{...options,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(12000)});
 const data=await response.json().catch(()=>({}));
 return {ok:response.ok,status:response.status,data};
}
async function invite(req,res){
 if(!valid||!SERVICE_KEY)return json(res,503,{error:'Administración de usuarios no configurada'});
 const authorization=req.headers.authorization||'';
 if(!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization))return json(res,401,{error:'Sesión requerida'});
 const jwt=authorization.slice(7);
 let body='';
 try{for await(const chunk of req){body+=chunk;if(body.length>4096)return json(res,413,{error:'Solicitud demasiado grande'});}}catch{return json(res,400,{error:'Solicitud inválida'});}
 let input;try{input=JSON.parse(body)}catch{return json(res,400,{error:'JSON inválido'})}
 const email=String(input.email||'').trim().toLowerCase(),role=String(input.rol||'');
 if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)||email.length>254||!['ADMIN','USUARIO'].includes(role))return json(res,400,{error:'Correo o rol inválido'});
 try{
  const identity=await sb('/auth/v1/user',ANON_KEY,{headers:{Authorization:'Bearer '+jwt}});
  if(!identity.ok||!identity.data.id)return json(res,401,{error:'Sesión inválida'});
  const perms=await sb('/rest/v1/mesa_usuarios?select=rol,activo&user_id=eq.'+encodeURIComponent(identity.data.id),ANON_KEY,{headers:{Authorization:'Bearer '+jwt}});
  if(!perms.ok||!Array.isArray(perms.data)||!perms.data.some(x=>x.rol==='ADMIN'&&x.activo))return json(res,403,{error:'Solo administradores'});
  const invited=await sb('/auth/v1/invite',SERVICE_KEY,{method:'POST',body:JSON.stringify({email})});
  if(!invited.ok)return json(res,invited.status===422?409:502,{error:'No se pudo invitar. Revisar si la cuenta ya existe y el correo SMTP.'});
  if(!invited.data.id)return json(res,502,{error:'Invitación sin identificador'});
  const roleSaved=await sb('/rest/v1/mesa_usuarios',SERVICE_KEY,{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({user_id:invited.data.id,rol:role,activo:true})});
  if(!roleSaved.ok){console.error('Role provisioning failed',roleSaved.status);return json(res,500,{error:'Invitación enviada, pero el rol no se registró. Revisar en Supabase antes de reintentar.'})}
  return json(res,201,{ok:true,email,rol:role});
 }catch(e){console.error('Invite request failed',e.message);return json(res,502,{error:'Error de comunicación con Supabase'})}
}
http.createServer(async (req,res)=>{
  const pathname = new URL(req.url,'http://localhost').pathname;
  if(pathname==='/api/usuarios/invitar'&&req.method==='POST')return invite(req,res);
  if(pathname==='/health'){
    res.writeHead(valid?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});
    return res.end(JSON.stringify({status:valid?'ok':'configuration_required'}));
  }
  if(!['/','/mesa-de-ayuda.html'].includes(pathname) || !['GET','HEAD'].includes(req.method)){
    res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Not found');
  }
  try{
    let html=await fs.readFile(path.join(__dirname,'mesa-de-ayuda.html'),'utf8');
    if(valid){
      html=html.replace("url:'REEMPLAZAR_SUPABASE_URL',anonKey:'REEMPLAZAR_SUPABASE_ANON_KEY'",
        'url:'+JSON.stringify(URL)+',anonKey:'+JSON.stringify(ANON_KEY));
    }
    res.writeHead(200,headers);
    res.end(req.method==='HEAD'?'':html);
  }catch(e){console.error('HTML read error',e.code);res.writeHead(500);res.end('Internal error')}
}).listen(PORT,'0.0.0.0',()=>console.log('Mesa de Ayuda listening on',PORT,'configured:',valid));

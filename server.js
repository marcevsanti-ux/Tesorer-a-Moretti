'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const PORT = Number(process.env.PORT || 3000);
const URL = process.env.SUPABASE_URL || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const valid = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(URL) && ANON_KEY.length > 20;
const headers = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};
http.createServer(async (req,res)=>{
  const pathname = new URL(req.url,'http://localhost').pathname;
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

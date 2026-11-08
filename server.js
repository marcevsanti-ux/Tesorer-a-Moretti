
'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { URL: NodeURL } = require('node:url');

const PORT = Number(process.env.PORT || 3000);
const URL = process.env.SUPABASE_URL || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const valid =
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(URL) &&
  ANON_KEY.length > 20;

const headers = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=()'
};

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}

async function sb(endpoint, key, options = {}) {
  const base = URL.endsWith('/') ? URL.slice(0, -1) : URL;

  const response = await fetch(base + endpoint, {
    ...options,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(12000)
  });

  const data = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

async function invite(req, res) {
  if (!valid || !SERVICE_KEY) {
    return json(res, 503, {
      error: 'Administración de usuarios no configurada'
    });
  }

  const authorization = req.headers.authorization || '';

  if (!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)) {
    return json(res, 401, {
      error: 'Sesión requerida'
    });
  }

  const jwt = authorization.slice(7);

  let body = '';

  try {
    for await (const chunk of req) {
      body += chunk;

      if (body.length > 4096) {
        return json(res, 413, {
          error: 'Solicitud demasiado grande'
        });
      }
    }
  } catch {
    return json(res, 400, {
      error: 'Solicitud inválida'
    });
  }

  let input;

  try {
    input = JSON.parse(body);
  } catch {
    return json(res, 400, {
      error: 'JSON inválido'
    });
  }

  const email = String(input.email || '')
    .trim()
    .toLowerCase();

  const role = String(input.rol || '');

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !['ADMIN', 'USUARIO'].includes(role)
  ) {
    return json(res, 400, {
      error: 'Correo o rol inválido'
    });
  }

  try {
    const identity = await sb(
      '/auth/v1/user',
      ANON_KEY,
      {
        headers: {
          Authorization: 'Bearer ' + jwt
        }
      }
    );

    if (!identity.ok || !identity.data.id) {
      return json(res, 401, {
        error: 'Sesión inválida'
      });
    }

    const perms = await sb(
      '/rest/v1/mesa_usuarios?select=rol,activo&user_id=eq.' +
        encodeURIComponent(identity.data.id),
      ANON_KEY,
      {
        headers: {
          Authorization: 'Bearer ' + jwt
        }
      }
    );

    if (
      !perms.ok ||
      !Array.isArray(perms.data) ||
      !perms.data.some(
        x => x.rol === 'ADMIN' && x.activo
      )
    ) {
      return json(res, 403, {
        error: 'Solo administradores'
      });
    }

    const invited = await sb(
      '/auth/v1/invite',
      SERVICE_KEY,
      {
        method: 'POST',
        body: JSON.stringify({ email })
      }
    );

    if (!invited.ok) {
      return json(
        res,
        invited.status === 422 ? 409 : 502,
        {
          error:
            'No se pudo invitar. Revisar si la cuenta ya existe y el correo SMTP.'
        }
      );
    }

    if (!invited.data.id) {
      return json(res, 502, {
        error: 'Invitación sin identificador'
      });
    }

    const roleSaved = await sb(
      '/rest/v1/mesa_usuarios',
      SERVICE_KEY,
      {
        method: 'POST',
        headers: {
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          user_id: invited.data.id,
          rol: role,
          activo: true
        })
      }
    );

    if (!roleSaved.ok) {
      console.error(
        'Role provisioning failed',
        roleSaved.status
      );

      return json(res, 500, {
        error:
          'Invitación enviada, pero el rol no se registró. Revisar en Supabase antes de reintentar.'
      });
    }

    return json(res, 201, {
      ok: true,
      email,
      rol: role
    });
  } catch (e) {
    console.error(
      'Invite request failed',
      e.message
    );

    return json(res, 502, {
      error: 'Error de comunicación con Supabase'
    });
  }
}


const RAILWAY_TOKEN = process.env.RAILWAY_PROJECT_TOKEN || '';
const CLARITY_SERVICE_ID = process.env.CLARITY_SYNC_SERVICE_ID || '';
const RAILWAY_ENVIRONMENT_ID = process.env.RAILWAY_ENVIRONMENT_ID || '';
let lastManualTrigger = 0;

let claritySchedulerBusy = false;
async function triggerRailwayClarity() {
  const response = await fetch('https://backboard.railway.com/graphql/v2', {
    method:'POST',
    headers:{'Content-Type':'application/json','Project-Access-Token':RAILWAY_TOKEN},
    body:JSON.stringify({
      query:'mutation ($serviceId: String!, $environmentId: String!) { serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId) }',
      variables:{serviceId:CLARITY_SERVICE_ID,environmentId:RAILWAY_ENVIRONMENT_ID}
    }),
    signal:AbortSignal.timeout(15000)
  });
  const result = await response.json().catch(()=>({}));
  if(!response.ok || result.errors?.length || !result.data?.serviceInstanceRedeploy)
    throw Error('Railway rechazó la solicitud de ejecución');
}
async function clarityScheduleTick() {
  if(claritySchedulerBusy || !valid || !SERVICE_KEY || !RAILWAY_TOKEN || !CLARITY_SERVICE_ID || !RAILWAY_ENVIRONMENT_ID)return;
  claritySchedulerBusy=true;
  try {
    const now=new Date();
    const local=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
    const p=Object.fromEntries(local.map(x=>[x.type,x.value]));
    const hhmm=p.hour+':'+p.minute;
    const config=await sb('/rest/v1/mesa_clarity_programacion?id=eq.1&select=activo,horarios',SERVICE_KEY);
    if(!config.ok || !config.data?.[0]?.activo || !config.data[0].horarios.includes(hhmm))return;
    const slot=p.year+'-'+p.month+'-'+p.day+'T'+hhmm;
    const claimed=await sb('/rest/v1/mesa_clarity_ejecuciones',SERVICE_KEY,{
      method:'POST',headers:{Prefer:'return=representation'},
      body:JSON.stringify({slot,estado:'SOLICITANDO'})
    });
    if(!claimed.ok) {
      if(claimed.status!==409)console.error('Clarity scheduler claim failed',claimed.status);
      return;
    }
    let estado='SOLICITADA',detalle=null;
    try {await triggerRailwayClarity();}catch(e){estado='ERROR';detalle=e.message;console.error('Clarity scheduled trigger failed',e.message)}
    await sb('/rest/v1/mesa_clarity_ejecuciones?slot=eq.'+encodeURIComponent(slot),SERVICE_KEY,{
      method:'PATCH',body:JSON.stringify({estado,detalle})
    });
    await sb('/rest/v1/mesa_clarity_programacion?id=eq.1',SERVICE_KEY,{
      method:'PATCH',body:JSON.stringify({ultimo_intento:now.toISOString(),ultimo_estado:estado,ultimo_error:detalle})
    });
    console.log('Clarity scheduled execution',slot,estado);
  }catch(e){console.error('Clarity scheduler error',e.message)}
  finally{claritySchedulerBusy=false}
}
setInterval(clarityScheduleTick,30000);
setTimeout(clarityScheduleTick,5000);


async function railwayDeployments() {
  const response = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Project-Access-Token': RAILWAY_TOKEN },
    body: JSON.stringify({
      query: 'query ($input: DeploymentListInput!, $first: Int) { deployments(input: $input, first: $first) { edges { node { id status createdAt } } } }',
      variables: { input: { serviceId: CLARITY_SERVICE_ID, environmentId: RAILWAY_ENVIRONMENT_ID }, first: 10 }
    }),
    signal: AbortSignal.timeout(12000)
  });
  const result = await response.json();
  if (!response.ok || result.errors?.length) throw Error('No se pudo consultar el estado de Railway');
  return (result.data?.deployments?.edges || []).map(e => e.node)
    .filter(Boolean).sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

async function clarityEstado(req, res) {
  if (!valid || !RAILWAY_TOKEN || !CLARITY_SERVICE_ID || !RAILWAY_ENVIRONMENT_ID)
    return json(res, 503, { error: 'Sincronización no configurada' });
  const authorization = req.headers.authorization || '';
  if (!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)) return json(res, 401, { error: 'Sesión requerida' });
  try {
    const jwt = authorization.slice(7);
    const identity = await sb('/auth/v1/user', ANON_KEY, { headers: { Authorization: 'Bearer ' + jwt } });
    if (!identity.ok || !identity.data?.id) return json(res, 401, { error: 'Sesión inválida' });
    const perms = await sb('/rest/v1/mesa_usuarios?select=rol,activo&user_id=eq.' +
      encodeURIComponent(identity.data.id), ANON_KEY, { headers: { Authorization: 'Bearer ' + jwt } });
    if (!perms.ok || !Array.isArray(perms.data) || !perms.data.some(x => x.activo && x.rol === 'ADMIN'))
      return json(res, 403, { error: 'Solo administradores' });
    const deployments = await railwayDeployments();
    return json(res, 200, { deployment: deployments[0] || null, solicitado_en: lastManualTrigger || null });
  } catch (error) {
    console.error('Clarity status check failed', error.message);
    return json(res, 502, { error: 'No se pudo consultar el estado del despliegue en Railway' });
  }
}

async function importarClarity(req, res) {
  if (!valid || !RAILWAY_TOKEN || !CLARITY_SERVICE_ID || !RAILWAY_ENVIRONMENT_ID) {
    return json(res, 503, { error: 'Importación manual aún no configurada en Railway' });
  }
  const authorization = req.headers.authorization || '';
  if (!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)) {
    return json(res, 401, { error: 'Sesión requerida' });
  }
  const jwt = authorization.slice(7);
  try {
    const identity = await sb('/auth/v1/user', ANON_KEY, {
      headers: { Authorization: 'Bearer ' + jwt }
    });
    if (!identity.ok || !identity.data.id) {
      return json(res, 401, { error: 'Sesión inválida' });
    }
    const perms = await sb(
      '/rest/v1/mesa_usuarios?select=rol,activo&user_id=eq.' +
        encodeURIComponent(identity.data.id),
      ANON_KEY, { headers: { Authorization: 'Bearer ' + jwt } }
    );
    if (!perms.ok || !Array.isArray(perms.data) ||
        !perms.data.some(x => x.rol === 'ADMIN' && x.activo)) {
      return json(res, 403, { error: 'Solo administradores' });
    }
    if (Date.now() - lastManualTrigger < 120000) {
      return json(res, 429, { error: 'Esperá dos minutos antes de volver a solicitar una importación' });
    }
    // Railway project tokens use Project-Access-Token, not Bearer.
    const response = await fetch('https://backboard.railway.com/graphql/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Project-Access-Token': RAILWAY_TOKEN
      },
      body: JSON.stringify({
        query: 'mutation ($serviceId: String!, $environmentId: String!) { serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId) }',
        variables: {
          serviceId: CLARITY_SERVICE_ID,
          environmentId: RAILWAY_ENVIRONMENT_ID
        }
      }),
      signal: AbortSignal.timeout(15000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.errors?.length || !result.data?.serviceInstanceRedeploy) {
      console.error('Railway manual trigger rejected', response.status,
        (result.errors || []).map(x => x.message).join('; '));
      return json(res, 502, { error: 'Railway no aceptó la ejecución. Revisar permisos y configuración.' });
    }
    lastManualTrigger = Date.now();
    console.log('Clarity manual trigger accepted for admin', identity.data.id);
    return json(res, 202, {
      ok: true,
      mensaje: 'Ejecución solicitada a Railway. La importación aún no ha finalizado.'
    });
  } catch (error) {
    console.error('Clarity trigger error', error.message);
    return json(res, 502, { error: 'No se pudo contactar Railway' });
  }
}


const PUENTES_API_KEY = process.env.PUENTES_API_KEY || '';
const PUENTES_BOT_ID = '77109ece-0d17-4abc-abd3-f81784e8675c';
const PUENTES_BASE = 'https://app.puentes.ai/api';
const assistantLocks = new Map();

async function puentes(endpoint, options = {}) {
  const response = await fetch(PUENTES_BASE + endpoint, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + PUENTES_API_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error('Puentes HTTP ' + response.status);
  return data;
}

async function assistantGroup(userId) {
  // A distinct private group for each Supabase user; never reuse the owner's direct chat.
  const name = 'Mesa Moretti · ' + userId;
  const groups = await puentes('/me/groups');
  const list = Array.isArray(groups) ? groups : (groups?.groups || []);
  const existing = list.find(g => g.kind === 'group' && g.name === name &&
    (g.members || []).some(m => m.id === PUENTES_BOT_ID || m.botId === PUENTES_BOT_ID));
  if (existing) return existing.id;
  const group = await puentes('/groups', {
    method: 'POST',
    body: JSON.stringify({ name, puentes: false })
  });
  if (!group?.id) throw new Error('Puentes did not return group ID');
  await puentes('/groups/' + encodeURIComponent(group.id) + '/bots', {
    method: 'POST',
    body: JSON.stringify({ botId: PUENTES_BOT_ID, mode: 'always' })
  });
  return group.id;
}


function normalizeMesa(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-AR').trim();
}
async function readMesaTable(table,jwt) {
  const rows=[];
  for(let start=0;start<10000;start+=500) {
    const result=await sb('/rest/v1/'+table+'?select=*&order=created_at.asc&limit=500&offset='+start,ANON_KEY,{headers:{Authorization:'Bearer '+jwt}});
    if(!result.ok||!Array.isArray(result.data))throw Error('No se pudo consultar '+table);
    rows.push(...result.data);
    if(result.data.length<500)break;
  }
  return rows;
}
function mesaRecordText(r,table) {
  const h=r.drive_historico||{};
  if(table==='mesa_reclamos')return ['ID '+(r.drive_id??''),h.Cliente||r.asunto,h.Motivo||r.asunto,h.Producto||'',r.estado,r.prioridad,h['Fecha ingreso']||r.fecha_ingreso_historica||'',h['Último contacto']||'',r.descripcion||''].join(' | ');
  return ['OT '+(r.numero||''),r.cliente,r.estado,r.subestado,r.observaciones||'',JSON.stringify(r.clarity_snapshot||{}).slice(0,600)].join(' | ');
}
function mesaMatches(text,question) {
  const q=normalizeMesa(question).replace(/[¿?¡!"]/g,' ');
  const m=q.match(/(?:motivo|producto|cliente|subestado|estado)\s+(?:(?:es|de|como|igual a|:)\s+)?(.+?)(?:\s+(?:en|de|con)\s+(?:los|las|el|la)\s+(?:casos|reclamos|ot|ordenes))?$/);
  if(m&&m[1])return normalizeMesa(text).includes(normalizeMesa(m[1].replace(/[. ]+$/,'')));
  const terms=q.split(/\s+/).filter(w=>w.length>3&&!['cuantos','cuantas','tienen','tenemos','casos','reclamos','ordenes','trabajo','mostrar','decime','cuales','sobre','informacion'].includes(w));
  return terms.length>0&&terms.every(w=>normalizeMesa(text).includes(w));
}


function structuredClaimCount(question,records){
 const q=normalizeMesa(question);
 if(!/\b(cuantos|cuantas|cantidad|total)\b/.test(q)||!/\breclamos?\b/.test(q))return null;
 const owners=[['Valeria',/\b(valeria|vale)\b/],['Samanta',/\b(samanta|sami)\b/],['Estefania',/\b(estefania|tefa)\b/]];
 const mentionsOwner=/\b(responsable|asignad[oa]s?|tiene|lleva|a cargo|de vale|de valeria|de sami|de samanta|de tefa|de estefania)\b/.test(q);
 const owner=mentionsOwner?owners.find(([,rx])=>rx.test(q))?.[0]:null;
 const status=/\ben[\s_-]*proceso\b/.test(q)?'EN_PROCESO':/\b(abiertos?|abiertas?)\b/.test(q)?'ABIERTO':/\b(cerrados?|cerradas?)\b/.test(q)?'CERRADO':/\b(resueltos?|resueltas?)\b/.test(q)?'RESUELTO':null;
 if(!owner&&!status)return null;
 const matched=records.filter(r=>(!owner||normalizeMesa(r.responsable)===normalizeMesa(owner))&&(!status||normalizeMesa(r.estado)===normalizeMesa(status)));
 const statusLabel={EN_PROCESO:'en proceso',ABIERTO:'abiertos',CERRADO:'cerrados',RESUELTO:'resueltos'};
 const detail=(owner?' asignados a '+owner:'')+(status?' con estado '+statusLabel[status]:'');
 return {respuesta:'Hay '+matched.length+' reclamos'+detail+'.'+(matched.length?' IDs: '+matched.slice(0,20).map(r=>'#'+(r.drive_id??r.id)).join(', ')+(matched.length>20?' (primeros 20 de '+matched.length+')':''):'') ,tipo:'supabase',cantidad:matched.length};
}

const FEEDBACK_REPO = 'marcevsanti-ux/Tesorer-a-Moretti';
const FEEDBACK_USERS = new Set(['valeriat@moretti.com.ar', 'marcelos@moretti.com.ar']);
const FEATURE_OWNER = 'marcelos@moretti.com.ar';

async function githubFeedback(endpoint, options = {}) {
  const token = process.env.GITHUB_FEEDBACK_TOKEN;
  if (!token) throw new Error('Feedback GitHub no configurado');
  const response = await fetch('https://api.github.com/repos/' + FEEDBACK_REPO + endpoint, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'moretti-mesa-feedback',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error('GitHub HTTP ' + response.status);
  return response.json();
}

function feedbackSeverity(description) {
  if (/contraseñ|token|credencial|permisos|datos personales|filtraci[oó]n|p[eé]rdida de datos|facturaci[oó]n|seguridad|autorizaci[oó]n/i.test(description)) return 'CRÍTICO - requiere aprobación de Marcelo';
  if (/no (puedo|funciona|abre|guarda)|error 5\d\d|bloquea|ca[ií]do|inaccesible/i.test(description)) return 'ALTO - revisión prioritaria';
  return 'NORMAL - pendiente de diagnóstico';
}

async function createFeedbackIssue(description, email, kind = 'bug', evidence = []) {
  const feature = kind === 'feature';
  const title = (feature ? '[Función solicitada] ' : '[Bug Mesa de Ayuda] ') +
    description.replace(/\s+/g, ' ').slice(0, 95);
  const body = [
    '## Reporte desde Agente Moretti',
    '- Tipo: ' + (feature ? 'Solicitud de función' : 'Bug'),
    '- Reportado por: ' + email,
    '- Fecha de recepción: ' + new Date().toISOString(),
    '- Prioridad inicial (heurística, no diagnóstico): ' + (feature ? 'Pendiente de evaluación' : feedbackSeverity(description)),
    '- Estado: Pendiente de revisión técnica',
    '',
    '## Descripción del usuario',
    description,
    '',
    ...(evidence.length?['## Evidencia adjunta (almacenamiento privado)',...evidence.map(x=>'- '+x.name+': storage://mesa-bug-evidence/'+x.path),'','Las imágenes se visualizan desde la Ticketera autenticada. No compartir enlaces públicos.','']:[]),
    '## Flujo requerido',
    '- [ ] Reproducir y validar el problema / alcance',
    '- [ ] Diagnóstico técnico y plan de cambio',
    '- [ ] Implementar corrección en rama de trabajo',
    '- [ ] Ejecutar pruebas automatizadas y QA funcional',
    '- [ ] Revisar permisos, datos y riesgos; solicitar aprobación para cambios críticos',
    '- [ ] Desplegar y verificar la versión de producción',
    '- [ ] Confirmar con Valeria o Marcelo y cerrar el ticket',
    '',
    '> La creación del ticket NO implica que el bug esté corregido ni desplegado.'
  ].join('\n');
  return githubFeedback('/issues', {
    method: 'POST',
    body: JSON.stringify({ title, body })
  });
}

async function saveBugImages(images, userId) {
  if (!Array.isArray(images) || images.length>3) throw new Error('Se admiten hasta 3 imágenes');
  if (images.length && !SERVICE_KEY) throw new Error('Almacenamiento no configurado');
  const saved=[];
  for (const item of images) {
    const mime=String(item.type||'');
    const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[mime];
    if (!ext || typeof item.data!=='string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.data))
      throw new Error('Formato de imagen inválido');
    const bytes=Buffer.from(item.data,'base64');
    if (!bytes.length || bytes.length>3145728) throw new Error('Imagen supera 3 MB');
    const magic=(mime==='image/png'&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))||
      (mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)||
      (mime==='image/webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP');
    if (!magic) throw new Error('El archivo no coincide con el tipo de imagen');
    const key=userId+'/'+randomUUID()+'.'+ext;
    const response=await fetch(URL.replace(/\\/$/,'')+'/storage/v1/object/mesa-bug-evidence/'+key,{
      method:'POST',headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+SERVICE_KEY,'Content-Type':mime,'x-upsert':'false'},
      body:bytes,signal:AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error('No se pudo guardar la imagen ('+response.status+')');
    saved.push({name:String(item.name||'captura.'+ext).replace(/[\\r\\n<>]/g,' ').slice(0,90),path:key});
  }
  return saved;
}

async function registerValeriaBug(description, authenticatedEmail, evidence = []) {
  if (!FEEDBACK_USERS.has(String(authenticatedEmail || '').trim().toLowerCase())) {
    throw new Error('Usuario no autorizado para reportar bugs');
  }
  return createFeedbackIssue(description, authenticatedEmail, 'bug', evidence);
}

async function getFeedbackIssue(number) {
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('Número de ticket inválido');
  return githubFeedback('/issues/' + number);
}

async function assistantChat(req, res) {
  if (!valid || !SERVICE_KEY)
    return json(res, 503, { error: 'Asistente no configurado' });
  const authorization = req.headers.authorization || '';
  if (!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization))
    return json(res, 401, { error: 'Iniciá sesión' });
  let body = '';
  try {
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 12582912) return json(res, 413, { error: 'Mensaje o imágenes demasiado grandes' });
    }
  } catch { return json(res, 400, { error: 'Solicitud inválida' }); }
  let question, images;
  try { const input=JSON.parse(body);question = String(input.mensaje || '').trim().slice(0, 3000); images=input.imagenes||[]; }
  catch { return json(res, 400, { error: 'JSON inválido' }); }
  if (!question) return json(res, 400, { error: 'Escribí una consulta' });

  let userId;
  let jwt;
  let identityEmail = '';
  try {
    jwt = authorization.slice(7);
    const identity = await sb('/auth/v1/user', ANON_KEY, {
      headers: { Authorization: 'Bearer ' + jwt }
    });
    if (!identity.ok || !identity.data.id)
      return json(res, 401, { error: 'Sesión inválida' });
    userId = identity.data.id;
    identityEmail = String(identity.data.email || '');
    const perms = await sb(
      '/rest/v1/mesa_usuarios?select=rol,activo&user_id=eq.' + encodeURIComponent(userId),
      ANON_KEY, { headers: { Authorization: 'Bearer ' + jwt } }
    );
    if (!perms.ok || !Array.isArray(perms.data) ||
        !perms.data.some(x => x.activo && ['ADMIN', 'USUARIO'].includes(x.rol)))
      return json(res, 403, { error: 'Sin acceso a Mesa de Ayuda' });
  } catch (e) {
    console.error('Assistant auth failed', e.message);
    return json(res, 502, { error: 'No se pudo validar la sesión' });
  }

  const email = identityEmail.trim().toLowerCase();
  const isBug = /^(?:reportar )?(?:bug|error):/i.test(question);
  const isFeature = /^(?:(?:solicitar|pedir) )?(?:funci[oó]n nueva|nueva funci[oó]n|mejora):/i.test(question);
  const statusMatch = question.match(/^(?:estado|seguimiento) (?:del )?(?:bug|ticket)\s*#?(\d+)\s*\??$/i);
  if (isBug || isFeature) {
    if (isFeature && email !== FEATURE_OWNER)
      return json(res, 403, { error: 'Solo Marcelo puede solicitar funciones nuevas.' });
    if (isBug && !FEEDBACK_USERS.has(email))
      return json(res, 403, { error: 'Solo Valeria y Marcelo pueden reportar bugs.' });
    const description = question.slice(question.indexOf(':') + 1).trim();
    if (description.length < 15)
      return json(res, 400, { error: 'Describí el problema con al menos 15 caracteres.' });
    try {
      if (images.length && (!isBug || !FEEDBACK_USERS.has(email))) return json(res, 403, {error:'Adjuntos no autorizados'});
      const evidence = isBug ? await saveBugImages(images, userId) : [];
      const issue = isFeature ? await createFeedbackIssue(description, email, 'feature') : await registerValeriaBug(description, email, evidence);
      return json(res, 200, { respuesta: 'Registré ' + (isFeature ? 'la solicitud' : 'el bug') +
        ' #' + issue.number + '.\nTítulo: ' + issue.title + '\nEnlace: ' + issue.html_url +
        '\nEstado: pendiente de revisión técnica. Todavía no fue corregido ni desplegado.' });
    } catch (error) {
      console.error('Feedback error', error.message);
      return json(res, 503, { error: 'No se pudo registrar el ticket en GitHub. Contactá a Sistemas.' });
    }
  }
  if (statusMatch) {
    if (!FEEDBACK_USERS.has(email))
      return json(res, 403, { error: 'No tenés permisos para consultar tickets.' });
    try {
      const issue = await getFeedbackIssue(Number(statusMatch[1]));
      if (!/^(\[Bug Mesa de Ayuda\]|\[Bug Valeria\]|\[Función solicitada\])/.test(issue.title || ''))
        return json(res, 404, { error: 'No se encontró un ticket del Agente Moretti con ese número.' });
      const labels = (issue.labels || []).map(x => typeof x === 'string' ? x : x.name);
      const status = issue.state === 'closed' ? 'Cerrado en GitHub (QA no verificado por este comando)' :
        labels.includes('qa-aprobado') ? 'QA aprobado (según etiqueta GitHub)' :
        labels.includes('en-qa') ? 'En QA (según etiqueta GitHub)' : 'Abierto, pendiente de revisión/corrección';
      return json(res, 200, { respuesta: 'Ticket #' + issue.number + ': ' + status + '. ' + issue.html_url });
    } catch (error) {
      console.error('Feedback status error', error.message);
      return json(res, 502, { error: 'No se pudo consultar el estado del ticket.' });
    }
  }
  if (!PUENTES_API_KEY)
    return json(res, 503, { error: 'Asistente Puentes no configurado' });

  // Serialize queries from the same user to avoid mixing answers.
  if (assistantLocks.has(userId))
    return json(res, 429, { error: 'Esperá la respuesta anterior antes de consultar otra vez' });
  assistantLocks.set(userId, true);
  try {
    // Consultas de solo lectura bajo el JWT del usuario: Supabase aplica RLS.
    const [reclamos,ordenes]=await Promise.all([
      readMesaTable('mesa_reclamos',jwt),readMesaTable('mesa_ot',jwt)
    ]);
    const isOT=/\b(?:ot|orden(?:es)?(?: de trabajo)?)\b/i.test(question);
    const table=isOT?'mesa_ot':'mesa_reclamos';
    const records=isOT?ordenes:reclamos;
    const structured=!isOT?structuredClaimCount(question,reclamos):null;
    if(structured)return json(res,200,structured);
    const matching=records.filter(x=>mesaMatches(mesaRecordText(x,table),question));
    const countQuestion=/\b(cuantos|cuantas|cantidad|total)\b/i.test(normalizeMesa(question));
    if(countQuestion && matching.length) {
      const examples=matching.slice(0,15).map(x=>mesaRecordText(x,table).slice(0,200));
      return json(res,200,{respuesta:'Encontré '+matching.length+' '+(isOT?'órdenes de trabajo':'reclamos')+' que coinciden con la consulta.\n'+examples.join('\n')+(matching.length>15?'\n(Se muestran los primeros 15)':''),tipo:'supabase'});
    }
    if(countQuestion && !matching.length && /motivo|producto|cliente|subestado|estado/i.test(question))
      return json(res,200,{respuesta:'No encontré registros que coincidan con ese criterio en los datos disponibles de Mesa de Ayuda.',tipo:'supabase'});
    const context=matching.slice(0,35).map(x=>mesaRecordText(x,table).slice(0,500)).join('\n');
    const fullQuestion='Respondé usando SOLO estos datos autorizados de Mesa de Ayuda. No confundas motivo con estado. Si no hay datos suficientes, indicá la limitación. Total reclamos: '+reclamos.length+'. Total OT: '+ordenes.length+'. Coincidencias de '+table+': '+matching.length+'.\n'+context+'\nPregunta: '+question;
    const groupId = await assistantGroup(userId);
    const route = '/groups/' + encodeURIComponent(groupId) + '/messages';
    const sent = await puentes(route, {
      method: 'POST',
      body: JSON.stringify({ text: fullQuestion.slice(0,18000), clientId: require('node:crypto').randomUUID() })
    });
    const sentId = sent?.id || sent?.message?.id;
    const sentSeq = sent?.seq || sent?.message?.seq || 0;
    if (!sentId) throw new Error('Puentes message ID missing');
    // Poll the specific isolated group. Do not return other users' messages.
    const deadline = Date.now() + 55000;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 1800));
      const history = await puentes(route + '?limit=30');
      const messages = Array.isArray(history) ? history : (history?.messages || []);
      const answer = messages.find(m => m.senderType === 'bot' &&
        (m.senderId === PUENTES_BOT_ID || m.botId === PUENTES_BOT_ID) &&
        (m.replyTo === sentId || (Number(m.seq) > Number(sentSeq) && Number(sentSeq) > 0)));
      if (answer?.text) return json(res, 200, { respuesta: answer.text, tipo: 'puentes' });
    }
    return json(res, 504, { error: 'El asistente está tardando en responder. Volvé a intentar en unos instantes.' });
  } catch (e) {
    console.error('Mesa assistant request failed', { code: e.name || 'Error', message: String(e.message || '').slice(0,250) });
    return json(res, 502, { error: 'No se pudo completar la consulta del asistente. Revisar registros del servidor.' });
  } finally {
    assistantLocks.delete(userId);
  }
}

async function listOwnerTickets(req, res) {
  const auth = req.headers.authorization || '';
  if (!/^Bearer [A-Za-z0-9_.-]+$/.test(auth)) return json(res, 401, {error:'Sesión requerida'});
  try {
    const jwt = auth.slice(7);
    const identity = await sb('/auth/v1/user', ANON_KEY, {headers:{Authorization:'Bearer '+jwt}});
    if (!identity.ok || !identity.data?.id) return json(res, 401, {error:'Sesión inválida'});
    if (String(identity.data.email || '').trim().toLowerCase() !== FEATURE_OWNER)
      return json(res, 403, {error:'Solo Marcelo puede consultar la ticketera'});
    const perms = await sb('/rest/v1/mesa_usuarios?select=rol,activo&user_id=eq.'+
      encodeURIComponent(identity.data.id), ANON_KEY, {headers:{Authorization:'Bearer '+jwt}});
    if (!perms.ok || !Array.isArray(perms.data) || !perms.data.some(x=>x.activo && x.rol==='ADMIN'))
      return json(res, 403, {error:'Acceso de administrador requerido'});
    const url = new NodeURL(req.url, 'http://localhost');
    const state = ['open','closed','all'].includes(url.searchParams.get('state')) ? url.searchParams.get('state') : 'all';
    const page = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get('page'),10)||1));
    const issues = await githubFeedback('/issues?state='+state+'&per_page=50&page='+page+'&sort=created&direction=desc');
    return json(res, 200, {tickets:issues.filter(x=>!x.pull_request && /^\[(?:Bug Mesa de Ayuda|Función solicitada)\]/i.test(x.title||'')).map(x=>({
      number:x.number,title:x.title,state:x.state,created_at:x.created_at,updated_at:x.updated_at,
      html_url:x.html_url,body:x.body||'',labels:(x.labels||[]).map(y=>typeof y==='string'?y:y.name),
      assignee:x.assignee?.login||null
    })),page,has_more:issues.length===50});
  } catch(e) {
    console.error('Ticketera error',e.message);
    return json(res, 502, {error:'No se pudieron consultar los tickets de GitHub'});
  }
}

http.createServer(async (req, res) => {
  const pathname = new NodeURL(
    req.url,
    'http://localhost'
  ).pathname;

  if (pathname === '/api/asistente/chat' && req.method === 'POST') return assistantChat(req,res);
  if (pathname === '/api/tickets' && req.method === 'GET') return listOwnerTickets(req,res);

  if (pathname === '/api/clarity/estado' && req.method === 'GET') {
    const auth = req.headers.authorization || '';
    if (!/^Bearer [A-Za-z0-9_.-]+$/.test(auth)) return json(res, 401, { error: 'Sesión requerida' });
    try {
      const jwt = auth.slice(7);
      const identity = await sb('/auth/v1/user', ANON_KEY, { headers: { Authorization: 'Bearer ' + jwt } });
      if (!identity.ok || !identity.data?.id) return json(res, 401, { error: 'Sesión inválida' });
      const perms = await sb('/rest/v1/mesa_usuarios?select=rol,activo&user_id=eq.' +
        encodeURIComponent(identity.data.id), ANON_KEY, { headers: { Authorization: 'Bearer ' + jwt } });
      if (!perms.ok || !Array.isArray(perms.data) ||
          !perms.data.some(x => x.activo && x.rol === 'ADMIN')) return json(res, 403, { error: 'Solo administradores' });
      return json(res, 200, { manual_configurada: Boolean(valid && RAILWAY_TOKEN && CLARITY_SERVICE_ID && RAILWAY_ENVIRONMENT_ID) });
    } catch { return json(res, 502, { error: 'No se pudo verificar Clarity' }); }
  }

  if (pathname === '/api/clarity/ejecucion' && req.method === 'GET') return clarityEstado(req, res);

  if (pathname === '/api/clarity/importar' && req.method === 'POST') {
    return importarClarity(req, res);
  }

  if (
    pathname === '/api/usuarios/invitar' &&
    req.method === 'POST'
  ) {
    return invite(req, res);
  }

  if (pathname === '/health') {
    res.writeHead(valid ? 200 : 503, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    });

    return res.end(
      JSON.stringify({
        status: valid ? 'ok' : 'configuration_required'
      })
    );
  }

  if (pathname === '/moretti-m-blue.svg' && ['GET','HEAD'].includes(req.method)) {
    try {
      const svg = await fs.readFile(path.join(__dirname, 'moretti-m-blue.svg'));
      res.writeHead(200, {'Content-Type':'image/svg+xml','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'});
      return res.end(req.method === 'HEAD' ? '' : svg);
    } catch (e) { return json(res,404,{error:'Icono no disponible'}); }
  }

  if (
    !['/', '/mesa-de-ayuda.html'].includes(pathname) ||
    !['GET', 'HEAD'].includes(req.method)
  ) {
    res.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8'
    });

    return res.end('Not found');
  }

  try {
    let html = await fs.readFile(
      path.join(__dirname, 'mesa-de-ayuda.html'),
      'utf8'
    );

    if (valid) {
      html = html.replace(
        "url:'REEMPLAZAR_SUPABASE_URL',anonKey:'REEMPLAZAR_SUPABASE_ANON_KEY'",
        'url:' +
          JSON.stringify(URL) +
          ',anonKey:' +
          JSON.stringify(ANON_KEY)
      );
    }

    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? '' : html);
  } catch (e) {
    console.error('HTML read error', e.code);

    res.writeHead(500);
    res.end('Internal error');
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(
    'Mesa de Ayuda listening on',
    PORT,
    'configured:',
    valid
  );
});

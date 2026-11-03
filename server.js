
'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
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

async function assistantChat(req, res) {
  if (!valid || !SERVICE_KEY || !PUENTES_API_KEY)
    return json(res, 503, { error: 'Asistente Puentes no configurado' });
  const authorization = req.headers.authorization || '';
  if (!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization))
    return json(res, 401, { error: 'Iniciá sesión' });
  let body = '';
  try {
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 4096) return json(res, 413, { error: 'Mensaje demasiado largo' });
    }
  } catch { return json(res, 400, { error: 'Solicitud inválida' }); }
  let question;
  try { question = String(JSON.parse(body).mensaje || '').trim().slice(0, 600); }
  catch { return json(res, 400, { error: 'JSON inválido' }); }
  if (!question) return json(res, 400, { error: 'Escribí una consulta' });

  let userId;
  let jwt;
  try {
    jwt = authorization.slice(7);
    const identity = await sb('/auth/v1/user', ANON_KEY, {
      headers: { Authorization: 'Bearer ' + jwt }
    });
    if (!identity.ok || !identity.data.id)
      return json(res, 401, { error: 'Sesión inválida' });
    userId = identity.data.id;
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

http.createServer(async (req, res) => {
  const pathname = new NodeURL(
    req.url,
    'http://localhost'
  ).pathname;

  if (pathname === '/api/asistente/chat' && req.method === 'POST') return assistantChat(req,res);

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

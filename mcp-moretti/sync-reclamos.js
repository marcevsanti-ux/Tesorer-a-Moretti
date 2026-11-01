// Sincronización de CRM_Reclamos (Google Sheets -> Supabase).
// Ejecutar con POST /sync/reclamos y X-Api-Key: MCP_API_TOKEN.
// Requiere hoja convertida a formato nativo de Google Sheets.
import { createSign } from 'node:crypto';

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1Q-QnJmgVvknBbvqZMVFWUOy7kBIzN4Yv';
const SHEET_RANGE = process.env.GOOGLE_SHEET_RANGE || 'A:M';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON');
  const parsed = JSON.parse(raw);
  if (!parsed.client_email || !parsed.private_key) throw new Error('Credencial Google incompleta');
  return parsed;
}
function base64url(value) { return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url'); }
async function googleToken() {
  const c = credentials();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: 'RS256', typ: 'JWT' });
  const payload = base64url({ iss: c.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const data = header + '.' + payload;
  const signer = createSign('RSA-SHA256');
  signer.update(data);
  signer.end();
  const assertion = data + '.' + signer.sign(c.private_key).toString('base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), signal: AbortSignal.timeout(15000) });
  const json = await response.json();
  if (!response.ok) throw new Error('Google OAuth (' + response.status + '): ' + (json.error_description || json.error || 'falló'));
  return json.access_token;
}
function cell(row, i) { return String(row[i] ?? '').trim(); }
function normalize(row) {
  // Columnas observadas: A ID, B Fecha ingreso, C Cliente, D Tipo Cliente,
  // E Motivo, F Tipo, G Urgencia, H Estado, I Producto, J Responsable,
  // K Último contacto, L Días sin respuesta, M Observaciones.
  const id = cell(row, 0);
  if (!id || !/^\d+$/.test(id)) return null;
  const days = Number(cell(row, 11).replace(',', '.'));
  return {
    reclamo_id: id, fecha_ingreso: cell(row, 1) || null,
    cliente: cell(row, 2) || null, tipo_cliente: cell(row, 3) || null,
    motivo: cell(row, 4) || null, tipo: cell(row, 5) || null,
    urgencia: cell(row, 6) || null, estado: cell(row, 7) || null,
    producto: cell(row, 8) || null, responsable: cell(row, 9) || null,
    ultimo_contacto: cell(row, 10) || null,
    dias_sin_respuesta: Number.isFinite(days) ? days : null,
    observaciones: cell(row, 12) || null,
    sincronizado_at: new Date().toISOString()
  };
}
export async function syncReclamos() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase no configurado');
  const token = await googleToken();
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(SHEET_ID) + '/values/' + encodeURIComponent(SHEET_RANGE);
  const sheet = await fetch(url, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(20000) });
  if (!sheet.ok) throw new Error('Google Sheets (' + sheet.status + '): revisar ID, permisos y formato Google Sheets');
  const data = await sheet.json();
  const byId = new Map();
  for (const row of data.values || []) {
    const item = normalize(row);
    if (item) byId.set(item.reclamo_id, item);
  }
  const rows = [...byId.values()];
  for (let i = 0; i < rows.length; i += 200) {
    const response = await fetch(SUPABASE_URL + '/rest/v1/crm_reclamos', {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + 200)),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error('Supabase crm_reclamos (' + response.status + '): ' + (await response.text()).slice(0, 350));
  }
  return { ok: true, filas_leidas: (data.values || []).length, reclamos_sincronizados: rows.length, sheet_id: SHEET_ID };
}

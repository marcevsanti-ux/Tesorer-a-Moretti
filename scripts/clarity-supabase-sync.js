'use strict';

// Sincronización conservadora: no borra registros ni modifica observaciones.
const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function headers(prefer) {
  return {
    apikey: KEY,
    Authorization: 'Bearer ' + KEY,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {})
  };
}
async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...headers(options.prefer), ...(options.headers || {}) },
    signal: AbortSignal.timeout(30000)
  });
  const body = await response.text();
  if (!response.ok) throw new Error('Supabase HTTP ' + response.status + ': ' + body.slice(0, 300));
  return body ? JSON.parse(body) : null;
}
function normalizar(registros) {
  const porNumero = new Map();
  for (const registro of registros) {
    const numero = String(registro.ot || '').trim();
    if (!/^OS\.-?\d{5,}$/i.test(numero)) {
      throw new Error('OT inválida en extracción: ' + numero);
    }
    const valores = registro.valores;
    if (!Array.isArray(valores) || !valores.length) throw new Error('Fila sin valores: ' + numero);
    if (!porNumero.has(numero)) porNumero.set(numero, []);
    porNumero.get(numero).push(registro);
  }
  return [...porNumero.entries()].map(([numero, filas]) => ({
    numero,
    cliente: String(filas[0].valores[3] || '').trim(),
    estado: 'Pendiente',
    subestado: '8 - Garantia',
    clarity_snapshot: {
      fuente: 'Clarity',
      fechaExtraccion: new Date().toISOString(),
      filtros: { estadoID: 1, subestadoID: 120 },
      filas
    }
  }));
}
async function sincronizar(registros) {
  const filas = normalizar(registros);
  if (process.env.CLARITY_SYNC_WRITE !== 'true') {
    console.log('Supabase: simulación (CLARITY_SYNC_WRITE no es true). OT:', filas.length);
    return { simulacion: true, cantidad: filas.length, numeros: filas.map(f => f.numero) };
  }
  if (!URL_BASE.startsWith('https://') || !KEY) throw new Error('Faltan credenciales de Supabase');
  let creadas = 0, actualizadas = 0;
  for (const fila of filas) {
    if (!fila.cliente) throw new Error('Cliente vacío en OT ' + fila.numero);
    const url = URL_BASE + '/rest/v1/mesa_ot';
    const params = new URLSearchParams({select:'id,numero,pendiente_sync',numero:'eq.' + fila.numero,limit:'1'});
    const existentes = await request(url + '?' + params);
    if (existentes.length > 1) throw new Error('OT duplicada: ' + fila.numero);
    if (existentes.length && existentes[0].pendiente_sync) {
      console.log('Omitida por pendiente_sync:', fila.numero);
      continue;
    }
    if (existentes.length) {
      await request(url + '?numero=eq.' + encodeURIComponent(fila.numero), {
        method:'PATCH', prefer:'return=minimal',
        body:JSON.stringify({...fila,updated_at:new Date().toISOString()})
      });
      actualizadas++;
    } else {
      await request(url, {
        method:'POST',prefer:'return=minimal',
        body:JSON.stringify(fila)
      });
      creadas++;
    }
  }
  return {simulacion:false,cantidad:filas.length,creadas,actualizadas};
}
module.exports = { sincronizar };

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
function fechaISO(valor) {
  const s = String(valor || '').trim();
  let y, m, d;
  let match = /^(\d{4})[\/-](\d{2})[\/-](\d{2})$/.exec(s);
  if (match) [, y, m, d] = match;
  else {
    match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (!match) throw new Error('FechaFinalizacion ausente o inválida: ' + s);
    [, d, m, y] = match;
  }
  const iso = y + '-' + m + '-' + d;
  if (new Date(iso + 'T00:00:00Z').toISOString().slice(0, 10) !== iso)
    throw new Error('FechaFinalizacion imposible: ' + s);
  return iso;
}
function normalizar(registros, ejecucionId, fechaExtraccion, opciones = {}) {
  const finalizadas = opciones.estado === 'Finalizado';
  const faltaRepuesto = opciones.subestado === '7 - Falta de Repuesto';
  if(finalizadas && !opciones.fechaDesde) throw new Error('Falta rango de finalización');
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
  return [...porNumero.entries()].map(([numero, filas]) => {
    const fechas = finalizadas ? [...new Set(filas.map(f => fechaISO(f.fechaFinalizacion)))].sort() : [];
    if (finalizadas && (!fechas.length || fechas.some(fecha => fecha < opciones.fechaDesde || fecha > opciones.fechaHasta))) {
      throw new Error('Fecha finalización ausente o fuera de rango en ' + numero + ': ' + fechas.join(','));
    }
    if (finalizadas && fechas.length > 1) {
      console.warn('OT con múltiples fechas de finalización:', numero, fechas.join(','), 'Fecha consolidada:', fechas[fechas.length - 1]);
    }
    return ({
    numero,
    cliente: String(filas[0].valores[3] || '').trim(),
    estado: finalizadas ? 'Finalizado' : 'Pendiente',
    subestado: finalizadas ? 'Finalizado' : faltaRepuesto ? '7 - Falta de Repuesto' : '8 - Garantia',
    clarity_snapshot: {
      fuente: 'Clarity',
      fechaExtraccion,
      ejecucionId,
      filtros: finalizadas ? { estado: 'Finalizado', tipoFecha: 'Finalización', fechaDesde: opciones.fechaDesde, fechaHasta: opciones.fechaHasta, subestado: 'Todos' } : { estadoID: 1, subestadoID: faltaRepuesto ? opciones.subestadoID : 120 },
      ...(finalizadas ? { fechaFinalizacion: fechas[fechas.length - 1], fechasFinalizacionDetectadas: fechas } : {}),
      filas
    }
  });
  });
}
async function sincronizar(registros, opciones = {}) {
  const fechaExtraccion = new Date().toISOString();
  const ejecucionId = 'clarity-' + fechaExtraccion;
  const filas = normalizar(registros, ejecucionId, fechaExtraccion, opciones);
  if (process.env.CLARITY_SYNC_WRITE !== 'true') {
    console.log('Supabase: simulación (CLARITY_SYNC_WRITE no es true). OT:', filas.length);
    return { simulacion: true, cantidad: filas.length, numeros: filas.map(f => f.numero) };
  }
  if (!URL_BASE.startsWith('https://') || !KEY) throw new Error('Faltan credenciales de Supabase');
  let creadas = 0, actualizadas = 0, historialRegistrado = 0;
  for (const fila of filas) {
    if (!fila.cliente) throw new Error('Cliente vacío en OT ' + fila.numero);
    const url = URL_BASE + '/rest/v1/mesa_ot';
    const params = new URLSearchParams({select:'id,numero,estado,subestado,pendiente_sync',numero:'eq.' + fila.numero,limit:'2'});
    const existentes = await request(url + '?' + params);
    if (existentes.length > 1) throw new Error('OT duplicada: ' + fila.numero);
    // Las consultas auxiliares solo reconcilian OT ya conocidas: nunca importan
    // indiscriminadamente órdenes ajenas a la cartera de Garantía.
    if (opciones.existingOnly && !existentes.length) continue;
    if (existentes.length && existentes[0].pendiente_sync) {
      console.log('Omitida por pendiente_sync:', fila.numero);
      continue;
    }
    const anterior = existentes[0] || null;
    const cambioReal = anterior && (
      String(anterior.estado ?? '') !== fila.estado ||
      String(anterior.subestado ?? '') !== fila.subestado
    );
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
    // Guardar únicamente altas observadas y cambios de estado/subestado.
    // La fecha es de detección, no necesariamente la fecha original de Clarity.
    if (!anterior || cambioReal) {
      await request(URL_BASE + '/rest/v1/mesa_ot_historial', {
        method: 'POST', prefer: 'return=minimal',
        body: JSON.stringify({
          ot_id: fila.numero,
          estado_anterior: anterior?.estado ?? null,
          estado_nuevo: fila.estado,
          subestado_anterior: anterior?.subestado ?? null,
          subestado_nuevo: fila.subestado,
          fecha_cambio: new Date().toISOString(),
          origen: 'CLARITY',
          observaciones: anterior
            ? 'Cambio detectado en sincronización; fecha de detección.'
            : 'Primera observación en sincronización; fecha de detección.'
        })
      });
      historialRegistrado++;
    }
  }
  return {simulacion:false,cantidad:filas.length,creadas,actualizadas,historialRegistrado};
}
module.exports = { sincronizar };

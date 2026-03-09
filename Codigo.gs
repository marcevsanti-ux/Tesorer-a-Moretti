// ============================================================
// MORETTI S.A. · Tesorería · Sistema de Cheques Rechazados
// ============================================================
// ARCHIVOS NECESARIOS EN APPS SCRIPT:
//   - Codigo.gs  (este archivo)
//   - Index.html (el otro archivo)
//
// INSTRUCCIONES:
// 1. Pegá este código en Codigo.gs
// 2. Creá un archivo nuevo HTML llamado "Index" y pegá el otro código
// 3. Guardá todo
// 4. Implementar → Nueva implementación → Aplicación web
//    - Ejecutar como: Yo
//    - Acceso: Cualquier persona de la organización (o Cualquier persona)
// ============================================================

const SHEET_RECHAZADOS = 'RECHAZADOS';
const SHEET_CANCELADOS = 'CANCELADOS';

// ─── SETUP ───────────────────────────────────────────────────
function setup() {
  Logger.log('✅ Tesorería Moretti · Setup OK');
}

// ─── SERVIR HTML ─────────────────────────────────────────────
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Tesorería · Moretti S.A.')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ─── LEER RECHAZADOS ─────────────────────────────────────────
function getRechazados() {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_RECHAZADOS);
    if (!sheet) return { ok: false, error: 'Hoja RECHAZADOS no encontrada' };

    const data = sheet.getDataRange().getValues();
    if (data.length < 4) return { ok: true, data: [], kpis: getKPIs([]) };

    const rows = [];
    for (let i = 3; i < data.length; i++) {
      const r = data[i];
      if (!r[0] && !r[5]) continue;
      rows.push({
        fila:               i + 1,
        cliente:            String(r[0]  || '').trim(),
        emision:            formatDate(r[1]),
        vencimiento:        formatDate(r[2]),
        tipo:               String(r[3]  || '').trim(),
        tipoLetra:          String(r[4]  || '').trim(),
        nroCheque:          String(r[5]  || '').trim(),
        fechaRechazo:       formatDate(r[6]),
        mes:                String(r[7]  || '').trim(),
        anio:               String(r[8]  || '').trim(),
        motivo:             String(r[9]  || '').trim(),
        importe:            parseNum(r[10]),
        gastos:             parseNum(r[11]),
        total:              parseNum(r[12]),
        detalle:            String(r[13] || '').trim(),
        aviso:              formatDate(r[14]),
        tipoCancelacion:    String(r[15] || '').trim(),
        cancelacion:        formatDate(r[16]),
        importeCancelacion: parseNum(r[17]),
        pendiente:          parseNum(r[18]),
        envio:              String(r[19] || '').trim(),
        cacDev:             String(r[20] || '').trim(),
        diasMora:           parseNum(r[21]),
      });
    }

    return { ok: true, data: rows, kpis: getKPIs(rows), total: rows.length };
  } catch(err) {
    return { ok: false, error: err.message };
  }
}

// ─── LEER CANCELADOS ─────────────────────────────────────────
function getCancelados() {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_CANCELADOS);
    if (!sheet) return { ok: true, data: [] };

    const data = sheet.getDataRange().getValues();
    if (data.length < 4) return { ok: true, data: [] };

    const rows = [];
    for (let i = 3; i < data.length; i++) {
      const r = data[i];
      if (!r[0] && !r[5]) continue;
      rows.push({
        fila:               i + 1,
        cliente:            String(r[0]  || '').trim(),
        emision:            formatDate(r[1]),
        vencimiento:        formatDate(r[2]),
        tipo:               String(r[3]  || '').trim(),
        nroCheque:          String(r[5]  || '').trim(),
        fechaRechazo:       formatDate(r[6]),
        mes:                String(r[7]  || '').trim(),
        anio:               String(r[8]  || '').trim(),
        motivo:             String(r[9]  || '').trim(),
        importe:            parseNum(r[10]),
        gastos:             parseNum(r[11]),
        detalle:            String(r[13] || '').trim(),
        cancelacion:        formatDate(r[16]),
        importeCancelacion: parseNum(r[17]),
      });
    }

    return { ok: true, data: rows, total: rows.length };
  } catch(err) {
    return { ok: false, error: err.message };
  }
}

// ─── ACTUALIZAR FILA ─────────────────────────────────────────
function actualizarFila(fila, campos) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_RECHAZADOS);
    if (!sheet) return { ok: false, error: 'Hoja RECHAZADOS no encontrada' };

    const colMap = {
      detalle:            14,
      aviso:              15,
      tipoCancelacion:    16,
      cancelacion:        17,
      importeCancelacion: 18,
      pendiente:          19,
      envio:              20,
      cacDev:             21,
    };

    Object.entries(campos).forEach(([key, val]) => {
      if (colMap[key]) sheet.getRange(fila, colMap[key]).setValue(val);
    });

    return { ok: true, fila };
  } catch(err) {
    return { ok: false, error: err.message };
  }
}

// ─── KPIs ─────────────────────────────────────────────────────
function getKPIs(rows) {
  const activos        = rows.filter(r => r.pendiente > 0);
  const totalPendiente = activos.reduce((s, r) => s + r.pendiente, 0);
  const totalImporte   = rows.reduce((s, r) => s + r.importe, 0);
  const totalGastos    = rows.reduce((s, r) => s + r.gastos, 0);
  const moraProm       = activos.length
    ? activos.reduce((s, r) => s + (r.diasMora || 0), 0) / activos.length : 0;

  const porMotivo = {};
  rows.forEach(r => {
    if (!porMotivo[r.motivo]) porMotivo[r.motivo] = { cantidad: 0, importe: 0 };
    porMotivo[r.motivo].cantidad++;
    porMotivo[r.motivo].importe += r.pendiente;
  });

  const porCliente = {};
  rows.forEach(r => {
    if (!r.cliente) return;
    if (!porCliente[r.cliente]) porCliente[r.cliente] = { cantidad: 0, pendiente: 0 };
    porCliente[r.cliente].cantidad++;
    porCliente[r.cliente].pendiente += r.pendiente;
  });
  const topClientes = Object.entries(porCliente)
    .map(([nombre, d]) => ({ nombre, ...d }))
    .sort((a, b) => b.pendiente - a.pendiente)
    .slice(0, 8);

  return {
    totalPendiente,
    totalImporte,
    totalGastos,
    cantidadActivos: activos.length,
    cantidadTotal:   rows.length,
    moraProm:        Math.round(moraProm),
    porMotivo,
    topClientes,
  };
}

// ─── HELPERS ─────────────────────────────────────────────────
function parseNum(v) {
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  return parseFloat(String(v).replace(/[^0-9.-]/g, '')) || 0;
}

function formatDate(v) {
  if (!v) return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy');
  }
  return String(v).trim();
}

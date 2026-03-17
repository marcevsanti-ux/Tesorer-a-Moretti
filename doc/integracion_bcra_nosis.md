# Informe de Integración — API BCRA y Nosis WS.01
## Tesorería Moretti S.A. — Sistema de Estado Crediticio
**Fecha:** 17/03/2026 | **Versión sistema:** v2.3.1

---

## 1. RESUMEN EJECUTIVO

El sistema consume hoy dos fuentes crediticias: la **API pública del BCRA** (Central de Deudores) y el módulo de análisis de **informes PDF de Nosis Manager** vía IA (Gemini). Este informe documenta el estado actual, problemas conocidos y el camino exacto para lograr integración 100% operativa en ambas fuentes.

---

## 2. INTEGRACIÓN BCRA

### 2.1 Estado actual

| Endpoint | Función | Estado |
|---|---|---|
| `GET /Deudas/{CUIT}` | Deudas vigentes sistema financiero | ⚠️ Intermitente |
| `GET /Deudas/Historicas/{CUIT}` | Historial 24 meses | ❌ No implementado |
| `GET /Deudas/ChequesRechazados/{CUIT}` | Cheques rechazados | ✅ Funciona via botón BCRA |

### 2.2 Causa del problema

```
Frontend → BCRA directo        → CORS bloqueado
Frontend → Cloudflare Worker   → BCRA bloquea IPs Cloudflare (error 520)
Frontend → Supabase Edge Fn    → Funciona para ChequesRechazados
                                → Intermitente para /Deudas/ (IP 45.235.97.44 bloqueada)
```

### 2.3 Solución definitiva

**Opción A — Dominio propio Cloudflare (~USD 10/año):**
```
1. Cloudflare → Workers & Pages → bcra-proxy → Settings → Triggers → Custom Domains
2. Agregar: api.tesoreria.moretti.com.ar
3. En index.html: const PROXY_CF = 'https://api.tesoreria.moretti.com.ar';
```

**Opción B — VPS propio (~USD 5/mes):**
Servidor en DigitalOcean/Linode con proxy Express. IPs de hosting convencional no están bloqueadas por BCRA.

### 2.4 Historial de deudas — pendiente implementar

Una vez resuelto el proxy, agregar en `consultarCUIT()`:
```javascript
const resHistorico = await fetch(PROXY_SB + '?endpoint=Deudas/Historicas/' + cuit).then(r => r.json());
// Mostrar tabla 24 meses por banco en la UI
```

### 2.5 Checklist BCRA al 100%
- [ ] Resolver proxy con IP fija (dominio propio o VPS)
- [ ] Implementar `/Deudas/Historicas/{CUIT}` y mostrar historial 24 meses
- [ ] Agregar campo CUIT obligatorio en tabla `cheques` para consulta automática
- [ ] Caché de consultas en Supabase (evitar repetir mismo CUIT el mismo día)

---

## 3. INTEGRACIÓN NOSIS WS.01

### 3.1 Estado actual — PDF + IA (Gemini)

El operador descarga el PDF de Nosis Manager manualmente, lo sube a la app, Gemini lo analiza y genera el informe completo. Funciona bien pero requiere intervención manual. **El objetivo es reemplazarlo con la API directa WS.01**, manteniendo el PDF como fallback.

### 3.2 Especificación técnica WS.01 (v1.4 — 28/01/2025)

#### Endpoints oficiales

| Protocolo | URL |
|---|---|
| REST | `https://ws01.nosis.com/rest` |
| HTTP Simple (API) | `https://ws01.nosis.com/api` |
| Schema XSD | `https://ws01.nosis.com/xsd/variables` |

#### Autenticación

Header HTTP obligatorio en **todas** las requests:
```
X-API-KEY: {api_key_cliente}
```
La API Key se puede regenerar en el portal de autogestión de Nosis o llamando al 2206-8000.

#### Parámetros de consulta

| Parámetro | Obligatorio | Descripción |
|---|---|---|
| `Documento` | ✅ Sí | CUIT, CUIL o DNI |
| `VR` | ✅ Sí | Número del grupo de variables del cliente |
| `RazonSocial` | No | Para desambiguar DNI |
| `Sexo` | No | M, F o X — para desambiguar DNI |
| `CDA` | No | Número del Criterio de Aceptación a aplicar |
| `Informe` | No | Número de grupo informe — incluye el PDF Manager en la respuesta |
| `RespuestaReducida` | No | SI/NO — si SI, devuelve solo nombre y valor |
| `Timeout` | No | Segundos máximos de espera |
| `Format` | No | XML (default) o **JSON** — usar JSON para simplificar el parseo |

#### Ejemplo de request para Moretti

```
GET https://ws01.nosis.com/rest/variables
    ?documento=27377866954
    &VR=99001
    &CDA=1211051
    &Format=JSON
    &Timeout=30

Headers:
  X-API-KEY: {api_key_188289}
```

> **Datos del contrato Moretti** (extraídos del informe de prueba del 17/03/2026):
> - Usuario Nosis: **188289 — ANDRES MORETTI E HIJOS SA**
> - Grupo VR: **99001** — "NM Personas Humanas" (Versión 9, 15/12/2025)
> - CDA: **1211051** — "Distribuidores" (configurado 26/03/2012)

#### Estructura de respuesta XML

```xml
<?xml version="1.0" encoding="utf-8"?>
<VariablesResponse xmlns="http://schemas.nosis.com/sac/ws01/types">
  <Contenido>

    <Pedido>
      <Usuario>188289</Usuario>
      <Documento>27377866954</Documento>
      <VR>99001</VR>
    </Pedido>

    <Resultado>
      <Estado>200</Estado>            <!-- Código HTTP estándar -->
      <Novedad>OK</Novedad>
      <Tiempo>305</Tiempo>            <!-- ms de procesamiento Nosis -->
      <FechaRecepcion>2026-03-17T12:48:00</FechaRecepcion>
      <Transaccion>guid-unico</Transaccion>
      <Referencia>27377866954</Referencia>
      <Version>1.4.0</Version>
    </Resultado>

    <Datos>
      <!-- Solo presente cuando Estado = 200 -->

      <Informe>
        <!-- Solo si se pasó el parámetro Informe -->
        <Status>Pendiente</Status>
        <Ticket>guid-del-informe</Ticket>
      </Informe>

      <Variables>
        <Variable>
          <Nombre>SCO_Score</Nombre>
          <Valor>1</Valor>
          <Descripcion>Score de Riesgo</Descripcion>
          <Tipo>ENTERO</Tipo>
          <FechaAct>2026-03-17</FechaAct>
        </Variable>
        <Variable>
          <Nombre>CI_PeorSituacion</Nombre>
          <Valor>4</Valor>
          <Tipo>ENTERO</Tipo>
        </Variable>
        <Variable>
          <Nombre>CI_MontoTotal</Nombre>
          <Valor>25618</Valor>   <!-- en miles de pesos -->
          <Tipo>MONEDA</Tipo>
        </Variable>
        <Variable>
          <Nombre>HC_CantSFNoPagados6m</Nombre>
          <Valor>197</Valor>
          <Tipo>ENTERO</Tipo>
        </Variable>
        <!-- ... resto de variables del VR 99001 ... -->
      </Variables>

    </Datos>
  </Contenido>
</VariablesResponse>
```

**Tipos de dato:** `ENTERO`, `DECIMAL`, `FECHA`, `TEXTO`, `PERIODO`, `BOOLEANO`, `DOCUMENTO`, `MONEDA`, `PORCENTAJE`, `TEL_NUMERO`, `TEL_AREA`, `XML`

#### Códigos de retorno completos

| Código | Estado | Descripción | Acción en sistema |
|---|---|---|---|
| 200 | OK | Consulta exitosa | Renderizar informe |
| 400 | Bad Request | Parámetro incorrecto (E01/E02) | Mostrar error al operador |
| 401 | Unauthorized | API Key inválida (E10) | Avisar en Configuración |
| 403 | Forbidden | IP no autorizada (E12) | Agregar IP a whitelist Nosis |
| 408 | Timeout | Sin respuesta en tiempo (E18) | Reintentar o usar PDF |
| 422 | Unprocessable | CUIT inexistente (E20) / ambiguo (E28) | Avisar al operador |
| 429 | Too Many Requests | Límite excedido (E19) | Mostrar mensaje de límite |
| 500 | Internal Error | Error Nosis (E90/E91) | Usar PDF fallback |

### 3.3 Proxy — por qué es necesario y cómo implementarlo

Nosis **no tiene CORS habilitado para browsers**, por lo que la llamada debe hacerse desde servidor. La solución es extender la **Supabase Edge Function** `bcra-proxy` existente:

```typescript
// Agregar al index.ts de la Edge Function bcra-proxy

if (source === 'nosis') {
  const documento = url.searchParams.get('documento');
  const vr  = url.searchParams.get('vr')  || '99001';
  const cda = url.searchParams.get('cda') || '1211051';

  // API Key guardada como Secret en Supabase (nunca en el frontend)
  const nosisKey = Deno.env.get('NOSIS_API_KEY');
  const nosisUrl = `https://ws01.nosis.com/rest/variables`
                 + `?documento=${documento}&VR=${vr}&CDA=${cda}&Format=JSON&Timeout=30`;

  const res = await fetch(nosisUrl, {
    headers: { 'X-API-KEY': nosisKey }
  });
  const data = await res.json();

  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
```

**Configurar el Secret en Supabase:**
```
Dashboard → Edge Functions → bcra-proxy → Secrets → New Secret
Nombre:  NOSIS_API_KEY
Valor:   {api_key_que_provea_nosis}
```

> **Importante — IP whitelist:** Nosis puede requerir autorizar la IP saliente de Supabase. Si devuelve error 403 (E12 — IP no autorizada), informar a Nosis que autoricen la IP `45.235.97.44` para el cliente 188289.

### 3.4 Implementación en el frontend (index.html)

```javascript
// Botón a agregar en Estado Crediticio junto al de BCRA:
// <button onclick="consultarNosisDirecto(cuitInput.value)">Consultar Nosis</button>

async function consultarNosisDirecto(cuit) {
  const result = document.getElementById('nosisResult');
  result.innerHTML = '<div style="display:flex;gap:10px"><div class="spinner"...></div>Consultando Nosis API...</div>';

  try {
    const url = 'https://qqmzhwifrkgfrgewmpig.supabase.co/functions/v1/bcra-proxy'
              + '?source=nosis&documento=' + cuit.replace(/\D/g,'');
    const res  = await fetch(url);
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    if(data?.Contenido?.Resultado?.Estado !== 200) {
      throw new Error(data?.Contenido?.Resultado?.Novedad || 'Error Nosis');
    }

    const info = mapNosisVariablesToInfo(data);
    result.innerHTML = buildNosisHTML(info);
    setTimeout(() => renderFeatureImportanceChart(info), 50);
    registrarLog('CONSULTA_CREDITICIA', { detalle: 'Consulta Nosis API CUIT: ' + cuit });

  } catch(e) {
    result.innerHTML = `<div style="background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);
      border-radius:8px;padding:14px;font-size:11px;color:#f87171">
      ⚠ Error Nosis API: ${e.message}. Podés importar el PDF manualmente.
    </div>`;
  }
}

function mapNosisVariablesToInfo(data) {
  // Convertir array de variables a objeto clave-valor
  const v = {};
  const vars = data?.Contenido?.Datos?.Variables?.Variable || [];
  (Array.isArray(vars) ? vars : [vars]).forEach(item => {
    v[item.Nombre] = item.Valor;
  });

  const i = k => parseInt(v[k]) || 0;
  const f = k => parseFloat(v[k]) || 0;
  const t = k => v[k] || '';

  return {
    denominacion:  t('VI_RazonSocial'),
    cuit:          t('VI_Identificacion'),
    fechaInforme:  new Date().toLocaleDateString('es-AR'),
    score: { valor: i('SCO_Score'), maximo: 999,
             interpretacion: i('SCO_Score') < 200 ? 'Riesgo muy alto'
                           : i('SCO_Score') < 500 ? 'Riesgo medio' : 'Riesgo bajo' },
    situacionBCRA: { numero: i('CI_PeorSituacion'),
                     descripcion: ['','Normal','Riesgo Bajo','Riesgo Medio',
                                   'Riesgo Alto','Irrecuperable','Irrec. Disp. Técnica'][i('CI_PeorSituacion')] || '',
                     color: 'normal' },
    nivelDeuda: {
      totalSistemaFinanciero: f('CI_MontoTotal') * 1000,
      compromisoMensual:      f('CI_CompromisoMensual'),
      entidades: []
    },
    chequesRechazados: {
      totalCantidad:      i('HC_CantSFNoPagados6m'),
      totalMonto:         f('HC_MontoSFNoPagados6m'),
      actitudPago:        i('HC_CantSFNoPagados6m') > 0 ? 'No pagó' : 'Sin antecedentes',
      porcentajeAbonado:  0,
      resumenPorBanco:    [],
      estadisticaMensual: []
    },
    resultadoCDA: t('CD_CriterioAceptacion') || '—',
    alertas:      generarAlertasNosis(v),
    resumenEjecutivo: '',
    evolucionAntecedentes: { tendencia: 'estable', descripcion: '', situacionesUltimos12meses: [] }
  };
}

function generarAlertasNosis(v) {
  const alertas = [];
  const score = parseInt(v['SCO_Score']) || 0;
  const sit   = parseInt(v['CI_PeorSituacion']) || 0;
  const cheq  = parseInt(v['HC_CantSFNoPagados6m']) || 0;

  if(score < 200)  alertas.push('Score crediticio extremadamente bajo (' + score + ').');
  if(sit >= 4)     alertas.push('Situación BCRA ' + sit + ' — alto riesgo de insolvencia.');
  if(cheq > 0)     alertas.push(cheq + ' cheques rechazados sin pagar en los últimos 6 meses.');
  if(v['DF_TieneDeudas'] === 'True') alertas.push('Tiene deudas fiscales registradas.');
  if(v['FA_TieneFacturasApocrifas'] === 'True') alertas.push('Tiene facturas apócrifas.');
  return alertas;
}
```

### 3.5 Comparación: PDF + IA vs API directa WS.01

| Criterio | Actual (PDF + Gemini) | Objetivo (WS.01) |
|---|---|---|
| Velocidad | 15-30 seg | 2-5 seg |
| Intervención manual | Alta | Nula |
| Costo adicional | Gemini gratis (1500/día) | Incluido en contrato Nosis |
| Precisión | Alta (IA interpreta) | Exacta (dato directo) |
| Sub-nodos de detalle | Parcial | Completo (entidades, historial) |
| Requiere proxy | No | Sí (Edge Function Supabase) |

---

## 4. CHECKLIST COMPLETO — Nosis WS.01

### A — Gestión comercial (sin código)
- [ ] Confirmar con asesor Nosis que el contrato incluye acceso al **WS.01**
- [ ] Obtener la **API Key** del cliente 188289
- [ ] Confirmar **VR habilitado** (según informe de prueba: 99001)
- [ ] Confirmar **CDA habilitado** (según informe de prueba: 1211051)
- [ ] Preguntar si hay **whitelist de IPs** requerida → informar IP `45.235.97.44` (Supabase)
- [ ] Solicitar **ambiente de sandbox/pruebas** para desarrollo sin consumir crédito
- [ ] Confirmar el formato de respuesta soportado (XML y/o JSON)

### B — Técnico
- [ ] Agregar Secret `NOSIS_API_KEY` en Supabase Edge Function `bcra-proxy`
- [ ] Extender Edge Function para manejar `?source=nosis`
- [ ] Testear con CUIT real: `curl "https://ws01.nosis.com/rest/variables?documento=27377866954&VR=99001&Format=JSON" -H "X-API-KEY: {key}"`
- [ ] Implementar `consultarNosisDirecto()` y `mapNosisVariablesToInfo()` en index.html
- [ ] Agregar botón "Consultar Nosis" en Estado Crediticio
- [ ] Agregar campo CUIT en tabla `cheques` (Supabase SQL)
- [ ] Mantener flujo PDF como fallback

---

## 5. ROADMAP

| Semana | Tarea |
|---|---|
| 1 | Obtener API Key Nosis + confirmar VR/CDA + whitelist IP |
| 1 | Resolver proxy BCRA (dominio propio Cloudflare) |
| 2 | Extender Edge Function + testear WS.01 |
| 2 | Implementar botón "Consultar Nosis" en la app |
| 3 | Agregar campo CUIT en tabla cheques |
| 3 | Implementar historial BCRA 24 meses |
| 4 | QA completo + pase a producción |

---

## 6. REFERENCIAS

### Nosis WS.01
| Item | Valor |
|---|---|
| Endpoint REST | `https://ws01.nosis.com/rest` |
| Endpoint API | `https://ws01.nosis.com/api` |
| Versión API | **1.4 (28/01/2025)** |
| Autenticación | Header `X-API-KEY` |
| Formato | XML (default) o JSON |
| Atención al Cliente | **2206-8000 / 5166-8000** |
| Email | info@nosis.com |
| Usuario Moretti | **188289 — ANDRES MORETTI E HIJOS SA** |
| Grupo VR | **99001 — NM Personas Humanas (v9, 15/12/2025)** |
| CDA | **1211051 — Distribuidores (26/03/2012)** |

### BCRA
| Item | Valor |
|---|---|
| Base URL | `https://api.bcra.gob.ar/centraldedeudores/v1.0/` |
| Documentación | https://www.bcra.gob.ar/BCRAyVos/API_Documentacion.asp |

### Infraestructura Moretti
| Item | Valor |
|---|---|
| Edge Function | `https://qqmzhwifrkgfrgewmpig.supabase.co/functions/v1/bcra-proxy` |
| Cloudflare Worker | `https://bcra-proxy.marcevsanti.workers.dev` |
| **IP saliente Supabase** | **`45.235.97.44`** (informar a Nosis para whitelist) |

---

*Basado en: WS.01 Variables API v1.4 — Nosis Laboratorio de Investigación y Desarrollo S.A.*  
*Sistema Tesorería Moretti v2.3.1 — 17/03/2026*

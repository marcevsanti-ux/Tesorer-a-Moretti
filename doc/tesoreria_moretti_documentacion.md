# Tesorería Moretti — Documentación del Proyecto

> Sistema de gestión de cheques rechazados · Moretti S.A.
> Última actualización: 17/03/2026

---

## Índice

1. [Arquitectura General](#arquitectura-general)
2. [URLs y Accesos](#urls-y-accesos)
3. [Credenciales y Claves](#credenciales-y-claves)
4. [Base de Datos — Supabase](#base-de-datos--supabase)
5. [Usuarios del Sistema](#usuarios-del-sistema)
6. [Versiones](#versiones)
7. [Funcionalidades Activas](#funcionalidades-activas)
8. [Pendientes](#pendientes)
9. [Estructura de Tablas SQL](#estructura-de-tablas-sql)
10. [Notas Técnicas](#notas-técnicas)

---

## Arquitectura General

```
Frontend (GitHub Pages)
    ├── index.html       → App Desktop
    ├── login.html       → Pantalla de login
    └── mobile.html      → App Mobile

Base de Datos
    └── Supabase PostgreSQL (tesoreria-moretti)

IA
    └── Gemini 2.5 Flash (lectura de comprobantes y análisis Nosis via API Key)

Auth
    └── Supabase Auth (email + contraseña)

Proxies API BCRA
    ├── Supabase Edge Function "bcra-proxy" → endpoint ChequesRechazados (funciona)
    └── Cloudflare Worker "bcra-proxy" → endpoint Deudas (intermitente — BCRA bloquea IPs)
```

**Stack:**
- Frontend: HTML + CSS + JavaScript vanilla (sin frameworks)
- Base de datos: Supabase PostgreSQL
- Auth: Supabase Auth
- Hosting: GitHub Pages
- IA: Google Gemini 2.5 Flash
- Proxies: Supabase Edge Functions + Cloudflare Workers

---

## URLs y Accesos

| Recurso | URL |
|---|---|
| App Desktop | https://marcevsanti-ux.github.io/Tesorer-a-Moretti/ |
| Login | https://marcevsanti-ux.github.io/Tesorer-a-Moretti/login.html |
| App Mobile | https://marcevsanti-ux.github.io/Tesorer-a-Moretti/mobile.html |
| Repositorio GitHub | https://github.com/marcevsanti-ux/Tesorer-a-Moretti |
| Supabase Dashboard | https://supabase.com/dashboard/project/qqmzhwifrkgfrgewmpig |
| Supabase Edge Functions | https://supabase.com/dashboard/project/qqmzhwifrkgfrgewmpig/functions |
| Cloudflare Workers | https://dash.cloudflare.com — cuenta marcevsanti@gmail.com |
| Cloudflare Worker URL | https://bcra-proxy.marcevsanti.workers.dev |
| Google Sheet (histórico) | https://docs.google.com/spreadsheets/d/1rJK2rRGf8fYjktOIX1BxS94EaCGs-XPhQa6bLnHQjwE/edit |
| Apps Script (deprecado) | https://script.google.com/u/0/home/projects/1Y5yMJrJ2aMFeke5vke5T9Y3n2YfHSYZuzPMgAg0dEGByzo_HduhHUM_K/edit |

---

## Credenciales y Claves

### Supabase — Proyecto `tesoreria-moretti`

| Campo | Valor |
|---|---|
| Project URL | `https://qqmzhwifrkgfrgewmpig.supabase.co` |
| Anon Key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxbXpod2lmcmtnZnJnZXdtcGlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2OTg4MzcsImV4cCI6MjA4OTI3NDgzN30.4W-n_WLRvcrE385qv0Phil4PrHrb1twpsZvxxIHodeg` |
| DB Password | `3#f3x9z.7#Wz++f` |
| Region | South America (São Paulo) — sa-east-1 |

### Gemini API Key (IA)

| Campo | Valor |
|---|---|
| Proyecto en AI Studio | `tesoreria-moretti` |
| Key (termina en) | `...tZjo` |
| Nombre | `Gemini API Key` |
| Plan | Gratuito — 1500 req/día |
| Generada | 16/03/2026 |

> ⚠️ La API Key de Gemini se guarda en `localStorage` con el nombre `gemini_key`.
> Se configura desde Configuración en el desktop o desde Config en el mobile.
> Se usa para: escaneo de comprobantes de cheques Y análisis de informes PDF de Nosis.

### Cloudflare Worker — `bcra-proxy`

| Campo | Valor |
|---|---|
| URL | `https://bcra-proxy.marcevsanti.workers.dev` |
| Cuenta | marcevsanti@gmail.com |
| Plan | Gratuito — 100k req/día |
| Función | Proxy para API BCRA (endpoint Deudas) |
| Estado | Intermitente — BCRA bloquea IPs de Cloudflare en producción |

---

## Base de Datos — Supabase

### Tablas

#### `public.cheques`
Tabla principal. Contiene todos los cheques rechazados y cancelados.

| Columna | Tipo | Descripción |
|---|---|---|
| id | uuid | Primary key |
| cliente | text | Nombre del emisor |
| emision | date | Fecha de emisión |
| vencimiento | date | Fecha de vencimiento |
| tipo | text | Electronico / Fisico / TEST |
| tipo_letra | text | V (default) |
| nro_cheque | text | Número de cheque |
| fecha_rechazo | date | Fecha del rechazo |
| mes | text | ENERO, FEBRERO, etc. |
| anio | integer | Año del rechazo |
| motivo | text | SIN FONDOS / CTA CERRADA / etc. |
| importe | numeric | Importe original |
| gastos | numeric | Gastos bancarios |
| total | numeric | importe + gastos |
| detalle | text | Acción/detalle de gestión |
| aviso | date | Fecha de aviso |
| tipo_cancelacion | text | Tipo de cancelación |
| cancelacion | date | Fecha de cancelación |
| importe_cancelacion | numeric | Importe cancelado |
| pendiente | numeric | Saldo pendiente |
| envio | text | A quién se envió |
| cac_dev | text | CAC / DEV |
| dias_mora | integer | Días de mora |
| evidencia_url | text | Link al comprobante en Drive |
| emisor | text | Propio / Terceros |
| hoja | text | RECHAZADOS / CANCELADOS |
| created_at | timestamptz | Fecha de creación |
| updated_at | timestamptz | Última modificación |
| created_by | uuid | Usuario que creó el registro |

> ⚠️ **Bug conocido:** el campo `evidencia_url` no se migró correctamente desde Google Sheets. Los links de Drive de la planilla original están en el Sheet histórico pero no en Supabase. Pendiente de fix con script SQL.

#### `public.usuarios`
Perfiles de usuarios del sistema.

| Columna | Tipo | Descripción |
|---|---|---|
| id | uuid | FK a auth.users |
| nombre | text | Nombre del usuario |
| email | text | Email |
| rol | text | admin / operador / consulta / crediticio |
| activo | boolean | Habilitado o no |
| created_at | timestamptz | Fecha de alta |

#### `public.logs`
Auditoría completa de movimientos.

| Columna | Tipo | Descripción |
|---|---|---|
| id | uuid | Primary key |
| accion | text | ALTA / MODIFICACION / BAJA / LOGIN / CONSULTA_CREDITICIA |
| cheque_id | uuid | FK a cheques |
| nro_cheque | text | Número de cheque |
| cliente | text | Nombre del cliente |
| usuario_id | uuid | FK a auth.users |
| usuario_email | text | Email del usuario |
| usuario_nombre | text | Nombre del usuario |
| campo | text | Campo modificado |
| valor_anterior | text | Valor antes del cambio |
| valor_nuevo | text | Valor después del cambio |
| cambios | jsonb | Cambios múltiples en formato JSON |
| detalle | text | Descripción libre |
| created_at | timestamptz | Timestamp del evento |

### Row Level Security (RLS)

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| cheques | Todos autenticados | Admin + Operador | Admin + Operador | Solo Admin |
| usuarios | Todos autenticados | Solo Admin | Solo Admin | — |
| logs | Todos autenticados | Todos autenticados | — | — |

### Datos migrados
- **290 cheques** en RECHAZADOS (migrados desde Google Sheets el 16/03/2026)
- **151 cheques** en CANCELADOS (migrados desde Google Sheets el 16/03/2026)

### Edge Functions activas

| Función | URL | Descripción |
|---|---|---|
| bcra-proxy | `https://qqmzhwifrkgfrgewmpig.supabase.co/functions/v1/bcra-proxy` | Proxy para API BCRA — funciona para ChequesRechazados, falla intermitentemente para Deudas |

> JWT verification: **OFF** (desactivado para permitir requests desde el browser sin auth)

---

## Usuarios del Sistema

| Nombre | Email | Rol | Estado |
|---|---|---|---|
| Marcelo | marcelos@moretti.com.ar | admin | Activo |
| M Santos | msantos@moretti.com.ar | admin | Activo |

### Roles y permisos

| Acción | Admin | Operador | Consulta | Crediticio |
|---|---|---|---|---|
| Ver todos los datos | ✅ | ✅ | ✅ | ❌ |
| Cargar cheque nuevo | ✅ | ✅ | ❌ | ❌ |
| Editar registro | ✅ | ✅ | ❌ | ❌ |
| Eliminar registro | ✅ | ❌ | ❌ | ❌ |
| Gestionar usuarios | ✅ | ❌ | ❌ | ❌ |
| Tab Estado Crediticio | ✅ | ✅ | ✅ | ✅ |

> ⚠️ El rol **crediticio** está pendiente de implementar en el código. Solo debe ver la tab Estado Crediticio — ideal para pasarlo a otros sectores (ventas, cobranzas, etc.)

---

## Versiones

### App Desktop (index.html)
| Versión | Cambios principales |
|---|---|
| v1.0 — v1.3.x | Base con Google Sheets + Apps Script |
| v2.0.0 | Migración a Supabase, login, roles |
| v2.0.1 | Tab Resumen (pivot motivo/cliente/año) |
| v2.0.2 | Fix formato fechas |
| v2.0.3 | Tab Estado Crediticio (API BCRA) |
| v2.0.4 | Tab Log de actividad, logo BCRA eliminado |
| v2.0.5 | Edición de usuarios, mapeo BCRA corregido |
| v2.0.6 | CUIT normalizado (acepta guiones, puntos, espacios) |
| v2.0.7 | Fix CORS API BCRA — intento con corsproxy.io |
| v2.0.8 | Fix CORS — intento con allorigins.win |
| v2.0.9 | Proxy via Supabase Edge Function bcra-proxy |
| v2.1.0 | Fix parseo estructura real BCRA ChequesRechazados. Badge versión en blanco |
| v2.1.1 | Proxy migrado a Cloudflare Worker |
| v2.1.2 | Sección cheques con KPIs + botón Validar en BCRA. Botón Importar Informe Nosis |
| v2.1.3 | Fix bug sintaxis JS (comillas en onmouseover) |
| v2.1.4 | Módulo análisis Nosis completo via Gemini (4 puntos de Mica) |
| v2.1.5 | Leyenda cheques actualizada. Proxy vuelve a Supabase Edge Function |
| v2.1.6 | Arquitectura híbrida: CF para Deudas, Supabase para ChequesRechazados |
| v2.1.7 | Cheques rechazados solo via botón BCRA. CF solo para Deudas |
| v2.1.8 | Supabase con fallback a CF para Deudas (actual) |

### App Mobile (mobile.html)
| Versión | Cambios principales |
|---|---|
| v1.0 — v1.3.x | Base con Google Sheets + Apps Script |
| v2.0.6 — v2.0.8 | Migración a Supabase, login integrado |
| v2.1.x | Fixes de autenticación y visibilidad del login |
| v2.1.4 | Login estable, CSS con especificidad correcta |

### Apps Script (deprecado)
| Versión | Cambios |
|---|---|
| v1.0.1 | Base |
| v1.0.2 | Fix doble mail |
| v1.0.3 | Fix formato moneda en planilla |
| v1.0.4 | Validación duplicados, fix setNumberFormat |
| v1.0.5 | Campo Emisor agregado |

> ⚠️ El Apps Script y Google Sheets quedaron como respaldo histórico.
> Todo el sistema ahora opera sobre Supabase.

---

## Funcionalidades Activas

### Desktop (v2.1.8)
- ✅ Login con email + contraseña (Supabase Auth)
- ✅ Roles: admin / operador / consulta
- ✅ Dashboard con KPIs y gráficos
- ✅ Tab Resumen — pivot motivo/cliente/año (exportable a CSV)
- ✅ Tab Estado Crediticio:
  - Consulta deudas sistema financiero via proxy (Supabase + fallback Cloudflare)
  - Razón social del consultado
  - Situación BCRA con colores (1 al 6)
  - KPIs de cheques rechazados (cantidad, monto, causa) con botón "Validar en BCRA"
  - Botón "Importar Informe Nosis" — analiza PDF via Gemini y genera informe con:
    - Score Nosis
    - Situación BCRA con barra visual 1-6
    - Nivel de deuda por entidad
    - Cheques rechazados por banco con actitud de pago
    - Evolución de antecedentes (tendencia + historial 12 meses)
    - Alertas automáticas
    - Resumen ejecutivo en lenguaje natural
- ✅ Tab Log de actividad — auditoría completa con filtros
- ✅ Tabla Rechazados con filtros, búsqueda y ordenamiento
- ✅ Tabla Cancelados
- ✅ Nuevo cheque: carga manual + escaneo con IA (Gemini)
- ✅ Editar registro
- ✅ Eliminar registro (solo admin)
- ✅ Validación de duplicados con warning
- ✅ Exportar CSV
- ✅ Importación masiva desde Excel
- ✅ Gestión de usuarios (solo admin): crear, editar, activar/desactivar
- ✅ Campo Emisor: Propio / Terceros
- ✅ Campo Detalle texto libre al elegir "Pago a proveedores"

### Mobile (v2.1.4)
- ✅ Login con email + contraseña
- ✅ Escanear comprobante con cámara (IA Gemini)
- ✅ Elegir archivo de galería o PDF
- ✅ Pre-carga automática de datos por IA
- ✅ Formulario manual de carga
- ✅ Guardar directo en Supabase
- ✅ Validación de duplicados
- ✅ Registro en Log
- ✅ Botón logout

---

## Pendientes

### Alta prioridad
- 🔴 **Rol "crediticio"** — acceso exclusivo a tab Estado Crediticio para otros sectores (ventas, cobranzas). Requiere cambio en código de navegación y en RLS de Supabase.
- 🔴 **Fix evidencia_url** — los links de Drive no se migraron desde Google Sheets. Hay que hacer un script SQL que tome los links del Sheet histórico y los inserte en Supabase por nro_cheque.
- 🔴 **API BCRA Deudas** — el proxy falla intermitentemente. Solución definitiva: dominio propio en Cloudflare (`api.tesoreria.moretti.com.ar`) o VPS propio. Mientras tanto funciona via PDF de Nosis.
- 🔴 Vincular CUIT del emisor como campo obligatorio

### Media prioridad
- 🟡 **Integración Nosis API** — ya tienen contrato, pendiente recibir credenciales. Necesitan: URL endpoint, API Key, documentación técnica del plan. Se integra en tab Estado Crediticio junto a la consulta BCRA.
- 🟡 Opción TEST en el campo Tipo (ya está en el schema)
- 🟡 Cartera de cheques — previsión de riesgo
- 🟡 Informes programados y alertas por horario
- 🟡 Vinculación cliente → vendedor (con CUIT)

### Futuro
- ⚪ Migrar a dominio propio (`tesoreria.moretti.com.ar`) — con esto se resuelve también el problema del proxy BCRA usando `api.tesoreria.moretti.com.ar`
- ⚪ Análisis de riesgo / curva ROC (requiere campo CUIT y más datos)
- ⚪ Maestro de clientes

---

## Notas Técnicas

### Problema API BCRA — Estado actual
La API del BCRA (`api.bcra.gob.ar`) bloquea requests que no provienen de navegadores reales:
- **CORS:** bloquea fetch directo desde el browser
- **Cloudflare:** bloquea IPs de Cloudflare Workers en producción (error 520)
- **Supabase Edge Functions:** funciona para `/Deudas/ChequesRechazados/` pero falla intermitentemente para `/Deudas/` (SSL error, IP `45.235.97.44` bloqueada)

**Solución actual (v2.1.8):** Supabase Edge Function con fallback a Cloudflare Worker para endpoint Deudas. Funciona de forma intermitente.

**Solución definitiva:** dominio propio en Cloudflare. Con `api.tesoreria.moretti.com.ar` el Worker funcionaría sin restricciones.

**Workaround disponible:** el módulo de análisis Nosis (PDF via Gemini) provee toda la info crediticia incluso cuando la API del BCRA falla.

### Cloudflare Worker — bcra-proxy
```javascript
// Código del Worker (worker.js)
export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    try {
      const url = new URL(request.url);
      const endpoint = url.searchParams.get('endpoint');
      if (!endpoint) return new Response(JSON.stringify({ error: 'Falta parámetro endpoint' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const bcraUrl = 'https://api.bcra.gob.ar/centraldedeudores/v1.0/' + endpoint;
      const bcraRes = await fetch(bcraUrl, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
      const text = await bcraRes.text();
      return new Response(text, { status: bcraRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch(e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  },
};
```

### Supabase Edge Function — bcra-proxy
```typescript
// Código de la Edge Function (index.ts)
Deno.serve(async (req: Request) => {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const endpoint = url.searchParams.get('endpoint');
    if (!endpoint) return new Response(JSON.stringify({ error: 'Falta parámetro endpoint' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const bcraUrl = 'https://api.bcra.gob.ar/centraldedeudores/v1.0/' + endpoint;
    const bcraRes = await fetch(bcraUrl, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } });
    const data = await bcraRes.json();
    return new Response(JSON.stringify(data), { status: bcraRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
```

### Análisis Nosis — Estructura del PDF
El módulo espera PDFs de **Nosis Manager** (formato estándar). Gemini extrae y devuelve JSON con:
- denominacion, cuit, fechaInforme
- score (valor/999 + interpretación)
- situacionBCRA (número 1-6 + descripción)
- nivelDeuda (total + compromisoMensual + entidades[])
- chequesRechazados (cantidad, monto, actitudPago, resumenPorBanco[], estadisticaMensual[])
- evolucionAntecedentes (tendencia + situacionesUltimos12meses[])
- consultasNosis, relacionesVinculadas, resultadoCDA, alertas[], resumenEjecutivo

### Dominio propio (cuando se decida)
Para usar `tesoreria.moretti.com.ar`:
1. Agregar CNAME en DNS: `tesoreria → marcevsanti-ux.github.io`
2. En GitHub Pages: Custom domain → `tesoreria.moretti.com.ar`
3. Para el proxy BCRA: agregar `api.tesoreria.moretti.com.ar` como custom domain del Cloudflare Worker `bcra-proxy`
4. Actualizar `MOBILE_URL` en `index.html`
5. El `localStorage` de la API Key de Gemini no se migra — hay que volver a cargarla

### Integración Nosis API (cuando lleguen las credenciales)
Nosis tiene API REST (Nosis Manager API). Necesitamos:
- URL base del endpoint
- API Key / credenciales
- Documentación técnica de su plan

Con eso se integra al lado de la consulta BCRA en la tab Estado Crediticio. El módulo de análisis PDF ya está listo — solo hay que agregar la llamada directa a la API.

### API BCRA — Endpoints disponibles
```
GET https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/{CUIT}
GET https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/Historicas/{CUIT}
GET https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/ChequesRechazados/{CUIT}
```
Respuesta en JSON. Monto expresado en miles de pesos.

### Supabase — Plan gratuito
- Máximo 2 proyectos activos simultáneos
- El proyecto `logistica-multi-proveedor` está pausado (no cuenta)
- Hay lugar para 1 proyecto activo más si se necesita

### GitHub
- Repositorio público: `marcevsanti-ux/Tesorer-a-Moretti`
- Branch principal: `main`
- GitHub Pages sirve desde `main` directamente
- Sin proceso de build — HTML estático directo

---

*Documento actualizado el 17/03/2026*

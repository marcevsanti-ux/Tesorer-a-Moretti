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

Storage
    └── Supabase Storage — bucket "comprobantes" (público)

IA
    └── Gemini 2.5 Flash (lectura de comprobantes y análisis Nosis via API Key)

Auth
    └── Supabase Auth (email + contraseña, sin confirmación de email)

Proxies API BCRA
    ├── Supabase Edge Function "bcra-proxy" → endpoint ChequesRechazados (funciona)
    └── Cloudflare Worker "bcra-proxy" → endpoint Deudas (intermitente — BCRA bloquea IPs)
```

**Stack:**
- Frontend: HTML + CSS + JavaScript vanilla (sin frameworks)
- Base de datos: Supabase PostgreSQL
- Storage: Supabase Storage (bucket `comprobantes`)
- Auth: Supabase Auth (Confirm email: **OFF**)
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
| Supabase Storage | https://supabase.com/dashboard/project/qqmzhwifrkgfrgewmpig/storage/buckets |
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

### Supabase Storage

| Campo | Valor |
|---|---|
| Bucket | `comprobantes` |
| Tipo | Público (Public bucket) |
| Límite | 50 MB por archivo (Supabase default) |
| Uso | Fotos y PDFs de comprobantes de cheques |

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
| evidencia_url | text | URL pública del comprobante en Supabase Storage |
| emisor | text | Propio / Terceros |
| hoja | text | RECHAZADOS / CANCELADOS |
| created_at | timestamptz | Fecha de creación |
| updated_at | timestamptz | Última modificación |
| created_by | uuid | Usuario que creó el registro |

> ✅ El campo `evidencia_url` ahora guarda la URL pública del archivo subido a Supabase Storage (bucket `comprobantes`). Los archivos del Sheet histórico aún no se migraron — pendiente fix con script SQL.

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

> **CHECK CONSTRAINT `usuarios_rol_check`:** acepta `admin`, `operador`, `consulta`, `crediticio`.

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
| usuarios | Todos autenticados | Autenticados (`WITH CHECK (true)`) | Solo Admin | — |
| logs | Todos autenticados | Todos autenticados | — | — |
| storage.objects (comprobantes) | Público | Autenticados | Autenticados | — |

### Políticas RLS activas relevantes

```sql
-- usuarios: cualquier autenticado puede insertar (admin crea usuarios de otros)
"authenticated_insert_usuarios" FOR INSERT TO authenticated WITH CHECK (true);

-- storage: upload autenticado, lectura pública
"authenticated_upload_comprobantes" FOR INSERT TO authenticated WITH CHECK (bucket_id = 'comprobantes');
"public_read_comprobantes" FOR SELECT TO public USING (bucket_id = 'comprobantes');
"authenticated_update_comprobantes" FOR UPDATE TO authenticated USING (bucket_id = 'comprobantes');
```

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
| Julian Balbi | jbalbi@moretti.com.ar | crediticio | Activo |

### Roles y permisos

| Acción | Admin | Operador | Consulta | Crediticio |
|---|---|---|---|---|
| Ver Dashboard, Rechazados, Cancelados, Resumen | ✅ | ✅ | ✅ | ❌ |
| Ver Tab Estado Crediticio | ✅ | ✅ | ✅ | ✅ |
| Tab Importación | ✅ | ✅ | ❌ | ❌ |
| Tab Log | ✅ | ✅ | ✅ | ❌ |
| Tab Configuración | ✅ | ✅ | ✅ | ❌ |
| Cargar cheque nuevo | ✅ | ✅ | ❌ | ❌ |
| Editar registro | ✅ | ✅ | ❌ | ❌ |
| Subir comprobante | ✅ | ✅ | ❌ | ❌ |
| Eliminar registro | ✅ | ❌ | ❌ | ❌ |
| Gestionar usuarios | ✅ | ❌ | ❌ | ❌ |
| Descargar backup Excel | ✅ | ❌ | ❌ | ❌ |

> El rol **crediticio** accede únicamente a la tab Estado Crediticio. Ideal para ventas, cobranzas y otros sectores que necesitan consultar antecedentes sin ver la operatoria interna.

### Notas sobre creación de usuarios
- Supabase Auth tiene **"Confirm email" desactivado** — los usuarios pueden loguearse inmediatamente sin confirmar email.
- Para crear un usuario nuevo: Configuración → Gestión de Usuarios → Nuevo Usuario.
- Si aparece error "User already registered": el email ya existe en `auth.users`. Eliminarlo desde Supabase Dashboard → Authentication → Users y volver a crear.
- Si aparece error RLS en `public.usuarios`: verificar que la política `authenticated_insert_usuarios` esté activa.

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
| v2.1.8 | Supabase con fallback a CF para Deudas |
| v2.2.0 | Exportar informe Nosis a PDF con membrete Moretti. Gráfico Feature Importance. Nombre archivo CUIT_NOMBRE.pdf |
| v2.2.1 | Rol `crediticio` — solo accede a Estado Crediticio. Bug evidencia_url: columna Comp. con preview en tabla. Campo Link en modal editar |
| v2.2.2 | Preview comprobante inline — modal fullscreen con iframe Drive o imagen. Botón ojo en tabla |
| v2.2.3 | Uploader comprobante con Supabase Storage. Drag & drop en modal editar. Upload a bucket `comprobantes` |
| v2.2.4 | Fix creación de usuarios: manejo rate limit email, error "already registered". Función `registrarLog` agregada |
| v2.2.5 | Fix crearUsuario: upsert en lugar de insert, manejo robusto de errores |
| v2.2.6 | Fix RLS usuarios (`authenticated_insert_usuarios`). `registrarLog` restaurada. `crearUsuario` con upsert |
| v2.2.7 | Eliminado botón "Reenviar Acceso" (no aplica sin confirmación de email) |
| v2.2.8 | Backup Excel completo — botón en header (luego movido). 6 solapas formato original |
| v2.2.9 | Backup con formato exacto de la planilla original (merges, anchos, solapas CH Recibidos, Resumen, ACCION, LOG) |
| v2.3.0 | Botón backup movido a Configuración — solo visible para admin |
| v2.3.1 | Nombre de archivo backup: `backup cheques rechazados DD-MM-AAAA HH-MM.xlsx` |

### App Mobile (mobile.html)
| Versión | Cambios principales |
|---|---|
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

### Desktop (v2.3.1)
- ✅ Login con email + contraseña (Supabase Auth, sin confirmación de email)
- ✅ Roles: admin / operador / consulta / crediticio
- ✅ Rol crediticio: acceso exclusivo a tab Estado Crediticio
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
    - Gráfico Feature Importance (factores de riesgo)
    - Alertas automáticas
    - Resumen ejecutivo en lenguaje natural
  - **Exportar informe Nosis a PDF** — membrete Moretti, fuentes, nombre `CUIT_NOMBRE.pdf`
- ✅ Tab Log de actividad — auditoría completa con filtros
- ✅ Tabla Rechazados con filtros, búsqueda y ordenamiento
- ✅ Columna comprobante: ícono ojo abre preview inline (iframe Drive o imagen)
- ✅ Tabla Cancelados
- ✅ Nuevo cheque: carga manual + escaneo con IA (Gemini)
- ✅ Editar registro — incluye uploader de comprobante (foto/PDF → Supabase Storage)
- ✅ Eliminar registro (solo admin)
- ✅ Validación de duplicados con warning
- ✅ Exportar CSV
- ✅ Importación masiva desde Excel
- ✅ Gestión de usuarios (solo admin): crear, editar, activar/desactivar
- ✅ Campo Emisor: Propio / Terceros
- ✅ Campo Detalle texto libre al elegir "Pago a proveedores"
- ✅ **Backup Excel completo** (solo admin, en Configuración): descarga `backup cheques rechazados FECHA HORA.xlsx` con 6 solapas en formato idéntico al original

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
- 🔴 **Fix evidencia_url histórico** — los links de Drive del Sheet histórico no se migraron a Supabase. Hay que hacer un script SQL que tome los links del Sheet y los inserte por nro_cheque. Los nuevos comprobantes ya se guardan en Supabase Storage.
- 🔴 **API BCRA Deudas** — el proxy falla intermitentemente. Solución definitiva: dominio propio en Cloudflare (`api.tesoreria.moretti.com.ar`) o VPS propio.
- 🔴 Vincular CUIT del emisor como campo obligatorio

### Media prioridad
- 🟡 **Integración Nosis API** — ya tienen contrato, pendiente recibir credenciales. URL endpoint, API Key, documentación técnica del plan. Se integra en tab Estado Crediticio junto a la consulta BCRA. El módulo de análisis PDF ya está listo.
- 🟡 Opción TEST en el campo Tipo (ya está en el schema)
- 🟡 Cartera de cheques — previsión de riesgo
- 🟡 Informes programados y alertas por horario
- 🟡 Vinculación cliente → vendedor (con CUIT)

### Futuro
- ⚪ Migrar a dominio propio (`tesoreria.moretti.com.ar`)
- ⚪ Análisis de riesgo / curva ROC (requiere campo CUIT y más datos)
- ⚪ Maestro de clientes

---

## Notas Técnicas

### Supabase Auth — configuración actual
- **Confirm email: OFF** — usuarios pueden loguearse inmediatamente sin confirmar email
- Esto resuelve el problema del rate limit de emails (2/hora en plan gratuito)
- Configuración: Authentication → Sign In / Providers → Email → Confirm email: desactivado

### Supabase Storage — bucket comprobantes
- Bucket público: las URLs son accesibles sin autenticación
- Las fotos/PDFs se suben desde el modal de edición de cheque
- Path del archivo: `{cheque_id}_{timestamp}.{ext}`
- URL pública: `https://qqmzhwifrkgfrgewmpig.supabase.co/storage/v1/object/public/comprobantes/{path}`
- Preview inline en la app: iframe para Drive/PDF, `<img>` para imágenes

### Problema API BCRA — Estado actual
La API del BCRA (`api.bcra.gob.ar`) bloquea requests que no provienen de navegadores reales:
- **CORS:** bloquea fetch directo desde el browser
- **Cloudflare:** bloquea IPs de Cloudflare Workers en producción (error 520)
- **Supabase Edge Functions:** funciona para `/Deudas/ChequesRechazados/` pero falla intermitentemente para `/Deudas/`

**Solución actual (v2.3.1):** Supabase Edge Function con fallback a Cloudflare Worker para endpoint Deudas.
**Workaround disponible:** el módulo de análisis Nosis (PDF via Gemini) provee toda la info crediticia incluso cuando la API del BCRA falla.

### Backup Excel
El backup descarga un `.xlsx` con 6 solapas en el mismo formato que la planilla original:
1. **CH Recibidos No Ingresados** — estructura original preservada
2. **Resumen** — pivot por motivo × año calculado en tiempo real
3. **RECHAZADOS** — 25 columnas, merges A1:M2 y O1:W2, mismos anchos
4. **CANCELADOS** — mismo formato que RECHAZADOS
5. **ACCION** — lista completa de acciones disponibles
6. **LOG** — historial completo de movimientos (hasta 5000 registros)

### Supabase — Plan gratuito
- Máximo 2 proyectos activos simultáneos
- El proyecto `logistica-multi-proveedor` está pausado (no cuenta)
- Hay lugar para 1 proyecto activo más si se necesita

### GitHub
- Repositorio público: `marcevsanti-ux/Tesorer-a-Moretti`
- Branch principal: `main`
- GitHub Pages sirve desde `main` directamente
- Sin proceso de build — HTML estático directo

### API BCRA — Endpoints disponibles
```
GET https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/{CUIT}
GET https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/Historicas/{CUIT}
GET https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/ChequesRechazados/{CUIT}
```
Respuesta en JSON. Monto expresado en miles de pesos.

### Integración Nosis API (cuando lleguen las credenciales)
Nosis tiene API REST (Nosis Manager API). Necesitamos:
- URL base del endpoint
- API Key / credenciales
- Documentación técnica de su plan

Con eso se integra al lado de la consulta BCRA en la tab Estado Crediticio. El módulo de análisis PDF ya está listo — solo hay que agregar la llamada directa a la API.

### Dominio propio (cuando se decida)
Para usar `tesoreria.moretti.com.ar`:
1. Agregar CNAME en DNS: `tesoreria → marcevsanti-ux.github.io`
2. En GitHub Pages: Custom domain → `tesoreria.moretti.com.ar`
3. Para el proxy BCRA: agregar `api.tesoreria.moretti.com.ar` como custom domain del Cloudflare Worker `bcra-proxy`
4. Actualizar `MOBILE_URL` en `index.html`
5. El `localStorage` de la API Key de Gemini no se migra — hay que volver a cargarla

---

*Documento actualizado el 17/03/2026*

# Tesorería Moretti — Documentación del Proyecto

> Sistema de gestión de cheques rechazados · Moretti S.A.
> Última actualización: 19/03/2026

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
9. [Notas Técnicas](#notas-técnicas)

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

Notificaciones (100% automático)
    └── Trigger SQL (INSERT en cheques) → Edge Function "enviar-mail-rechazo" → Gmail SMTP (cuenta Mica)
```

**Stack:**
- Frontend: HTML + CSS + JavaScript vanilla (sin frameworks)
- Base de datos: Supabase PostgreSQL
- Storage: Supabase Storage (bucket `comprobantes`)
- Auth: Supabase Auth (Confirm email: **OFF**)
- Hosting: GitHub Pages
- IA: Google Gemini 2.5 Flash
- Proxies: Supabase Edge Functions + Cloudflare Workers
- Mail: Gmail SMTP via App Password (cuenta `micasantosmoretti@gmail.com`)

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
| Supabase SQL Editor | https://supabase.com/dashboard/project/qqmzhwifrkgfrgewmpig/sql |
| Cloudflare Workers | https://dash.cloudflare.com — cuenta marcevsanti@gmail.com |
| Cloudflare Worker URL | https://bcra-proxy.marcevsanti.workers.dev |
| Google Sheet (histórico) | https://docs.google.com/spreadsheets/d/1rJK2rRGf8fYjktOIX1BxS94EaCGs-XPhQa6bLnHQjwE/edit |
| Apps Script (deprecado) | https://script.google.com/u/0/home/projects/1Y5yMJrJ2aMFeke5vke5T9Y3n2YfHSYZuzPMgAg0dEGByzo_HduhHUM_K/edit |
| Resend Dashboard | https://resend.com — cuenta marcevsanti@gmail.com (GitHub) — no se usa activamente |
| Google App Passwords | https://myaccount.google.com/apppasswords — cuenta micasantosmoretti@gmail.com |

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
| Límite | 50 MB por archivo |
| Uso | Fotos y PDFs de comprobantes de cheques |

### Gemini API Key (IA)

| Campo | Valor |
|---|---|
| Proyecto en AI Studio | `tesoreria-moretti` |
| Key (termina en) | `...tZjo` |
| Plan | Gratuito — 1500 req/día |
| Generada | 16/03/2026 |

> ⚠️ La API Key de Gemini se guarda en `localStorage` con el nombre `gemini_key`. Se configura desde Configuración en el desktop o desde Config en el mobile.

### Cloudflare Worker — `bcra-proxy`

| Campo | Valor |
|---|---|
| URL | `https://bcra-proxy.marcevsanti.workers.dev` |
| Cuenta | marcevsanti@gmail.com |
| Plan | Gratuito — 100k req/día |
| Estado | Intermitente — BCRA bloquea IPs de Cloudflare en producción |

### Gmail SMTP — Sistema de Mail

| Campo | Valor |
|---|---|
| Cuenta remitente | `micasantosmoretti@gmail.com` |
| Nombre visible | `Tesoreria Moretti` |
| Método auth | App Password (Google) |
| Nombre del App Password | `tesoreria-moretti` |
| Secret en Supabase | `GMAIL_USER` + `GMAIL_APP_PASSWORD` |
| Verificación 2 pasos | Activada en la cuenta de Mica |

> ⚠️ Si se cambia la contraseña de Google de Mica, el App Password se invalida. Hay que generar uno nuevo en myaccount.google.com/apppasswords y actualizar el secret `GMAIL_APP_PASSWORD` en Supabase → Edge Functions → Secrets.

### Resend (creado pero en desuso)

| Campo | Valor |
|---|---|
| Cuenta | marcevsanti@gmail.com (GitHub) |
| Estado | Reemplazado por Gmail SMTP — plan gratuito solo permitía enviar al mail de registro |

### Secrets en Supabase Edge Functions

| Secret | Descripción |
|---|---|
| `GMAIL_USER` | `micasantosmoretti@gmail.com` |
| `GMAIL_APP_PASSWORD` | App Password de Google (16 chars sin espacios) |
| `RESEND_API_KEY` | En desuso |
| `tesoreria-moretti` | Secret viejo — puede eliminarse |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / etc. | Auto-generados por Supabase |

---

## Base de Datos — Supabase

### Tablas

#### `public.cheques`

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

#### `public.usuarios`

| Columna | Tipo | Descripción |
|---|---|---|
| id | uuid | FK a auth.users |
| nombre | text | Nombre del usuario |
| email | text | Email |
| rol | text | admin / operador / consulta / crediticio |
| activo | boolean | Habilitado o no |
| created_at | timestamptz | Fecha de alta |

#### `public.logs`

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
| usuarios | Todos autenticados | Autenticados | Solo Admin | — |
| logs | Todos autenticados | Todos autenticados | — | — |
| storage.objects (comprobantes) | Público | Autenticados | Autenticados | — |

### Edge Functions activas

| Función | URL | JWT verify |
|---|---|---|
| bcra-proxy | `https://qqmzhwifrkgfrgewmpig.supabase.co/functions/v1/bcra-proxy` | OFF |
| enviar-mail-rechazo | `https://qqmzhwifrkgfrgewmpig.supabase.co/functions/v1/enviar-mail-rechazo` | OFF |

### Trigger SQL activo

```sql
-- Función
notify_nuevo_rechazo()
-- Se ejecuta en cada INSERT en public.cheques donde hoja = 'RECHAZADOS'
-- Llama a la Edge Function enviar-mail-rechazo via net.http_post

-- Trigger
trigger_nuevo_rechazo
AFTER INSERT ON public.cheques FOR EACH ROW
EXECUTE FUNCTION notify_nuevo_rechazo();
```

**mail_to hardcodeado:** `micasantosmoretti@gmail.com`
**Pendiente:** hacer `mail_to` y `mail_cc` configurables desde tabla `configuracion` en Supabase.

### Datos migrados
- **290 cheques** en RECHAZADOS (migrados desde Google Sheets el 16/03/2026)
- **151 cheques** en CANCELADOS (migrados desde Google Sheets el 16/03/2026)

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

---

## Versiones

### App Desktop (index.html)
| Versión | Cambios principales |
|---|---|
| v1.0 — v1.3.x | Base con Google Sheets + Apps Script |
| v2.0.0 | Migración a Supabase, login, roles |
| v2.0.1 — v2.1.8 | Proxies BCRA, Estado Crediticio, Nosis, fixes varios |
| v2.2.0 — v2.2.9 | PDF Nosis, rol crediticio, comprobantes, backup Excel |
| v2.3.0 | Backup movido a Configuración |
| v2.3.1 | Nombre archivo backup con fecha/hora |
| v2.3.2 | Mail al guardar rechazado via Resend (luego reemplazado) |
| v2.3.3 | Card "Notificaciones por Mail" en Configuración — Enviado de, Enviar a, CC |
| v2.3.4 | Reescritura mail con Gmail SMTP. Adjunto evidencia si existe |
| v2.3.5 | Mail dispara al subir comprobante desde Editar |
| v2.3.6 | **Mail removido del JS — 100% automático via trigger SQL en Supabase** |

### App Mobile (mobile.html)
| Versión | Cambios principales |
|---|---|
| v2.1.4 | Login estable, CSS con especificidad correcta |
| v2.1.5 | Mail al guardar rechazado (luego reemplazado por trigger) |
| v2.1.6 | Gmail SMTP, mail_from configurable |
| v2.1.7 | **Mail removido del JS — 100% automático via trigger SQL** |

### Apps Script (deprecado)
| Versión | Cambios |
|---|---|
| v1.0.1 — v1.0.5 | Base, fix mails, formato moneda, validación duplicados, campo Emisor |

---

## Funcionalidades Activas

### Desktop (v2.3.6)
- ✅ Login con email + contraseña (Supabase Auth, sin confirmación)
- ✅ Roles: admin / operador / consulta / crediticio
- ✅ Dashboard con KPIs y gráficos
- ✅ Tab Resumen — pivot motivo/cliente/año (exportable a CSV)
- ✅ Tab Estado Crediticio con BCRA + análisis Nosis PDF via Gemini
- ✅ Exportar informe Nosis a PDF con membrete Moretti
- ✅ Tab Log de actividad — auditoría completa con filtros
- ✅ Tabla Rechazados con filtros, búsqueda y ordenamiento
- ✅ Tabla Cancelados
- ✅ Nuevo cheque: carga manual + escaneo con IA (Gemini)
- ✅ Editar registro — uploader de comprobante (foto/PDF → Supabase Storage)
- ✅ Eliminar registro (solo admin)
- ✅ Validación de duplicados con warning
- ✅ Exportar CSV / Importación masiva desde Excel
- ✅ Gestión de usuarios (solo admin)
- ✅ Backup Excel completo (solo admin) — 6 solapas formato original
- ✅ **Mail automático via trigger SQL** — sale solo al insertar cualquier cheque en RECHAZADOS, desde cualquier origen (Desktop, Mobile, importación masiva)
- ✅ **Configuración de mail** en tab Configuración — Enviado de, Enviar a (múltiples), CC (múltiples), guardado en localStorage

### Mobile (v2.1.7)
- ✅ Login con email + contraseña
- ✅ Escanear comprobante con cámara (IA Gemini)
- ✅ Formulario manual de carga
- ✅ Guardar directo en Supabase
- ✅ Validación de duplicados / Registro en Log
- ✅ **Mail automático via trigger SQL** al guardar en RECHAZADOS
- ✅ Botón logout

---

## Pendientes

### Alta prioridad
- 🔴 **Fix evidencia_url histórico** — links de Drive del Sheet no migrados a Supabase Storage
- 🔴 **API BCRA Deudas** — proxy falla intermitentemente. Solución: dominio propio o VPS
- 🔴 **mail_to configurable desde Supabase** — actualmente hardcodeado en el trigger SQL. Crear tabla `configuracion` con `mail_to` y `mail_cc` y que el trigger la lea dinámicamente
- 🔴 Vincular CUIT del emisor como campo obligatorio

### Media prioridad
- 🟡 **Integración Nosis API** — contrato firmado, pendiente credenciales
- 🟡 Cartera de cheques — previsión de riesgo
- 🟡 Informes programados y alertas por horario
- 🟡 Vinculación cliente → vendedor (con CUIT)
- 🟡 **Verificar dominio moretti.com.ar en Resend** — para usar `tesoreria@moretti.com.ar` como remitente (requiere acceso DNS en NIC.ar)

### Futuro
- ⚪ Migrar a dominio propio (`tesoreria.moretti.com.ar`)
- ⚪ Análisis de riesgo / curva ROC
- ⚪ Maestro de clientes

---

## Notas Técnicas

### Sistema de Mail — Arquitectura final (v2.3.6 / v2.1.7)

**Flujo completo:**
1. Se inserta un cheque en `public.cheques` con `hoja = 'RECHAZADOS'`
2. El trigger `trigger_nuevo_rechazo` detecta el INSERT
3. La función SQL hace `net.http_post` a la Edge Function `enviar-mail-rechazo`
4. La Edge Function se conecta a `smtp.gmail.com:465` con las credenciales de Mica
5. Mail sale desde `Tesoreria Moretti <micasantosmoretti@gmail.com>`

**Asunto:** `Nuevo cheque rechazado - Moretti S.A. - {CLIENTE} - N {NRO_CHEQUE}`

**Contenido:** Cliente, N° cheque, tipo, fecha rechazo, motivo, importe, gastos, emisor, detalle, link comprobante si existe.

**Configuración de destinatarios** (tab Configuración → Notificaciones por Mail):
- `Enviado de` → `localStorage: mail_from`
- `Enviar a` → `localStorage: mail_to` (varios por coma)
- `CC` → `localStorage: mail_cc` (varios por coma)

> ⚠️ El trigger tiene `mail_to` hardcodeado como `micasantosmoretti@gmail.com`. La configuración del Desktop aplica solo cuando el mail se dispara desde el JS (subida de comprobante desde Editar). Para unificar: crear tabla `configuracion` en Supabase.

**Script SQL completo del trigger (para re-crear si es necesario):**
```sql
CREATE OR REPLACE FUNCTION notify_nuevo_rechazo()
RETURNS trigger AS $$
BEGIN
  IF NEW.hoja = 'RECHAZADOS' THEN
    PERFORM net.http_post(
      url := 'https://qqmzhwifrkgfrgewmpig.supabase.co/functions/v1/enviar-mail-rechazo',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxbXpod2lmcmtnZnJnZXdtcGlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2OTg4MzcsImV4cCI6MjA4OTI3NDgzN30.4W-n_WLRvcrE385qv0Phil4PrHrb1twpsZvxxIHodeg'
      ),
      body := jsonb_build_object(
        'cliente',       NEW.cliente,
        'nro_cheque',    NEW.nro_cheque,
        'tipo',          COALESCE(NEW.tipo, '—'),
        'fecha_rechazo', TO_CHAR(NEW.fecha_rechazo, 'DD/MM/YYYY'),
        'motivo',        COALESCE(NEW.motivo, '—'),
        'importe',       '$' || TO_CHAR(COALESCE(NEW.importe, 0), 'FM999,999,999.00'),
        'gastos',        '$' || TO_CHAR(COALESCE(NEW.gastos, 0), 'FM999,999,999.00'),
        'emisor',        COALESCE(NEW.emisor, '—'),
        'detalle',       COALESCE(NEW.detalle, '—'),
        'evidencia_url', NEW.evidencia_url,
        'mail_to',       'micasantosmoretti@gmail.com',
        'mail_cc',       ''
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trigger_nuevo_rechazo
  AFTER INSERT ON public.cheques
  FOR EACH ROW
  EXECUTE FUNCTION notify_nuevo_rechazo();
```

### Regenerar App Password de Gmail
1. Ir a myaccount.google.com/apppasswords (cuenta Mica)
2. Eliminar `tesoreria-moretti`
3. Crear uno nuevo con el mismo nombre
4. Actualizar secret `GMAIL_APP_PASSWORD` en Supabase → Edge Functions → Secrets

### Supabase Auth
- **Confirm email: OFF** — usuarios logueados inmediatamente sin confirmar email

### Supabase Storage — bucket comprobantes
- Bucket público — URLs accesibles sin autenticación
- Path: `{cheque_id}_{timestamp}.{ext}`
- URL: `https://qqmzhwifrkgfrgewmpig.supabase.co/storage/v1/object/public/comprobantes/{path}`

### Problema API BCRA
- CORS bloquea fetch directo desde browser
- Cloudflare Workers bloqueado por BCRA en producción (error 520)
- Supabase Edge Function funciona para ChequesRechazados, falla intermitentemente para Deudas
- Solución actual: Supabase con fallback a Cloudflare para Deudas

### GitHub
- Repositorio: `marcevsanti-ux/Tesorer-a-Moretti` (público)
- Branch: `main` → GitHub Pages directo, sin build

### Dominio propio (cuando se decida)
1. CNAME: `tesoreria → marcevsanti-ux.github.io`
2. GitHub Pages Custom domain → `tesoreria.moretti.com.ar`
3. CF Worker custom domain → `api.tesoreria.moretti.com.ar`
4. Actualizar `MOBILE_URL` en `index.html`
5. Volver a cargar API Key Gemini (localStorage no se migra)
6. Verificar `moretti.com.ar` en Resend y cambiar `MAIL_FROM` en Edge Function

---

*Documento actualizado el 19/03/2026*

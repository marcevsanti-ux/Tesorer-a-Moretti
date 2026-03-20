# Tesorería Moretti — Documentación del Proyecto

> Sistema de gestión de cheques rechazados · Moretti S.A.
> Última actualización: 20/03/2026

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
    └── Trigger SQL (INSERT en cheques con hoja=RECHAZADOS)
        → Edge Function "enviar-mail-rechazo"
        → Gmail SMTP (micasantosmoretti@gmail.com)
        → Destinatarios configurados en tabla public.configuracion
        → Mail adicional a Pago a Proveedores si detalle ILIKE '%Pago a proveedores%'
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
| Resend Dashboard | https://resend.com — cuenta marcevsanti@gmail.com (GitHub) — creado pero no se usa |
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

### Gmail SMTP — Sistema de Mail

| Campo | Valor |
|---|---|
| Cuenta remitente | `micasantosmoretti@gmail.com` |
| Nombre visible | `Tesoreria Moretti` |
| Método auth | App Password (Google) |
| Nombre del App Password | `tesoreria-moretti` |
| Secret en Supabase | `GMAIL_USER` + `GMAIL_APP_PASSWORD` |
| Verificación 2 pasos | Activada en la cuenta de Mica |

> ⚠️ Si se cambia la contraseña de Google de Mica, el App Password se invalida. Regenerar en myaccount.google.com/apppasswords y actualizar secret `GMAIL_APP_PASSWORD` en Supabase → Edge Functions → Secrets.

### Gemini API Key (IA)

| Campo | Valor |
|---|---|
| Key (termina en) | `...tZjo` |
| Plan | Gratuito — 1500 req/día |
| Guardada en | `localStorage` con nombre `gemini_key` |

### Cloudflare Worker — `bcra-proxy`

| Campo | Valor |
|---|---|
| URL | `https://bcra-proxy.marcevsanti.workers.dev` |
| Cuenta | marcevsanti@gmail.com |
| Estado | Intermitente — BCRA bloquea IPs de Cloudflare en producción |

### Secrets en Supabase Edge Functions

| Secret | Descripción |
|---|---|
| `GMAIL_USER` | `micasantosmoretti@gmail.com` |
| `GMAIL_APP_PASSWORD` | App Password de Google (16 chars sin espacios) |
| `RESEND_API_KEY` | En desuso — puede eliminarse |
| `tesoreria-moretti` | Secret viejo — puede eliminarse |

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
| nro_cheque | text | Número de cheque |
| fecha_rechazo | date | Fecha del rechazo |
| mes | text | ENERO, FEBRERO, etc. |
| anio | integer | Año del rechazo |
| motivo | text | SIN FONDOS / CTA CERRADA / etc. |
| importe | numeric | Importe original |
| gastos | numeric | Gastos bancarios |
| total | numeric | importe + gastos |
| detalle | text | Acción/detalle. Si es "Pago a proveedores" con texto libre se guarda como "Pago a proveedores — {texto}" |
| evidencia_url | text | URL pública del comprobante en Supabase Storage |
| emisor | text | Propio / Terceros |
| hoja | text | RECHAZADOS / CANCELADOS |
| created_at | timestamptz | Fecha de creación |
| created_by | uuid | Usuario que creó el registro |

#### `public.configuracion`

| Clave | Descripción |
|---|---|
| `mail_to` | Destinatarios principales del mail (separados por coma) |
| `mail_cc` | Con copia (separados por coma) |
| `mail_pago_proveedores` | Destinatario extra cuando detalle = "Pago a proveedores" |

> Se edita desde Desktop → tab Configuración → card "Notificaciones por Mail".

### Extensiones habilitadas

| Extensión | Uso |
|---|---|
| `pg_net` | HTTP requests desde funciones SQL — usado por el trigger de mail |

### Edge Functions activas

| Función | URL | JWT verify |
|---|---|---|
| bcra-proxy | `https://qqmzhwifrkgfrgewmpig.supabase.co/functions/v1/bcra-proxy` | OFF |
| enviar-mail-rechazo | `https://qqmzhwifrkgfrgewmpig.supabase.co/functions/v1/enviar-mail-rechazo` | OFF |

### Trigger SQL activo

```
trigger_nuevo_rechazo → AFTER INSERT ON public.cheques FOR EACH ROW
→ Si hoja = 'RECHAZADOS':
   1. Lee mail_to y mail_cc de public.configuracion
   2. Envía mail principal a Tesorería
   3. Si detalle ILIKE '%Pago a proveedores%' Y mail_pago_proveedores configurado:
      → Envía segundo mail a esa casilla
```

Script completo para re-crear — ver sección Notas Técnicas.

---

## Usuarios del Sistema

| Nombre | Email | Rol | Estado |
|---|---|---|---|
| Marcelo | marcelos@moretti.com.ar | admin | Activo |
| M Santos | msantos@moretti.com.ar | admin | Activo |
| Julian Balbi | jbalbi@moretti.com.ar | crediticio | Activo |

### Cambiar contraseña de usuario (Supabase Auth)

```sql
UPDATE auth.users 
SET encrypted_password = crypt('nueva_pass', gen_salt('bf'))
WHERE email = 'usuario@moretti.com.ar';
```

---

## Versiones

### App Desktop (index.html)
| Versión | Cambios principales |
|---|---|
| v2.3.9 | Fix bug link comprobante — UUID sin rename |
| v2.4.0 | KPIs Cheques Recuperados y Monto Recuperado en Dashboard |
| v2.4.1 | Análisis Nosis: secciones 5a Aportes Patronales y 5b Situación SRT |
| v2.4.2 | Card "Regla especial Pago a Proveedores" en Configuración — mail adicional configurable |
| v2.4.3 | Fix detalle "Pago a proveedores": se guarda como "Pago a proveedores — {texto}" para que el trigger matchee correctamente |

### App Mobile (mobile.html)
| Versión | Cambios principales |
|---|---|
| v2.1.7 | Mail 100% automático via trigger SQL |
| v2.1.8 | Fix escaneo: inputs llamaban a handleFile() inexistente, corregido a handleCapture(). Fix detalle Pago a proveedores |
| v2.1.9 | Fix navegación entre tabs: switchTab usaba IDs incorrectos (tab-X en lugar de pane-X) |

---

## Funcionalidades Activas

### Desktop (v2.4.3)
- ✅ Login con email + contraseña (Supabase Auth)
- ✅ Roles: admin / operador / consulta / crediticio
- ✅ Dashboard con KPIs: Total Pendiente, Importe Total, Gastos, Mora Promedio, Total Registrados
- ✅ **KPIs Recuperados**: Cheques Recuperados (cantidad + monto + ratio %) y Monto Recuperado — franja verde destacada
- ✅ Tab Resumen — pivot motivo/cliente/año
- ✅ Tab Estado Crediticio con BCRA + análisis Nosis PDF via Gemini:
  - Score, Situación BCRA, Nivel de Deuda, Cheques Rechazados por banco
  - Evolución de Antecedentes (12 meses)
  - **5a · Aportes Patronales** — estado, períodos impagos, fuente ARCA/ANSES
  - **5b · Situación SRT** — estado, aseguradora, N° contrato, fechas, motivo extinción
  - Alertas automáticas, Resumen Ejecutivo, Factores de Riesgo
  - Exportar informe a PDF con membrete Moretti
- ✅ Tabla Rechazados / Cancelados con filtros y búsqueda
- ✅ Nuevo cheque: carga manual + escaneo IA + uploader comprobante en el mismo paso
- ✅ Editar registro con uploader comprobante
- ✅ Eliminar registro (solo admin)
- ✅ Validación de duplicados
- ✅ Exportar CSV / Importación masiva desde Excel
- ✅ Gestión de usuarios (solo admin)
- ✅ Backup Excel completo (solo admin) — 6 solapas
- ✅ Mail automático via trigger SQL al insertar en RECHAZADOS
- ✅ Configuración de mail: Enviado de, Enviar a, CC, **Regla especial Pago a Proveedores**

### Mobile (v2.1.9)
- ✅ Login con email + contraseña
- ✅ Escanear comprobante con cámara (IA Gemini) — fix navegación tabs
- ✅ Elegir archivo de galería o PDF
- ✅ Formulario manual de carga
- ✅ Guardar directo en Supabase
- ✅ Validación de duplicados / Registro en Log
- ✅ Mail automático via trigger SQL
- ✅ Botón logout

---

## Pendientes

### Alta prioridad
- 🔴 **Migración a dominio propio** `tesoreria.moretti.com.ar` — pendiente admin de red (ver solicitud_admin_red_dns.md)
- 🔴 **API BCRA Deudas intermitente** — Opción A: dominio propio en CF (depende del admin). Opción B: VPS $5-10 USD/mes en DigitalOcean São Paulo (solución definitiva)
- 🔴 **Fix evidencia_url histórico** — links de Drive del Sheet no migrados a Supabase Storage
- 🔴 Vincular CUIT del emisor como campo obligatorio

### Sprint 2 — en progreso
- ✅ KPIs Recuperados en Dashboard
- ✅ Mail a Pago a Proveedores
- ✅ Aportes Patronales y SRT en análisis Nosis
- 🟡 Mail al vendedor según cliente — pendiente definición del Maestro de Clientes

### Media prioridad
- 🟡 **Integración Nosis API** — contrato firmado, pendiente credenciales
- 🟡 Verificar dominio `moretti.com.ar` en Resend para remitente profesional
- 🟡 Cartera de cheques — previsión de riesgo
- 🟡 Informes programados y alertas por horario
- 🟡 Vinculación cliente → vendedor (con CUIT)

### Futuro
- ⚪ VPS propio para proxy BCRA definitivo
- ⚪ Análisis de riesgo / curva ROC
- ⚪ Maestro de clientes

---

## Notas Técnicas

### Sistema de Mail — Arquitectura final (v2.4.3)

**Flujo completo:**
1. Operador carga cheque → sube comprobante (opcional) → INSERT con `evidencia_url`
2. Trigger `trigger_nuevo_rechazo` detecta INSERT en RECHAZADOS
3. Lee `mail_to`, `mail_cc`, `mail_pago_proveedores` de `public.configuracion`
4. Envía mail principal via Edge Function → Gmail SMTP
5. Si `detalle ILIKE '%Pago a proveedores%'` → segundo mail a `mail_pago_proveedores`

**Detalle "Pago a proveedores":**
Cuando se elige "Pago a proveedores" en el select con texto libre, se guarda como `"Pago a proveedores — {texto}"`. Esto garantiza que el trigger siempre matchee con `ILIKE '%Pago a proveedores%'`.

**Script SQL completo para re-crear trigger:**
```sql
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION notify_nuevo_rechazo()
RETURNS trigger AS $$
DECLARE
  v_mail_to text;
  v_mail_cc text;
  v_mail_pp text;
BEGIN
  IF NEW.hoja = 'RECHAZADOS' THEN
    SELECT valor INTO v_mail_to FROM public.configuracion WHERE clave = 'mail_to';
    SELECT valor INTO v_mail_cc FROM public.configuracion WHERE clave = 'mail_cc';
    SELECT valor INTO v_mail_pp FROM public.configuracion WHERE clave = 'mail_pago_proveedores';

    PERFORM net.http_post(
      url := 'https://qqmzhwifrkgfrgewmpig.supabase.co/functions/v1/enviar-mail-rechazo',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxbXpod2lmcmtnZnJnZXdtcGlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2OTg4MzcsImV4cCI6MjA4OTI3NDgzN30.4W-n_WLRvcrE385qv0Phil4PrHrb1twpsZvxxIHodeg'
      ),
      body := jsonb_build_object(
        'cliente',       NEW.cliente,
        'nro_cheque',    NEW.nro_cheque,
        'tipo',          COALESCE(NEW.tipo, '-'),
        'fecha_rechazo', TO_CHAR(NEW.fecha_rechazo, 'DD/MM/YYYY'),
        'motivo',        COALESCE(NEW.motivo, '-'),
        'importe',       '$' || TO_CHAR(COALESCE(NEW.importe, 0), 'FM999,999,999.00'),
        'gastos',        '$' || TO_CHAR(COALESCE(NEW.gastos, 0), 'FM999,999,999.00'),
        'emisor',        COALESCE(NEW.emisor, '-'),
        'detalle',       COALESCE(NEW.detalle, '-'),
        'evidencia_url', NEW.evidencia_url,
        'mail_to',       COALESCE(v_mail_to, 'micasantosmoretti@gmail.com'),
        'mail_cc',       COALESCE(v_mail_cc, '')
      )
    );

    IF NEW.detalle ILIKE '%Pago a proveedores%' AND v_mail_pp IS NOT NULL AND v_mail_pp != '' THEN
      PERFORM net.http_post(
        url := 'https://qqmzhwifrkgfrgewmpig.supabase.co/functions/v1/enviar-mail-rechazo',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxbXpod2lmcmtnZnJnZXdtcGlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2OTg4MzcsImV4cCI6MjA4OTI3NDgzN30.4W-n_WLRvcrE385qv0Phil4PrHrb1twpsZvxxIHodeg'
        ),
        body := jsonb_build_object(
          'cliente',       NEW.cliente,
          'nro_cheque',    NEW.nro_cheque,
          'tipo',          COALESCE(NEW.tipo, '-'),
          'fecha_rechazo', TO_CHAR(NEW.fecha_rechazo, 'DD/MM/YYYY'),
          'motivo',        COALESCE(NEW.motivo, '-'),
          'importe',       '$' || TO_CHAR(COALESCE(NEW.importe, 0), 'FM999,999,999.00'),
          'gastos',        '$' || TO_CHAR(COALESCE(NEW.gastos, 0), 'FM999,999,999.00'),
          'emisor',        COALESCE(NEW.emisor, '-'),
          'detalle',       COALESCE(NEW.detalle, '-'),
          'evidencia_url', NEW.evidencia_url,
          'mail_to',       v_mail_pp,
          'mail_cc',       ''
        )
      );
    END IF;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trigger_nuevo_rechazo
  AFTER INSERT ON public.cheques
  FOR EACH ROW
  EXECUTE FUNCTION notify_nuevo_rechazo();
```

### Cambiar contraseña de usuario (Supabase Auth)
```sql
UPDATE auth.users 
SET encrypted_password = crypt('nueva_pass', gen_salt('bf'))
WHERE email = 'usuario@moretti.com.ar';
```

### Supabase Storage — bucket comprobantes
- Path nuevo cheque: `nc_{uuid}_{timestamp}.{ext}`
- Path editar: `{cheque_id}_{timestamp}.{ext}`
- URL: `https://qqmzhwifrkgfrgewmpig.supabase.co/storage/v1/object/public/comprobantes/{path}`

### API BCRA — Estado y opciones
- Falla intermitentemente porque el BCRA bloquea IPs de datacenters (Cloudflare, Supabase)
- Opción A: dominio `api.tesoreria.moretti.com.ar` en Cloudflare Worker (depende del admin de red)
- Opción B (definitiva): VPS propio ~$5-10 USD/mes en DigitalOcean São Paulo con IP fija

### GitHub
- Repositorio: `marcevsanti-ux/Tesorer-a-Moretti` (público)
- Branch: `main` → GitHub Pages directo, sin build

---

*Documento actualizado el 20/03/2026*

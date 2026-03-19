# Solicitud al Administrador de Red — Moretti S.A.
# Migración de Tesorería al dominio tesoreria.moretti.com.ar

> Preparado por: Área de Sistemas
> Fecha: 19/03/2026
> Prioridad: Alta

---

## Resumen ejecutivo

El sistema de gestión de cheques rechazados de Tesorería actualmente se sirve desde una URL
pública de GitHub (`marcevsanti-ux.github.io/Tesorer-a-Moretti`). Se solicita migrarlo al
dominio propio `tesoreria.moretti.com.ar` para dar una imagen profesional, mejorar la
seguridad y habilitar el envío de mails desde casillas propias del dominio.

No se requiere ningún servidor nuevo. La app seguirá hosteada en GitHub Pages y la base de
datos en Supabase — solo se necesitan cambios de DNS.

---

## Accesos necesarios

Para ejecutar esta migración necesitamos acceso (o que el administrador ejecute los cambios)
sobre el DNS del dominio `moretti.com.ar`, administrado actualmente en **NIC.ar**.

---

## Registros DNS a crear

### 1. App principal — `tesoreria.moretti.com.ar`

Permite acceder a la app desde `https://tesoreria.moretti.com.ar` en lugar de la URL de GitHub.

| Campo | Valor |
|---|---|
| Tipo | `CNAME` |
| Nombre / Host | `tesoreria` |
| Destino / Apunta a | `marcevsanti-ux.github.io` |
| TTL | 3600 (o el default) |

### 2. Proxy API BCRA — `api.tesoreria.moretti.com.ar`

Permite resolver el problema intermitente de la API del Banco Central. El proxy actual en
Cloudflare falla porque el BCRA bloquea sus IPs. Con un dominio propio, las requests pasan
como si vinieran de Moretti y no de Cloudflare.

| Campo | Valor |
|---|---|
| Tipo | `CNAME` |
| Nombre / Host | `api.tesoreria` |
| Destino / Apunta a | `bcra-proxy.marcevsanti.workers.dev` |
| TTL | 3600 (o el default) |

> Este registro habilita el endpoint `https://api.tesoreria.moretti.com.ar` que actúa como proxy hacia la API pública del BCRA.

### 3. Verificación de dominio para envío de mails — Resend

Para que los mails del sistema salgan desde `tesoreria@moretti.com.ar` (en lugar del Gmail
personal de Mica), el servicio de envío de mails (Resend) requiere verificar la propiedad
del dominio con registros DNS adicionales.

Una vez que los registros anteriores estén activos, desde el panel de Resend
(resend.com — cuenta marcevsanti@gmail.com) se generan los registros específicos para
`moretti.com.ar`. Se comunicarán en una segunda solicitud, ya que Resend los genera en el
momento. Típicamente son:

| Campo | Valor aproximado |
|---|---|
| Tipo | `TXT` |
| Nombre / Host | `resend._domainkey.moretti.com.ar` |
| Valor | Clave DKIM generada por Resend (se proveerá) |
| TTL | 3600 |

| Campo | Valor aproximado |
|---|---|
| Tipo | `TXT` |
| Nombre / Host | `moretti.com.ar` |
| Valor | `v=spf1 include:amazonses.com ~all` |
| TTL | 3600 |

> Los valores exactos de estos registros se proporcionarán en una segunda solicitud una vez
> que se active el dominio en el panel de Resend.

---

## Resumen de registros a crear (tabla consolidada)

| Tipo | Host | Destino / Valor | Cuándo |
|---|---|---|---|
| CNAME | `tesoreria` | `marcevsanti-ux.github.io` | Ahora |
| CNAME | `api.tesoreria` | `bcra-proxy.marcevsanti.workers.dev` | Ahora |
| TXT | `resend._domainkey` | (se proveerá) | Segunda etapa |
| TXT | `@` o raíz | SPF Resend (se proveerá) | Segunda etapa |

---

## Qué NO cambia

- No se requiere ningún servidor nuevo ni hosting propio.
- La base de datos sigue en Supabase (nube).
- Los archivos de la app siguen en GitHub.
- No hay cambios en el firewall ni en la red interna de Moretti.
- El sistema sigue siendo accesible desde cualquier navegador, sin VPN ni configuración especial.

---

## Pasos posteriores a cargo de Sistemas (no requieren al admin de red)

Una vez que el admin confirme que los registros DNS están activos (puede tardar entre 5 minutos
y 48 horas en propagarse), Sistemas ejecutará:

1. Configurar el custom domain en GitHub Pages (`tesoreria.moretti.com.ar`)
2. Actualizar la URL interna de la app en el código fuente
3. Activar el dominio en Resend y solicitar los registros TXT al admin
4. Cambiar el remitente de mails de `micasantosmoretti@gmail.com` a `tesoreria@moretti.com.ar`
5. Actualizar el proxy BCRA para usar el nuevo subdominio `api.tesoreria.moretti.com.ar`
6. Prueba integral del sistema en el nuevo dominio

---

## Contacto

Ante cualquier duda sobre esta solicitud, contactar a:

**Marcelo** — marcelos@moretti.com.ar
**M. Santos** — msantos@moretti.com.ar

---

*Documento preparado el 19/03/2026*

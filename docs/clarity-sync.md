# Integración Clarity — Etapa 1 (diagnóstico)
Rama de trabajo: `feature/clarity-sync`. No se modifica producción.

## Objetivo
Sincronizar en modo lectura las órdenes de trabajo de todos los técnicos con Estado **Pendiente** y SubEstado **8 - Garantia**, a las **07:00** y **12:00** hora Argentina.

## Estado
- Se identificó el acceso `/app/login.html` y el listado ASP `/app/Includes/ListView.asp`.
- La consulta observada en DevTools filtra por los códigos internos `1,120`, pero esos códigos se deben validar antes de automatizar.
- El listado usa paginación y puede incluir varias filas por OT.
- **Todavía no se verificó el login automatizado, la extracción ni la escritura a Supabase.**

## Primer diagnóstico
En una máquina autorizada:
```bash
npm install --no-save playwright
npx playwright install chromium
CLARITY_DOCUMENTO=... CLARITY_USUARIO=... CLARITY_CLAVE=... node scripts/clarity-diagnostico.js
```
El diagnóstico **no envía credenciales**: solo inspecciona los campos de login y guarda sus nombres/tipos en un archivo local. No publicar ese archivo si contiene información interna.

## Próximas tareas
1. Validar selectores del login y flujo de sesión (sin registrar cookies ni contraseñas).
2. Navegar con sesión autenticada al listado, validar filtros y recorrer todas las páginas.
3. Normalizar OT y equipos, deduplicar y registrar resultados en tablas aisladas.
4. Implementar ejecución programada con zona `America/Argentina/Buenos_Aires` y bloqueo de ejecuciones simultáneas.
5. Conectar el monitor de la interfaz con ejecuciones reales.

No guardar contraseñas en GitHub, HTML ni tablas sin cifrado. Para el servicio usar variables secretas de Railway.
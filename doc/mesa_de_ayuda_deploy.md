# Mesa de Ayuda · Railway

Rama de despliegue: `feature/mesa-de-ayuda`. No fusionar a `main` sin revisión.

## Variables del servicio Railway

- `SUPABASE_URL`: URL pública del proyecto Supabase.
- `SUPABASE_ANON_KEY`: clave pública anon/publishable compatible con supabase-js.
- `SUPABASE_SERVICE_ROLE_KEY`: secreto de servidor, necesario exclusivamente para enviar invitaciones y asignar roles. Nunca publicarlo ni copiarlo al HTML.\n- `PORT`: Railway la asigna automáticamente; no definir manualmente.

**Nunca** colocar `SUPABASE_SERVICE_ROLE_KEY` ni contraseñas en el frontend. La service_role se configura solo como variable privada de Railway. El HTML se sirve desde `/` y `/mesa-de-ayuda.html`; el resto de los archivos del repositorio no se exponen.

## Antes del primer despliegue

1. Revisar en Supabase que el proyecto es el correcto y hacer backup.
2. Revisar el SQL `sql/mesa_de_ayuda_v1.sql` en un entorno de prueba. El archivo no se ejecuta automáticamente.
3. Registrar inicialmente a Marcelo como ADMIN mediante el INSERT comentado al final del SQL (validar UUID y correo). Después invitar a Valeria y otros usuarios desde Administración de usuarios en el portal.\n4. Configurar SMTP e URL de redirección de Auth para que las invitaciones se entreguen correctamente.
5. Configurar las dos variables públicas y la variable secreta del servicio.
6. Verificar el estado de salud en `/health` y probar login y RLS con ambas cuentas.
7. Revisar la configuración de autodeploy antes de aplicar cambios pendientes en Railway.

## Límites actuales

- El servidor sólo publica la interfaz: no hay API ni sincronización con Clarity.
- Los cambios de OT quedan en Supabase, no se envían a Clarity.
- La biblioteca y el MCP están pendientes.
- Las métricas del frontend se calculan sobre los primeros 500 registros cargados.
- No se ha validado la base real ni ejecutado una prueba end-to-end.

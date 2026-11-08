# Herramientas de Mesa de Ayuda para Puentes (QA)

Estas operaciones están implementadas en la rama QA. **No están desplegadas ni registradas como herramientas de Puentes**.

## Autenticación
Todas las llamadas requieren `Authorization: Bearer <Supabase access_token>` de un usuario autenticado, activo y autorizado de Mesa de Ayuda. No cargar un token de servicio ni credenciales de administrador en Puentes.

## Herramientas HTTP propuestas
- `GET /api/asistente/reclamos?limit=5&offset=0&responsable=Valeria`: lista filtrada y paginada.
- `GET /api/asistente/reclamos/detalle?numero=93`: reclamo puntual.
- `GET /api/asistente/reclamos/stats`: agrupación por estado y responsable.
- `GET /api/asistente/reclamos/stats?responsable=Valeria`: estadísticas filtradas.

## Reporte de bugs
`POST /api/asistente/chat` con `{"mensaje":"bug: descripción de al menos 15 caracteres"}`. **Solo** una sesión Supabase cuyo correo validado sea `valeriat@moretti.com.ar` puede registrar un bug. La API devuelve 403 a los demás usuarios. No publicar este endpoint como herramienta genérica con token compartido ni cambiar esta restricción.

## Validaciones pendientes
1. Ejecutar pruebas de sintaxis y tests automatizados en la rama QA.
2. Desplegar la rama en entorno de prueba aislado.
3. Registrar las herramientas HTTP en Puentes con un mecanismo seguro para propagar la identidad del usuario.
4. Comprobar consulta del reclamo 93, paginación sin solapamiento, filtro por Valeria y agregados.
5. Validar que un usuario distinto de Valeria reciba 403 al intentar reportar bugs.
6. Solo después de QA, evaluar promoción a producción.

## Preguntas para probar después de la conexión
- «Buscá el reclamo 93 y mostrame su estado, motivo, responsable y fechas disponibles».
- «Mostrame los últimos cinco reclamos de Valeria».
- «Mostrame los reclamos 11 al 20 sin repetir los primeros diez».
- «Agrupá todos los reclamos por responsable y estado y dame los totales».

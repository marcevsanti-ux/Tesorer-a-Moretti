# MCP Moretti — prototipo

Servicio aislado para Puentes y Mesa de Ayuda Moretti. No desplegado.

Node.js >=20. Inicio: `node server.js`. Salud: `GET /health`. MCP JSON-RPC: `POST /mcp`.

Variables obligatorias: `MCP_AUTH_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Google Sheets: `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_RANGE`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`. Escritura desactivada por defecto; `GOOGLE_SHEETS_WRITE_ENABLED=true` solo luego de validar auditoria y permisos.

Pendiente: confirmar compatibilidad exacta del transporte MCP con Puentes; revisar columnas y relaciones de Supabase; verificar pestaña y permisos de Google Sheets; implementar auditoria persistente y autorizacion de escritura por usuario. No conectar a produccion hasta completar estas validaciones.

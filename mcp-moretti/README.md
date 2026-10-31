# MCP Moretti — integración experimental

Servidor MCP remoto (Streamable HTTP, JSON-RPC 2.0) aislado del resto de Tesorería.

## Herramientas
- `moretti_estado_conexion`: diagnóstico no sensible.
- `moretti_listar_reclamos`: consulta de hasta 50 reclamos por estado, solo lectura, sin descripciones ni datos de clientes.

## Ejecutar
Node.js 20+. Configurar las variables de `.env.example` en el entorno (no subir secretos).
`node mcp-moretti/server.js` desde la raíz del repositorio, o `npm start` dentro de `mcp-moretti`.

- `GET /health`: diagnóstico público, sin datos.
- `POST /mcp`: requiere `Authorization: Bearer <MCP_API_TOKEN>` y `Content-Type: application/json`.
- Protocolo MCP anunciado: `2025-03-26`.

## Estado y pendientes
**No desplegado ni conectado a Puentes.ai.** Falta verificar los requisitos exactos de su documentación (URL proporcionada: https://app.puentes.ai/docs#mcp), especialmente transporte, autenticación y registro de herramientas. No habilitar el servicio sin HTTPS y secreto robusto. Si Puentes no soporta Bearer o esta versión del protocolo, adaptar antes del despliegue. No se ha probado contra el entorno real de Supabase.

Esta implementación es un MVP de solo lectura; no modificar reclamos ni cheques desde MCP hasta contar con controles de autorización y auditoría.

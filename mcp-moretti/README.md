# MCP Moretti — Puentes.ai (piloto)

Servidor MCP remoto HTTP JSON-RPC 2.0. Carpeta aislada de la aplicación de Tesorería.

## Herramientas

- `moretti_estado_conexion`: diagnóstico, disponible sin cuenta, no expone credenciales.
- `moretti_listar_reclamos`: consulta de hasta 50 reclamos (id, asunto, estado, prioridad y fechas). Requiere una credencial de cuenta independiente.

Ambas llevan `annotations.readOnlyHint: true` conforme a la documentación de Puentes.ai (31/10/2026, páginas 3-4).

## Railway (servicio NUEVO)

1. Crear un servicio separado en Railway desde el repositorio `marcevsanti-ux/Tesorer-a-Moretti`, rama `feature/mcp-moretti`.
2. **Root directory:** `/mcp-moretti`.
3. **Start command:** `npm start`. Node >=20. No build command.
4. Configurar las variables de `.env.example` en Railway (valores reales; jamás subir secretos).
5. Habilitar dominio HTTPS público. Comprobar `GET https://DOMINIO/health`.
6. Registrar `https://DOMINIO/mcp` en Puentes.ai: «Creadores» > «Servidores MCP» o desde la IA > «Qué puede usar» > «Agregar herramientas» > «Cargar mi propio servidor MCP». Usar el valor de `MCP_API_TOKEN` como **clave del servidor**, auth bearer.
7. Para `moretti_listar_reclamos`, conectar la cuenta con `MCP_ACCOUNT_TOKEN` como **credencial de cuenta**. Puentes envía la clave del servidor por `X-Api-Key` y la de cuenta por `Authorization: Bearer`. Si la interfaz no permite credencial de cuenta tipo bearer, detener esa prueba hasta ajustar el flujo; la herramienta de diagnóstico funciona sin cuenta.

**Importante:** no confundir el token de servidor con el de cuenta. Mantener el conector y la IA privados durante el piloto. `SUPABASE_SERVICE_ROLE_KEY` concede acceso elevado: usar preferentemente una credencial Supabase de solo lectura con privilegios mínimos antes de habilitar datos reales.

## Pruebas

```bash
# 1. Salud (sin secretos)
curl https://DOMINIO/health

# 2. Handshake MCP
curl -s https://DOMINIO/mcp -H "Authorization: Bearer $MCP_API_TOKEN" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"smoke-test","version":"1"}}}'

# 3. Listar herramientas
curl -s https://DOMINIO/mcp -H "X-Api-Key: $MCP_API_TOKEN" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# 4. Diagnóstico sin cuenta
curl -s https://DOMINIO/mcp -H "X-Api-Key: $MCP_API_TOKEN" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"moretti_estado_conexion","arguments":{}}}'

# 5. Reclamos (requiere ambas credenciales)
curl -s https://DOMINIO/mcp -H "X-Api-Key: $MCP_API_TOKEN" -H "Authorization: Bearer $MCP_ACCOUNT_TOKEN" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"moretti_listar_reclamos","arguments":{"limite":5}}}'
```

## Estado

Código publicado en GitHub, **no desplegado** ni probado en Railway, Supabase o Puentes. No hay escrituras de datos. Referencia: PDF «Puentes · API para developers», páginas 3-4. No publicar el dominio ni secretos en chats.

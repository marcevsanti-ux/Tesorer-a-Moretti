# Tesorería Moretti — Recepción de Cheques V1

Archivos:
- `01_supabase_cheques_v1.sql`: tablas, índices, bucket y políticas RLS.
- `mobile-cobranzas.html`: carga de cheque por vendedor desde celular.
- `autorizaciones-cheques.html`: bandeja de autorización para Andrés / Tesorería.

## Criterio funcional elegido
1. El vendedor fotografía el cheque.
2. OCR extrae datos; el usuario debe verificarlos.
3. El cliente se identifica contra `clientes_clarity`.
4. Se consulta One Core / Clarity por comprobantes del cliente.
5. Se puede seleccionar una factura sugerida, pero no se imputa automáticamente.
6. El cheque queda `PENDIENTE_AUTORIZACION`.
7. Andrés acepta o rechaza; rechazo exige motivo.
8. Toda resolución queda auditada.

## Seguridad importante
No colocar una Gemini API Key ni `service_role` de Supabase dentro de HTML.
El OCR debe pasar por One Core o una Supabase Edge Function.

## Integración Clarity
El HTML deja una llamada provisoria al endpoint de IVA Ventas que ya existe.
Para producción conviene crear un endpoint específico en One Core:
`GET /tesoreria/clientes/:empresaId/comprobantes-abiertos`
porque necesitamos deuda/saldo abierto, no solamente ventas históricas.

## Próximo ajuste
Adaptar las constantes `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `ONECORE_BASE_URL`
a las del proyecto actual y validar los nombres de tablas existentes antes de desplegar.

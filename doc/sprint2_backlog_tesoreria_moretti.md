# Tesorería Moretti — Backlog Sprint 2
> Sistema de gestión de cheques rechazados · Moretti S.A.
> Fecha: 19/03/2026
> Estado: Pendiente de desarrollo

---

## Contexto

Luego de la presentación exitosa del sistema en su versión actual (v2.3.9), el equipo de
Tesorería relevó un conjunto de mejoras y nuevas funcionalidades para incorporar en el
próximo sprint de desarrollo. Este documento formaliza los requerimientos para su
planificación y ejecución.

---

## Requerimientos

### 1. Panel General — Nuevos KPIs

**Descripción**
Incorporar en el dashboard dos indicadores adicionales que hoy no están presentes:

- **Cheques recuperados** — cantidad y monto de cheques que pasaron de RECHAZADOS a CANCELADOS (es decir, que fueron cobrados o regularizados).
- **Cheques registrados** — cantidad total de cheques ingresados al sistema en el período (independientemente de su estado).

**Objetivo**
Dar visibilidad inmediata del ratio de recupero y del volumen operativo total, métricas clave para la gestión de Tesorería y para reportar a la dirección.

**Criterios de aceptación**
- Los KPIs aparecen en el dashboard principal junto a los indicadores existentes.
- Se pueden filtrar por período (mes / año) igual que el resto del dashboard.
- Los valores se calculan en tiempo real desde Supabase.

---

### 2. Sistema de Notificaciones por Mail — Ampliación

El sistema de mail automático actual notifica al área de Tesorería cuando se registra un cheque rechazado. Se solicita extender esta lógica con dos nuevos flujos de notificación.

#### 2a. Mail al vendedor según el cliente

**Descripción**
Cuando se registra un cheque rechazado, además del mail a Tesorería, debe enviarse una notificación automática al vendedor asignado al cliente emisor del cheque.

**Requisito previo — Maestro de clientes / vendedores**
Para implementar este flujo se necesita una tabla que vincule cada cliente con su vendedor y el mail de ese vendedor. Esta tabla no existe actualmente en el sistema. Opciones:

- Opción A: Crear un **Maestro de Clientes** dentro del sistema (tabla `clientes` en Supabase con campos: nombre, CUIT, vendedor asignado, mail del vendedor).
- Opción B: Mantener un archivo Excel externo que se importa periódicamente.

Se recomienda la Opción A para mantener todo centralizado.

**Criterios de aceptación**
- Al registrar un cheque rechazado, el sistema busca el cliente en el Maestro de Clientes.
- Si encuentra un vendedor asignado con mail, le envía una notificación con los datos del cheque.
- Si no hay vendedor asignado, el sistema continúa normalmente sin error.
- El mail al vendedor tiene asunto y cuerpo diferenciado del mail de Tesorería.

#### 2b. Mail a pagoaproveedores@moretti.com.ar cuando Detalle = "Pago a proveedores"

**Descripción**
Cuando el campo **Detalle / Acción** de un cheque rechazado tiene el valor `Pago a proveedores`, el sistema debe enviar una notificación adicional a `pagoaproveedores@moretti.com.ar` informando el rechazo.

**Criterios de aceptación**
- El mail se dispara automáticamente junto con el mail de Tesorería cuando `detalle = 'Pago a proveedores'`.
- El destinatario `pagoaproveedores@moretti.com.ar` es fijo y no requiere configuración en el panel.
- El cuerpo del mail incluye los mismos datos del cheque más el detalle de la acción.
- Si el detalle es cualquier otro valor, este mail no se envía.

**Implementación técnica sugerida**
Agregar en el trigger SQL `notify_nuevo_rechazo` una condición adicional: si `NEW.detalle ILIKE '%Pago a proveedores%'`, hacer un segundo `net.http_post` a la Edge Function con `mail_to = 'pagoaproveedores@moretti.com.ar'`.

---

### 3. Estado Crediticio — Ampliación del análisis Nosis

**Descripción**
El módulo de análisis de informes Nosis (importación de PDF via Gemini) actualmente extrae y presenta información sobre situación BCRA, cheques rechazados, nivel de deuda y score. Se solicita incorporar dos secciones adicionales al informe generado:

#### 3a. Situación de Aportes Patronales

Incorporar en el informe Nosis el análisis de la situación del cliente respecto de sus **aportes patronales** (AFIP / ANSES): si está al día, con deuda, en mora o con planes de pago activos. Esta información suele figurar en los informes Nosis extendidos.

**Criterios de aceptación**
- El prompt enviado a Gemini se actualiza para extraer esta información del PDF.
- El informe generado incluye una sección "Aportes Patronales" con el estado detectado.
- Si el informe PDF no contiene esta información, la sección indica "Sin datos disponibles".

#### 3b. Situación SRT (Seguro de Riesgos del Trabajo)

Incorporar en el informe Nosis el análisis de la situación del cliente respecto de la **SRT**: si tiene cobertura vigente, si registra deuda con la aseguradora o si hay incumplimientos. Esta información también puede figurar en informes Nosis extendidos.

**Criterios de aceptación**
- El prompt enviado a Gemini se actualiza para extraer esta información del PDF.
- El informe generado incluye una sección "Situación SRT" con el estado detectado.
- Si el informe PDF no contiene esta información, la sección indica "Sin datos disponibles".

**Nota técnica**
Ambas secciones se implementan actualizando el prompt de análisis de Gemini en la función `ncAiHandleFile` / módulo Nosis del index.html. No requieren cambios en la base de datos ni en la Edge Function de mails.

---

## Priorización sugerida

| # | Requerimiento | Complejidad | Prioridad |
|---|---|---|---|
| 3a + 3b | Ampliación análisis Nosis (Aportes + SRT) | Baja — solo prompt | Alta |
| 2b | Mail a Pago a Proveedores | Baja — trigger SQL | Alta |
| 1 | KPIs Recuperados + Registrados | Media — cálculo + UI | Media |
| 2a | Mail al vendedor | Alta — requiere Maestro de Clientes | Media |

---

## Dependencias y prerequisitos

- **Requerimiento 2a** depende de la decisión sobre el Maestro de Clientes. Requiere definir estructura de datos y proceso de carga/mantenimiento antes de desarrollar.
- **Requerimientos 3a y 3b** dependen de que los informes PDF de Nosis que se importan contengan efectivamente esa información. Se recomienda verificar con un PDF real antes de iniciar.
- **Requerimiento 2b** es independiente y puede desarrollarse en cualquier momento.
- **Requerimiento 1** es independiente.

---

## Fuera de alcance de este sprint

Los siguientes ítems del backlog general quedan fuera de este sprint por complejidad o dependencias externas:

- Migración al dominio `tesoreria.moretti.com.ar` (pendiente admin de red)
- Integración Nosis API directa (pendiente credenciales del proveedor)
- Fix evidencia_url histórico (requiere script de migración dedicado)
- Cartera de cheques y previsión de riesgo

---

*Documento preparado el 19/03/2026 · Sprint 2 — Tesorería Moretti*

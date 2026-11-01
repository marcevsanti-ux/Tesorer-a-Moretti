-- Ejecutar en Supabase SQL Editor del proyecto de Tesorería Moretti.
-- Tabla independiente: no altera mesa_reclamos ni tablas existentes.
create table if not exists public.crm_reclamos (
  reclamo_id text primary key,
  fecha_ingreso text,
  cliente text,
  tipo_cliente text,
  motivo text,
  tipo text,
  urgencia text,
  estado text,
  producto text,
  responsable text,
  ultimo_contacto text,
  dias_sin_respuesta numeric,
  observaciones text,
  sincronizado_at timestamptz not null default now()
);
create index if not exists crm_reclamos_estado_idx on public.crm_reclamos (estado);
create index if not exists crm_reclamos_responsable_idx on public.crm_reclamos (responsable);
alter table public.crm_reclamos enable row level security;
-- Sin políticas públicas: acceso exclusivo desde el backend con service_role.

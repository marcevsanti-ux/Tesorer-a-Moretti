-- Mesa de Ayuda: ejecutar en Supabase SQL Editor, después de revisar en entorno de pruebas.
-- No altera tablas existentes de Tesorería.
create table if not exists public.mesa_usuarios (
 user_id uuid primary key references auth.users(id) on delete cascade,
 rol text not null check (rol in ('ADMIN','USUARIO')),
 activo boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.mesa_ot (
 id uuid primary key default gen_random_uuid(),
 numero text not null unique,
 cliente text not null,
 estado text not null default 'Pendiente',
 subestado text not null default '',
 observaciones text not null default '',
 clarity_id text unique,
 clarity_snapshot jsonb,
 pendiente_sync boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.mesa_reclamos (
 id uuid primary key default gen_random_uuid(),
 ot_id uuid references public.mesa_ot(id) on delete set null,
 asunto text not null,
 descripcion text not null default '',
 estado text not null default 'ABIERTO' check (estado in ('ABIERTO','EN_PROCESO','CERRADO')),
 prioridad text not null default 'MEDIA' check (prioridad in ('BAJA','MEDIA','ALTA')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.mesa_seguimientos (
 id uuid primary key default gen_random_uuid(),
 ot_id uuid references public.mesa_ot(id) on delete restrict,
 reclamo_id uuid references public.mesa_reclamos(id) on delete restrict,
 contenido text not null check(length(trim(contenido))>0),
 autor uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 constraint seguimiento_un_destino check ((ot_id is not null) <> (reclamo_id is not null))
);
create table if not exists public.mesa_auditoria (
 id bigint generated always as identity primary key,
 tabla text not null,
 registro_id uuid not null,
 accion text not null,
 antes jsonb,
 despues jsonb,
 actor uuid default auth.uid(),
 fecha timestamptz not null default now()
);
create or replace function public.mesa_es_usuario() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mesa_usuarios where user_id=(select auth.uid()) and activo=true)
$$;
create or replace function public.mesa_es_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mesa_usuarios where user_id=(select auth.uid()) and activo=true and rol='ADMIN')
$$;
revoke all on function public.mesa_es_usuario() from public;
revoke all on function public.mesa_es_admin() from public;
grant execute on function public.mesa_es_usuario() to authenticated;
grant execute on function public.mesa_es_admin() to authenticated;
alter table public.mesa_usuarios enable row level security;
alter table public.mesa_ot enable row level security;
alter table public.mesa_reclamos enable row level security;
alter table public.mesa_seguimientos enable row level security;
alter table public.mesa_auditoria enable row level security;
create policy mesa_usuarios_read on public.mesa_usuarios for select to authenticated using (user_id=(select auth.uid()) or (select public.mesa_es_admin()));
create policy mesa_usuarios_admin_insert on public.mesa_usuarios for insert to authenticated with check ((select public.mesa_es_admin()));
create policy mesa_usuarios_admin_update on public.mesa_usuarios for update to authenticated using ((select public.mesa_es_admin())) with check ((select public.mesa_es_admin()));
create policy mesa_ot_read on public.mesa_ot for select to authenticated using ((select public.mesa_es_usuario()));
create policy mesa_ot_insert on public.mesa_ot for insert to authenticated with check ((select public.mesa_es_usuario()));
create policy mesa_ot_update on public.mesa_ot for update to authenticated using ((select public.mesa_es_usuario())) with check ((select public.mesa_es_usuario()));
create policy mesa_reclamos_read on public.mesa_reclamos for select to authenticated using ((select public.mesa_es_usuario()));
create policy mesa_reclamos_insert on public.mesa_reclamos for insert to authenticated with check ((select public.mesa_es_usuario()));
create policy mesa_reclamos_update on public.mesa_reclamos for update to authenticated using ((select public.mesa_es_usuario())) with check ((select public.mesa_es_usuario()));
create policy mesa_seguimientos_read on public.mesa_seguimientos for select to authenticated using ((select public.mesa_es_usuario()));
create policy mesa_seguimientos_insert on public.mesa_seguimientos for insert to authenticated with check ((select public.mesa_es_usuario()) and autor=(select auth.uid()));
create policy mesa_auditoria_read on public.mesa_auditoria for select to authenticated using ((select public.mesa_es_admin()));
create or replace function public.mesa_touch_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
   new.updated_at=now();
   insert into public.mesa_auditoria(tabla,registro_id,accion,antes,despues,actor)
   values(tg_table_name,new.id,tg_op,to_jsonb(old),to_jsonb(new),auth.uid());
   return new;
 elsif tg_op='INSERT' then
   insert into public.mesa_auditoria(tabla,registro_id,accion,despues,actor)
   values(tg_table_name,new.id,tg_op,to_jsonb(new),auth.uid());
   return new;
 end if;
 return null;
end $$;
create trigger mesa_ot_audit before insert or update on public.mesa_ot for each row execute function public.mesa_touch_audit();
create trigger mesa_reclamos_audit before insert or update on public.mesa_reclamos for each row execute function public.mesa_touch_audit();
-- Alta de roles: primero invitar/crear usuarios desde Supabase Auth.
-- Luego reemplazar los UUID por los IDs reales:
-- insert into public.mesa_usuarios(user_id,rol) values ('UUID_MARCELO','ADMIN'),('UUID_VALERIA','USUARIO');
-- No ejecutar placeholders. No colocar service_role en HTML.

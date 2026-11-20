-- TallerYa — códigos de invitación para talleres.
-- Corre en Supabase → SQL Editor (proyecto TallerYa), ANTES del deploy
-- de esta versión. Sin esta tabla el registro de talleres falla.
--
-- El flujo (decisión de Orlan 2026-11-19): solo entran talleres serios
-- y establecidos, verificados por él EN PERSONA. Orlan genera un código
-- en la app (pantalla "Códigos"), va al taller, verifica que existe y
-- le entrega el código al encargado. El taller mete el código al
-- registrarse y queda aprobado en ese momento. Sin código no hay
-- registro de taller (el conductor no necesita código).
-- El código es de UN SOLO USO: al registrarse queda marcado con quién
-- lo usó y cuándo. Se genera como TALLER-XXXXXX (6 caracteres al azar,
-- nunca secuencial). El dueño puede desactivar un código sin usar.
-- Nada aquí toca OnlyClick.

create table if not exists invite_codes (
  id bigint generated always as identity primary key,
  code text not null unique,
  note text not null default '',
  created_by bigint references users (id) on delete set null,
  used_by bigint references users (id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_invite_codes_code on invite_codes (code);

-- Permisos (OBLIGATORIO, igual que en schema.sql 2026-11-19): las
-- tablas creadas por SQL no le dan permisos DML a service_role por
-- defecto. Sin estos GRANT la API devuelve "permission denied".
grant select, insert, update, delete on table invite_codes to service_role;
grant usage, select on sequence invite_codes_id_seq to service_role;

-- Verificación: debe dar 0 filas (tabla nueva, vacía).
select count(*) as codigos from invite_codes;

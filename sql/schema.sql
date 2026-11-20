-- TallerYa — esquema Supabase (proyecto nuevo, separado de OnlyClick).
-- Corre este archivo en el SQL Editor de Supabase (proyecto TallerYa).
-- Después corre sql/seed.sql para los talleres de ejemplo.
-- Nada aquí toca OnlyClick.

create table if not exists users (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('driver', 'workshop')),
  phone text not null default '',
  is_owner boolean not null default false,
  approved boolean not null default true,
  created_at timestamptz not null default now()
);

-- Perfil del conductor: hasta 3 carros + seguro (todo en una fila).
create table if not exists driver_profiles (
  user_id bigint primary key references users (id) on delete cascade,
  carros jsonb not null default '[]'::jsonb,
  tiene_seguro boolean not null default false,
  aseguradora text not null default '',
  poliza text not null default '',
  tel_aseg text not null default '',
  updated_at timestamptz not null default now()
);

-- Talleres con la app (un taller por cuenta de usuario).
create table if not exists workshops (
  id bigint generated always as identity primary key,
  user_id bigint not null unique references users (id) on delete cascade,
  nombre text not null,
  especialidad text not null default 'Mecánica',
  ciudad text not null default 'Ensenada',
  zona text not null default '',
  whatsapp text not null default '',
  tiene_grua boolean not null default false,
  a_domicilio boolean not null default false,
  plan text not null default 'Basico' check (plan in ('Basico', 'Destacado', 'Premium')),
  activo boolean not null default true,
  rating numeric not null default 0,
  opiniones integer not null default 0,
  horario text not null default '',
  direccion text not null default '',
  servicios text not null default '',
  costo_visita numeric,
  lat numeric,
  lng numeric,
  dist_km numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists services (
  id bigint generated always as identity primary key,
  workshop_id bigint not null references workshops (id) on delete cascade,
  nombre text not null,
  precio text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists offers (
  id bigint generated always as identity primary key,
  workshop_id bigint not null references workshops (id) on delete cascade,
  titulo text not null,
  precio text not null default '',
  vigencia text not null default '',
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

-- Solicitudes: el conductor avisa al taller (doble aviso: en la app + WhatsApp).
create table if not exists requests (
  id bigint generated always as identity primary key,
  driver_id bigint not null references users (id) on delete cascade,
  workshop_id bigint not null references workshops (id) on delete cascade,
  incident text not null,
  descripcion text not null default '',
  carro jsonb,
  lat numeric,
  lng numeric,
  foto_key text,
  estado text not null default 'nueva',
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id bigint generated always as identity primary key,
  user_id bigint not null references users (id) on delete cascade,
  titulo text not null,
  cuerpo text not null default '',
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

-- Eventos simples para las estadísticas del taller (vista / llamada / aviso).
create table if not exists workshop_events (
  id bigint generated always as identity primary key,
  workshop_id bigint not null references workshops (id) on delete cascade,
  kind text not null check (kind in ('vista', 'llamada', 'aviso')),
  created_at timestamptz not null default now()
);

-- Listados de Google (semilla): talleres que aún no tienen la app.
-- Se llenan con sql/seed.sql; en producción se reemplazan por Google Places.
create table if not exists google_shops (
  id bigint generated always as identity primary key,
  nombre text not null,
  especialidad text not null,
  tipo text not null,
  zona text not null default '',
  direccion text not null default '',
  telefono text not null default '',
  rating numeric not null default 0,
  opiniones integer not null default 0,
  horario text not null default '',
  servicios text not null default '',
  lat numeric,
  lng numeric,
  dist_km numeric not null default 0,
  created_at timestamptz not null default now()
);

-- Índices para las consultas del panel y la búsqueda.
create index if not exists idx_requests_workshop on requests (workshop_id, id desc);
create index if not exists idx_requests_driver on requests (driver_id, id desc);
create index if not exists idx_notifications_user on notifications (user_id, id desc);
create index if not exists idx_events_workshop on workshop_events (workshop_id, created_at desc);
create index if not exists idx_services_workshop on services (workshop_id);
create index if not exists idx_offers_workshop on offers (workshop_id, id desc);

-- Bucket de fotos (crear en Storage > Buckets, nombre "fotos", privado):
-- las fotos adjuntas a solicitudes viven ahí; solo las ven el conductor
-- que las mandó y el taller que las recibió (lo verifica el backend).

-- Permisos (OBLIGATORIO, 2026-11-19): sin estos GRANT la API devuelve
-- "permission denied for table users" y la búsqueda devuelve 0 talleres,
-- aunque la clave service_role sea la correcta. Las tablas se crean como
-- postgres y service_role NO hereda los permisos DML por defecto en este
-- proyecto: hay que otorgarlos explícito. RLS está desactivado, así que
-- estos GRANT son el único control de acceso a nivel base.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

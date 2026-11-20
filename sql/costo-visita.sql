-- Costo por ir a cotizar fuera del taller (en el lugar del percance o a
-- domicilio). Lo pone cada taller en su panel; cubre el servicio, el
-- tiempo y el traslado del carrocero. NULL = a convenir.
-- Correr en el SQL Editor de Supabase (proyecto TallerYa) al desplegar
-- el rediseño con los modos de Choqué.
alter table workshops add column if not exists costo_visita numeric;

-- TallerYa — quitar los talleres de ejemplo de Google.
-- Corre en Supabase → SQL Editor (proyecto TallerYa).
-- Después de esto, google_shops queda VACÍA: las búsquedas muestran
-- los talleres registrados en la app primero y después los talleres
-- REALES de Google Places (con la llave GOOGLE_PLACES_API_KEY en
-- Vercel). Sin llave, solo salen los talleres con la app.
-- No se borra nada más: solo la tabla google_shops.

delete from google_shops;

-- Verificación: debe dar 0.
select count(*) as talleres_ejemplo_restantes from google_shops;

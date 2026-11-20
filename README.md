# TallerYa — v1

App real (no prototipo) para que un conductor con un incidente en su carro
toque **un solo botón** y conecte directamente con el dueño de un taller,
persona a persona. Ensenada, Baja California.

- **Conductor:** gratis. Se registra, guarda hasta 3 carros + su seguro,
  pica qué le pasó y le avisa al taller (en la app + WhatsApp).
- **Taller:** se registra y paga suscripción después (en v1 NO hay cobro).
  Su panel recibe solicitudes, edita servicios y precios, publica ofertas,
  ve estadísticas simples y puede pausar su anuncio.
- **Botón rojo 911** fijo en todas las pantallas (`tel:911`).
- **Estilo:** azul marino oscuro + dorado, como el prototipo aprobado
  (`~/workspace/goals/app-de-talleres-mec-nicos-y-hojalater-a/files/prototipo-talleres.html`).

> **Estado: código listo y probado en local. NO está desplegado.**
> No se creó ningún repositorio, proyecto de Vercel ni proyecto de
> Supabase. Los pasos para desplegar están abajo.

## Qué se construyó

```
server.js                  Punto de entrada ÚNICO en producción (Vercel).
                           Todas las rutas /api/* se registran aquí.
                           (Lección de OnlyClick: en Vercel corre server.js,
                           NO los wrappers api/*.js.)
api/_lib/handlers.js       Toda la lógica: auth, búsqueda, notify, panel,
                           foquitos, foto, notificaciones, stats.
api/_lib/store.js          Adaptador de datos: archivo JSON local (dev)
                           o Supabase (producción). Misma interfaz.
api/_lib/auth.js           Contraseñas con scrypt + token de sesión HMAC.
api/_lib/focos.js          Los 10 foquitos del tablero + especialista.
api/_lib/seed.js           6 talleres de ejemplo (3 con app + 3 de Google).
public/index.html          La app (una sola página): registro, inicio,
                           datos, resultados, ficha, foquito, confirmación,
                           panel del taller, notificaciones, mis datos.
public/app.js              Toda la lógica del frente (~900 líneas).
public/logo.png            Logo: pin dorado con llave, fondo negro.
public/icon-192.png        Icono PWA (192).
public/icon-512.png        Icono PWA (512).
public/manifest.json       Manifiesto PWA (nombre TallerYa, fondo negro).
sql/schema.sql             Esquema completo para Supabase (proyecto nuevo).
sql/seed.sql               Los 3 talleres de Google de ejemplo.
test/                      22 pruebas (node:test): auth, orden de
                           resultados, foquitos y flujo completo.
```

### Flujo del conductor
1. Registro (nombre, correo, contraseña, teléfono) → rol `driver`.
2. Guarda **hasta 3 carros** (marca/modelo/año/color) + **seguro**
   (aseguradora, póliza, teléfono). Se guardan una sola vez.
3. En inicio pica uno de los **6 botones grandes**: Choqué · No arranca ·
   Llantas / Frenos · Se calentó · Necesito grúa · Otro problema
   (con espacio para describirlo) — y **“Se prendió un foquito”**.
4. Foquito: sube foto del tablero (máx. 2 MB) **o** pica a mano los
   foquitos prendidos → ve qué significa cada uno, la urgencia
   (“¡No sigas manejando!” para aceite/temperatura/frenos) y el
   especialista recomendado, con botón para buscarlo.
5. Ubicación por GPS (o zona de Ensenada si no da permiso) + foto
   opcional del daño (máx. 2 MB).
6. **Resultados ordenados así (regla del plan): talleres CON la app
   primero** — por plan (Premium → Destacado → Básico), luego por
   calificación, luego por distancia real (GPS) — **y después los de
   Google**. Ej.: 10 talleres con la app salen antes que el 11.º de Google.
7. Ficha del taller: servicios y precios, ofertas, opiniones, llamar /
   WhatsApp, y **“Avisar al taller”** (solo en talleres con la app).
8. Al avisar: se crea la solicitud en el panel del taller, le llega la
   notificación en su campanita **y** se abre WhatsApp con el mensaje
   ya escrito (qué pasó + cuál carro + ubicación). Si tiene seguro
   guardado, la pantalla de confirmación muestra su aseguradora y el
   botón para llamarla.

### Panel del taller
- **Solicitudes:** nombre del conductor, qué le pasó, su carro, distancia,
  foto adjunta (si la mandó), botones Llamar / WhatsApp.
- **Servicios y precios:** editables (se guardan con “Guardar servicios”).
- **Ofertas:** crear (título, precio, vigencia), listar, pausar / republicar.
- **Perfil:** nombre, WhatsApp, horario, zona, dirección, servicios,
  tiene grúa, a domicilio.
- **Estadísticas (últimos 7 días):** cuántas veces lo vieron, lo llamaron
  y le avisaron.
- **Suscripción:** muestra el plan y botón **Pausar mi anuncio** (mientras
  está pausado no aparece en las búsquedas). **Sin cobro real en v1.**
- **Aprobación:** un taller nuevo NO aparece en búsquedas hasta que el
  dueño lo aprueba (`OWNER_EMAIL`, ver abajo).

### Seguridad y honestidad
- Contraseñas con `scrypt` + salt; tokens de sesión HMAC con expiración
  de 30 días. Las fotos adjuntas solo las ven el conductor que las mandó
  y el taller que las recibió (el backend verifica el acceso).
- El seguro **NO** se conecta al sistema de la aseguradora: se guardan
  los datos y al tocar el botón se llama a la aseguradora con los datos
  listos (así quedó explicado en el plan).
- El foquito por foto en v1 es **manual**: la foto se guarda para el
  taller, pero el diagnóstico lo hace el usuario picando los foquitos.
  La lectura con IA (Gemini, como la lectura de dorsales de OnlyClick)
  queda para después.
- Los talleres “De Google” son datos de ejemplo; la integración real con
  Google Places queda para después.

## Cómo correrlo en local

```bash
cd ~/workspace/tallerya-v1
npm install        # no hay dependencias externas; solo deja listo npm test
AUTH_SECRET=un-secreto-largo npm start
# o: PORT=3100 AUTH_SECRET=un-secreto-largo npm start
# abre http://localhost:3000
```

Sin `AUTH_SECRET` arranca con uno temporal (solo para probar; cada
reinicio invalida las sesiones). Los datos se guardan en `./data/db.json`
(se crea solo). Para borrar todo: `rm -rf data`.

### Variables de entorno (local)
| Variable | Para qué | Obligatoria |
|---|---|---|
| `AUTH_SECRET` | Firma los tokens de sesión | No (temporal si falta) |
| `OWNER_EMAIL` | Correo del dueño (aprueba talleres). Por defecto `dueno@tallerya.mx` | No |
| `PORT` | Puerto. Por defecto `3000` | No |
| `TALLERYA_DATA_DIR` | Dónde guarda `db.json` en local | No |
| `SUPABASE_URL` | URL del proyecto Supabase (producción) | Sí, en producción |
| `SUPABASE_SERVICE_ROLE_KEY` | Llave service_role (producción) | Sí, en producción |

> ⚠️ **Nunca pongas claves ni contraseñas en el código ni en el chat.**
> Solo en variables de entorno de Vercel (o en la terminal local).

## Pruebas

```bash
npm test            # 22 pruebas, todas verdes
node --check server.js public/app.js api/_lib/*.js
```

Qué cubren: hash/verificación de contraseña y tokens; orden de
resultados (app primero, plan, rating, distancia, GPS real); los 10
foquitos y su especialista; y el flujo completo con el adaptador de
archivo: registro driver/taller, perfil con 3 carros (el 4.º se rechaza),
aprobación por el dueño, búsqueda antes/después de aprobar, aviso al
taller + notificación + WhatsApp, panel (servicios, ofertas, perfil,
pausa), foto visible solo para conductor y taller, stats.

**Prueba de humo manual (ya hecha en local, 2026-11-19):** servidor
arrancado con `AUTH_SECRET` de prueba: registro driver → guardar perfil
con carro + seguro → búsqueda “choque” (solo Google antes de aprobar) →
registro taller → aprobación por el dueño → búsqueda (taller con app
primero) → aviso → panel con 1 solicitud, 1 no leída, stats con 1 aviso
→ notificación en la campanita. Todo funcionó.

## Despliegue (pasos exactos, para hacer después)

### 1. GitHub (repo nuevo, separado de OnlyClick)
1. En github.com, crear repositorio **público o privado** llamado
   `tallerya` (cuenta `dustsince2026-oss`, la misma de OnlyClick).
2. Subir todo el contenido de `~/workspace/tallerya-v1/` a la rama `main`
   (sin la carpeta `data/` — está en `.gitignore`).
3. Verificar que `server.js` quedó en la **raíz** del repo (Vercel lo
   usa como entrypoint, igual que OnlyClick) y que `vercel.json` también
   quedó en la raíz — SIN `vercel.json` Vercel despliega solo archivos
   estáticos y las rutas `/api/*` dan 404 (pasó en el primer deploy
   2026-11-19: la página cargaba pero la API no respondía). OJO: NO
   copiar tal cual el vercel.json de OnlyClick: su bloque
   `"functions":{"api/**/*.js":...}` exige que existan archivos de
   función en api/ y TallerYa solo tiene api/_lib/ — el build falla con
   `unused_function` (pasó 2026-11-19 ~16:29). El vercel.json de
   TallerYa lleva SOLO el rewrite, sin bloque functions.

### 2. Supabase (proyecto nuevo, separado de OnlyClick)
1. En supabase.com, crear proyecto nuevo llamado **TallerYa**.
2. En **SQL Editor → New query**, pegar y correr `sql/schema.sql`
   (crea las 9 tablas + índices).
3. En otra query, pegar y correr `sql/seed.sql` (3 talleres de Google).
4. En **Storage → Create bucket**: nombre `fotos`, **privado**
   (las fotos las sirve el backend con verificación de acceso).
5. Copiar de **Settings → API**: `Project URL` y la llave
   `service_role` (la secreta, no la `anon`).

### 3. Vercel (proyecto nuevo)
1. En vercel.com, **Add New → Project → Import** el repo `tallerya`.
2. Framework: **Other** (no hay build; `server.js` es el entrypoint).
3. Variables de entorno (Settings → Environment Variables):
   - `SUPABASE_URL` = la URL del paso 2.5
   - `SUPABASE_SERVICE_ROLE_KEY` = la llave service_role
   - `AUTH_SECRET` = una frase larga al azar (generarla en ese momento)
   - `OWNER_EMAIL` = `dust.since2026@gmail.com`
4. Deploy. El sitio queda en `https://tallerya.vercel.app` (o el
   dominio que se le asigne después; el dominio `tallerya.com.mx`
   se compra aparte en Cloudflare, como se hizo con OnlyClick,
   ~$17 USD/año — **no es necesario para que la app funcione**).

### 4. Verificación después del deploy
1. Abrir la URL → debe verse la pantalla de registro.
2. Registrar un conductor de prueba → guardar 1 carro → buscar
   “Choqué” → deben salir los 3 talleres de Google de ejemplo.
3. Registrar un taller de prueba → **no** debe aparecer en búsquedas
   hasta aprobarlo.
4. En Supabase (Table Editor → users) poner `approved = true` al
   taller (o usar el endpoint `/api/workshop-approve` con la sesión
   del dueño) → buscar otra vez → el taller con la app sale primero.
5. Avisar al taller desde el conductor → revisar que llegue la
   solicitud al panel y la notificación.
6. Revisar en Vercel → Logs que no haya errores 500.

### Pendiente para después del v1 (no incluido)
- Lectura del foquito por foto con IA (Gemini).
- Google Places real en vez de la semilla (reemplazar `google_shops`).
- Suscripciones con cobro real (Clip, como OnlyClick).
- Publicación en Play Store (PWA → TWA, cuenta de desarrollador
  $25 USD por única vez, como se decidió en el plan).
- Dominio `tallerya.com.mx` (Orlan lo revisa en Cloudflare).

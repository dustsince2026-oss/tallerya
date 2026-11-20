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

> **Estado: EN VIVO desde 2026-11-19: https://tallerya-beryl.vercel.app/**
> (GitHub dustsince2026-oss/tallerya, Supabase proyecto "TallerYa",
> Vercel proyecto "tallerya"). Esta carpeta es la versión con Google
> Places reales: todavía NO desplegada — ver "Despliegue de esta
> versión" abajo.

## Qué se construyó

```
server.js                  Punto de entrada ÚNICO en producción (Vercel).
                           Todas las rutas /api/* se registran aquí.
                           (Lección de OnlyClick: en Vercel corre server.js,
                           NO los wrappers api/*.js.)
api/_lib/handlers.js       Toda la lógica: auth, búsqueda, notify, panel,
                           foquitos, foto, notificaciones, stats.
api/_lib/places.js         Google Places (API New): Text Search + Place
                           Details, mapeo a la forma pública de Google,
                           deduplicación contra talleres con la app.
api/_lib/store.js          Adaptador de datos: archivo JSON local (dev)
                           o Supabase (producción). Misma interfaz.
api/_lib/auth.js           Contraseñas con scrypt + token de sesión HMAC.
api/_lib/focos.js          Los 10 foquitos del tablero + especialista.
api/_lib/seed.js           Configuración de incidentes (NO datos de
                           ejemplo: los talleres de ejemplo se eliminaron).
public/index.html          La app (una sola página): registro, inicio,
                           datos, resultados, ficha, foquito, confirmación,
                           panel del taller, notificaciones, mis datos.
public/app.js              Toda la lógica del frente (~900 líneas).
public/logo.png            Logo: pin dorado con llave, fondo negro.
public/icon-192.png        Icono PWA (192).
public/icon-512.png        Icono PWA (512).
public/manifest.json       Manifiesto PWA (nombre TallerYa, fondo negro).
sql/schema.sql             Esquema completo para Supabase (proyecto nuevo).
sql/seed.sql               VACÍO (los datos de ejemplo se eliminaron).
sql/quitar-talleres-ejemplo.sql  DELETE FROM google_shops + verificación.
                           Corre en Supabase → SQL Editor (ver abajo).
test/                      38 pruebas (node:test): auth, orden de
                           resultados, foquitos, flujo completo y Google
                           Places (con el fetch simulado, nunca la API real).
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
  está pausado no aparece en las búsquedas). **Plan gratis, sin cobro.**
- **Códigos de invitación:** el taller se registra solo y queda en
  espera; el dueño lo visita en persona, le entrega un código y el
  taller **activa su cuenta** con ese código (ver "Códigos de
  invitación para talleres" abajo). Si ya tiene el código, lo puede
  meter directo al registrarse y entra aprobado en ese momento.
  Respaldo: el dueño puede quitarle y devolverle la aprobación con
  `/api/workshop-approve` (`OWNER_EMAIL`, ver abajo).

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
- Los talleres “De Google” son REALES: vienen de Google Places
  (ver "Google Places" abajo). Los 3 de ejemplo se eliminaron del
  código y de la base (sql/quitar-talleres-ejemplo.sql). Sin llave de
  Google, la búsqueda muestra solo los talleres con la app y avisa
  con una línea corta; nunca muestra datos inventados.

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
| `OWNER_EMAIL` | Correo del dueño (genera códigos y puede aprobar talleres). Por defecto `dueno@tallerya.mx` | No |
| `PORT` | Puerto. Por defecto `3000` | No |
| `TALLERYA_DATA_DIR` | Dónde guarda `db.json` en local | No |
| `SUPABASE_URL` | URL del proyecto Supabase (producción) | Sí, en producción |
| `SUPABASE_SERVICE_ROLE_KEY` | Llave service_role (producción) | Sí, en producción |
| `GOOGLE_PLACES_API_KEY` | Llave de Google Places (API New) para los talleres reales de Google | No (sin ella solo salen los talleres con la app) |
| `PLACES_TIMEOUT_MS` | Timeout de Google Places en ms (por defecto 8000; solo para pruebas) | No |

> ⚠️ **Nunca pongas claves ni contraseñas en el código ni en el chat.**
> Solo en variables de entorno de Vercel (o en la terminal local).

## Pruebas

```bash
npm test            # 51 pruebas, todas verdes
node --check server.js public/app.js api/_lib/*.js
```

Qué cubren: hash/verificación de contraseña y tokens; orden de
resultados (app primero, plan, rating, distancia, GPS real); los 10
foquitos y su especialista; el flujo completo con el adaptador de
archivo: registro driver/taller, perfil con 3 carros (el 4.º se rechaza),
registro de taller sin código (queda en espera, no aparece en
búsquedas), activación con código (válido/inválido/ya usado/ya activo,
solo talleres), lista de talleres en espera (solo el dueño), códigos de
invitación (con código válido entra aprobado y aparece en búsquedas,
desactivar, solo el dueño crea/lista/desactiva), el aviso de la visita
en la pantalla de espera, aprobación por el dueño (respaldo), aviso al
taller + notificación + WhatsApp, panel (servicios, ofertas, perfil,
pausa), foto visible solo para conductor y taller, stats; y Google
Places: mapeo de la respuesta de la API, teléfono a 10 dígitos, cerrado
permanente fuera, timeout a 8 s, deduplicación contra la app, límite de
10 por búsqueda, detalle por Place Details, y los casos sin llave y con
Google caído (solo app + `googleDisponible: false`). El fetch de Google
se simula en los tests — nunca se llama a la API real.

**Prueba de humo manual (ya hecha en local, 2026-11-19):** servidor
arrancado con `AUTH_SECRET` de prueba: registro del dueño → búsqueda
"choque" sin llave: 0 resultados + `googleDisponible: false` → la
página sirve con el aviso de Google. Todo funcionó.

## Google Places (talleres reales)

La búsqueda muestra **primero los talleres registrados en la app**
(por plan, luego calificación, luego distancia) y **después los
talleres REALES de Google** (por distancia, máximo 10 por búsqueda).
Los 3 talleres de ejemplo ya no existen en ningún lado: ni en el
código (`api/_lib/seed.js` ya no los tiene), ni en el adaptador local
(`store.js` ya no siembra nada), ni en la base (ver limpieza abajo).

### Cómo funciona
- `api/_lib/places.js` llama a la API **Places (New)** de Google:
  Text Search (`POST /v1/places:searchText`) para buscar y Place
  Details (`GET /v1/places/{placeId}`) para la ficha. Timeout de 8 s.
- La pregunta a Google depende del incidente: `choque` → "carrocería
  y hojalatería en Ensenada", `noarranca`/`otro`/`foquito` → "taller
  mecánico en Ensenada", `grua` → "grúas en Ensenada", `electrico` →
  "taller eléctrico automotriz en Ensenada". Con GPS del conductor se
  manda un círculo de 15 km como `locationBias`.
- Cada lugar se mapea a la misma forma pública que un taller con la
  app (`id: 'places:' + placeId`, `source: 'google'`, `enApp: false`,
  nombre, dirección, teléfono local de 10 dígitos, calificación,
  opiniones, horario de hoy, distancia real). Los cerrados
  permanentemente no salen.
- **Deduplicación:** si un lugar de Google tiene el mismo nombre que
  un taller con la app y está a menos de ~200 m (o no hay coordenadas
  para comparar), no se repite: el taller con la app ya está primero.
- **Sin llave o con Google caído:** la búsqueda devuelve solo los
  talleres con la app y `googleDisponible: false`; el frente muestra
  la línea "Los talleres de Google se activan cuando se agregue la
  llave." Nunca se muestran datos de ejemplo.
- La ficha de un taller de Google se pinta con los datos que ya trae
  la búsqueda (sin otra llamada); el detalle por Place Details
  (`/api/shop-get?source=google&id=places:...`) queda para cuando no
  hay resultado guardado.

### La llave (la crea Orlan, nunca va en el chat ni en el código)
1. En Google Cloud Console (cuenta dust.since2026@gmail.com), crear o
   elegir el proyecto y habilitar **Places API (New)**.
2. En **APIs y servicios → Credenciales → Crear credenciales → Clave
   de API** (restringirla a Places API si se puede).
3. En Vercel → proyecto `tallerya` → **Settings → Environment
   Variables** → agregar `GOOGLE_PLACES_API_KEY` = la clave, solo para
   **Production** → **Redeploy** (o el próximo deploy la toma).
4. Sin redeploy no cambia nada: la variable se lee al arrancar.

### Costo (aproximado, confirmar en Cloud Console)
Google Maps Platform da **$200 USD de crédito al mes** por cuenta de
facturación. Text Search cuesta ~**$32 USD por cada 1,000 búsquedas**,
así que el crédito cubre ~**6,250 búsquedas al mes**; Place Details
cuesta ~$17 USD por 1,000. Para el arranque en Ensenada sobra. Si el
crédito se acaba, Google cobra lo que sigue según su lista de precios
— revisar en Cloud Console → Facturación antes de que llegue el caso.

## Códigos de invitación para talleres

Solo entran talleres **serios y establecidos**, verificados por Orlan
**en persona** (decisión de Orlan 2026-11-19). El taller se registra
solo y queda **en espera** hasta que Orlan va a verificarlo y le
entrega el código; con el código el taller **activa su cuenta**. El
conductor no necesita código.

### Cómo funciona (flujo)
1. El taller interesado se registra como **Taller** (nombre del taller,
   especialidad, zona, WhatsApp, plan). El campo **"Código de
   invitación" es opcional**: si lo deja vacío, queda **en espera**
   (no aparece en las búsquedas).
2. Al registrarse y cada vez que entra a su cuenta mientras siga en
   espera, el taller ve este aviso en su panel:
   > "En los próximos días llegará un agente de TallerYa a visitarte
   > para corroborar la información que nos mostraste y entregarte el
   > código para que tu registro sea exitoso."
   Y el campo para meter el código con el botón **"Activar mi taller"**.
3. Orlan ve los talleres en espera en su pantalla **"Códigos de
   invitación"** (sección "Talleres en espera": nombre, contacto,
   correo, teléfono, fecha de registro). Ahí mismo genera el código:
   escribe el nombre del taller (opcional) y pica **"Generar código"**.
   Sale un código grande, formato `TALLER-XXXXXX` (6 caracteres al
   azar, nunca secuencial), con botón **Copiar**.
4. Orlan va al taller, verifica que existe, habla con el encargado y
   le entrega el código.
5. El encargado mete el código en su panel (**"Activar mi taller"**).
   Con código válido la cuenta se **activa en ese momento** y ya
   aparece en las búsquedas, primero que los de Google. Con código que
   no existe o ya se usó da error: "Ese código no es válido."
6. **Atajo:** si Orlan ya le dio el código antes de que se registrara,
   el taller lo mete directo en el registro y entra **aprobado en ese
   momento**, sin pasar por la espera.
7. El código sirve **una sola vez**: en la lista de códigos sale como
   "USADO por <nombre> el <fecha>". El dueño puede **desactivar** un
   código sin usar (ya no sirve); uno usado no se puede desactivar.
8. Respaldo: el endpoint viejo `/api/workshop-approve` sigue
   funcionando (el dueño puede quitarle y devolverle la aprobación a
   un taller desde la API).

### Datos técnicos
- Tabla `invite_codes` (ver `sql/codigos-invitacion.sql`):
  `code` único, `note`, `created_by`, `used_by`, `used_at`,
  `created_at`. **Ya existe en Supabase** (se creó en el deploy de
  códigos 2026-11-19): esta versión **no necesita ningún SQL nuevo**.
- Endpoints: `POST /api/workshop-activate` (body `{inviteCode}`,
  el propio taller, con sesión; devuelve el usuario aprobado) y `GET
  /api/pending-workshops` (dueño, `requireOwner`). Los de códigos
  siguen igual (dueño, `requireOwner`): `POST
  /api/invite-code-create` (body `{note}`), `GET
  /api/invite-codes-list`, `POST /api/invite-code-deactivate` (body
  `{code}`). El registro de taller (`POST /api/auth-register` con
  `role: 'workshop'`) acepta `inviteCode` opcional: con código válido
  lo marca como usado antes de devolver éxito y el taller entra
  aprobado; sin código entra con `approved=false` y no aparece en
  las búsquedas (el filtro ya existía en `listApprovedWorkshops`).
- Sin variables de entorno nuevas. El plan (Básico/Destacado/Premium)
  sigue existiendo igual, sin cambios de lógica.

### Plan gratis
Por decisión de Orlan (2026-11-19, corregida el mismo día): los
talleres **no pagan nada por ahora**. En la app dice solo
**"Plan gratis."** — en el registro de taller (junto al plan) y en el
panel del taller. Sin fechas, sin "pruebas", sin "hasta nuevo aviso".

### Regla futura (NO implementada todavía, solo documentada)
Cuando lleguen los planes de cobro, al taller se le dirá que si quiere
moverse a un plan de pago, se empieza a cobrar; si no se quiere mover,
se queda abajo en los resultados, más o menos por donde salen los de
Google. Todavía no hay código para esto.

## Despliegue de esta versión (la app YA está en vivo)

La app vive en https://tallerya-beryl.vercel.app/ (repo
dustsince2026-oss/tallerya, Vercel proyecto "tallerya", Supabase
proyecto "TallerYa"). Esta versión solo hay que subirla encima:

### 1. SQL en Supabase: NO hace falta nada nuevo
La tabla `invite_codes` **ya existe en vivo** (se creó en el deploy
de códigos 2026-11-19, con sus GRANT a `service_role`). Esta versión
no crea tablas ni cambia el esquema: solo se sube el código.

### 2. Subir el código a GitHub (rama main)
Subir el contenido de `~/workspace/tallerya-activacion-talleres/` (sin
`data/` — está en `.gitignore`). Archivos nuevos o cambiados:
`api/_lib/handlers.js`, `api/_lib/store.js`, `public/app.js`,
`public/index.html`, `server.js`, `test/handlers.test.js`,
`test/places.test.js`, `test/codigos.test.js`,
`test/activacion.test.js` (nuevo), `README.md`.
Cada subida dispara el deploy automático en Vercel (~1 min).
Recordar (lección del primer deploy 2026-11-19): el entrypoint en
vivo es `server.js` (preset de Vercel "Node"); `vercel.json` lleva
SOLO el rewrite, sin bloque `functions`.

### 3. Poner la llave en Vercel (ver "Google Places" arriba)
`GOOGLE_PLACES_API_KEY` en Production + Redeploy. Sin la llave la app
sigue funcionando (solo talleres con la app + el aviso).

### 4. Verificación después del deploy
1. Abrir la URL → debe verse la pantalla de registro.
2. Buscar "Choqué" sin talleres registrados y **sin llave** → **0
   resultados** + la línea "Los talleres de Google se activan cuando
   se agregue la llave."
3. Con la llave puesta → buscar "Choqué" → salen talleres REALES de
   carrocería/hojalatería de Ensenada (con nombre, dirección y teléfono reales);
   buscar "Necesito grúa" → grúas reales.
4. Registrar un taller de prueba **sin código** → queda en espera
   (approved=false): NO da error, NO aparece en "Choqué", y en su
   panel sale el aviso de la visita con el campo para meter el código.
   Registrar otro taller con un código que no existe → error "Ese
   código no es válido."
5. Orlan (conductor, dueño) ve al taller en **"Códigos de
   invitación" → "Talleres en espera"**, genera un código y se lo
   entrega: el taller lo mete en su panel (**"Activar mi taller"**) →
   queda activo y sale PRIMERO en "Choqué", antes que los de Google.
   Registrar otro taller con el mismo código → error. Atajo: un
   taller que se registra metiendo un código válido entra aprobado
   directo, sin espera.
6. Avisar al taller desde el conductor → revisar que llegue la
   solicitud al panel y la notificación.
7. Revisar en Vercel → Logs que no haya errores 500.

### Pendiente para después (no incluido)
- Lectura del foquito por foto con IA (Gemini).
- Suscripciones con cobro real (Clip, como OnlyClick).
- Publicación en Play Store (PWA → TWA, cuenta de desarrollador
  $25 USD por única vez, como se decidió en el plan).
- Dominio `tallerya.com.mx` (Orlan lo revisa en Cloudflare).

## Botón único Choqué + terminología carrocería/hojalatería (2026-11-19)

- El botón **"Presupuesto de hojalatería" se eliminó**: era lo mismo que
  "Choqué" (si chocaste necesitas el presupuesto del choque) y ambos
  buscaban talleres de hojalatería. Quedó un solo botón **"Choqué"**
  con el subtítulo "Carrocería/hojalatería y pintura · te dan el
  presupuesto". En el servidor `incident=presupuesto` sigue funcionando
  como alias de `choque` para no romper clientes viejos (test
  "choqué y presupuesto son lo mismo" en test/handlers.test.js).
- **Terminología (regla de Orlan):** donde la app se refiere a la
  hojalatería, dice **"carrocería/hojalatería"** — botón, títulos de
  resultados, notas, especialidad del formulario, ficha de Google y
  pregunta a Google ("carrocería y hojalatería en Ensenada"). La clave
  interna sigue siendo `hojalateria` (código, base de datos, tipos).
- Ojo al tocar la lista de botones: el valor por defecto cuando no hay
  incidente elegido se busca por clave (`find(i => i.k === 'otro')`),
  NO por índice, para que quitar o mover un botón no cambie el
  valor por defecto.

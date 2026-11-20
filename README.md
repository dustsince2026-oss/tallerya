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

## Botón Llantera en vez de Falla eléctrica (2026-11-19)

- Orlan notó que "Falla eléctrica" repetía lo que ya cubre "No arranca"
  (mecánico o eléctrico). El botón ahora es **"🛞 Llantera"** (llantas,
  ponchadura, balanceo), con tipo nuevo `llantera`: pregunta a Google
  "llantera en Ensenada" y especialidad "Llantera" en el registro de
  talleres. Lo eléctrico sigue existiendo por dentro: `noarranca` busca
  mecánico + eléctrico, el diagnóstico del foquito recomienda taller
  eléctrico, y `incident=electrico` queda como alias en el servidor.
  `otro` y `Varias` ahora incluyen también `llantera`.

## Modos de Choqué + costo por la visita (2026-11-19/20)

- El botón "Choqué" dice solo **"Carrocería/hojalatería"** (sin pintura
  ni lo de presupuestos). Al picarlo NO va directo a pedir la ubicación:
  primero abre una pantalla con 3 modos — **"Necesito
  asistencia/presupuesto en el lugar del percance"** (con etiqueta roja
  **URGENTE**), **"Necesito un presupuesto (yo conduzco el auto hasta el
  taller)"** y **"Necesito un presupuesto a domicilio"** — y el modo
  elegido se guarda en el aviso al taller y en el subtítulo de
  resultados. Los otros incidentes van directo a la ubicación, como
  antes. Verificación en `/tmp/choque-modos-check.js` (jsdom, 21
  comprobaciones: flujo, etiquetas, subtítulo y costo).
- **Costo por la visita:** los dos presupuestos fuera del taller (en el
  lugar del percance y a domicilio) TIENEN COSTO — lo pone cada taller
  en su panel ("Costo por ir a cotizar fuera del taller", MXN) y cubre
  el servicio, el tiempo y el traslado del carrocero. Si el taller no
  lo pone, se muestra "a convenir". Llevar el carro al taller (modo
  "yo conduzco") no lleva costo extra. El precio sale en la tarjeta de
  resultados, en la ficha del taller y en el aviso que le llega al
  taller. Campo nuevo `workshops.costo_visita` (SQL
  `sql/costo-visita.sql`, también agregado a `sql/schema.sql`); el
  panel lo guarda con `panel-profile` y la búsqueda lo devuelve en
  `publicAppShop`.

## Botones amarillos (2026-11-20)

- Orlan: los botones grandes se veían azules (`#1c3a5c` del v1). Ahora
  son **amarillos un poco transparentes** (`rgba(245,179,1,.85)`, el
  dorado de la app) con **las letras en color sólido oscuro** (#1a1a1a;
  el texto chico en #3a3a3a, también sólido). El estado seleccionado
  quedó con borde oscuro. Los botones dorados principales (`.primary`)
  ya eran así y no se tocaron.

## Modos de No arranca (2026-11-20)

- Igual que Choqué: al picar **"No arranca"** primero sale una
  pantalla con modos. **Orlan 2026-11-20 ~00:26: sí lleva costo y son
  3 modos** — dos asistencias fuera del taller + llevar el carro: (1)
  "📍 Necesito un mecánico en mi ubicación actual" con etiqueta
  **URGENTE** (frase ELEGIDA por Orlan 2026-11-20 ~00:37, tras
  probar él mismo el flujo como usuario; antes decía "Asistencia
  donde se quedó el carro", propuesta por Bibi), (2) "🏠 Asistencia
  mecánica a domicilio" sin etiqueta, (3) "🚗 Puedo manejar el carro
  hasta el taller" sin etiqueta. Las dos
  asistencias fuera del taller **SÍ llevan costo por la visita** (mismo
  campo `costo_visita` del panel; la tarjeta dice "Asistencia fuera
  del taller: $X MXN (servicio, tiempo y traslado)" y el aviso al
  taller lleva "(costo por la visita: $X MXN)"); llevar el carro no
  lleva costo extra. El campo del panel ahora se llama "Costo por ir a
  atender fuera del taller (MXN)" y su ayuda cubre los 3 casos (lugar
  del percance, domicilio, donde se quedó el carro).
- La frase del botón urgente ("Necesito un mecánico en mi ubicación
  actual") la eligió Orlan tras simular el caso como usuario; antes
  decía "Asistencia donde se quedó el carro" (propuesta de Bibi).
- Suite `test/modos.test.js` (jsdom, 5 tests): 3 modos con URGENTE
  solo en el 1, costo en tarjeta y aviso para lugar y domicilio,
  conduzco sin costo, y regresión de Choqué. **Suite total: 61/61.**

## Modos de Llantera (2026-11-20)

- Igual que Choqué y No arranca: al picar **"Llantera"** primero sale
  una pantalla con **2 opciones**: (1) "🏠 Llantera a domicilio",
  (2) "📍 Necesito la llantera más cercana". Ninguna lleva etiqueta
  URGENTE (Orlan no la pidió aquí). El modo elegido aparece en el
  subtítulo de resultados y en el aviso que le llega a la llantera.
- La llantera a domicilio **todavía NO lleva costo por la visita**
  (pendiente la decisión de Orlan, como antes con el mecánico).
- Suite `test/modos.test.js` (jsdom, 8 tests: +3 de llantera).
  **Suite total: 64/64.**

## Carrusel del inicio (2026-11-20)

- Orlan 2026-11-20 ~00:43 (con imagen de referencia: conductor con el
  cofre abierto mirando su teléfono): en el inicio, en el espacio de
  abajo de los botones, imágenes que van cambiando solas haciendo
  referencia a la app, con frases: (1) "Asistencia para tu
  vehículo", (2) "Te asisten profesionales", (3) "La mejor opción
  para tu vehículo".
- Implementación: 3 imágenes originales generadas para TallerYa
  (`public/carrusel-1.jpg` conductor con el cofre abierto en la
  costa de Ensenada, `carrusel-2.jpg` mecánico profesional en el
  taller, `carrusel-3.jpg` familia viajando tranquila al atardecer;
  sin texto dentro de la imagen — la frase va en HTML encima, en
  dorado sobre degradado oscuro). El carrusel cambia solo cada 5
  segundos y los puntitos dejan cambiar de imagen a mano.
- Suite `test/carrusel.test.js` (jsdom, 3 tests): 3 imágenes con sus
  frases y 3 puntitos, picar un puntito cambia la imagen, las 3
  existen en public/. **Suite total: 85/85.**
- Lección: el `setInterval` del carrusel dejaba colgado `npm test`
  (el proceso no terminaba); los 3 archivos jsdom ahora cierran su
  ventana con un hook `after()` y la suite vuelve a terminar en ~15 s.

- **APROBADO por Orlan ~00:39 ("Sí, arma la grúa así") y CONSTRUIDO.**
  La pantalla de datos de la grúa ahora pide los dos lugares: (1)
  "¿Dónde se recoge el vehículo?" — con DOS opciones: **"Mi ubicación
  actual"** (el cuadro se llena SOLO con tu dirección, vía nueva ruta
  `POST /api/reverse-geocode` con Nominatim, gratis y sin llave) o
  **"Escribir la dirección"** (el cuadro se vacía y se escribe a mano;
  al buscar, esa dirección se geocodifica y los km salen desde ahí,
  así que los km YA NO necesitan GPS) — y (2) "¿Adónde se lleva el
  vehículo?" (texto libre, obligatorio — sin destino no busca). Al
  picar "Buscar grúas cercanas", el servidor calcula los **km de ruta
  real** (no en línea recta) y los muestra en la pantalla ("Distancia
  del traslado: X km") y en el subtítulo de resultados ("Traslado: X
  km"); el aviso que le llega a la grúa lleva los dos lugares y los km
  ("Necesito grúa · Recoger en: … · Llevar a: … (X km)").
- El cálculo es **gratis y sin llave**: el destino se geocodifica con
  Nominatim (OpenStreetMap) y la ruta se calcula con OSRM
  (router.project-osrm.org), nueva ruta `POST /api/grua-distancia`
  (dispatch `grua-distancia`, server.js ROUTES). Si Nominatim/OSRM
  falla, se avisa en la pantalla y la búsqueda sigue sin los km (no
  se bloquea la ayuda); sin GPS no hay km pero sí búsqueda.
- **Lección (prueba real 2026-11-20 ~01:20):** sin ", Ensenada" en la
  búsqueda, Nominatim geocodificó "Av. Reforma 232" a la Av. Reforma
  de MEXICALI (253 km) — ahora `geocodificarDireccion` siempre agrega
  ", Ensenada, Baja California, México". Prueba real tras el arreglo:
  origen manual Av. Rayón 273 → Av. Reforma 232 = 2.0 km; origen GPS
  (31.863141, -116.595902) → mismo destino = 2.9 km; reverse-geocode
  de esas coordenadas = "Avenida Ignacio López Rayón, Independencia,
  Ensenada".
- Suite `test/grua.test.js` (10 jsdom + 8 backend con fetch stubbeado):
  dos campos, sin destino no busca, km en resultados y aviso, fallo
  sin bloquear, sin GPS sin km; dos opciones de recogida, auto-llenado
  con la dirección, origen manual con km sin GPS, reverse-geocode y
  origen manual en backend. **Suite total: 85/85.**
- Prueba real 2026-11-20 ~00:41: servidor local + Nominatim/OSRM en
  vivo → Av. Reforma 232 desde Av. Rayón = **2.9 km** de ruta.
- **DESPLEGADO EN VIVO 2026-11-20 ~01:26 y VERIFICADO con curl por
  Bibi** (6 archivos/6 commits, último 2fb332d; Vercel Ready):
  home 200, app.js en vivo idéntico a la carpeta (md5 b08aca9b),
  reverse-geocode en vivo = "Avenida Ignacio López Rayón,
  Independencia, Ensenada", grúa origen manual = 1.9 km y origen GPS
  = 2.5 km, destino en Ensenada. **CONFIRMADO por Orlan en su
  teléfono ~01:30 (captura: los dos botones se ven en vivo).**
- **Corrección de Orlan ~01:30: UN SOLO botón de ubicación.** Los dos
  botones de ubicación ("Usar mi ubicación" arriba y "Mi ubicación
  actual" abajo) eran lo mismo dos veces: ahora solo queda el de
  arriba, que al picarlo llena DIRECTO el cuadro con tu dirección.
  "Escribir la dirección a mano" quedó como un enlace discreto abajo
  del cuadro (no un botón). Cambios: index.html (se quitan los dos
  botones + CSS, se agrega el enlace), app.js (setOrigenGrua sin
  botones; el enlace se ata en JS), test/grua.test.js (el botón
  "Mi ubicación actual" ya no existe). Suite 85/85.
- **DESPLEGADO EN VIVO 2026-11-20 ~01:37 y VERIFICADO con curl por
  Bibi** (4 archivos/4 commits, último 20fc51c; Vercel Ready): home
  200, app.js en vivo idéntico a la carpeta (md5 a1b14281),
  btnOrigenGps = 0 en vivo (el segundo botón ya no existe),
  reverse-geocode en vivo sigue dando "Avenida Ignacio López Rayón,
  Independencia, Ensenada". **CONFIRMADO por Orlan en su teléfono
  ~01:39 (reportó un fallo, ver abajo).**
- **Fallo reportado por Orlan ~01:39 (DESPLEGADO EN VIVO 2026-11-20
  ~01:46 y VERIFICADO con curl por Bibi** (3 archivos/3 commits,
  último e892e64; Vercel Ready): si ponías la ubicación con el botón,
  la borrabas y volvías a picar el botón, ya no se ponía. Causa:
  `useLocation()` solo llenaba el cuadro si el modo seguía en 'gps',
  y al borrarlo el modo cambiaba a 'manual'. Arreglo: el botón "Usar
  mi ubicación" SIEMPRE vuelve a poner tu ubicación en el cuadro
  cuando estás en la grúa, sin importar el modo anterior. app.js en
  vivo idéntico a la carpeta (md5 30f5b1f7), reverse-geocode en vivo
  sigue dando "Avenida Ignacio López Rayón, Independencia, Ensenada".
  **Pendiente: confirmación de Orlan en su teléfono.**
- **Dirección escrita abajo del botón (pedido de Orlan ~01:41,
  DESPLEGADO EN VIVO 2026-11-20 ~01:46 con el mismo deploy,
  VERIFICADO con curl por Bibi):** al picar "Usar mi ubicación"
  ahora aparece abajo, en letras blancas, la dirección escrita
  ("Av. Rayón 273, Independencia") para que el conductor se asegure
  de que sí se leyó su ubicación. La pantalla de datos es la misma
  para todos los incidentes, así que sale en choque, no arranca,
  grúa, llantera y otro. Si no hay internet para buscar la dirección,
  queda el "Ubicación lista ✓" de antes. Suite 87/87.
- **Domicilio a mano para servicios a domicilio (pedido de Orlan
  ~01:50, DESPLEGADO EN VIVO 2026-11-20 ~02:05 y VERIFICADO con curl
  por Bibi):** cuando el servicio es a domicilio (presupuesto o
  asistencia en casa) sale la casilla "¿En qué domicilio es el
  servicio?" — por defecto trae tu ubicación actual, y si no estás
  en tu casa, el enlace "Escribir la dirección a mano" abre el
  cuadro para escribir el domicilio. Los talleres se buscan cerca
  DEL DOMICILIO (no de donde estás tú) y el aviso al taller lleva
  la dirección ("· Domicilio: ..."). Nueva ruta POST /api/geocode
  (Nominatim, gratis, sin llave, con ", Ensenada" para no caer en
  Mexicali). Cambios: index.html (casilla), app.js
  (esDomicilio/setOrigenDomicilio/domicilioTexto, búsqueda por
  domicilio, aviso con domicilio), handlers.js + server.js (ruta
  geocode), test/domicilio.test.js (11 pruebas nuevas),
  test/modos.test.js (2 pruebas actualizadas al nuevo aviso).
  Suite 98/98. Prueba real con Nominatim: "Av. Rayón 273,
  Ensenada" → 31.86122, -116.610283, Ensenada. Commits: index.html
  45cfdd9, app.js b09530b, handlers.js 2766e7b, server.js 9f5b25e,
  tests 00dd012/abc5e88, README a9b0ef1; Vercel Ready. Verificado
  en vivo con curl: home 200, geocode vivo OK.
- **Logo sin esquinas blancas (pedido de Orlan ~01:53, DESPLEGADO
  EN VIVO 2026-11-20 ~02:05 con el mismo deploy y VERIFICADO con
  curl por Bibi):** logo.png, icon-192.png e icon-512.png eran PNG
  sin transparencia con las esquinas blancas y se veían feas sobre
  el fondo azul oscuro. Ahora el fondo (blanco de las esquinas +
  cuadro negro) es transparente y solo queda el pin dorado con la
  llave. Verificado en vivo: logo 512 RGBA, esquina alpha 0.
  Commits bea13b2/a0f453b/c38e59d. Script:
  `~/workspace/your_files/make_logo_tallerya_transparente.py`.
- **Foquitos con IA (pedido de Orlan ~01:54, CONSTRUIDO, frente
  pendiente subir en vivo):** al tomar la foto del tablero, Gemini
  marca solos los foquitos prendidos (misma IA y mismo patrón que
  la lectura de dorsales de OnlyClick). Nueva ruta POST
  /api/focos-leer-foto { dataBase64, mimeType } → { ok, focos: [ids] };
  solo devuelve ids de la lista conocida (nunca inventa); sin
  GEMINI_API_KEY devuelve no-key y queda la lista manual; la foto
  no se guarda. Frente: al elegir la foto sale "Leyendo la foto con
  inteligencia artificial…" y se marcan las casillas; el conductor
  revisa y corrige antes de "Ver qué significa". Cambios:
  handlers.js (geminiVisionJson + leerFocosFoto + ruta), server.js
  (ROUTES), index.html (línea de estado + nota actualizada),
  app.js (leerFotoTablero), test/foquitos-ia.test.js (10 pruebas).
  Suite 108/108. **OJO — el backend YA ESTÁ EN VIVO sin querer:**
  el deploy del domicilio subió handlers.js (commit 2766e7b) con el
  código de foquitos incluido porque el archivo se reexpidió después
  de construirlo; la ruta está dormida (nadie la llama sin el frente
  y sin la llave). La llave GEMINI_API_KEY la está poniendo el
  navegador (crear en AI Studio + Vercel + redeploy) por pedido de
  Orlan ~02:02.

- El flujo actual de grúa solo pide dónde está el carro (un solo
  lugar, por GPS); NO hay dos cuadritos de recoger/llevar. Sí se puede
  calcular la distancia del traslado en km (ruta real por carretera,
  no en línea recta): dos lugares (recoger / llevar) -> coordenadas ->
  ruta (OSRM de OpenStreetMap, gratis y sin llave; o Google Distance
  Matrix con la llave que Orlan ya está creando) -> km. Pendiente que
  Orlan apruebe armar los dos campos + el cálculo.

## Iconos en los botones (2026-11-20)

- Los botones de incidente SÍ llevan icono en la app real (emojis:
  🚗 🔧 🚛 🛞 ❓ 💡), pero las vistas previas de PIL no pueden dibujar
  emojis y se veían sin nada — por eso Orlan preguntó. El script de
  mockups (`~/workspace/make_mockup_tallerya_rediseno.py`) ahora dibuja
  los iconos a mano con formas simples (carro, batería, grúa, llanta,
  "?", foquito) para que la vista previa se parezca a la app real.
- Los 3 modos de Choqué también llevan icono ahora (📍 lugar, 🚗 yo
  conduzco, 🏠 domicilio); el texto que ve el taller y el subtítulo de
  resultados quitan el emoji al inicio, igual que los botones de
  incidente.

## Tipografía (2026-11-20)

- La app usa la letra del sistema del teléfono (`system-ui...`). Orlan
  dijo que no le gusta. Opciones preparadas con vistas previas (fuentes
  de Google Fonts, TTF en `/tmp/fuentes/`): **Poppins** (geométrica,
  moderna), **Nunito** (redonda, amable), **Montserrat** (limpia,
  fuerte). **DECISIÓN de Orlan 2026-11-20 ~00:16: le gusta la
  tipografía original** — se queda `system-ui`, SIN Google Fonts; las
  3 opciones quedaron descartadas. No hay cambio de código por esto. OJO al bajar las
  fuentes: Nunito y Montserrat vienen como variables y hay que fijar el
  peso con `set_variation_by_axes` en PIL (si no, salen en Thin 100 /
  ExtraLight 200).

## Rediseño inspirado en SafeCar (2026-11-19, SIN desplegar)

Orlan vio la app SafeCar y le gustó su diseño: se ve profesional, tiene
un mapita en vivo con tu ubicación y fondos con foto. Pidió rediseñar
TallerYa INSPIRADA en SafeCar, sin copiarla ("No lo copies, quiero que
sea inspirado. Solamente no una copia.").

Qué se tomó como inspiración (solo la sensación):
- Un mapa en vivo en la pantalla de resultados, con tu ubicación en
  tiempo real y los talleres cercanos como pines.
- Un fondo con foto oscura y profesional en la pantalla principal.
- Acabado general más profesional: más aire, tarjetas con sombra suave.

Qué se mantuvo propio (nada de copia):
- Identidad de TallerYa: colores azul marino + dorado, SU logo (pin
  dorado con llave), sus botones de incidente, sus textos y su flujo.
- Nada del amarillo/negro de SafeCar, nada de su logo, nombre, pantallas
  ni textos.

Qué cambió (archivos):
- `public/hero-taller.jpg` (NUEVO): foto original generada para
  TallerYa (taller oscuro, carro clásico en elevador, luces cálidas;
  sin texto ni logos). Es el fondo de la pantalla principal y del inicio
  de sesión, con un velo azul marino encima para que se lea el texto.
- `public/index.html`: Leaflet 1.9.4 por CDN (CSS + JS), contenedor
  `#mapaResultados` + nota `#mapaNota` en la pantalla de resultados,
  clase `hero` en las pantallas de inicio y de entrar, CSS del mapa,
  de los pines y del pulido de tarjetas/botones.
- `public/app.js`: `initMapa()` (mapa con OpenStreetMap, punto azul del
  conductor, pines dorados de los talleres con coordenadas; picar un pin
  abre su ficha), `ponerMarcadorYo()` y `watchPosition` en `useLocation()`
  para que el punto azul se mueva en vivo. Sin GPS, el mapa se centra en
  Ensenada (31.866, -116.596) con un aviso corto. La lista de talleres
  se queda igual, debajo del mapa. Si Leaflet no carga, la lista sigue
  funcionando.
- `test/handlers.test.js`: prueba nueva "la búsqueda trae las
  coordenadas del taller cuando las tiene (para el mapa)". El servidor YA
  devolvía lat/lng en la búsqueda (publicAppShop y mapPlace); no se
  cambió el servidor. Las coordenadas solo existen si el taller las
  guardó en su panel (perfil) o vienen de Google Places: nunca se
  inventan.

Cómo verificarlo (local, antes de desplegar):
- `npm test` → 53/53 (52 anteriores + 1 nueva).
- `node server.js` con TALLERYA_DATA_DIR temporal → home 200,
  /hero-taller.jpg 200, /api/search?incident=choque 200.
- Comprobación del mapa con jsdom (script puntual en /tmp/mapa-check.js,
  no parte de la suite): 16/16 PASS — flujo completo (picar Choqué,
  ubicación, buscar), mapa creado, punto azul, pines solo con
  coordenadas, popup con "Ver taller", encuadre de puntos.
- Captura de pantalla: no se pudo tomar en esta VM (el Chromium de la
  imagen no arranca fuera del navegador de Hatch: "Hatch WebGL domain
  policy is required"). La foto del fondo se revisó directo
  (public/hero-taller.jpg) y el mapa se verificó con el script jsdom.

Pendiente antes de desplegar: que Orlan vea el diseño y lo apruebe.
NO subir a GitHub ni a Vercel hasta entonces.

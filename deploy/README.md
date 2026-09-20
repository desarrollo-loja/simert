# Stack SIMERT Loja en Docker

Reemplazo de PM2 por Docker Compose para los cinco componentes de servidor:
`simert`, `simert-auth`, `simert-pay`, `simert-socket` y `simert-web`.

Las tres apps Flutter (`parking_app_user`, `simert-store-loja`,
`simert-supervisor-loja`) quedan fuera: son aplicaciones moviles, no servicios.

**No se modifico ni una linea de codigo de la aplicacion.** Las dependencias
que el codigo tiene de PM2 se reproducen con variables de entorno. Ver
[Decisiones de diseno](#decisiones-de-diseno).

---

## Requisitos previos

1. Docker Engine 24+ con Compose v2.
2. El submodulo `src/common` inicializado en los cuatro servicios Node:
   ```bash
   for s in simert simert-auth simert-pay simert-socket; do
     (cd "../../$s" && git submodule update --init --recursive)
   done
   ```
3. El `.env` de cada servicio en su sitio (estan en `.gitignore`: no vienen del
   repositorio). El stack los monta tal cual, no los modifica.
4. Para el front, el fichero de entorno con el que se quiere hornear el bundle
   (`.env.production` en el servidor). Ver `WEB_ENV_FILE` en `.env`.

Comprueba todo de una vez:

```bash
./bin/preflight.sh
```

---

## Arranque

```bash
cd deploy

./bin/preflight.sh          # 1. verifica submodulos, .env y PM2
docker compose build        # 2. construye las 5 imagenes
docker compose up -d        # 3. levanta el stack
docker compose ps           # 4. estado
docker compose logs -f      # 5. logs de todo
```

Los servicios quedan escuchando en **los mismos puertos que hoy**
(127.0.0.1:3000-3003), asi que **el nginx del host no necesita ningun cambio**.
El front queda en 127.0.0.1:8080.

### Por servicio

```bash
docker compose up -d auth-0 auth-1          # levantar solo auth
docker compose restart simert-0             # reiniciar una instancia
docker compose stop pay-0 pay-1             # parar pay
docker compose logs -f --tail=100 socket-0  # logs de uno
docker compose up -d --no-deps --build simert-0 simert-1   # redesplegar simert
```

---

## Equivalencias con PM2

| PM2 | Docker Compose |
|---|---|
| `pm2 start ecosystem.config.js --env production` | `docker compose up -d` |
| `pm2 restart simert` | `docker compose restart simert-0 simert-1` |
| `pm2 stop simert-auth` | `docker compose stop auth-0 auth-1` |
| `pm2 logs simert --lines 100` | `docker compose logs -f --tail=100 simert-0 simert-1` |
| `pm2 list` | `docker compose ps` |
| `pm2 monit` | `docker stats` |
| `pm2 delete simert` | `docker compose rm -sf simert-0 simert-1` |
| `max_memory_restart: '600M'` | `NEST_MEM_LIMIT` + `NEST_HEAP_MB` en `.env` |
| `kill_timeout: 5000` | `stop_grace_period: 15s` |
| `instances: 2` | dos servicios declarados (`-0` y `-1`) |

---

## Decisiones de diseno

Cuatro comportamientos del codigo dependen hoy de PM2. El stack los reproduce
en vez de cambiar el codigo.

### 1. `NODE_APP_INSTANCE`: quien corre los jobs singleton

`src/common/glob/utilities/cluster.ts` decide con `isPrimaryInstance()` quien
ejecuta la conciliacion GIM, el archivado historico y los barridos de
expiracion. Lee `NODE_APP_INSTANCE`, que exporta PM2 en modo cluster.

Compose da el mismo entorno a todas las replicas de un servicio, asi que con
`docker compose up --scale simert=2` **las dos** creerian ser la instancia 0 y
duplicarian los depositos en GIM. Por eso cada instancia se declara como un
servicio aparte (`simert-0`, `simert-1`) con su indice fijado a mano.

> Al escalar hay que anadir un servicio nuevo con el siguiente indice, nunca
> usar `--scale` sobre `simert`, `pay` o `auth`.

### 2. `pm_id`: quien muestrea la CPU

`CommonCpuService` arranca el monitor solo si `pm_id === '0'` y escribe el
promedio en la clave **compartida** `P|_CPU` de Redis. La lee el endpoint
`PATCH auth/check/:userId/...`, que es el que consultan las apps moviles.

Como `pm_id` es un id de todo el demonio de PM2, hoy solo lo muestrea **un
proceso por host**. El stack reproduce eso exactamente: `pm_id: "0"` esta
puesto en **`auth-0` y en ningun otro contenedor**.

> Si se quita, nadie escribe `P|_CPU`, `getCpu()` devuelve `Number(undefined)`
> = `NaN`, la comparacion `NaN <= limite` es `false` y ese endpoint empieza a
> responder `CPU_SATURED` de forma permanente.

### 3. `NODE_ENV=production`

PM2 lo inyecta via `env_production`, y dotenv **no pisa** una variable que ya
existe en el proceso. Por eso hoy manda `production` aunque el `.env` diga
`development`. El stack lo fija explicitamente en `environment`, porque de el
dependen el prefijo de las claves de Redis (`P|` vs `D|`), que dominio de CORS
se aplica y si se expone Swagger.

### 4. El `.env` se monta, no se pasa con `env_file`

El parser de `env_file` de Compose es **mas estricto que dotenv** y rechaza el
fichero entero ante una linea que no sea `CLAVE=valor`. Los `.env` actuales
tienen lineas asi (valores largos partidos en varias lineas, algun caracter
suelto al principio) que dotenv se salta en silencio.

Montando el fichero en `/app/.env` lo parsea el propio dotenv de la aplicacion,
con exactamente la misma interpretacion que hoy. `bin/preflight.sh` avisa de
esas lineas para que se revisen, pero no cambia nada.

> Tras editar un `.env`, usa `docker compose up -d --force-recreate <servicio>`.
> Un `restart` a secas puede seguir viendo el fichero viejo, porque los editores
> que guardan creando un fichero nuevo rompen el bind mount de un solo fichero.

### 5. Publicacion en 127.0.0.1

Docker publica por defecto en `0.0.0.0` y sus reglas de iptables **se saltan el
firewall del host** (ufw/firewalld). Un `ports: "3000:3000"` dejaria los cuatro
servicios expuestos a internet. Con `BIND_ADDR=127.0.0.1` se conserva la
topologia actual: el unico que entra desde fuera es el nginx del host.

---

## Migracion por fases

El orden importa porque `simert` y `simert-pay` **no pueden correr a la vez en
PM2 y en Docker** contra la misma base de datos: el guard de ciclos solapados
(`this.isDepositingCheckboxes`) es un campo de instancia y no coordina entre
procesos, asi que se registrarian depositos duplicados en GIM.

| Servicio | Convive con PM2 | Motivo |
|---|---|---|
| `simert-socket` | **Si** | Sin jobs; `@socket.io/redis-adapter` coordina las instancias |
| `simert-auth` | **Si** | Su unico intervalo es `syncFromDb()`, lectura pura por proceso |
| `simert-pay` | No | Job singleton en `src/data/data.service.ts` |
| `simert` | No | Jobs en `src/check`, `src/incident` y `src/data` |

Orden recomendado:

1. **`simert-socket`** — levantalo en Docker con PM2 todavia corriendo, manda
   algo de trafico y compara. Sin ventana de mantenimiento.
2. **`simert-auth`** — igual.
3. **`simert-pay`** — `pm2 stop simert-pay` y despues `docker compose up -d pay-0 pay-1`.
4. **`simert`** — `pm2 stop simert` y despues `docker compose up -d simert-0 simert-1`.
5. **`simert-web`** — cuando el resto este estable, apunta el nginx del host al
   puerto 8080 en vez de al directorio de estaticos actual.

Mientras dure la fase mixta, un contenedor alcanza un servicio que siga en PM2
por `http://host.docker.internal:PUERTO/` (ya configurado con `extra_hosts`).

---

## Rollback

PM2 sigue siendo la red de seguridad. No borres `ecosystem.config.js` ni el
`dist/` del servidor hasta que Docker lleve semanas estable.

```bash
docker compose down
pm2 start ecosystem.config.js --env production   # en cada servicio
```

---

## Pendientes conocidos

Cosas que este stack **no** hace, deliberadamente, porque requieren tocar
codigo o decisiones de producto:

- **Split `api` / `worker`.** Mientras los jobs vivan dentro del proceso HTTP,
  escalar horizontalmente obliga a declarar cada instancia a mano. Separar un
  contenedor `worker` con los jobs y N contenedores `api` sin ellos es lo que
  habilita `--scale` de verdad.
- **`os.cpus()` mide el host, no el contenedor.** Si se ponen limites de CPU
  por contenedor, el porcentaje que promedia `CommonCpuService` no corresponde
  a lo que ese contenedor tiene asignado.
- **Presupuesto de conexiones.** Sigue vigente
  `instancias x T_CONNECTIONLIMIT (+ H_CONNECTIONLIMIT)` contra el
  `max_connections` de PostgreSQL. Al anadir instancias, revisarlo. PgBouncer
  es el siguiente paso natural.
- **Cero-downtime.** `docker compose up -d` recrea el contenedor: hay unos
  segundos de corte, a diferencia de `pm2 reload`. Con dos instancias por
  servicio se puede recrear una a la vez a mano.
- **`simert-socket` tiene dependencias inconsistentes.** Su
  `package-lock.json` esta desincronizado con el `package.json`, y declara
  `@eslint/js@^10.0.1` junto a `eslint@^9.39.4` (las otras tres usan `^9`).
  `@eslint/js@10` pide `eslint@^10` como peer, asi que npm aborta. Por eso el
  Dockerfile cae a `npm install --legacy-peer-deps` cuando `npm ci` falla, y
  avisa en el log del build. Los otros tres servicios si instalan desde el
  lock. Arreglo real: bajar `@eslint/js` a `^9.39.4` y regenerar el lock.
- **`SYNCHRONIZE='TRUE'` en el `.env` de desarrollo de `simert`.** Con eso
  TypeORM altera el esquema al arrancar. Es el comportamiento actual bajo PM2,
  el stack no lo cambia, pero conviene confirmar que en el servidor esta en
  `FALSE`.
- **`.env` malformados.** `bin/preflight.sh` los reporta; corregirlos cambia el
  valor que recibe la aplicacion (hoy llega truncado), asi que es una decision
  consciente, no un arreglo automatico.

---

## Estado de la verificacion

Lo comprobado en la maquina de desarrollo el 2026-09-19:

- Las cinco imagenes construyen (`simert/auth`, `simert/pay`, `simert/simert`,
  `simert/socket`, `simert/web`).
- `docker compose config` renderiza sin errores y con la emulacion de PM2
  correcta: `NODE_ENV=production`, un `NODE_APP_INSTANCE` por instancia y
  `pm_id=0` solo en `auth-0`.
- Dentro del contenedor de `simert`, dotenv interpreta el `.env` **igual que
  bajo PM2**: `IS_CACHE` llega como `TRUE`, `NODE_ENV` efectivo es `production`
  aunque el fichero diga `development`, y `AUTORIZATION` sigue truncado a 176
  caracteres igual que hoy.
- `isPrimaryInstance()` devuelve `true` solo en la instancia 0.
- La hora del contenedor es `-05` (America/Guayaquil).
- La configuracion del gateway pasa `nginx -t` y envsubst respeta las variables
  propias de nginx.
- El front responde 200, sirve la SPA, comprime con gzip y da una sola cabecera
  `Cache-Control`.

**Sin verificar todavia** (requiere el servidor, no se puede desde aqui):

- Arranque real de los cuatro servicios Node contra sus bases de datos: en esta
  maquina solo existe el `.env` de `simert`, y levantarlos contra la base de
  produccion es justo lo que no se debe hacer mientras PM2 siga corriendo.
- El comportamiento del gateway con trafico real.

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
4. Para el front, el fichero de entorno con el que se quiere hornear el bundle.
   En el servidor actual es `.env`, porque ahi estan sus URLs publicas de
   produccion. Ver `WEB_ENV_FILE` en `deploy/.env`.

5. El `.env` de la orquestacion, que es por maquina y no se versiona:
   ```bash
   cp .env.example .env
   ```
   Ajusta sobre todo `WEB_ENV_FILE`. Vue CLI hornea las `VUE_APP_*` en tiempo
   de build, asi que ese valor decide contra que backend apunta el bundle.

Comprueba todo de una vez:

```bash
./bin/preflight.sh            # revisa los cinco componentes
./bin/preflight.sh web        # revisa solo uno
```

---

## Arranque

La via recomendada es `bin/deploy.sh`, que encadena verificacion, build,
arranque y chequeo de salud, y ademas **impide el unico error que cuesta
dinero**: levantar `simert` o `simert-pay` mientras su proceso de PM2 sigue
online contra la misma base de datos.

```bash
cd deploy

./bin/deploy.sh all --build     # todo, en el orden correcto
./bin/deploy.sh web             # un componente
./bin/deploy.sh auth --build    # reconstruyendo antes
./bin/deploy.sh pay --stop-pm2  # parando PM2 primero (obligatorio en pay y simert)
```

A mano, si prefieres control paso a paso:

```bash
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
docker compose up -d auth-0                 # levantar solo auth
docker compose restart simert-0             # reiniciar una instancia
docker compose stop pay-0                   # parar pay
docker compose logs -f --tail=100 socket-0  # logs de uno
docker compose up -d --no-deps --build simert-0             # redesplegar simert
```

---

## Equivalencias con PM2

| PM2 | Docker Compose |
|---|---|
| `pm2 start ecosystem.config.js --env production` | `docker compose up -d` |
| `pm2 restart simert` | `docker compose restart simert-0` |
| `pm2 stop simert-auth` | `docker compose stop auth-0` |
| `pm2 logs simert --lines 100` | `docker compose logs -f --tail=100 simert-0` |
| `pm2 list` | `docker compose ps` |
| `pm2 monit` | `docker stats` |
| `pm2 delete simert` | `docker compose rm -sf simert-0` |
| `max_memory_restart: '600M'` | `NEST_MEM_LIMIT` + `NEST_HEAP_MB` en `.env` |
| `kill_timeout: 5000` | `stop_grace_period: 15s` |
| una instancia PM2 | un servicio declarado (`-0`) |

---

## Decisiones de diseno

Cuatro comportamientos del codigo dependen hoy de PM2. El stack los reproduce
en vez de cambiar el codigo.

### 1. `NODE_APP_INSTANCE`: quien corre los jobs singleton

`src/common/glob/utilities/cluster.ts` decide con `isPrimaryInstance()` quien
ejecuta la conciliacion GIM, el archivado historico y los barridos de
expiracion. Lee `NODE_APP_INSTANCE`, que exporta PM2 en modo cluster.

El despliegue inicial conserva una instancia por servicio, como el servidor
actual. Compose da el mismo entorno a todas las replicas, asi que con
`docker compose up --scale simert=2` **las dos** creerian ser la instancia 0 y
duplicarian los depositos en GIM. Toda instancia futura debe declararse como
un servicio separado (`simert-1`, etc.) con su indice fijado a mano.

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
3. **`simert-pay`** — `pm2 stop simert-pay` y despues `docker compose up -d pay-0`.
4. **`simert`** — `pm2 stop simert` y despues `docker compose up -d simert-0`.
5. **`simert-web`** — cuando el resto este estable, apunta el nginx del host al
   puerto 8080 en vez de al directorio de estaticos actual.

Mientras dure la fase mixta, un contenedor alcanza un servicio que siga en PM2
por `http://host.docker.internal:PUERTO/` (ya configurado con `extra_hosts`).

---

## Despliegue en el servidor

Lo que cambia respecto a una maquina de desarrollo son tres cosas: el entorno
con el que se hornea el front, donde se construyen las imagenes, y que el
nginx del host deja de servir archivos para hacer proxy al contenedor.

### Preparacion (una sola vez)

```bash
cd /ruta/Simert-loja
for s in simert simert-auth simert-pay simert-socket simert-web; do
  (cd "$s" && git pull && git submodule update --init --recursive)
done

cd simert/deploy
cp .env.example .env
```

En ese `.env`, para servidor:

```bash
WEB_ENV_FILE=.env              # contiene las URLs publicas actuales
TAG=prod
BIND_ADDR=127.0.0.1            # no lo cambies: ver "Publicacion en 127.0.0.1"
```

Y asegurate de que estan en su sitio los ficheros que **no vienen del repo**
porque estan en `.gitignore`:

- el `.env` de cada uno de los cuatro servicios Node,
- el fichero de `simert-web` indicado por `WEB_ENV_FILE` (`.env` actualmente),
- `simert-pay/ahorita_keys/keys.txt`.

`./bin/preflight.sh` te dice cual falta.

### Donde se construyen las imagenes

Por defecto, **en el servidor**: el `compose.yaml` construye desde el codigo
fuente. Eso implica que el build del front (35 chunks, unos 30 s) compite por
CPU y memoria con los servicios que ya corren ahi. Si el pico molesta,
constryelas donde construyes hoy y publicalas a un registro
(`docker push` / `docker pull`); el stack acepta cualquiera de las dos vias,
pero el registro hay que montarlo aparte.

### Orden de migracion

El orden no es preferencia: `simert` y `simert-pay` tienen jobs singleton y no
pueden correr a la vez en PM2 y en Docker contra la misma base. `deploy.sh` lo
impide salvo que pases `--stop-pm2`.

```bash
./bin/deploy.sh socket --build              # convive con PM2: sin corte
./bin/deploy.sh auth   --build              # convive con PM2: sin corte
./bin/deploy.sh pay    --build --stop-pm2   # para PM2 y levanta
./bin/deploy.sh simert --build --stop-pm2   # para PM2 y levanta
./bin/deploy.sh web    --build              # el front, todavia sin trafico
./bin/deploy.sh gateway                     # ultimo: necesita 3000-3003 libres
```

Entre paso y paso, verifica antes de seguir:

```bash
docker compose ps
docker compose logs -f --tail=100 <servicio>
```

El gateway va al final porque publica los puertos 3000-3003 y no puede
arrancar mientras PM2 los ocupe. `deploy.sh` lo detecta y te lo dice en vez de
fallar con un error de bind.

### El nginx del host

Hasta aqui no se ha tocado el trafico real: los contenedores estan arriba pero
quien atiende sigue siendo lo de siempre. El ultimo paso es mover el front.

`nginx/host-site.example.conf` tiene la plantilla comentada. En resumen, el
bloque que servia el `dist` pasa de `root` a `proxy_pass`:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

El bloque `/api` **no se toca**: sigue apuntando a `127.0.0.1:3000-3003`, que es
exactamente donde publica el gateway. nginx elige por prefijo mas largo, asi
que `/api` gana sobre `/`.

```bash
curl -I http://127.0.0.1:8080/        # comprueba el contenedor ANTES
sudo nginx -t && sudo systemctl reload nginx
```

### Que verificar despues

- El front carga y navega (el router usa hash, sin rewrites).
- Login y una operacion de cada servicio.
- `docker compose logs` sin errores de conexion a base de datos ni a Redis.
- Que los jobs corren **una sola vez** en los logs de `simert-0`.
- La hora de los logs en `-05`, no en UTC.

---

## Rollback

PM2 sigue siendo la red de seguridad. Antes de migrar ejecuta `pm2 save` para
guardar exactamente los procesos actuales. No borres el `dist/` del servidor
hasta que Docker lleve semanas estable.

```bash
docker compose down
pm2 resurrect
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
  segundos de corte, a diferencia de `pm2 reload`. El despliegue inicial
  conserva una instancia por servicio; el escalado se hara en una fase aparte.
- **`simert-socket` tiene dependencias inconsistentes.** Su
  `package-lock.json` esta desincronizado con el `package.json`, y declara
  `@eslint/js@^10.0.1` junto a `eslint@^9.39.4` (las otras tres usan `^9`).
  `@eslint/js@10` pide `eslint@^10` como peer, asi que npm aborta. Por eso el
  Dockerfile cae a `npm install --legacy-peer-deps` cuando `npm ci` falla, y
  avisa en el log del build. Los otros tres servicios si instalan desde el
  lock. Arreglo real: bajar `@eslint/js` a `^9.39.4` y regenerar el lock.
- **`SYNCHRONIZE='TRUE'` no se admite en produccion.** Con eso TypeORM puede
  alterar el esquema al arrancar. `bin/preflight.sh` bloquea el despliegue
  hasta cambiarlo conscientemente a `FALSE`.
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

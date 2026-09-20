#!/usr/bin/env bash
#
# Despliegue de un servicio (o de todos) con las guardas que evitan el unico
# error que puede costar dinero: que `simert` o `simert-pay` corran a la vez en
# PM2 y en Docker contra la misma base de datos.
#
#   ./bin/deploy.sh socket              # levanta simert-socket
#   ./bin/deploy.sh auth --build        # reconstruye y levanta simert-auth
#   ./bin/deploy.sh pay --stop-pm2      # para PM2 y levanta simert-pay
#   ./bin/deploy.sh all --build         # todo, en el orden correcto
#
# Servicios: socket | auth | pay | simert | web | gateway | all
#
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

RED=$'\033[31m'; YEL=$'\033[33m'; GRN=$'\033[32m'; BLD=$'\033[1m'; OFF=$'\033[0m'

die()  { echo "${RED}ERROR${OFF}  $*" >&2; exit 1; }
warn() { echo "${YEL}AVISO${OFF}  $*"; }
ok()   { echo "${GRN}ok${OFF}     $*"; }
step() { echo; echo "${BLD}==> $*${OFF}"; }

# --- Mapa de servicios -------------------------------------------------------
#
# Nombre corto -> servicios de compose. Los que tienen dos instancias las llevan
# declaradas por separado (ver README: `--scale` duplicaria los jobs singleton).
#
# El tercer campo dice si el servicio puede convivir con su proceso de PM2:
#   safe   sin jobs singleton, las dos copias pueden correr a la vez
#   unsafe tiene jobs que escribirian dos veces contra la misma base
services_for() {
  case "$1" in
    socket)  echo "socket-0" ;;
    auth)    echo "auth-0 auth-1" ;;
    pay)     echo "pay-0 pay-1" ;;
    simert)  echo "simert-0 simert-1" ;;
    web)     echo "web" ;;
    gateway) echo "gateway" ;;
    *)       echo "" ;;
  esac
}

pm2_name_for() {
  case "$1" in
    socket) echo "simert-socket" ;;
    auth)   echo "simert-auth" ;;
    pay)    echo "simert-pay" ;;
    simert) echo "simert" ;;
    *)      echo "" ;;
  esac
}

coexists_with_pm2() {
  # socket: sin setInterval ni isPrimaryInstance; el RedisIoAdapter coordina.
  # auth:   su unico intervalo es syncFromDb(), lectura pura por proceso.
  # pay:    job singleton en src/data/data.service.ts.
  # simert: jobs en src/check, src/incident y src/data (depositos en GIM).
  case "$1" in
    socket|auth|web) return 0 ;;
    *)               return 1 ;;
  esac
}

# --- Argumentos --------------------------------------------------------------
TARGET="${1:-}"
shift || true
DO_BUILD=0
STOP_PM2=0
for arg in "$@"; do
  case "$arg" in
    --build)    DO_BUILD=1 ;;
    --stop-pm2) STOP_PM2=1 ;;
    *)          die "opcion desconocida: $arg" ;;
  esac
done

[ -n "$TARGET" ] || die "uso: ./bin/deploy.sh <socket|auth|pay|simert|web|gateway|all> [--build] [--stop-pm2]"

# El orden de `all` no es alfabetico: primero los que conviven con PM2, el
# gateway al final porque necesita los puertos 3000-3003 libres.
if [ "$TARGET" = "all" ]; then
  ORDER="socket auth pay simert web gateway"
else
  [ -n "$(services_for "$TARGET")" ] || die "servicio desconocido: $TARGET"
  ORDER="$TARGET"
fi

# --- Configuracion de la maquina --------------------------------------------
step "Configuracion"
if [ ! -f .env ]; then
  [ -f .env.example ] || die "no existe .env ni .env.example en $(pwd)"
  cp .env.example .env
  warn "no habia .env: lo cree desde .env.example."
  echo "         Revisa los valores (sobre todo WEB_ENV_FILE) y vuelve a ejecutar."
  exit 1
fi
# shellcheck disable=SC1091
. ./.env
ok ".env cargado (WEB_ENV_FILE=${WEB_ENV_FILE:-<sin definir>}, BIND_ADDR=${BIND_ADDR:-127.0.0.1})"

# --- Verificaciones previas --------------------------------------------------
step "Verificaciones previas"
# shellcheck disable=SC2086
./bin/preflight.sh $ORDER || die "preflight fallo. Corrige lo de arriba antes de desplegar."

# --- PM2 ---------------------------------------------------------------------
pm2_online() {
  command -v pm2 >/dev/null 2>&1 || return 1
  pm2 jlist 2>/dev/null | python3 -c "
import json,sys
try: procs = json.load(sys.stdin)
except Exception: sys.exit(1)
name = sys.argv[1]
sys.exit(0 if any(p.get('name')==name and p.get('pm2_env',{}).get('status')=='online' for p in procs) else 1)
" "$1"
}

for svc in $ORDER; do
  pm2name="$(pm2_name_for "$svc")"
  [ -n "$pm2name" ] || continue
  if pm2_online "$pm2name"; then
    if coexists_with_pm2 "$svc"; then
      warn "$pm2name sigue online en PM2. Puede convivir: se levantara en paralelo."
    elif [ "$STOP_PM2" -eq 1 ]; then
      step "Parando $pm2name en PM2"
      pm2 stop "$pm2name" || die "no se pudo parar $pm2name"
      ok "$pm2name detenido"
    else
      echo
      die "$pm2name esta online en PM2 y NO puede convivir con su contenedor.
       Tiene jobs singleton: las dos copias registrarian los mismos depositos
       en GIM por duplicado (el guard es un campo de instancia, no coordina
       entre procesos).
       Para continuar: ./bin/deploy.sh $svc --stop-pm2"
    fi
  fi
done

# --- Gateway: los puertos tienen que estar libres ---------------------------
if echo "$ORDER" | grep -qw gateway; then
  busy=""
  for p in "${AUTH_PORT:-3000}" "${PAY_PORT:-3001}" "${SIMERT_PORT:-3002}" "${SOCKET_PORT:-3003}"; do
    if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
      # Ignora el propio gateway si ya esta levantado.
      if ! docker compose ps --status running gateway 2>/dev/null | grep -q gateway; then
        busy="$busy $p"
      fi
    fi
  done
  if [ -n "$busy" ]; then
    die "el gateway necesita los puertos$busy y estan ocupados (PM2 todavia escucha ahi).
       Migra antes los cuatro servicios y vuelve a lanzar el gateway."
  fi
fi

# --- Build -------------------------------------------------------------------
COMPOSE_SERVICES=""
for svc in $ORDER; do
  COMPOSE_SERVICES="$COMPOSE_SERVICES $(services_for "$svc")"
done

if [ "$DO_BUILD" -eq 1 ]; then
  step "Construyendo imagenes"
  # shellcheck disable=SC2086
  docker compose build $COMPOSE_SERVICES || die "el build fallo"
  ok "imagenes construidas"
fi

# --- Arranque ----------------------------------------------------------------
step "Levantando:$COMPOSE_SERVICES"
# shellcheck disable=SC2086
docker compose up -d $COMPOSE_SERVICES || die "docker compose up fallo"

# --- Salud -------------------------------------------------------------------
step "Esperando a que los contenedores esten sanos"
deadline=$(( $(date +%s) + 120 ))
pending="$COMPOSE_SERVICES"
while [ -n "${pending// /}" ] && [ "$(date +%s)" -lt "$deadline" ]; do
  still=""
  for cs in $pending; do
    cid=$(docker compose ps -q "$cs" 2>/dev/null)
    if [ -z "$cid" ]; then still="$still $cs"; continue; fi
    state=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null)
    case "$state" in
      healthy|running) ok "$cs ($state)" ;;
      starting)        still="$still $cs" ;;
      *)               warn "$cs: $state" ;;
    esac
  done
  pending="$still"
  [ -n "${pending// /}" ] && sleep 3
done
for cs in $pending; do warn "$cs no llego a estado sano en 120s — revisa: docker compose logs $cs"; done

step "Estado"
# shellcheck disable=SC2086
docker compose ps $COMPOSE_SERVICES

echo
ok "Listo. Logs: docker compose logs -f --tail=100$COMPOSE_SERVICES"

#!/usr/bin/env bash
#
# Comprobaciones previas al arranque del stack.
#
# No modifica nada: solo revisa que estan las piezas que Docker necesita y
# avisa de las cosas que dotenv tolera en silencio pero conviene mirar.
#
#   ./bin/preflight.sh                 # revisa todo
#   ./bin/preflight.sh web             # revisa solo el front
#   ./bin/preflight.sh auth pay        # revisa solo esos servicios
#
# Servicios: socket | auth | pay | simert | web | gateway
#
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

RED=$'\033[31m'; YEL=$'\033[33m'; GRN=$'\033[32m'; OFF=$'\033[0m'
errors=0
warns=0

err()  { echo "${RED}ERROR${OFF}  $*"; errors=$((errors + 1)); }
warn() { echo "${YEL}AVISO${OFF}  $*"; warns=$((warns + 1)); }
ok()   { echo "${GRN}ok${OFF}     $*"; }

# Puertos declarados en deploy/.env, para contrastarlos con cada servicio.
if [ ! -f .env ]; then
  echo "${RED}ERROR${OFF}  falta deploy/.env. Creralo desde la plantilla:"
  echo "         cp .env.example .env"
  echo "         y ajusta WEB_ENV_FILE al fichero que contiene las VUE_APP_* de produccion."
  exit 1
fi
# shellcheck disable=SC1091
. ./.env

echo "== Servicios NestJS =="
check_service() {
  local dir="$1" expected_port="$2"
  local name="${dir##*/}"
  local before=$errors

  # 1. Submodulo src/common inicializado: sin el, el build falla al compilar.
  if [ ! -f "$dir/src/common/common.cache.service.ts" ]; then
    err "$name: el submodulo src/common esta vacio. Ejecuta:"
    echo "         (cd $dir && git submodule update --init --recursive)"
  fi

  # 2. El .env debe existir Y ser un fichero. Si no existe, Docker crearia un
  #    DIRECTORIO en su lugar al montar el volumen y la app arrancaria sin
  #    ninguna configuracion.
  if [ ! -e "$dir/.env" ]; then
    err "$name: falta $dir/.env (el bind mount crearia un directorio vacio)"
    return
  elif [ -d "$dir/.env" ]; then
    err "$name: $dir/.env es un DIRECTORIO (lo creo un arranque previo sin .env)."
    echo "         Borralo y restaura el fichero: rmdir $dir/.env"
    return
  fi

  # 3. Lineas que dotenv ignora en silencio. No rompen nada hoy (por eso pasan
  #    desapercibidas), pero suelen ser valores partidos o pegados a medias.
  local bad
  bad=$(grep -nvE '^[[:space:]]*(#|$)|^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_.-]*[[:space:]]*=' "$dir/.env" | cut -d: -f1 | tr '\n' ' ')
  if [ -n "$bad" ]; then
    warn "$name: dotenv ignora estas lineas de .env (n.o): $bad"
    echo "         Suele ser un valor cortado en varias lineas: el valor real"
    echo "         que recibe la app esta TRUNCADO, igual hoy que en Docker."
  fi

  # 4. PORT_SERVER del servicio vs. puerto publicado en deploy/.env.
  local declared
  declared=$(grep -E '^[[:space:]]*PORT_SERVER[[:space:]]*=' "$dir/.env" | tail -1 | cut -d= -f2- | tr -d " '\"")
  if [ -n "$declared" ] && [ "$declared" != "$expected_port" ]; then
    warn "$name: PORT_SERVER=$declared en .env, pero el stack publica $expected_port."
    echo "         El contenedor usara $expected_port (compose lo fija). Si el nginx"
    echo "         del host apunta a $declared, ajusta deploy/.env."
  fi

  # 5. Nunca permitir synchronize en el arranque productivo. TypeORM puede
  #    alterar el esquema automaticamente antes de que se verifiquen logs o
  #    salud; las migraciones deben ejecutarse de forma explicita.
  local synchronize
  synchronize=$(grep -E '^[[:space:]]*SYNCHRONIZE[[:space:]]*=' "$dir/.env" | tail -1 | cut -d= -f2- | tr -d " '\"" | tr '[:lower:]' '[:upper:]')
  if [ "$synchronize" = "TRUE" ]; then
    err "$name: SYNCHRONIZE=TRUE no es seguro para produccion. Cambialo a FALSE antes de desplegar."
  fi

  [ $errors -eq $before ] && ok "$name"
}

# Sin argumentos se revisa todo; con argumentos, solo lo pedido. `gateway` no
# tiene comprobaciones propias: depende de que los demas esten bien.
WANT="${*:-socket auth pay simert web gateway}"
# El gateway arrastra los cuatro backends por `depends_on`, asi que revisarlo
# a el implica revisarlos a todos: si a alguno le falta su .env, el bind mount
# crearia un directorio vacio y ese servicio arrancaria sin configuracion.
case " $WANT " in *" gateway "*) WANT="$WANT socket auth pay simert" ;; esac
wants() { echo " $WANT " | grep -q " $1 "; }

wants auth   && check_service ../../simert-auth   "${AUTH_PORT:-3000}"
wants pay    && check_service ../../simert-pay    "${PAY_PORT:-3001}"
wants simert && check_service ../../simert        "${SIMERT_PORT:-3002}"
wants socket && check_service ../../simert-socket "${SOCKET_PORT:-3003}"
wants auth || wants pay || wants simert || wants socket || echo "  (ninguno seleccionado)"

echo
echo "== Front =="
web_env="${WEB_ENV_FILE:-.env}"
if ! wants web; then
  echo "  (no seleccionado)"
elif true; then
  if [ ! -f "../../simert-web/$web_env" ]; then
    err "simert-web: falta ../../simert-web/$web_env (WEB_ENV_FILE en deploy/.env)."
    echo "         Vue CLI hornea las VUE_APP_* en tiempo de build: sin ese fichero"
    echo "         no se puede construir la imagen del front."
  else
    ok "simert-web ($web_env)"
  fi
fi

echo
echo "== PM2 =="
if command -v pm2 >/dev/null 2>&1; then
  running=$(pm2 jlist 2>/dev/null | python3 -c "import json,sys;
try: print(' '.join(p['name'] for p in json.load(sys.stdin) if p.get('pm2_env',{}).get('status')=='online'))
except Exception: print('')" 2>/dev/null)
  if [ -n "$running" ]; then
    warn "PM2 tiene procesos online: $running"
    echo "         simert y simert-pay NO pueden correr a la vez en PM2 y en Docker"
    echo "         contra la misma base: duplicarian los depositos en GIM."
    echo "         Para esos dos: pm2 stop <servicio> antes de levantar su contenedor."
  else
    ok "PM2 sin procesos online"
  fi
else
  ok "pm2 no esta instalado en esta maquina"
fi

echo
if [ $errors -gt 0 ]; then
  echo "${RED}$errors error(es)${OFF} y $warns aviso(s). Corrige los errores antes de arrancar."
  exit 1
fi
echo "${GRN}Sin errores${OFF} ($warns aviso(s))."

#!/usr/bin/env bash
# Pruebas no destructivas de CORS y de una regla OWASP CRS sobre una API.
# No usa credenciales ni imprime cabeceras, cuerpos o tokens.
set -euo pipefail

base_url="${1:-http://127.0.0.1:3000/api/auth/}"
allowed_origin="${2:-http://181.113.129.20}"
expect_block="${3:-detection}"

if [[ "$expect_block" != "detection" && "$expect_block" != "blocking" ]]; then
  echo "Uso: $0 [URL_AUTH] [ORIGEN_PERMITIDO] [detection|blocking]" >&2
  exit 2
fi

response_headers="$(curl --fail-with-body --silent --show-error --dump-header - --output /dev/null \
  --request OPTIONS \
  --header "Origin: $allowed_origin" \
  --header 'Access-Control-Request-Method: POST' \
  --header 'Access-Control-Request-Headers: authorization,content-type,platform' \
  "$base_url")"

get_header() {
  local name="$1"
  printf '%s\n' "$response_headers" | tr -d '\r' |
    awk -v name="$name" 'tolower($1) == tolower(name ":") { $1=""; sub(/^ /, ""); print; exit }'
}

actual_origin="$(get_header Access-Control-Allow-Origin)"
if [[ "$actual_origin" != "$allowed_origin" ]]; then
  echo "FALLO: preflight CORS no concede el origen esperado" >&2
  exit 1
fi

allowed_methods="$(get_header Access-Control-Allow-Methods)"
if [[ " ${allowed_methods^^} " != *POST* || " ${allowed_methods^^} " == *TRACE* ]]; then
  echo "FALLO: metodos CORS distintos de la politica esperada" >&2
  exit 1
fi

allowed_headers="$(get_header Access-Control-Allow-Headers)"
if [[ "${allowed_headers,,}" != *authorization* || "${allowed_headers,,}" != *platform* || "$allowed_headers" == *'*'* ]]; then
  echo "FALLO: preflight CORS no permite las cabeceras necesarias" >&2
  exit 1
fi
echo 'OK: preflight CORS para el origen autorizado'

denied_origin='http://origen-no-autorizado.invalid'
response_headers="$(curl --silent --show-error --dump-header - --output /dev/null \
  --request OPTIONS \
  --header "Origin: $denied_origin" \
  --header 'Access-Control-Request-Method: POST' \
  "$base_url")"

denied_response_origin="$(get_header Access-Control-Allow-Origin)"
if [[ "$denied_response_origin" == "$denied_origin" || "$denied_response_origin" == '*' ]]; then
  echo "FALLO: CORS concede acceso a un origen no autorizado" >&2
  exit 1
fi
echo 'OK: origen no autorizado sin permiso CORS'

# Patrón controlado recomendado por la documentación oficial de OWASP CRS.
# No ejecuta ninguna operación de negocio ni requiere un usuario real.
separator='?'
if [[ "$base_url" == *'?'* ]]; then separator='&'; fi
attack_url="${base_url}${separator}foo=/etc/passwd&bar=/bin/sh"
status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "$attack_url")"
if [[ "$expect_block" == "blocking" ]]; then
  if [[ "$status" != "403" ]]; then
    echo "FALLO: WAF en bloqueo no rechazo el patron controlado (HTTP $status)" >&2
    exit 1
  fi
  echo 'OK: WAF bloqueo el patron controlado (HTTP 403)'
else
  echo "INFO: modo deteccion, prueba controlada respondio HTTP $status (sin exigir bloqueo)"
fi

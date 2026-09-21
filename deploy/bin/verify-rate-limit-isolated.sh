#!/usr/bin/env bash
# Exercises the gateway policy in a disposable, unpublished container.
# Uses only GET /api/auth/ and reserved example IPs; it never submits credentials.
set -euo pipefail

cd "$(dirname "$0")/.."

probe_id=''
cleanup() {
  if [[ -n "$probe_id" ]]; then
    docker stop "$probe_id" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

probe_id="$(
  SIMERT_RATE_LIMIT_RATE=1r/m \
  SIMERT_RATE_LIMIT_BURST=1 \
  SIMERT_RATE_LIMIT_DRY_RUN=off \
    docker compose -f compose.yaml -f compose.waf.yaml -f compose.resilience.yaml \
      run -d --rm --no-deps gateway
)"

probe_ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$probe_id")"
if [[ -z "$probe_ip" ]]; then
  echo 'FALLO: el contenedor de prueba no obtuvo IP privada' >&2
  exit 1
fi

probe_url="http://${probe_ip}:3000/api/auth/"
curl --silent --show-error --retry 5 --retry-connrefused --retry-delay 1 \
  --max-time 5 --output /dev/null "$probe_url"

# The readiness request used a separate key (no X-Forwarded-For).
statuses=''
for _ in 1 2 3 4 5 6 7 8; do
  status="$(curl --silent --show-error --max-time 5 --output /dev/null \
    --write-out '%{http_code}' \
    --header 'Origin: http://181.113.129.20' \
    --header 'X-Forwarded-For: 192.0.2.10' "$probe_url")"
  statuses="${statuses} ${status}"
done

if [[ " $statuses " != *' 429 '* ]]; then
  echo "FALLO: la rafaga no produjo 429:${statuses}" >&2
  exit 1
fi
echo "OK: rafaga limitada (codigos:${statuses})"

headers="$(curl --silent --show-error --max-time 5 --dump-header - \
  --output /dev/null \
  --header 'Origin: http://181.113.129.20' \
  --header 'X-Forwarded-For: 192.0.2.10' "$probe_url")"
if ! printf '%s\n' "$headers" | grep -qi '^HTTP/.* 429 '; then
  echo 'FALLO: la respuesta posterior a la rafaga no fue 429' >&2
  exit 1
fi
if ! printf '%s\n' "$headers" | tr -d '\r' |
  grep -qi '^Access-Control-Allow-Origin: http://181.113.129.20$'; then
  echo 'FALLO: 429 sin CORS para el origen autorizado' >&2
  exit 1
fi
echo 'OK: 429 conserva CORS para el origen autorizado'

other_status="$(curl --silent --show-error --max-time 5 --output /dev/null \
  --write-out '%{http_code}' \
  --header 'X-Forwarded-For: 192.0.2.11' "$probe_url")"
if [[ "$other_status" == '429' || "$other_status" == '000' ]]; then
  echo "FALLO: otro cliente resulto limitado (HTTP ${other_status})" >&2
  exit 1
fi
echo "OK: otro cliente no se limita por la rafaga ajena (HTTP ${other_status})"

# Escenario de resiliencia: estado y despliegue seguro

Este escenario **no queda validado** por agregar la configuración. Requiere
evidencia de una prueba controlada y de una ejecución real sin regresiones.

## Parámetros propuestos

| Protección | Valor inicial | Estado inicial |
| --- | --- | --- |
| Gateway, por último IP de `X-Forwarded-For` | 30 solicitudes/s, ráfaga de 60 | Observación (`SIMERT_RATE_LIMIT_DRY_RUN=on`) |
| Rechazo del gateway al superar el límite | HTTP 429 | Solo con modo bloqueo |
| Consulta de títulos pagados en GIM (POST de solo lectura) | Timeout 20 s; máximo 1 reintento tras 200 ms ante fallo de transporte/5xx | Desactivada (`GIM_READ_RESILIENCE_ENABLED=false`) |
| Circuit breaker de esa consulta GIM | Abre tras 3 solicitudes fallidas; una prueba de recuperación después de 30 s | Desactivado; estado por proceso |

Los POST de escritura a GIM, incluidos los que registran transacciones, no
tienen reintento automático. La única excepción es
`simert/paid-obligations`: GIM la expone como POST, pero solo consulta títulos
ya pagados. El reintento existente ante 401 tras renovar un token continúa
siendo independiente. Estos valores son punto de partida, no una cuota diaria.

## Precondiciones antes del modo bloqueo

1. Confirmar en la configuración **real** del Nginx del host que
   `X-Forwarded-For` se sobrescribe o se amplía con `$proxy_add_x_forwarded_for`.
   De lo contrario, el último IP de la cabecera podría ser manipulable. Si
   falta la cabecera, el gateway usa `$binary_remote_addr`, que podría agrupar
   a todos los usuarios detrás del Nginx del host.
2. Validar que una respuesta 429 del gateway conserva CORS para el origen
   autorizado mediante las cabeceras condicionales de este overlay; sin ello
   el navegador podría mostrar un error CORS en lugar del 429. No activar el
   bloqueo hasta verificarlo con una solicitud real.
3. Ejecutar pruebas de ráfaga y fallos en un entorno aislado, con una
   dependencia GIM simulada. No detener GIM, Keycloak ni PostgreSQL reales.
4. Vigilar CPU, memoria, conexiones y errores de los contenedores durante la
   prueba. Definir la carga máxima según la capacidad observada.

Para comprobar el límite sin modificar el gateway activo, ejecutar desde
`deploy/` `./bin/verify-rate-limit-isolated.sh`. El script crea un gateway
temporal sin puertos publicados, envía una ráfaga pequeña con IP de ejemplo,
comprueba 429, CORS y separación por cliente, y detiene el contenedor al salir.
No usa credenciales ni genera carga sostenida. Requiere que los contenedores
WAF y auth existentes estén disponibles en la red de Compose.

La política de consultas GIM se comprueba además con un servidor HTTP simulado
local mediante `npm test -- --runInBand
src/api/gim/__tests__/dependency-resilience.http.spec.ts`. Esta prueba cubre
respuesta 503, timeout, número de intentos, apertura y recuperación del
circuito. No sustituye una prueba funcional del servicio desplegado.

## Integración optativa del gateway

Añadir `-f compose.resilience.yaml` **después** de `compose.waf.yaml` a la
invocación de Compose. El valor predeterminado `SIMERT_RATE_LIMIT_DRY_RUN=on`
cuenta excesos y los registra, pero no rechaza peticiones. El overlay no se
aplica al comando de producción existente hasta que se incluya explícitamente.

Desde `deploy/`, primer paso en el servidor (reinicia solo el gateway; puede
haber unos segundos de reconexión):

```bash
SIMERT_RATE_LIMIT_DRY_RUN=on docker compose -f compose.yaml -f compose.waf.yaml -f compose.resilience.yaml up -d --no-deps --force-recreate gateway
docker exec simert-gateway-1 nginx -T 2>&1 | grep -E 'limit_req(_dry_run|_zone|_status)? '
docker compose -f compose.yaml -f compose.waf.yaml -f compose.resilience.yaml ps gateway
```

En este paso el limitador solo observa: el login, las consultas y los pagos no
deben recibir 429 por esta capa. Si se observa una regresión, volver al gateway
anterior con:

```bash
docker compose -f compose.yaml -f compose.waf.yaml up -d --no-deps --force-recreate gateway
```

Antes de pasar a bloqueo se necesita revisar registros de excesos en tráfico
normal y confirmar que el presupuesto propuesto no perjudica usuarios
compartiendo IP (por ejemplo, una red municipal). `30r/s` con ráfaga `60` es
un presupuesto por IP, no una cuota diaria. Obtener un conteo sin imprimir
direcciones ni rutas de usuarios:

```bash
docker logs --since 30m simert-gateway-1 2>&1 | grep -c 'limiting requests, dry run' || true
```

Si el conteo es inesperado, revisar el umbral antes de bloquear. El modo
bloqueo es un overlay adicional y reversible. Desde `deploy/`, en una ventana
vigilada:

```bash
docker compose -f compose.yaml -f compose.waf.yaml -f compose.resilience.yaml -f compose.resilience.gateway-blocking.yaml config --quiet
docker compose -f compose.yaml -f compose.waf.yaml -f compose.resilience.yaml -f compose.resilience.gateway-blocking.yaml up -d --no-deps --force-recreate gateway
docker exec simert-gateway-1 nginx -T 2>&1 | grep -E 'limit_req(_dry_run|_zone|_status)? '
```

La línea efectiva debe ser `limit_req_dry_run off;`. Repetir login, consultas,
pagos y la prueba de 429. Si hay una regresión, volver inmediatamente a
observación sin desactivar el WAF:

```bash
SIMERT_RATE_LIMIT_DRY_RUN=on docker compose -f compose.yaml -f compose.waf.yaml -f compose.resilience.yaml up -d --no-deps --force-recreate gateway
```

La protección de la consulta de títulos pagados de GIM se activa por separado.
El código de `simert-0` debe reconstruirse después de actualizar el repositorio;
no basta recrear el contenedor antiguo. Desplegar en una ventana vigilada y
mantener disponibles los flujos de recaudación para la prueba funcional:

```bash
docker compose -f compose.yaml -f compose.waf.yaml -f compose.resilience.yaml -f compose.resilience.gim-on.yaml config --quiet
docker compose -f compose.yaml -f compose.waf.yaml -f compose.resilience.yaml -f compose.resilience.gim-on.yaml up -d --no-deps --build simert-0
docker compose -f compose.yaml -f compose.waf.yaml -f compose.resilience.yaml -f compose.resilience.gim-on.yaml exec -T simert-0 printenv GIM_READ_RESILIENCE_ENABLED
```

La variable debe indicar `true`. La prueba de caída/latencia usa GIM simulado;
no se debe detener GIM real. Si aparece una regresión, conservar la nueva
imagen pero desactivar la política y recrear solo `simert-0`:

```bash
GIM_READ_RESILIENCE_ENABLED=false docker compose -f compose.yaml -f compose.waf.yaml -f compose.resilience.yaml up -d --no-deps --force-recreate simert-0
```

Mientras estas capas estén activas, incluir los overlays correspondientes en
los futuros comandos `docker compose` que recrean `gateway` o `simert-0`; si
se omiten, Compose tomará el valor definido en `deploy/.env` o el valor
predeterminado (observación/off). Verificar ese valor antes de recrear.

### Después de recrear contenedores

Nginx puede conservar la IP anterior de un contenedor de Docker. En esta
prueba, tras recrear `pay-0`, la ruta de pagos devolvió 502 hasta recargar el
WAF de pagos y el gateway. Una vez que el backend esté `healthy`, probar cada
salto y recargar la configuración del proxy correspondiente sin recrearlo:

```bash
docker exec simert-waf-pay-1 nginx -t
docker exec simert-waf-pay-1 nginx -s reload
docker exec simert-gateway-1 nginx -t
docker exec simert-gateway-1 nginx -s reload
```

Para `simert-0` usar `simert-waf-simert-1`; para `auth-0`,
`simert-waf-auth-1`; para `socket-0`, `simert-waf-socket-1`. Si se recrea un
WAF, recargar también el gateway después. Un 502 tras un despliegue no prueba
que la lógica de negocio falló: localizar primero cuál salto no responde.

## Evidencia requerida para cerrar el escenario

- Carga normal: respuestas correctas sin 429.
- Ráfaga acotada: 429 al superar el límite, manteniendo disponible el login y
  las demás rutas; recuperación al bajar la carga.
- Cliente autorizado y no autorizado: comportamiento CORS correcto también en
  429.
- GIM simulado: número exacto de intentos, timeout acotado, apertura del
  circuito tras tres fallos, rechazo rápido mientras está abierto y cierre
  después de una prueba satisfactoria a los 30 s.
- Repetir flujos funcionales de login, consulta, pagos y WebSocket al terminar.

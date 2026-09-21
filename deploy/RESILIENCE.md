# Escenario de resiliencia: estado y despliegue seguro

Este escenario **no queda validado** por agregar la configuración. Requiere
evidencia de una prueba controlada y de una ejecución real sin regresiones.

## Parámetros propuestos

| Protección | Valor inicial | Estado inicial |
| --- | --- | --- |
| Gateway, por último IP de `X-Forwarded-For` | 30 solicitudes/s, ráfaga de 60 | Observación (`SIMERT_RATE_LIMIT_DRY_RUN=on`) |
| Rechazo del gateway al superar el límite | HTTP 429 | Solo con modo bloqueo |
| Lecturas GET de GIM | Timeout 20 s; máximo 1 reintento tras 200 ms ante fallo de transporte/5xx | Desactivada (`GIM_READ_RESILIENCE_ENABLED=false`) |
| Circuit breaker de lecturas GET de GIM | Abre tras 3 solicitudes fallidas; una prueba de recuperación después de 30 s | Desactivado; estado por proceso |

Los POST a GIM, incluidos los que registran transacciones, no tienen reintento
automático. El reintento existente ante 401 tras renovar un token continúa
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

La política de lecturas GIM se comprueba además con un servidor HTTP simulado
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
normal y confirmar que la cuota propuesta no perjudica usuarios compartiendo
IP (por ejemplo, una red municipal). `30r/s` con ráfaga `60` es un presupuesto
por IP, no una cuota diaria. El cambio a bloqueo se realiza recreando solo el
gateway con `SIMERT_RATE_LIMIT_DRY_RUN=off`; hacerlo en una ventana vigilada y
mantener el comando de reversión anterior a mano.

La protección de GIM se configura en la misma capa, pero queda apagada hasta
activar explícitamente `GIM_READ_RESILIENCE_ENABLED=true` y desplegar la imagen
del servicio `simert-0` que contiene el código nuevo. No recrear ese servicio
solo por activar la observación del gateway.

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

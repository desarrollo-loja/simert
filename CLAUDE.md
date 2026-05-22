# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run start:dev       # Watch mode
npm run start:debug     # Debug + watch

# Build
npm run build           # Compile TypeScript (prebuild cleans dist/)

# Code quality
npm run lint            # ESLint with auto-fix
npm run format          # Prettier

# Testing
npm test                # Jest unit tests
npm run test:watch      # Watch mode
npm run test:cov        # With coverage
npm run test:e2e        # End-to-end tests

# Infrastructure
docker-compose up -d    # Start PostgreSQL (PostGIS)
```

Single test: `npx jest --testPathPattern=<path-or-name>`

## Architecture

La documentación completa de arquitectura vive en [README.md](README.md). Ahí está todo lo que antes estaba aquí:

- Capas modulares (`src/admin/`, `src/client/`, `src/api/`, `src/auth/`, `src/common/`).
- Conexiones TypeORM multi-DB (default, `tracking`, `tracking_controller`) y cache Redis con prefijos por entorno (`P|` prod, `D|` dev).
- Jerarquía del dominio Parking: `Zone → Block → Slot → Fraction → FractionStatus → RangeSalePointTransaction → Card → Bank`.
- Diagrama Entidad-Relación (Mermaid) con las 24 tablas de [`src/admin/`](src/admin/) y sus FKs declaradas en TypeORM.
- Autenticación dual Keycloak/GIM: realms `GIM2_REALM_SERVICE_HUB` (clientes, `password`) y `GIM2_REALM_MUNICIPIO_K` (empleados municipales, `client_credentials`).
- Variables de entorno, scripts, despliegue con PM2.

### Reglas rápidas para Claude

- Las conexiones no-default requieren nombre explícito en `@Entity({ … })` y en `TypeOrmModule.forFeature([], 'tracking' | 'tracking_controller')`.
- `CheckboxUser` saldo:
  - **Incremento** (`+=`): al comprar en `RangeSalePointTransaction` o al asignar en `CheckboxService`.
  - **Decremento** (`-=`): en `simert.service.ts` al estacionar (`parking`, solo si `isPaidParking = true`) y al incrementar tiempo (`incrementTime`, siempre). Ambos usan `pessimistic_write` lock.
- `KeycloakService.getToken()` usa caché (ServiceHub). `getTokenMunicipalityK()` siempre fresco vía `client_credentials`.
- `KeycloakTokenGuard` decide el realm según el rol detectado (`ADMIN`/`CONTROLLER`/`SUPERVISOR` → municipio K).
- DTOs, interfaces y servicios compartidos siempre van en [`src/common/`](src/common/).
- **Entidad `L` (`public.l`) = buffer de tracking en tiempo real** (alta escritura, flag `taken` para consumo). Por diseño usa **IDs numéricos planos**, no relaciones: `userId`, `zoneId`, `blockId`. No agregar `@ManyToOne`/FK aquí — un `onDelete RESTRICT` bloquearía borrar/desactivar `Zone`/`Block` y la FK añade contención en cada escritura. Columnas geográficas nuevas van como `@Column('int', { default: null, nullable: true })` para no romper filas/clientes existentes que aún no las envían.
- **Queries SQL crudos (`repository.query` / `dataSource.query`) y columnas camelCase**: TypeORM crea las columnas camelCase respetando mayúsculas, así que en SQL crudo hay que **entre comillas dobles** (`"zoneId"`, `"userId"`, `"timestamp"`). Sin comillas Postgres las pasa a minúsculas → `column "zoneid" does not exist`. Antes de cerrar, verificar que el nº de placeholders (`$1..$N`) coincida con el largo del array de parámetros.
- **Formato de fechas hacia el cliente**: devolver los `timestamp`/`createdAt`/`updatedAt` como string con `TO_CHAR(col, 'YYYY-MM-DD"T"HH24:MI:SS.MS')` (evita la serialización a UTC con sufijo `Z` del `Date` de JS y mantiene el formato consistente del repo). En QueryBuilder es `.addSelect(\`TO_CHAR(alias."col", 'YYYY-MM-DD"T"HH24:MI:SS.MS')\`, 'alias_col')` + `.getRawAndEntities()`, y luego mezclar `raw[i].alias_col` dentro de cada entidad (patrón en [operator.service.ts](src/client/operator/operator.service.ts)). Los filtros `WHERE`/`BETWEEN` siguen usando la columna real, no el alias.



## Refactoring & documentation conventions (always apply)

These rules are standing policy for **all** work in `src/` from now on, not a one-off task.

### SOLID & refactoring
- Apply SOLID and keep changes **behavior-preserving**. Prefer Extract Method / Extract Helper to remove duplication; keep methods small and single-responsibility; reduce nesting.
- Extract repeated logic into well-named `private` helpers (existing convention: `_` prefix for privates). Examples already in the codebase: Keycloak realm routing, GIM-resident resolution, verification-email send, audit-log writers (`_logUserOperation` / `_logVehicleOperation` / `_logPermissionOperation` / `_logSystemConfigOperation`), SMTP `createTransporter`, tracking-table resolution, config lookup-or-throw.

### Documentation (English)
- Add English JSDoc to **every** class, public method, exported function and new helper: purpose, `@param`, `@returns`, and `@throws`/validations where relevant.
- **Controllers:** always add a class-level JSDoc (responsibility + base route + the service it delegates to). Add per-endpoint JSDoc only where it adds value; if the endpoint already has Swagger `@ApiOperation`, the class-level doc is enough (don't duplicate).
- Convert Spanish **code comments** to English. Keep comments useful (no redundant/obvious comments); prefer self-explanatory code.

### Naming
- `camelCase` for variables/methods (methods start with a verb), `PascalCase` for classes, `UPPER_SNAKE_CASE` for constants. Avoid `temp`/`data`/`foo`/`item`. Never rename production-facing names: routes, entity/DTO fields, enum values.

### Hard constraints (never change)
- Routes, endpoints, payloads, HTTP responses, **Spanish response messages** (they are contracts), current validations, and business logic.
- `src/common` is a **git submodule** — read it to match signatures, but never modify or commit its pointer. `npm install` silently moves it (`git submodule update --remote`); restore with `git -C src/common checkout <original-commit>`.
- Do **not** add or modify tests (`*.spec.ts`).

### Validate before finishing
- This project uses **npm/npx** (the `yarn …` lines above are legacy; `yarn` is not installed). Run `npx nest build` (must exit 0) and `npx eslint <changed files>` (0 errors) before reporting done. Fix lint errors in files you touch.

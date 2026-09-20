# syntax=docker/dockerfile:1.7
#
# Imagen de runtime para los servicios NestJS de SIMERT.
#
# Reemplaza a `pm2 start ecosystem.config.js --env production` sin cambiar una
# sola linea del codigo de la aplicacion: la semantica de cluster de PM2
# (`NODE_APP_INSTANCE`, `pm_id`) se reproduce con variables de entorno que
# inyecta `deploy/compose.yaml`. Ver `deploy/README.md`.
#
# El contexto de build es la raiz del servicio. Requiere que el submodulo
# `src/common` este inicializado:
#   git submodule update --init --recursive
#
ARG NODE_VERSION=24-alpine

# ---------------------------------------------------------------------------
# Etapa 1: compilacion (`nest build` -> dist/)
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder

# bcrypt es un addon nativo y no siempre trae prebuild para Alpine/musl.
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
# `npm ci` es reproducible pero exige que el lock este en sync con el
# package.json. Como el lock esta en .gitignore en estos repos, puede faltar
# o estar desfasado; en ese caso se cae a `npm install` avisando en el log.
# --legacy-peer-deps en el fallback: simert-socket declara @eslint/js@^10 junto
# a eslint@^9 y npm moderno aborta por el peer conflict. Son dependencias de
# lint, no afectan al build ni al runtime, y es como esta instalado en local.
RUN if [ -f package-lock.json ] && npm ci; then \
      echo '==> dependencias instaladas desde package-lock.json'; \
    else \
      echo '==> AVISO: package-lock.json ausente o desincronizado, usando npm install'; \
      npm install --legacy-peer-deps; \
    fi

COPY tsconfig*.json nest-cli.json ./
COPY src ./src

# Falla temprano y con un mensaje claro si el submodulo no esta inicializado,
# en vez de soltar cientos de errores de TypeScript por imports no resueltos.
RUN test -f src/common/common.cache.service.ts || { \
      echo ""; \
      echo "ERROR: el submodulo src/common (simert-common) esta vacio."; \
      echo "Ejecuta 'git submodule update --init --recursive' antes del build."; \
      echo ""; \
      exit 1; \
    }

RUN npm run build

# Descarta devDependencies conservando el bcrypt ya compilado contra esta libc.
RUN npm prune --omit=dev --legacy-peer-deps

# ---------------------------------------------------------------------------
# Etapa 2: runtime
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime

# tzdata: sin el, TZ se ignora y el contenedor corre en UTC. Los jobs de
# conciliacion y las fechas de las multas dependen de la hora local.
RUN apk add --no-cache tzdata

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# El .env NO se hornea en la imagen: lo inyecta compose con `env_file`, para que
# la misma imagen sirva en desarrollo y en produccion.
USER node

# Chequeo de vida por TCP contra el propio PORT_SERVER. Deliberadamente no toca
# ningun endpoint de negocio (evita ruido en logs y en el rate limit).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('net').connect(+process.env.PORT_SERVER,'127.0.0.1').on('connect',function(){process.exit(0)}).on('error',function(){process.exit(1)})"

CMD ["node", "dist/main.js"]

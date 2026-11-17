# Imagen de la API de Valora (ADR-012): se construye en etapas para que la imagen final lleve solo
# el código compilado y las dependencias de producción, sin las herramientas de compilación.
# Debian slim (glibc): sharp y @node-rs/argon2 traen binarios listos para esta plataforma.

FROM node:22-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./

# Compila con todas las dependencias. Sin scripts de instalación (los binarios vienen precompilados).
FROM base AS build
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm build

# Solo las dependencias de producción.
FROM base AS deps
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# La semilla (node dist/seed.js) lee los CSV de seed/.
COPY seed ./seed
# Carpeta de fotos (ADR-020). Render la borra en cada despliegue: almacenamiento definitivo pendiente.
RUN mkdir media && chown node:node media
USER node
EXPOSE 10000
CMD ["node", "dist/main.js"]

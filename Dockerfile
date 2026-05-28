ARG GO_VERSION=1.26
ARG BUN_VERSION=1.3.10

FROM oven/bun:${BUN_VERSION} AS bun

FROM golang:${GO_VERSION}-bookworm AS build

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app

COPY package.json bun.lock turbo.json biome.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/wasm/package.json packages/wasm/package.json

RUN bun install --frozen-lockfile

COPY . .

RUN bun run build
RUN gzip -k -9 apps/web/dist/ballerina.wasm

FROM nginxinc/nginx-unprivileged:1.31-alpine AS runtime

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

USER 10014

EXPOSE 8080

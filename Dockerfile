# syntax=docker/dockerfile:1.7
FROM node:20-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --include=dev

COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY web ./web

RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/resend_rapper.sqlite

RUN apt-get update && apt-get install -y --no-install-recommends \
    tini ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist

RUN mkdir -p /data
# Note: no VOLUME declaration here. Railway forbids it (use a Railway Volume
# mounted at /data instead). For docker-compose use, the named volume in
# docker-compose.yml mounts to /data so persistence still works.
EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]

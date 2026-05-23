# EnvForge — Multi-stage Dockerfile
# Build: docker compose build
# Run:   docker compose up -d

# ---------- Stage 1: Build ----------
FROM node:20-alpine AS builder

# Allow overriding npm registry at build time (e.g. for users in restricted networks)
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN npm config set registry $NPM_REGISTRY

WORKDIR /app

# Copy workspace manifests first for better layer caching.
# Changes to source code below won't invalidate the npm install layer.
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/collectors/package.json ./packages/collectors/
COPY packages/restorers/package.json ./packages/restorers/
COPY packages/cli/package.json ./packages/cli/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install ALL dependencies (build needs devDeps like typescript, vite)
RUN npm ci --ignore-scripts

# Copy source
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
COPY apps/web/ ./apps/web/
COPY configs/ ./configs/

# Build all workspaces in dependency order
RUN npm run build --workspace @fool/core \
 && npm run build --workspace @fool/collectors \
 && npm run build --workspace @fool/restorers \
 && npm run build --workspace @fool/api \
 && npm run build --workspace @fool/web

# ---------- Stage 2: Production image ----------
FROM node:20-alpine AS production

ARG NPM_REGISTRY=https://registry.npmjs.org
RUN npm config set registry $NPM_REGISTRY

# Tools needed at runtime:
#   wget — used by HEALTHCHECK
#   tini — proper PID 1 / signal handling for graceful shutdown
RUN apk add --no-cache wget tini

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/collectors/package.json ./packages/collectors/
COPY packages/restorers/package.json ./packages/restorers/
COPY packages/cli/package.json ./packages/cli/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN npm ci --omit=dev --ignore-scripts

# Copy built artifacts from builder stage
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/collectors/dist ./packages/collectors/dist
COPY --from=builder /app/packages/restorers/dist ./packages/restorers/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Email templates — copied separately because tsc doesn't emit .txt/.html.
# The build script copy-email-templates.mjs places them in dist/, which is
# what we copy above; this line is a safety belt in case the script is skipped.
COPY apps/api/src/email/templates/ ./apps/api/dist/email/templates/

# Copy catalog assets (Playbook YAMLs, vars schemas, MD guides — needed at runtime)
COPY configs/ ./configs/

# Pre-create data directories with correct ownership (will be overlaid by volume mount)
RUN mkdir -p /app/data /app/data/keys /app/data/snapshots

# Non-root user for security
RUN addgroup -S envforge && adduser -S envforge -G envforge \
 && chown -R envforge:envforge /app/data \
 && mkdir -p /home/envforge/.ssh \
 && chown -R envforge:envforge /home/envforge

USER envforge

# Defaults — override via docker-compose environment or -e flags
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5173 \
    SERVE_WEB=1 \
    WEB_DIST_DIR=apps/web/dist \
    FOOL_DATA_DIR=/app/data \
    FOOL_RUNTIME_DB=/app/data/runtime-db.json \
    FOOL_SNAPSHOT_DIR=/app/data/snapshots \
    SESSION_TTL_HOURS=168

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5173/api/health || exit 1

# Use tini for graceful SIGTERM handling
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/server.js"]

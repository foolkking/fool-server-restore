# EnvForge — Multi-stage Dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/collectors/package.json ./packages/collectors/
COPY packages/restorers/package.json ./packages/restorers/
COPY packages/cli/package.json ./packages/cli/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install all dependencies
RUN npm ci --ignore-scripts

# Copy source
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
COPY apps/web/ ./apps/web/
COPY configs/ ./configs/

# Build all workspaces
RUN npm run build --workspace @fool/core \
 && npm run build --workspace @fool/collectors \
 && npm run build --workspace @fool/restorers \
 && npm run build --workspace @fool/api \
 && npm run build --workspace @fool/web

# Stage 2: Production image
FROM node:20-alpine AS production

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

# Copy built artifacts
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/collectors/dist ./packages/collectors/dist
COPY --from=builder /app/packages/restorers/dist ./packages/restorers/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Copy catalog configs (Playbook YAMLs and MD files)
COPY configs/ ./configs/

# Create data directory (will be overridden by volume mount)
RUN mkdir -p /app/data /app/data/keys /app/data/snapshots

# Non-root user for security
RUN addgroup -S envforge && adduser -S envforge -G envforge \
 && chown -R envforge:envforge /app/data

USER envforge

# Environment defaults (override via docker-compose or -e flags)
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

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:5173/api/health || exit 1

CMD ["node", "apps/api/dist/server.js"]

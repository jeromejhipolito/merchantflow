# ============================================================================
# MerchantFlow API — Multi-stage Docker Build
# ============================================================================
# Stage 1: Install dependencies
# Stage 2: Build TypeScript
# Stage 3: Production image (minimal)

FROM node:22-alpine AS base
RUN corepack enable pnpm

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-schemas/package.json ./packages/shared-schemas/
RUN pnpm install --frozen-lockfile

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/ ./packages/
COPY . .
RUN pnpm --filter @merchantflow/api exec prisma generate
RUN pnpm --filter @merchantflow/api build

# --- Production ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 merchantflow

COPY --from=builder --chown=merchantflow:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=merchantflow:nodejs /app/apps/api/prisma ./prisma
COPY --from=builder --chown=merchantflow:nodejs /app/apps/api/node_modules ./node_modules
COPY --from=builder --chown=merchantflow:nodejs /app/apps/api/package.json ./

USER merchantflow

EXPOSE 3005

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3005/health || exit 1

CMD ["node", "dist/server.js"]

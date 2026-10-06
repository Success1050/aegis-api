# ==========================================
# AEGIS Backend Dockerfile (Multi-stage build)
# ==========================================

# 1. Base Stage
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat
ENV NODE_ENV=production

# 2. Dependencies Stage
FROM base AS dependencies
WORKDIR /app
COPY package.json yarn.lock ./
COPY prisma ./prisma/
RUN yarn install --frozen-lockfile --production=false
RUN yarn prisma generate

# 3. Build Stage
FROM dependencies AS builder
WORKDIR /app
COPY . .
RUN yarn build
RUN yarn install --production=true --frozen-lockfile --prefer-offline

# 4. Production Runner Stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Create unprivileged user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

COPY --chown=nestjs:nodejs --from=dependencies /app/node_modules ./node_modules
COPY --chown=nestjs:nodejs --from=builder /app/dist ./dist
COPY --chown=nestjs:nodejs --from=builder /app/prisma ./prisma
COPY --chown=nestjs:nodejs --from=builder /app/package.json ./package.json

USER nestjs

EXPOSE 4000

# Health check using wget on /health probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["node", "dist/src/main"]

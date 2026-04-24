# syntax=docker/dockerfile:1.7
# ----------------------------------------------------------------------------
# Next.js 14 + Prisma 6 生产镜像（standalone 模式）
# ----------------------------------------------------------------------------

FROM node:20-alpine AS deps
WORKDIR /app
# Prisma on alpine 需要 openssl
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN apk add --no-cache openssl \
  && addgroup -S nodejs -g 1001 \
  && adduser -S nextjs -u 1001

# Next standalone 产物（含最小 node_modules）
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Prisma schema + migrations + seed（容器内手动跑 migrate / seed 时需要）
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# Prisma 运行时引擎
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

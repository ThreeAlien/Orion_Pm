# Orion PM — Next.js 16 standalone build
# 多階段：app 執行期用精簡 runner（standalone）；
# prisma migrate deploy 改用 builder 階段（含完整 node_modules）跑，見 docker-compose.yml

FROM node:24-slim AS deps
WORKDIR /app
# Prisma 引擎偵測 libssl 用
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
# 跳過 postinstall(prisma generate)：此階段尚未 COPY schema，
# client 改在 builder 階段（npm run build 內含 prisma generate）生成
RUN npm ci --ignore-scripts

FROM node:24-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# package.json build script = "prisma generate && next build"
# build 階段不連 DB（見 README），這些 dummy 值只為滿足 next-auth/Prisma 在 build 時的
# 存在性檢查，不會寫進最終 image，runtime 由 docker compose 的 .env.production 注入真值
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    AUTH_SECRET="build_time_dummy_not_used_at_runtime" \
    AUTH_TRUST_HOST="true" \
    npm run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# 連 Neon(TLS) 用根憑證；建立非 root 執行帳號
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1001 nodejs \
    && useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nextjs

# Next.js standalone：自帶 app 執行期最小 node_modules + server.js
# 不需要 prisma CLI / @prisma/config — app 用的是 build 時 bundle 進 standalone 的
# generated client（src/generated/prisma）+ @prisma/adapter-pg。migration 走 builder 階段。
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

# ============================================================
# 英语词根词缀词典 —— 生产镜像
#
# 三阶段构建：安装依赖 -> 构建 -> 精简运行
# 运行阶段仅含 standalone 产物，不含 devDependencies 与源码。
# ============================================================

# ---------- 1. 依赖 ----------
FROM node:24-alpine AS deps

# 固定 pnpm 版本，与 package.json#packageManager 保持一致，避免版本漂移
RUN corepack enable && corepack prepare pnpm@10.27.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

# --frozen-lockfile：lockfile 与 package.json 不一致时直接失败，保证可复现
RUN pnpm install --frozen-lockfile


# ---------- 2. 构建 ----------
FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.27.0 --activate

WORKDIR /app

# 触发 next.config.ts 生成 standalone 产物。
# 本地构建不开启：Windows + pnpm 的嵌套路径会超 MAX_PATH，
# 创建符号链接时报 EPERM。Linux 容器无此问题。
ENV DOCKER_BUILD=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm run build


# ---------- 3. 运行 ----------
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# 不做自动更新：镜像由本地 docker build 产出，registry 上不存在同名 tag。
# 宿主机上的 watchtower 若扫描到本容器，只会反复 pull 失败并重启，
# 因此用 label 显式排除（watchtower 默认模式与 --label-enable 模式都安全）。
LABEL com.centurylinklabs.watchtower.enable="false"

# 非 root 运行
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# standalone 产物入口
CMD ["node", "server.js"]

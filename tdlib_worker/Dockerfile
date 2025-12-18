# Build stage
FROM node:24-slim AS builder
RUN npm install -g pnpm@10.25.0
WORKDIR /app
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY tdlib_worker/package.json ./tdlib_worker/
RUN pnpm install --frozen-lockfile
COPY tdlib_worker/ ./tdlib_worker/
RUN pnpm --filter tdlib_worker build

FROM node:24-slim AS runner
RUN apt-get update && apt-get install -y curl
RUN npm install -g pnpm@10.25.0
WORKDIR /app
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY tdlib_worker/package.json ./tdlib_worker/
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/tdlib_worker/dist ./tdlib_worker/dist
WORKDIR /app/tdlib_worker
CMD ["node", "dist/main.js"]
# Build stage
FROM node:24-slim AS builder
RUN npm install -g pnpm@10.25.0
WORKDIR /app
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
# Copy shared-types package.json first
COPY shared-types/package.json ./shared-types/
COPY shared-types/tsconfig.json ./shared-types/
# Copy tdlib_worker package.json
COPY tdlib_worker/package.json ./tdlib_worker/
RUN pnpm install --frozen-lockfile
# Copy shared-types source and build it
COPY shared-types/ ./shared-types/
RUN pnpm --filter @felip-ai/shared-types build
# Copy tdlib_worker source and build it
COPY tdlib_worker/ ./tdlib_worker/
RUN pnpm --filter tdlib_worker build

FROM node:24-slim AS runner
RUN apt-get update && apt-get install -y curl
RUN npm install -g pnpm@10.25.0
WORKDIR /app
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
# Copy shared-types package.json and built dist
COPY shared-types/package.json ./shared-types/
COPY --from=builder /app/shared-types/dist ./shared-types/dist
# Copy tdlib_worker package.json and built dist
COPY tdlib_worker/package.json ./tdlib_worker/
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/tdlib_worker/dist ./tdlib_worker/dist
WORKDIR /app/tdlib_worker
CMD ["node", "dist/main.js"]
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
# Copy nest_api package.json
COPY nest_api/package.json ./nest_api/
RUN pnpm install --frozen-lockfile
# Copy shared-types source and build it
COPY shared-types/ ./shared-types/
RUN pnpm --filter @felip-ai/shared-types build
# Copy nest_api source and build it
COPY nest_api/ ./nest_api/
RUN pnpm --filter nest_api build

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
# Copy nest_api package.json and built dist
COPY nest_api/package.json ./nest_api/
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/nest_api/dist ./nest_api/dist
WORKDIR /app/nest_api
CMD ["node", "dist/main.js"]


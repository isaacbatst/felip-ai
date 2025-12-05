FROM node:24-slim as builder

WORKDIR /app
COPY package.json .
COPY package-lock.json .
RUN npm ci

COPY . .

RUN npm run build

FROM node:24-slim

WORKDIR /app
COPY --from=builder /app/dist .
COPY --from=builder /app/package.json .
COPY --from=builder /app/package-lock.json .
RUN npm ci --production

CMD ["node", "index.js"]
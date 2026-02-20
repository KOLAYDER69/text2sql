FROM node:20-slim

WORKDIR /app

# Copy workspace root
COPY package.json package-lock.json ./
COPY packages/query-engine/package.json packages/query-engine/
COPY apps/bot/package.json apps/bot/

RUN npm ci --workspace=apps/bot --workspace=packages/query-engine

# Copy source
COPY packages/query-engine/ packages/query-engine/
COPY apps/bot/ apps/bot/

WORKDIR /app/apps/bot
CMD ["npx", "tsx", "src/index.ts"]

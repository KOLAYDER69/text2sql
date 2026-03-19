FROM node:22-slim

RUN apt-get update && apt-get install -y curl python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace config
COPY package.json package-lock.json ./
COPY packages/query-engine/package.json packages/query-engine/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/

# Install deps
RUN npm ci --omit=dev || npm install

# Copy source
COPY packages/query-engine/ packages/query-engine/
COPY apps/web/ apps/web/
COPY apps/api/ apps/api/
COPY scripts/ scripts/

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
ENV API_URL=http://localhost:3001

RUN cd apps/web && npm run build

COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

CMD ["/app/docker-entrypoint.sh"]

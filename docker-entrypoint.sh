#!/bin/bash
set -e

echo "Starting text2SQL..."

# Start API server in background
cd /app/apps/api
npx tsx src/index.ts &
API_PID=$!

# Wait for API
echo "Waiting for API server..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3001/api/setup/status > /dev/null 2>&1; then
    echo "API is ready"
    break
  fi
  sleep 1
done

# Start Next.js
cd /app/apps/web
echo "Starting web server on port 3000..."
npx next start -p 3000 &
WEB_PID=$!

echo ""
echo "========================================="
echo "  text2SQL is running!"
echo "  Open http://localhost:3000"
echo "========================================="
echo ""

# Wait for either process to exit
wait -n $API_PID $WEB_PID

# Next.js app plus local Remotion rendering (headless Chrome + ffmpeg ship
# with @remotion/renderer; Chrome needs these system libraries).
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-noto-color-emoji fonts-liberation \
    libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && node -e "require('@remotion/renderer').ensureBrowser()"

ENV NODE_ENV=production AUTH_REQUIRED=true
EXPOSE 3000
CMD ["sh", "-c", "npx next start -p ${PORT:-3000}"]

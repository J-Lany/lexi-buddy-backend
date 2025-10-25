# --- Stage 1: build ---
FROM node:20-bookworm-slim AS build

WORKDIR /app
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN set -x   # Включаем подробные логи

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build


# --- Stage 2: production ---
FROM node:20-alpine AS prod

WORKDIR /app
SHELL ["/bin/sh", "-c"]
RUN set -x   # Логи и здесь, на случай ошибок

ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev || (echo "❌ npm ci failed"; cat /root/.npm/_logs/* || true)
COPY --from=build /app/dist ./dist

EXPOSE 4000
CMD ["node", "dist/main.js"]

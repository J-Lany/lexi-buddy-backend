# --- Stage 1: build ---
FROM node:20-bookworm-slim AS build

WORKDIR /app
COPY package*.json ./

# Устанавливаем ВСЕ зависимости (включая dev)
RUN npm install

# Копируем весь исходный код и собираем проект
COPY . .
RUN npm run build


# --- Stage 2: production ---
FROM node:20-alpine AS prod

WORKDIR /app
ENV NODE_ENV=production

# Ставим только прод-зависимости
COPY package*.json ./
RUN npm ci --omit=dev

# Копируем собранный код из предыдущего этапа
COPY --from=build /app/dist ./dist

# Указываем порт и команду запуска
EXPOSE 4000
CMD ["node", "dist/main.js"]

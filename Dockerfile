# --- Stage 1: build ---
FROM node:20-bookworm-slim AS build

WORKDIR /app

# 1. Устанавливаем зависимости
COPY package*.json ./
RUN npm install

# 2. Копируем исходники и Prisma schema
COPY . .

# 3. Генерируем Prisma клиент с бинарями для Alpine
RUN npx prisma generate

# 4. Собираем проект NestJS
RUN npm run build


# --- Stage 2: production ---
FROM node:20-alpine AS prod

WORKDIR /app

# 5. Устанавливаем нужные библиотеки (Prisma runtime требует OpenSSL3 и ICU)
RUN apk add --no-cache openssl3 icu-data-full icu-libs

ENV NODE_ENV=production

# 6. Копируем package.json и ставим прод-зависимости
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# 7. Копируем Prisma schema и бинарники
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# 8. Копируем собранный билд
COPY --from=build /app/dist ./dist

EXPOSE 4001

CMD ["node", "dist/main.js"]

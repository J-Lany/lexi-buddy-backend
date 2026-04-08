# --- Stage 1: build ---
FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build


# --- Stage 2: runtime ---
FROM node:20-bookworm-slim AS prod

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN HUSKY=0 npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=build /app/dist ./dist

ENV NODE_ENV=production

EXPOSE 4000

CMD ["node", "dist/main.js"]
# Сборка
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# Запуск
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production TZ=Europe/Moscow
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
COPY tools ./tools
# Не работаем от root внутри контейнера
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]

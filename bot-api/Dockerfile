FROM node:20-alpine AS painel-build
WORKDIR /painel
COPY painel/package.json ./
RUN npm install
COPY painel/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY bot-api/package.json ./
RUN npm install --omit=dev
COPY bot-api/src ./src
COPY postgres/migrate_painel.sql /postgres/migrate_painel.sql
COPY postgres/migrate_usuarios_consumo.sql /postgres/migrate_usuarios_consumo.sql
COPY --from=painel-build /painel/dist ./src/public/painel
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]

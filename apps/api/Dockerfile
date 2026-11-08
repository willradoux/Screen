# Contexto de build: raiz do repositório
#   docker build -f apps/api/Dockerfile -t screem-api .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web/package.json apps/web/package.json
RUN npm ci --ignore-scripts \
 && npm run build -w @screem/shared \
 && npm run build -w @screem/api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --ignore-scripts -w @screem/api -w @screem/shared
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]

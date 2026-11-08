# Contexto de build: raiz do repositório
#   docker build -f apps/web/Dockerfile -t screem-web \
#     --build-arg VITE_API_URL=https://api.exemplo.com/api/v1 \
#     --build-arg VITE_SOCKET_URL=https://api.exemplo.com .
# As variáveis VITE_* são embutidas no JavaScript durante o build: mudou, faça novo build.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
COPY apps/api/package.json apps/api/package.json
ARG VITE_API_URL
ARG VITE_SOCKET_URL
ENV VITE_API_URL=$VITE_API_URL VITE_SOCKET_URL=$VITE_SOCKET_URL
RUN npm ci --ignore-scripts \
 && npm run build -w @screem/shared \
 && npm run build -w @screem/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/healthz || exit 1

# ---- build: compile the Vite app ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Vite env vars are baked in at BUILD time, not read at container startup —
# this has to be passed as a build arg, not a runtime environment variable.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- runtime: serve the static build with nginx ----
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ > /dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]

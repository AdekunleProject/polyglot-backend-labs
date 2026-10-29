FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++ \
 && corepack enable \
 && corepack prepare pnpm@10.28.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM build AS prune
RUN pnpm prune --prod

FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS runtime
ENV NODE_ENV=production
ENV PORT=5000
WORKDIR /app
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app
COPY --from=prune --chown=app:app /app/node_modules ./node_modules
COPY --from=prune --chown=app:app /app/dist ./dist
COPY --from=prune --chown=app:app /app/package.json ./
USER app
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:5000/health || exit 1
CMD ["node", "dist/main"]
# Node 24: the Nest 12 packages are ES modules, which Jest can only load on
# Node 24.9 or newer. Pin by digest once you have pulled it:
#   docker pull node:24-alpine && docker inspect --format="{{index .RepoDigests 0}}" node:24-alpine
FROM node:24-alpine AS build
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

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app
COPY --from=prune --chown=app:app /app/node_modules ./node_modules
COPY --from=prune --chown=app:app /app/dist ./dist
COPY --from=prune --chown=app:app /app/package.json ./
COPY --chown=app:app scripts ./scripts
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/main"]

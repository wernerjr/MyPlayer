FROM node:24-slim AS build
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:24-slim
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8788 DATA_DIR=/data
EXPOSE 8788
CMD ["node", "apps/api/dist/server.js"]

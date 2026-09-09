FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY shared ./shared
COPY model ./model
COPY server ./server
COPY public ./public
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN install -d -o node -g node -m 0700 /data /backups
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/shared ./shared
COPY --from=build --chown=node:node /app/model ./model
COPY --chown=node:node tools/backup.mjs tools/restore.mjs tools/sqlite-snapshot.mjs ./tools/
COPY --chown=node:node tools/moderate.ts ./tools/
USER node
EXPOSE 3001
CMD ["node", "--import", "tsx", "server/index.ts"]

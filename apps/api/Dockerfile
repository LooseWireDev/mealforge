# Build context is the repository root:
#   docker build -f apps/api/Dockerfile .
# bookworm (glibc), not alpine: better-sqlite3 ships a prebuilt glibc binary,
# so no python/make/g++ toolchain is needed in the image.
FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json nx.json tsconfig.base.json vitest.config.ts biome.json ./
COPY apps ./apps
COPY packages ./packages
COPY tools ./tools
RUN pnpm install --frozen-lockfile
RUN pnpm exec nx run-many -t build -p @mealforge/api @mealforge/web
# pruned production node_modules for the api (keeps the built native module)
RUN pnpm --filter @mealforge/api --prod deploy --legacy /out

FROM base AS production
ENV NODE_ENV=production \
    WEB_DIST=./web \
    MIGRATIONS_DIR=/app/migrations \
    DATABASE_URL=file:/app/data/mealforge.db
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/src/db/migrations ./migrations
COPY --from=build /app/apps/web/dist ./web

VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "fetch('http://localhost:3000/trpc/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]

# Mirrors the seriestours-website Dockerfile (multi-stage, npm start, non-root
# uid 1001) with two deliberate differences, both forced by this app:
#
#   1. bookworm-slim, not alpine. better-sqlite3 is a native module and Prisma
#      ships glibc engines; building it against musl is avoidable pain for no
#      benefit here.
#   2. Node 24, not 20. package.json engines requires >=24.
FROM node:24-bookworm-slim AS base

FROM base AS deps
WORKDIR /app
# better-sqlite3 compiles from source when no prebuild matches the platform.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# npm 11 gates install scripts; these three need theirs to build.
RUN npm ci --include=dev \
    && npm approve-scripts better-sqlite3 @prisma/engines esbuild \
    && npm rebuild better-sqlite3

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# The client must exist before `next build` typechecks against it.
RUN npx prisma generate && npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl sqlite3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
# REQUIRED AT RUNTIME, not just at build time. `next start` re-reads
# next.config.ts from disk; without it the server silently falls back to
# framework defaults — which capped Server Action bodies at 1MB and broke
# document uploads in production, even though the built output carried the
# 16mb value. A missing config here fails quietly, so the entrypoint asserts it.
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# The SQLite file lives on a bind mount, never in the image — a rebuild must
# not be able to take the database with it.
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
VOLUME ["/app/data"]

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "start"]

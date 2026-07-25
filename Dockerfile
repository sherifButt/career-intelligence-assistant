# Simple two-stage build. Deliberately not micro-optimised (no standalone
# output tracing) — image size isn't the priority here, clarity is.
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# DATABASE_URL isn't available at build time; pages that touch the DB are
# rendered dynamically, so the build doesn't need a live database.
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY --from=builder /app ./
EXPOSE 3000
CMD ["pnpm", "start"]

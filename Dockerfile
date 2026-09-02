# syntax=docker/dockerfile:1

# --- deps: install dependencies (incl. native build for better-sqlite3) ---
FROM node:22-alpine AS deps
WORKDIR /app
# py3-setuptools provides distutils, which node-gyp needs to compile better-sqlite3
# (Python 3.12 on Alpine removed distutils from the stdlib).
RUN apk add --no-cache libc6-compat python3 py3-setuptools make g++
COPY package.json package-lock.json ./
RUN npm ci

# --- builder: build the Next.js app ---
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- runner: minimal production image ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# better-sqlite3 loads its native addon at runtime, so it needs libc compat too.
RUN apk add --no-cache libc6-compat

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone server + static assets + public files.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Persistent app data (SQLite file, db-config.json, .dbkey) lives here.
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]

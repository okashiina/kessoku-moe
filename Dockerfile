FROM node:20-slim AS prebuild
WORKDIR /app

# Copy package metadata
COPY package.json yarn.lock ./

# Copy all the submodules
COPY frontend frontend
COPY packages packages

# Remove every file in submodules except package metadata
RUN find packages \! -name "package.json" -mindepth 2 -maxdepth 2 -print | xargs rm -rf
RUN find frontend \! -name "package.json" -mindepth 1 -maxdepth 1 -print | xargs rm -rf


FROM node:20-slim AS builder
WORKDIR /app

# Copy all the package metadata from prebuild stage
# This stage is time consuming. So its made sure it runs only when necessary
COPY --from=prebuild /app ./

# Install deps
RUN yarn install --frozen-lockfile

# Copy the source code
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED 1

# NEXT_PUBLIC_* are inlined into the client bundle at build time, so the URL must
# exist during `yarn build` (next build), not just at runtime. Railway passes
# service variables as build args; declare the ARG and promote it to ENV so the
# custom player gets the source-service URL baked in. Without this it is undefined
# and the "Try our server" path silently falls back to the embed switcher.
ARG NEXT_PUBLIC_SOURCE_SERVICE_URL
ENV NEXT_PUBLIC_SOURCE_SERVICE_URL=$NEXT_PUBLIC_SOURCE_SERVICE_URL

# AniList OAuth client id — also a NEXT_PUBLIC_* that must be baked at build time
# (the Header sign-in button hides itself when it's unset). Same ARG→ENV pattern.
ARG NEXT_PUBLIC_ANILIST_CLIENT_ID
ENV NEXT_PUBLIC_ANILIST_CLIENT_ID=$NEXT_PUBLIC_ANILIST_CLIENT_ID

# Web Push VAPID public key — NEXT_PUBLIC_* baked at build time so the client can
# subscribe. Unset = the notify UI hides itself. Private key + DATABASE_URL stay
# server-only (runtime env), never build args. Same ARG→ENV pattern.
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

# build the image
RUN yarn build


# Production image, copy all the files and run the server
FROM node:20-slim AS runner

# link the docker image to animeflix repo
LABEL org.opencontainers.image.source https://github.com/chirag-droid/animeflix

WORKDIR /app

ENV NODE_ENV production
# Uncomment the following line in case you want to disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED 1

# curl is required at runtime by the manhwatop (Madara) manga provider, which
# shells out to curl to fetch HTML + stream images: that source sits behind
# Cloudflare bot protection that 403s Node's undici fetch ("Just a moment") while
# curl's TLS fingerprint passes. node:20-slim ships without curl, so install it.
# (Caveat: from a datacenter IP Cloudflare may still challenge curl; if manhwatop
# breaks in prod, route that provider through a residential egress — MangaDex via
# DoH + Weebcentral are unaffected. See docs/MANGA-ROADMAP.md.)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the build files from the builder stage
COPY --from=builder --chown=nextjs:nodejs /app/frontend/next.config.js ./frontend/
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/static ./frontend/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/frontend/public ./frontend/public

# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/standalone ./

USER nextjs

# Expose port 3000
EXPOSE 3000

ENV PORT 3000

# Run the server
CMD ["node", "frontend/server.js"]

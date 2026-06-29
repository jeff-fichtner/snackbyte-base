# Container that builds the app and serves it. What the app is (static or server) is
# baked into its source, so no build-time mode flag is needed.
FROM node:24-slim AS build
WORKDIR /app

# Install ALL deps (incl. the build toolchain) first. NODE_ENV must NOT be production
# here, or npm ci would skip devDependencies and the build tools would be missing.
COPY package*.json ./
RUN npm ci

COPY . .

# Now bake the production build. NODE_ENV stays 'production' so the build reads the real
# version (the version gate keys on it). The version itself is NOT taken from package.json
# (which holds only MAJOR.MINOR) — it arrives as the APP_VERSION build-arg and is baked into
# the frontend bundle. The environment identity arrives as APP_ENV_NAME (a single build-arg):
# the build resolves its facets from environments.json and bakes them into the frontend bundle
# AND the compiled server (so both report the same environment). The version chip is keyed off
# the resolved isPublicFace (NOT NODE_ENV): a public-face build hides the chip; a non-public-face
# build (e.g. staging) shows it. An explicit APP_IS_PUBLIC_FACE still overrides the chip directly.
# With no APP_ENV_NAME the build resolves the 'local' identity. Commit/date arrive the same way;
# without --build-arg they fall back to 'unknown'. Set these only for the build step.
ARG BUILD_GIT_COMMIT=unknown
ARG BUILD_DATE=unknown
ARG APP_ENV_NAME=
ARG APP_IS_PUBLIC_FACE=true
ARG APP_VERSION=0.0.0
RUN CI=true NODE_ENV=production APP_ENV_NAME=${APP_ENV_NAME} APP_IS_PUBLIC_FACE=${APP_IS_PUBLIC_FACE} \
    APP_VERSION=${APP_VERSION} BUILD_GIT_COMMIT=${BUILD_GIT_COMMIT} BUILD_DATE=${BUILD_DATE} \
    npm run build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Runtime needs only production dependencies (express, react, react-dom); the build
# toolchain stays in the build stage.
COPY package*.json ./
RUN npm ci --omit=dev

# Ship only the built artifact — compiled server + built frontend — never source.
COPY --from=build /app/dist ./dist

# Cloud Run provides PORT; default to 8080 locally.
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "run", "start"]

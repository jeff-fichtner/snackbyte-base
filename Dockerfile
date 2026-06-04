# Container that builds the app and serves it. What the app is (static or server) is
# baked into its source, so no build-time mode flag is needed.
FROM node:24-slim AS build
WORKDIR /app

# Install ALL deps (incl. the build toolchain) first. NODE_ENV must NOT be production
# here, or npm ci would skip devDependencies and the build tools would be missing.
COPY package*.json ./
RUN npm ci

COPY . .

# Now bake the production build: CI makes the frontend use the real package.json
# version; NODE_ENV=production hides the version chip. Set them only for the build
# step (after deps are installed). The commit/date ARGs only carry real values if the
# build is invoked with --build-arg; `gcloud run deploy --source .` (see deploy.sh) does
# not pass them, so the frontend's commit/date fall back to 'unknown'. (The server's
# /api/version gets real commit/date from runtime env, set by deploy.sh.)
ARG BUILD_GIT_COMMIT=unknown
ARG BUILD_DATE=unknown
RUN CI=true NODE_ENV=production \
    BUILD_GIT_COMMIT=${BUILD_GIT_COMMIT} BUILD_DATE=${BUILD_DATE} \
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

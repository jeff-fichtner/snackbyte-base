# Container that builds the app and serves it. What the app is (static or server) is
# baked into its source, so no build-time mode flag is needed.
FROM node:24-slim AS build
WORKDIR /app

# Version info, passed in by the deploy flow, baked into the build (the frontend
# bundle and prerender read these so the version chip and reported version are real).
ARG APP_VERSION=0.0.0
ARG BUILD_GIT_COMMIT=unknown
ARG BUILD_DATE=unknown
ENV CI=true
ENV NODE_ENV=production
ENV APP_VERSION=${APP_VERSION}
ENV BUILD_GIT_COMMIT=${BUILD_GIT_COMMIT}
ENV BUILD_DATE=${BUILD_DATE}

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

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

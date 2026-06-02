# Container that builds the app and serves it. What the app is (static or server) is
# baked into its source, so no build-time mode flag is needed.
FROM node:24-slim AS build
WORKDIR /app

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

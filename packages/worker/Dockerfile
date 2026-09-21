FROM node:20-alpine AS build
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/db packages/db
COPY packages/worker packages/worker
RUN npm install --workspace @ch/core --workspace @ch/db --workspace @ch/worker
RUN npm run build --workspace @ch/core --workspace @ch/db --workspace @ch/worker

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/packages/worker/dist packages/worker/dist
COPY --from=build /app/package.json ./
CMD ["node", "packages/worker/dist/index.js"]
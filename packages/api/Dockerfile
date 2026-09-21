FROM node:20-alpine AS build
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/db packages/db
COPY packages/api packages/api
RUN npm install --workspace @ch/core --workspace @ch/db --workspace @ch/api
RUN npm run build --workspace @ch/core --workspace @ch/db --workspace @ch/api

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/packages/api/dist packages/api/dist
COPY --from=build /app/package.json ./
EXPOSE 3000
CMD ["node", "packages/api/dist/server.js"]
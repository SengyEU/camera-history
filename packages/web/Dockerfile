FROM node:20-alpine AS build
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/web packages/web
COPY packages/admin packages/admin
RUN npm install --workspace @ch/web --workspace @ch/admin
RUN npm run build --workspace @ch/web --workspace @ch/admin

FROM nginx:1.27-alpine
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
COPY --from=build /app/packages/admin/dist /usr/share/nginx/html/admin
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
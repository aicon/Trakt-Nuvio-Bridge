FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY app.js server.js index.html styles.css config.js ./
COPY assets ./assets

ENV NODE_ENV=production
ENV PORT=4173
ENV HOST=0.0.0.0

EXPOSE 4173

CMD ["node", "server.js"]

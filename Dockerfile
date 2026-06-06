FROM node:18-alpine

ARG APPNAME=trakt-nuvio-bridge \
  VERSION=dev \
  BUILD_DATE=unknown

# -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
LABEL \
  maintainer="aicon <dsz360@gmail.com>" \
  name=${APPNAME} \
  build-date=${BUILD_DATE} \
  description="Docker image: Nuvio Trakt Bridge v.${VERSION}, based on Alpine linux." \
  org.opencontainers.image.created=${BUILD_DATE} \
  org.opencontainers.image.source="https://github.com/aicon/Trakt-Nuvio-Bridge" \
  org.opencontainers.image.authors="aicon <dsz360@gmail.com>" \
  org.opencontainers.image.title=${APPNAME} \
  org.opencontainers.image.description="Nuvio Trakt Bridge v.${VERSION}, based on Alpine linux."
# -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=4173
ENV HOST=0.0.0.0

EXPOSE 4173

CMD ["node", "server.js"]

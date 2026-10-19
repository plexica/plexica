FROM node:24.22.0-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f

WORKDIR /app
COPY server.mjs ./server.mjs

USER node
EXPOSE 3000
CMD ["node", "server.mjs"]

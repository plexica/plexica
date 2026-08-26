FROM node:24-bookworm

EXPOSE 3000
CMD ["node", "-e", "require('node:http').createServer((_, response) => response.end('sidecar-ok')).listen(3000)"]

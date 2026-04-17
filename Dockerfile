FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DB_PATH=/data/books.db

EXPOSE 3000

CMD ["node", "server.js"]

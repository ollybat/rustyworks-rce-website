# The bot needs no dependencies at all: Node 20+ already has fetch, Request/Response
# and WebCrypto, which is everything the interactions handler uses. That keeps the
# image tiny and the build to a few seconds.
FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Only the bot folder is needed in the image; the website is served elsewhere.
COPY bot/ ./bot/

USER node
ENV PORT=8080
EXPOSE 8080

CMD ["node", "bot/server.mjs"]

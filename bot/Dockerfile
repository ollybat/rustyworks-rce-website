# The bot needs one dependency: discord.js, for the gateway connection that makes it
# show as online. Installing it here keeps the image self-contained and the build short.
FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY bot/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY bot/ ./

USER node
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.mjs"]

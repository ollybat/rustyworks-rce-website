# The bot needs one dependency: discord.js, for the gateway connection that makes it
# show as online. Installing it here keeps the image self-contained and the build short.
FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY bot/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY bot/ ./

# A folder the bot may write its settings file to. Without it the app (which runs as the
# node user) cannot create /app/data, and nothing it saves survives even a reconnect.
# For settings that outlive a redeploy, attach a Railway volume (the bot finds it itself).
RUN mkdir -p /app/data && chown node:node /app/data

USER node

# Do NOT pin PORT here. Railway assigns the port it routes the public domain to and
# passes it in as PORT; a hardcoded value in the image can leave the app listening on
# a port nothing reaches, which shows up as "502 Application failed to respond".
# The app reads PORT itself and falls back to 8080 when it is absent.
EXPOSE 8080

CMD ["node", "server.mjs"]

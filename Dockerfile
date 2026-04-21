FROM node:20 AS base

RUN apt update && apt install -y less man-db
RUN apt upgrade -y

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm config set strict-ssl false && npm install

# --- Production ---
FROM base AS production
COPY . .
EXPOSE 4000
CMD ["npx", "tsx", "src/server.ts"]

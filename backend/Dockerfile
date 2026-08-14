FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=Europe/Prague
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate

EXPOSE 3010
CMD ["npm", "run", "dev"]

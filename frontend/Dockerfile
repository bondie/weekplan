FROM node:22-alpine

ENV TZ=Europe/Prague
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src

EXPOSE 5180
CMD ["npm", "run", "dev"]

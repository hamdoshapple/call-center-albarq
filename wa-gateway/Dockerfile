FROM node:20-bookworm
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY src ./src
CMD ["npm","start"]

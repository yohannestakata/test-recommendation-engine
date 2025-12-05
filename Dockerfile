FROM node:20-bullseye

WORKDIR /usr/src/app

# Install Python (no heavy ML deps; embeddings script can run in mock mode)
RUN apt-get update && \
  apt-get install -y python3 python3-pip && \
  rm -rf /var/lib/apt/lists/*

ENV PYTHON_EXECUTABLE=python3
# Default to mock embeddings inside Docker to keep images light and fast
ENV EMBEDDINGS_MODE=mock

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build && npx prisma generate

EXPOSE 3000

CMD ["node", "dist/main.js"]



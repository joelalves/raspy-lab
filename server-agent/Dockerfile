FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY index.js system-info.js ./
EXPOSE 9090
CMD ["node", "index.js"]

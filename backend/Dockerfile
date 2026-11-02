FROM node:20-alpine
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm install
COPY backend/tsconfig.json ./
COPY backend/src ./src
COPY frontend /frontend
RUN npx tsc
ENV PORT=5000
ENV NODE_ENV=production
ENV FRONTEND_DIR=/frontend
EXPOSE 5000
CMD ["node", "dist/index.js"]

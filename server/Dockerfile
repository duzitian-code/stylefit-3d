FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server

ENV PORT=8787
ENV AVATAR_RECONSTRUCTION_PROVIDER=stylefit
ENV STYLEFIT_AVATAR_WORKER_URL=http://stylefit-avatar-worker:8791

EXPOSE 8787
CMD ["npm", "run", "reconstruction:api"]
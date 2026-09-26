FROM node:22-alpine

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Generate Prisma client
ARG DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN DATABASE_URL=$DATABASE_URL npx prisma generate

# Type check (compile check)
RUN npm run build

# Production configuration
ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

CMD ["npm", "start"]


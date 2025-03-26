# Use an official Node.js runtime as a parent image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the app's source code
COPY . .

# Build the Next.js app
RUN npm run build

# Start a new stage to create a smaller image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy only the necessary files from the builder stage
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/.next .next
COPY --from=builder /app/public public
COPY --from=builder /app/node_modules node_modules

# Expose port
EXPOSE 3000

# Set environment variable
ENV NODE_ENV=production

# Start the Next.js app
CMD ["npm", "run", "start"]

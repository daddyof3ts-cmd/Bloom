FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application files
COPY . .

# Build the Vite application
RUN npm run build

# Expose the port (Cloud Run / App Engine standard)
EXPOSE 8080

# Start the application server
CMD ["npm", "start"]

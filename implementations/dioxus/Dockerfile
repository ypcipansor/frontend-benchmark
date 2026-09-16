# Build stage
FROM rust:latest AS builder

# Install dependencies
RUN apt-get update && \
    apt-get install -y pkg-config libssl-dev && \
    rm -rf /var/lib/apt/lists/*

# Install trunk and wasm target (same toolchain used for leptos and yew)
RUN rustup target add wasm32-unknown-unknown && \
    cargo install --locked trunk

WORKDIR /app

# Copy source files
COPY . .

# Build for production
RUN trunk build --release

# Production stage
FROM nginx:alpine

# Copy built files to nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

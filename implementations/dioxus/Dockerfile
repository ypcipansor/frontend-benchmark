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

# Copy the dioxus implementation and the shared stylesheet. The build context is
# the repository root (see docker-compose.yml) so that index.html can reference
# the shared CSS exactly like Leptos and Yew (../../shared/styles/todo.css).
COPY implementations/dioxus/ ./dioxus/
COPY shared/ ./shared/

# Build for production from the dioxus directory so the shared CSS resolves.
WORKDIR /app/dioxus
RUN trunk build --release

# Production stage
FROM nginx:alpine

# Copy built files to nginx
COPY --from=builder /app/dioxus/dist /usr/share/nginx/html

# Serve the shared stylesheet at the path referenced by index.html
# (../../shared/styles/todo.css), so the app uses the same shared design as
# Leptos and Yew and the Lighthouse/bundle benchmarks reflect it.
COPY shared/styles/todo.css /usr/share/nginx/html/shared/styles/todo.css

# Copy nginx configuration
COPY implementations/dioxus/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

# Docker-based Benchmarking Guide

This document provides instructions for running benchmarks using Docker containers for each frontend framework implementation.

## Prerequisites

- Docker (v20.10+)
- Docker Compose v2 (comes with Docker)
- At least 8GB of available disk space
- At least 4GB of available RAM

## Quick Start

### Build All Containers

```bash
docker compose build
```

This will build Docker containers for all implementations:
- React
- Vue.js
- Angular
- Leptos (Rust/WASM)
- Yew (Rust/WASM)
- Dioxus (Rust/WASM)
- Blade.php

**Note:** Building all containers, especially Rust-based ones, can take 30-60 minutes depending on your system.

### Run Individual Frameworks

```bash
# Start React
docker compose up -d react

# Start Vue
docker compose up -d vue

# Start Angular
docker compose up -d angular

# And so on...
```

### Access Running Containers

Once started, frameworks are accessible at:

- React: http://localhost:3001
- Vue: http://localhost:3002
- Angular: http://localhost:3003
- Leptos: http://localhost:3004
- Yew: http://localhost:3005
- Dioxus: http://localhost:3006
- Blade: http://localhost:3007

## Running Benchmarks

### Automated Benchmark Suite

Run the complete automated benchmark suite:

```bash
cd benchmarks/scripts
npm install
npm run benchmark:docker
```

This will:
1. Build and start each framework container one by one
2. Analyze bundle sizes
3. Run Lighthouse performance audits
4. Generate comprehensive results
5. Save results to `benchmarks/results/docker-benchmark-results.json`

### Manual Testing

#### Bundle Size Analysis

```bash
cd benchmarks/scripts
npm run benchmark:bundle
```

#### Lighthouse Performance Audit

First, start all containers:

```bash
docker compose up -d
```

Then run the audit:

```bash
cd benchmarks/scripts
npm run benchmark:lighthouse
```

## Docker Container Details

### JavaScript Frameworks (React, Vue, Angular)

These use a multi-stage build process:
1. **Builder stage**: Node.js Alpine image to install dependencies and build
2. **Production stage**: Nginx Alpine to serve the built static files

Build optimization features:
- Gzip compression enabled in Nginx
- Production builds with minification
- Multi-stage builds to minimize image size

### Rust/WASM Frameworks (Leptos, Yew, Dioxus)

These also use multi-stage builds:
1. **Builder stage**: Rust image to compile WASM and build assets
2. **Production stage**: Nginx Alpine to serve the compiled WASM and assets

Special considerations:
- WASM target compilation
- Trunk/DX CLI for building
- WASM-specific Nginx configuration

### Blade.php

Uses PHP 8.2 with Apache:
- Composer for PHP dependencies
- Apache with mod_rewrite enabled
- Serves directly from PHP

## Managing Containers

### View Running Containers

```bash
docker compose ps
```

### View Logs

```bash
# All containers
docker compose logs

# Specific container
docker compose logs react
docker compose logs vue
```

### Stop Containers

```bash
# Stop all
docker compose down

# Stop specific
docker compose stop react
```

### Rebuild After Code Changes

```bash
# Rebuild all
docker compose build --no-cache

# Rebuild specific
docker compose build --no-cache react
```

## Troubleshooting

### Container fails to start

Check logs:
```bash
docker compose logs <service-name>
```

### Port already in use

Modify the ports in `docker-compose.yml`:

```yaml
services:
  react:
    ports:
      - "3001:80"  # Change 3001 to another port
```

### Build fails

Clean up and rebuild:
```bash
# Remove all containers and images
docker compose down --rmi all --volumes

# Rebuild
docker compose build --no-cache
```

### Low disk space

Remove unused Docker resources:
```bash
docker system prune -a
```

## Performance Considerations

### Build Time

- **JavaScript frameworks**: 5-10 minutes per framework
- **Rust frameworks**: 15-30 minutes per framework (first build)
- **Subsequent builds**: Much faster due to caching

### Resource Usage

During build:
- CPU: High usage (all cores utilized)
- RAM: 2-4GB per container
- Disk: 500MB-1GB per framework image

During runtime:
- CPU: Minimal
- RAM: 50-100MB per container
- Disk: No additional usage

## Best Practices

1. **Build frameworks in order**: Start with JavaScript frameworks (faster) before Rust frameworks
2. **Use Docker layer caching**: Don't use `--no-cache` unless necessary
3. **Monitor resources**: Use `docker stats` to monitor container resource usage
4. **Clean up regularly**: Remove old images with `docker image prune`
5. **Incremental testing**: Test one framework at a time before running the full suite

## CI/CD Integration

For automated benchmarking in CI/CD:

```yaml
# Example GitHub Actions workflow
steps:
  - name: Build and test React
    run: |
      docker compose build react
      docker compose up -d react
      # Wait for container to be ready
      sleep 10
      # Run tests/benchmarks
      curl http://localhost:3001
```

## Results

All benchmark results are saved to:
- Bundle sizes: `benchmarks/results/bundle-sizes.json`
- Lighthouse results: `benchmarks/results/lighthouse-results.json`
- Docker benchmark results: `benchmarks/results/docker-benchmark-results.json`

The committed summary of these numbers lives in the **Benchmark Results** section of [README.md](README.md); `npm run update-readme` regenerates it from `comprehensive-benchmark-results.json`.

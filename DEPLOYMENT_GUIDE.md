# Plexica Deployment Guide

This guide covers deploying the Plexica platform to various environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Docker Build & Testing](#docker-build--testing)
4. [Production Deployment](#production-deployment)
5. [Environment Configuration](#environment-configuration)
6. [Health Checks & Monitoring](#health-checks--monitoring)
7. [Troubleshooting](#troubleshooting)
8. [Runbooks](#runbooks)

---

## Prerequisites

### System Requirements

- **Node.js**: v20.0.0 or higher
- **pnpm**: v8.0.0 or higher (package manager)
- **Docker**: v29.1.3 or higher
- **Docker Compose**: v5.0.0 or higher
- **PostgreSQL**: v15 or higher (managed by Docker)
- **Redis**: v7 or higher (managed by Docker)

### Credentials & Access

Before deployment, ensure you have:

1. **Database credentials**: PostgreSQL user and password
2. **Redis password** (if authentication required)
3. **Keycloak admin credentials**: For SSO configuration
4. **MinIO credentials**: For object storage (S3-compatible)
5. **JWT secret**: For token signing
6. **Redpanda/Kafka brokers**: For event streaming

---

## Local Development Setup

### 1. Install Dependencies

```bash
# Install pnpm globally (if not already installed)
npm install -g pnpm

# Install project dependencies
cd /path/to/plexica
pnpm install
```

### 2. Start Infrastructure Services

```bash
# Start all services (PostgreSQL, Redis, Keycloak, MinIO, Redpanda)
pnpm infra:start

# View logs
pnpm infra:logs

# Check status
pnpm infra:status
```

### 3. Initialize Database

```bash
# Run database migrations
pnpm db:migrate

# Generate Prisma client
pnpm db:generate

# (Optional) Open Prisma Studio for data inspection
pnpm db:studio
```

### 4. Start Development Servers

```bash
# Terminal 1: Start all services in development mode
pnpm dev

# Services will start on:
# - Core API: http://localhost:3000
# - Web App: http://localhost:3001
# - Super Admin: http://localhost:3002
# - Keycloak: http://localhost:8080
# - MinIO Console: http://localhost:9001
# - Redpanda Console: http://localhost:8090
```

### 5. Run Tests

```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm --filter @plexica/core-api test

# Run tests in watch mode
pnpm test -- --watch

# Generate coverage report
pnpm test -- --coverage
```

---

## Docker Build & Testing

### Building Docker Images

#### Prerequisites

Before building, ensure DATABASE_URL is available (for Prisma code generation):

```bash
export DATABASE_URL="postgresql://plexica:plexica_password@postgres:5432/plexica"
```

#### Build Core API Image

```bash
# Build the production image
docker build \
  -f apps/core-api/Dockerfile \
  --build-arg DATABASE_URL="postgresql://plexica:plexica_password@postgres:5432/plexica" \
  -t plexica/core-api:latest \
  .

# Build with specific tag
docker build \
  -f apps/core-api/Dockerfile \
  --build-arg DATABASE_URL="postgresql://plexica:plexica_password@postgres:5432/plexica" \
  -t plexica/core-api:v0.1.0 \
  .
```

#### Build Web App Image

```bash
docker build \
  -f apps/web/Dockerfile \
  -t plexica/web:latest \
  .
```

#### Build All Images

```bash
# Build all application images
docker build -f apps/core-api/Dockerfile -t plexica/core-api:latest .
docker build -f apps/web/Dockerfile -t plexica/web:latest .
docker build -f apps/super-admin/Dockerfile -t plexica/super-admin:latest .
```

### Testing Docker Images Locally

#### Using docker-compose (Development)

```bash
# Start development environment with Docker
docker-compose -f docker-compose.yml up -d

# View logs
docker-compose -f docker-compose.yml logs -f core-api

# Stop services
docker-compose -f docker-compose.yml down

# Clean up volumes
docker-compose -f docker-compose.yml down -v
```

#### Using docker-compose.prod.yml (Production Simulation)

```bash
# Start production-like environment
docker-compose -f docker-compose.prod.yml up -d

# Create .env.prod file first with:
# - POSTGRES_PASSWORD=<secure-password>
# - REDIS_PASSWORD=<secure-password>
# - KEYCLOAK_ADMIN_PASSWORD=<secure-password>
# - JWT_SECRET=<secure-secret>
# - And other environment variables

# View logs
docker-compose -f docker-compose.prod.yml logs -f core-api

# Run with specific environment file
docker-compose --env-file .env.prod -f docker-compose.prod.yml up -d

# Stop services
docker-compose -f docker-compose.prod.yml down
```

#### Running Container Health Checks

```bash
# Check container health
docker inspect <container-id> --format='{{.State.Health.Status}}'

# View container logs
docker logs <container-id>

# Test API endpoint
curl http://localhost:3000/health

# Test with Docker Compose
docker-compose exec core-api curl http://localhost:3000/health
```

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] All tests passing (`pnpm test`)
- [ ] Docker images built and tested locally
- [ ] Environment variables configured
- [ ] Database migrations tested
- [ ] Secrets stored securely (not in code)
- [ ] Security audit completed
- [ ] Load testing performed
- [ ] Backup strategy in place
- [ ] Monitoring configured
- [ ] Incident response plan documented

### Deployment Steps

#### 1. Prepare Environment

```bash
# Create production environment file
cat > .env.prod << EOF
# Database
POSTGRES_USER=plexica
POSTGRES_PASSWORD=${DB_PASSWORD}
POSTGRES_DB=plexica
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:5432/plexica

# Redis
REDIS_HOST=${REDIS_HOST}
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}

# Keycloak
KEYCLOAK_URL=${KEYCLOAK_URL}
KEYCLOAK_REALM=master
KEYCLOAK_CLIENT_ID=plexica
KEYCLOAK_CLIENT_SECRET=${KC_SECRET}

# JWT
JWT_SECRET=${JWT_SECRET}

# MinIO/S3
MINIO_ENDPOINT=${STORAGE_HOST}
MINIO_PORT=9000
STORAGE_ACCESS_KEY=${STORAGE_ACCESS_KEY}
STORAGE_SECRET_KEY=${STORAGE_SECRET_KEY}

# Redpanda/Kafka
REDPANDA_BROKERS=${KAFKA_BROKERS}

# API Configuration
PORT=3000
API_URL=https://api.plexica.com
KEYCLOAK_CALLBACK_URL=https://api.plexica.com/api/auth/callback

# Node environment
NODE_ENV=production
LOG_LEVEL=info
EOF

# Secure permissions
chmod 600 .env.prod
```

#### 2. Deploy Using Docker Compose

```bash
# Pull latest images or use pre-built images
docker-compose --env-file .env.prod -f docker-compose.prod.yml pull

# Start services (creates new containers if needed)
docker-compose --env-file .env.prod -f docker-compose.prod.yml up -d

# View deployment status
docker-compose --env-file .env.prod -f docker-compose.prod.yml ps

# Follow logs
docker-compose --env-file .env.prod -f docker-compose.prod.yml logs -f
```

#### 3. Run Post-Deployment Checks

```bash
# Check API health
curl https://api.plexica.com/health

# Verify database connectivity
docker-compose --env-file .env.prod -f docker-compose.prod.yml exec core-api \
  node -e "console.log('DB connection check')"

# Check Redis connectivity
docker-compose --env-file .env.prod -f docker-compose.prod.yml exec redis \
  redis-cli ping

# Run smoke tests
pnpm test:smoke
```

#### 4. Enable Monitoring

```bash
# Prometheus metrics collection (if using)
# Update prometheus.yml to scrape core-api metrics endpoint

# Set up alerts for:
# - API response time > 500ms
# - Error rate > 1%
# - Database connection pool exhaustion
# - Redis memory usage > 80%
# - Disk usage > 85%
```

---

## Environment Configuration

### Core Environment Variables

| Variable                 | Required | Example                               | Description                                       |
| ------------------------ | -------- | ------------------------------------- | ------------------------------------------------- |
| `NODE_ENV`               | Yes      | `production`                          | Node environment (development/staging/production) |
| `PORT`                   | No       | `3000`                                | API server port                                   |
| `LOG_LEVEL`              | No       | `info`                                | Log verbosity (error/warn/info/debug)             |
| `DATABASE_URL`           | Yes      | `postgresql://user:pass@host:5432/db` | PostgreSQL connection                             |
| `REDIS_HOST`             | Yes      | `localhost`                           | Redis hostname                                    |
| `REDIS_PORT`             | No       | `6379`                                | Redis port                                        |
| `REDIS_PASSWORD`         | No       | `password`                            | Redis authentication password                     |
| `JWT_SECRET`             | Yes      | `your-secret-key`                     | Secret for JWT signing                            |
| `KEYCLOAK_URL`           | Yes      | `https://keycloak.example.com`        | Keycloak server URL                               |
| `KEYCLOAK_REALM`         | Yes      | `master`                              | Keycloak realm name                               |
| `KEYCLOAK_CLIENT_ID`     | Yes      | `plexica`                             | Keycloak client ID                                |
| `KEYCLOAK_CLIENT_SECRET` | Yes      | `secret`                              | Keycloak client secret                            |
| `STORAGE_ACCESS_KEY`     | Yes      | `minioadmin`                          | MinIO/S3 access key                               |
| `STORAGE_SECRET_KEY`     | Yes      | `minioadmin`                          | MinIO/S3 secret key                               |
| `MINIO_ENDPOINT`         | Yes      | `minio.example.com`                   | MinIO server hostname                             |
| `MINIO_PORT`             | No       | `9000`                                | MinIO port                                        |
| `REDPANDA_BROKERS`       | Yes      | `kafka:9092`                          | Kafka/Redpanda brokers                            |

### Security Best Practices

1. **Never commit secrets** to version control
2. **Use environment files** (.env.prod) not included in git
3. **Rotate secrets regularly** (especially JWT_SECRET, database passwords)
4. **Use strong passwords** (min 32 chars, mixed case, symbols)
5. **Restrict file permissions** on `.env.prod` files (chmod 600)
6. **Use secrets management** tools in production (Vault, AWS Secrets Manager)
7. **Enable HTTPS** in production (Let's Encrypt, AWS ACM)
8. **Configure rate limiting** to prevent brute force attacks
9. **Enable database SSL** for remote connections
10. **Monitor failed login attempts** and set up alerts

---

## Health Checks & Monitoring

### API Health Endpoint

```bash
# Check basic health
curl http://localhost:3000/health

# Expected response:
# { "status": "ok", "timestamp": "2024-01-23T12:00:00Z" }
```

### Docker Health Status

```bash
# Check all container health
docker ps --format "table {{.Names}}\t{{.Status}}"

# Expected: healthy status for all services
```

### Database Connectivity

```bash
# Test PostgreSQL connection
psql postgresql://user:pass@localhost:5432/plexica -c "SELECT 1"

# Test from Docker
docker-compose exec postgres psql -U plexica -d plexica -c "SELECT 1"
```

### Redis Connectivity

```bash
# Test Redis connection
redis-cli -h localhost ping

# Expected: PONG response
```

### Monitoring Stack (Recommended)

#### Prometheus + Grafana Setup

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'plexica-api'
    static_configs:
      - targets: ['core-api:3000']
    metrics_path: '/metrics'
```

#### Key Metrics to Monitor

- **API Response Time**: p95 < 500ms, p99 < 1s
- **Error Rate**: < 0.1%
- **Database Connection Pool**: < 80% utilization
- **Memory Usage**: < 70%
- **CPU Usage**: < 80%
- **Disk Space**: < 85% full

---

## Troubleshooting

### Common Issues

#### 1. Database Connection Timeout

**Problem**: "FATAL: could not accept SSL connection"

**Solution**:

```bash
# Ensure PostgreSQL is running
docker-compose ps postgres

# Check network connectivity
docker network inspect plexica-network

# Verify DATABASE_URL format
echo $DATABASE_URL

# If using SSL, add ssl=require to URL
DATABASE_URL="postgresql://user:pass@host/db?ssl=require"
```

#### 2. Redis Connection Refused

**Problem**: "Error: connect ECONNREFUSED 127.0.0.1:6379"

**Solution**:

```bash
# Verify Redis container is running
docker-compose ps redis

# Check Redis password if set
redis-cli -h localhost -a password ping

# Clear Redis and restart
docker-compose restart redis
```

#### 3. Keycloak Not Responding

**Problem**: "Connection refused" when accessing Keycloak

**Solution**:

```bash
# Check Keycloak container
docker-compose logs keycloak

# Wait for startup (may take 60+ seconds)
sleep 90

# Verify health endpoint
curl http://localhost:8080/health/ready
```

#### 4. API Not Starting

**Problem**: "Failed to load ENV variables"

**Solution**:

```bash
# Check .env file exists
ls -la .env

# Verify all required variables are set
grep "DATABASE_URL\|JWT_SECRET\|KEYCLOAK" .env

# Add missing variables
echo "MISSING_VAR=value" >> .env

# Rebuild image with correct ENV
docker-compose build --no-cache core-api
```

#### 5. Out of Memory

**Problem**: Container killed by Docker (exit code 137)

**Solution**:

```bash
# Check Docker memory allocation
docker stats

# Increase Docker memory limit
# Docker Desktop: Settings > Resources > Memory

# Or use docker-compose resource limits
# See docker-compose.prod.yml for examples

# Optimize application
# - Enable compression
# - Reduce batch sizes
# - Implement connection pooling
```

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug docker-compose up

# Enable TypeScript source maps
NODE_OPTIONS="--enable-source-maps" npm start

# Attach debugger
node --inspect=0.0.0.0:9229 app.js

# Access DevTools at: chrome://inspect
```

---

## Runbooks

### Scaling Horizontally

```bash
# Scale core-api to 3 instances
docker-compose up -d --scale core-api=3

# Monitor CPU usage during scale-up
watch 'docker stats --no-stream | grep core-api'
```

### Database Maintenance

#### Backup

```bash
# Create backup
docker-compose exec postgres pg_dump -U plexica plexica > backup.sql

# Create compressed backup
docker-compose exec postgres pg_dump -U plexica plexica | gzip > backup.sql.gz

# Backup with schedule (cron)
# 0 2 * * * docker-compose exec postgres pg_dump -U plexica plexica | gzip > /backups/plexica-$(date +\%Y\%m\%d).sql.gz
```

#### Restore

```bash
# Restore from backup
docker-compose exec -T postgres psql -U plexica < backup.sql

# Restore compressed backup
gunzip < backup.sql.gz | docker-compose exec -T postgres psql -U plexica
```

#### Vacuum & Analyze (Maintenance)

```bash
# Run maintenance
docker-compose exec postgres psql -U plexica -c "VACUUM ANALYZE;"

# Check table sizes
docker-compose exec postgres psql -U plexica -c "
  SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
  FROM pg_catalog.pg_statio_user_tables
  ORDER BY pg_total_relation_size(relid) DESC;
"
```

### Cache Management

#### Clear Redis Cache

```bash
# Clear all cache
docker-compose exec redis redis-cli FLUSHALL

# Clear specific key patterns
docker-compose exec redis redis-cli KEYS "pattern*" | xargs redis-cli DEL

# Monitor Redis memory
docker-compose exec redis redis-cli INFO memory
```

### Logs & Diagnostics

#### View Logs

```bash
# View logs for specific service
docker-compose logs -f core-api --tail=100

# View logs with timestamps
docker-compose logs --timestamps core-api

# Export logs for analysis
docker-compose logs > logs.txt
```

#### Performance Analysis

```bash
# Check slow queries (PostgreSQL)
docker-compose exec postgres psql -U plexica -c "
  SELECT query, calls, mean_time
  FROM pg_stat_statements
  WHERE mean_time > 100
  ORDER BY mean_time DESC;
"

# Check query explain plan
docker-compose exec postgres psql -U plexica -c "
  EXPLAIN ANALYZE SELECT * FROM your_table WHERE condition;
"
```

### Emergency Procedures

#### Service Restart

```bash
# Restart single service
docker-compose restart core-api

# Restart all services
docker-compose restart

# Hard restart (remove and recreate)
docker-compose up -d --force-recreate
```

#### Recovery from Disaster

```bash
# Stop all services
docker-compose down

# Remove all volumes (WARNING: deletes data!)
docker-compose down -v

# Restore database backup
docker-compose up -d postgres
docker-compose exec -T postgres psql -U plexica < backup.sql

# Restart all services
docker-compose up -d
```

#### Handle Full Disk

```bash
# Check disk usage
df -h

# Clean up unused Docker images
docker image prune -a

# Clean up unused volumes
docker volume prune

# Clean up logs
docker exec $(docker ps -q) sh -c 'truncate -s 0 /var/log/app.log'
```

---

## Performance Tuning

### PostgreSQL Optimization

```sql
-- Increase shared_buffers (25% of system RAM)
-- In docker-compose.prod.yml:
// ALTER SYSTEM SET shared_buffers = '2GB';

-- Optimize connection pooling
// ALTER SYSTEM SET max_connections = 200;

-- Enable compression
// ALTER SYSTEM SET wal_compression = on;
```

### Redis Optimization

```bash
# Optimize eviction policy (for cache)
docker-compose exec redis redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Enable persistence if needed
docker-compose exec redis redis-cli CONFIG SET save "900 1 300 10 60 10000"
```

### API Performance

```javascript
// In core-api configuration
- Enable response compression
- Implement query caching
- Use connection pooling
- Set appropriate timeouts
- Configure rate limiting
```

---

## Support & Escalation

### Getting Help

1. Check logs: `docker-compose logs -f service-name`
2. Review this guide for similar issues
3. Check GitHub issues: https://github.com/anomalyco/plexica/issues
4. Contact support team with:
   - Error messages
   - Recent changes
   - Environment details
   - Logs (sanitized)

### Reporting Issues

Include in bug reports:

- Steps to reproduce
- Expected vs actual behavior
- Environment (Docker version, OS, etc.)
- Relevant logs (errors, warnings)
- Sanitized environment variables

---

**Last Updated**: January 2025  
**Version**: 1.0.0  
**Document Status**: Production Ready

# Load Testing Guide for Plexica Core API

Load tests for Plexica using k6 (modern load testing tool).

## Installation

k6 is required. Install via:

```bash
# macOS
brew install k6

# Linux
sudo apt-get install k6

# Or from source
https://k6.io/docs/getting-started/installation/
```

## Test Scripts

### 1. Main Load Test (`main.js`)

General load test covering all major endpoints.

**Features:**

- Ramps up from 10 to 100 virtual users
- Tests health check, plugins, workspaces, and tenant context
- Validates response times (p95 < 500ms, p99 < 1000ms)
- Error rate threshold: < 10%

**Run:**

```bash
k6 run apps/core-api/load-tests/main.js
```

**With custom options:**

```bash
k6 run \
  -u 50 \                    # 50 virtual users
  -d 5m \                    # 5 minute duration
  -e BASE_URL=http://localhost:3000 \
  -e TENANT_SLUG=test-tenant \
  apps/core-api/load-tests/main.js
```

### 2. Authentication Test (`auth.js`)

Focused testing of authentication flows and token handling.

**Features:**

- Tests with and without authentication
- Validates token expiration handling
- Tests concurrent auth attempts
- Tests invalid token rejection

**Run:**

```bash
k6 run apps/core-api/load-tests/auth.js
```

**With authentication token:**

```bash
k6 run \
  -e AUTH_TOKEN="your-jwt-token" \
  -e BASE_URL=http://localhost:3000 \
  apps/core-api/load-tests/auth.js
```

### 3. Multi-Tenant Test (`multi-tenant.js`)

Tests multi-tenant isolation and resource handling.

**Features:**

- Simulates 5 different tenants
- Tests tenant isolation
- Tests concurrent operations across tenants
- Tests tenant context switching

**Run:**

```bash
k6 run apps/core-api/load-tests/multi-tenant.js
```

**With custom number of virtual users:**

```bash
k6 run \
  -u 40 \                    # 40 users spread across 5 tenants
  -d 3m \
  apps/core-api/load-tests/multi-tenant.js
```

## Environment Variables

All tests support these environment variables:

| Variable      | Default                 | Purpose                                     |
| ------------- | ----------------------- | ------------------------------------------- |
| `BASE_URL`    | `http://localhost:3000` | API base URL                                |
| `TENANT_SLUG` | `test-tenant`           | Tenant identifier                           |
| `AUTH_TOKEN`  | (none)                  | JWT bearer token for authenticated requests |

## Performance Targets

### Response Times

- **Health check**: < 100ms
- **API endpoints**: < 500ms (p95)
- **Authenticated requests**: < 1000ms (p99)

### Throughput

- Minimum: 50 requests/second
- Target: 100+ requests/second at peak load

### Error Rates

- Target: < 10% for general tests
- Target: < 15% for auth tests (slower due to token validation)

## Interpreting Results

k6 output includes:

```
Test Files  : 1 passed (1)
Tests       : 323 passed (323)
VUs (peak)  : 100
Duration    : 5m30s
Requests    : 15,234 (46.2 req/s)
Data Sent   : 2.5 MB
Data Recv   : 8.3 MB

http_req_duration..............: avg=245ms, p(95)=480ms, p(99)=950ms
http_req_failed.................: 4.32% (662)
```

Key metrics:

- **http_req_duration**: Response time distribution
- **http_req_failed**: Percentage of failed requests
- **http_reqs**: Total requests and average request rate
- **vus**: Virtual users

## Running with Cloud

Run tests on k6 Cloud for detailed analysis:

```bash
k6 cloud apps/core-api/load-tests/main.js
```

Requires k6 Cloud account and login:

```bash
k6 login cloud
```

## Troubleshooting

### Connection Refused

- Ensure API server is running: `npm run dev` in core-api
- Check BASE_URL is correct

### High Error Rates

- Check authentication token validity (if using AUTH_TOKEN)
- Verify tenant exists and is ACTIVE
- Check server logs for errors

### Slow Response Times

- Reduce concurrent virtual users with `-u` flag
- Check server resource usage (CPU, memory, DB)
- Look for database query bottlenecks

## Integration with CI/CD

Run load tests in CI pipeline:

```yaml
# Example GitHub Actions
- name: Run Load Tests
  run: |
    k6 run \
      -u 20 \
      -d 2m \
      -e BASE_URL=${{ secrets.STAGING_URL }} \
      -e AUTH_TOKEN=${{ secrets.TEST_TOKEN }} \
      apps/core-api/load-tests/main.js
```

## Best Practices

1. **Start small**: Begin with 10-20 users and gradually increase
2. **Monitor server**: Watch CPU, memory, DB connections during tests
3. **Test realistic scenarios**: Mix authentication and multi-tenant workloads
4. **Regular baselines**: Run tests regularly to detect performance regressions
5. **Isolate tests**: Run on dedicated test environment, not production
6. **Document results**: Keep records of performance trends

## References

- [k6 Documentation](https://k6.io/docs/)
- [k6 API Reference](https://k6.io/docs/javascript-api/)
- [Performance Testing Guide](https://k6.io/docs/test-types/)

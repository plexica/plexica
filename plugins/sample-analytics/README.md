# Sample Analytics Plugin

A demonstration plugin for the Plexica platform that showcases analytics and reporting capabilities.

## Features

- **User Activity Tracking**: Monitor user login/logout events and session duration
- **API Usage Analytics**: Track API request patterns and usage metrics
- **Custom Reports**: Generate analytics reports on demand
- **Dashboard**: Visual dashboard for analytics data
- **Configurable**: Flexible configuration for tracking, reporting intervals, and data retention

## Configuration

The plugin supports the following configuration options:

| Key                 | Type    | Required | Default | Description                        |
| ------------------- | ------- | -------- | ------- | ---------------------------------- |
| `apiKey`            | string  | Yes      | -       | Analytics service API key          |
| `trackingEnabled`   | boolean | No       | true    | Enable/disable tracking            |
| `reportingInterval` | number  | No       | 24      | Report generation interval (hours) |
| `dataRetentionDays` | number  | No       | 90      | Data retention period (days)       |

## Permissions

The plugin defines the following permissions:

- `analytics.read` - View analytics data and reports
- `analytics.write` - Generate and export reports
- `analytics.delete` - Delete analytics data

## Hooks

The plugin subscribes to the following system hooks:

- `user.login` - Tracks user login events
- `user.logout` - Tracks logout events and session duration
- `api.request` - Tracks API usage patterns

## API Endpoints

The plugin exposes the following REST endpoints:

- `GET /analytics/dashboard` - Get dashboard data
- `GET /analytics/reports` - List available reports
- `POST /analytics/reports` - Generate new report

## Frontend Routes

- `/analytics` - Analytics dashboard
- `/analytics/reports` - Reports list

## Installation

1. Register the plugin in the global registry:

```bash
curl -X POST http://localhost:3000/api/plugins \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SUPER_ADMIN_TOKEN>" \
  -d @plugin.json
```

2. Install for a tenant:

```bash
curl -X POST http://localhost:3000/api/tenants/{tenantId}/plugins/sample-analytics/install \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "configuration": {
      "apiKey": "test-api-key-12345",
      "trackingEnabled": true,
      "reportingInterval": 24,
      "dataRetentionDays": 90
    }
  }'
```

3. Activate the plugin:

```bash
curl -X POST http://localhost:3000/api/tenants/{tenantId}/plugins/sample-analytics/activate \
  -H "Authorization: Bearer <TOKEN>"
```

## Development

This is a sample plugin for demonstration purposes. In a production environment, you would:

1. Implement the actual hook handlers in `src/hooks.ts`
2. Build the frontend module with Module Federation
3. Add database migrations for analytics tables
4. Implement the REST API endpoints
5. Add comprehensive tests

## License

MIT

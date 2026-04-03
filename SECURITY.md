# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| main    | ✅ Yes    |

Only the `main` branch receives security fixes. No backport policy is in place
for earlier commits.

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities via public GitHub Issues.**

If you discover a security vulnerability, report it privately using
[GitHub Security Advisories](https://github.com/plexica/plexica/security/advisories/new).

You will receive a response within **72 hours** acknowledging your report.
We aim to release a fix within **14 days** for critical vulnerabilities.

Please include:

- A clear description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigations (optional)

---

## Security Model

Plexica is designed with tenant isolation as a primary security constraint:

- **Schema-per-tenant**: Each tenant's data is isolated in a separate PostgreSQL schema.
  Cross-tenant data access is considered a critical security incident.
- **Authentication**: All API endpoints require a valid Keycloak JWT unless explicitly
  marked as public in the route definition.
- **Input validation**: All external input is validated via Zod schemas before reaching
  business logic.
- **Secrets**: Never committed to the repository. Use environment variables only.
- **SQL**: Parameterised queries exclusively. String interpolation in SQL is prohibited.
- **PII**: Never appears in logs, error messages, or client-side error responses.

---

## Disclosure Policy

We follow a **coordinated disclosure** model:

1. Report received and acknowledged within 72 hours.
2. Maintainers validate and assess severity.
3. Fix developed privately.
4. Fix released and advisory published.
5. Reporter credited (unless anonymity is requested).

---

## Out of Scope

The following are **not** considered security issues:

- Vulnerabilities in third-party services (Keycloak, PostgreSQL, Redis, Redpanda).
  Report those to the respective upstream projects.
- Issues that require physical access to the server.
- Denial-of-service attacks against self-hosted instances without rate limiting configured.
- Social engineering attacks.

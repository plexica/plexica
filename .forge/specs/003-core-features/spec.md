# Spec 003: Core Features

**Phase**: 2 — Core Features
**Duration**: 4-5 weeks
**Status**: Draft
**Date**: March 2026

---

## Overview

Build the primary application features on top of the authenticated, tenant-
isolated foundation: workspace management with hierarchy, user invitation and
role assignment with ABAC-based authorization, and tenant-level settings
including branding and audit logging. After this phase the platform is usable
as a multi-tenant collaboration tool — before any plugin system exists.

## Dependencies

- **Spec 002** (Foundations) — multi-realm authentication, schema-per-tenant
  isolation, frontend shell with design system, auth store, data fetching
  pattern.

## Features

### 3.1 Workspace Management (2 weeks)

| ID     | Feature                                               | E2E Test                                                     |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------ |
| 003-01 | Workspace list                                        | User sees workspaces they have access to                     |
| 003-02 | Create workspace                                      | Tenant admin creates workspace, appears in list              |
| 003-03 | Workspace detail with navigation                      | User opens workspace, sees overview with sidebar navigation  |
| 003-04 | Workspace hierarchy (parent/child, materialized path) | Admin creates child workspace, parent→child navigation works |
| 003-05 | Workspace members                                     | Admin adds member, member sees the workspace                 |
| 003-06 | Workspace settings                                    | Admin modifies name/description, save works                  |
| 003-07 | Delete workspace                                      | Admin deletes workspace, no longer in list, children handled |
| 003-08 | Workspace templates                                   | Admin creates workspace from pre-defined template            |

### 3.2 Users, Roles & ABAC (2 weeks)

| ID     | Feature                     | E2E Test                                                           |
| ------ | --------------------------- | ------------------------------------------------------------------ |
| 003-09 | Tenant user list            | Tenant admin sees all users in their tenant                        |
| 003-10 | Invite user via email       | Admin invites user, email arrives (Mailpit), user accepts, logs in |
| 003-11 | RBAC role assignment        | Admin assigns role, user has correct permissions                   |
| 003-12 | ABAC workspace isolation    | User with role in workspace A cannot see data in workspace B       |
| 003-13 | ABAC condition tree         | ABAC policy evaluated: given context X, decision is Y              |
| 003-14 | ABAC decision logging       | Every ABAC evaluation logs input, rules, result (for debugging)    |
| 003-15 | Remove user                 | Admin removes user, user can no longer access                      |
| 003-16 | Basic user profile          | User views and edits their profile                                 |
| 003-17 | End-to-end permission check | Viewer can't create workspace, member can't manage users           |

### 3.3 Tenant Settings (1 week)

| ID     | Feature                                          | E2E Test                                                       |
| ------ | ------------------------------------------------ | -------------------------------------------------------------- |
| 003-18 | General settings page                            | Admin modifies tenant name, slug                               |
| 003-19 | Branding (logo, primary color, dark mode toggle) | Admin uploads logo, changes color, interface reflects branding |
| 003-20 | Audit log                                        | Admin views recent actions, filterable                         |
| 003-21 | Auth realm configuration (visibility)            | Admin sees auth options for their realm                        |

## Acceptance Criteria

1. A tenant admin can create, edit, and delete workspaces including nested
   child workspaces. Deleting a parent handles children gracefully (archive or
   cascade — configurable).
2. A tenant admin can invite a user by email. The invite email is delivered
   (verified via Mailpit in tests), and the invited user can accept, log in,
   and access exactly the workspaces they are assigned to.
3. RBAC roles are assignable per user per workspace. A viewer cannot create
   workspaces; a member cannot manage users — verified by negative-permission
   E2E tests.
4. ABAC policies enforce workspace-level data isolation: a user with access to
   workspace A receives 403/404 when attempting to access workspace B
   resources.
5. ABAC decision logging captures input context, evaluated rules, and the
   final allow/deny decision for every authorization check.
6. Tenant branding (logo, primary colour, dark mode) is configurable and
   reflected in the UI immediately after save.
7. Audit log displays recent tenant actions with filtering by action type,
   user, and date range.
8. Workspace templates allow one-click creation of a pre-configured workspace.
9. All of the above verified by Playwright E2E tests in CI.

## Non-Functional Requirements

| NFR    | Metric                                      | Target          |
| ------ | ------------------------------------------- | --------------- |
| NFR-01 | ABAC condition tree evaluation              | < 50ms (P95)    |
| NFR-02 | Workspace list API response                 | < 200ms (P95)   |
| NFR-03 | Audit log query (last 30 days, filtered)    | < 500ms (P95)   |
| NFR-04 | User invitation email delivery (Mailpit)    | < 5s            |
| NFR-05 | Materialized path depth support             | Up to 10 levels |
| NFR-06 | Concurrent ABAC evaluations (no contention) | 100 req/s       |
| NFR-07 | Branding asset upload (logo)                | < 2MB, < 3s     |

## Risks

| ID   | Risk                                                         | Impact | Mitigation                                                          |
| ---- | ------------------------------------------------------------ | ------ | ------------------------------------------------------------------- |
| R-01 | ABAC performance with deep workspace hierarchies             | HIGH   | Redis caching of flattened permission sets, benchmark at 10 levels  |
| R-02 | Materialized path corruption on workspace move/reparent      | HIGH   | Wrap reparent in transaction, recalculate all descendant paths      |
| R-03 | Keycloak user federation sync lag                            | MEDIUM | Webhook-based sync + periodic reconciliation job                    |
| R-04 | Email delivery reliability in CI (Mailpit flakiness)         | LOW    | Retry with polling, increase Playwright timeout for email checks    |
| R-05 | ABAC decision log volume in high-traffic tenants             | MEDIUM | Sampling at INFO level, full logging at DEBUG, TTL-based rotation   |
| R-06 | Workspace template schema evolution (templates become stale) | LOW    | Version templates, validate against current schema on instantiation |

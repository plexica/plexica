# Decision Log Archives — March 2026

> Archived from `.forge/knowledge/decision-log.md` on March 2, 2026.
> These entries are completed and no longer need to be in the active log.

---

## Closed Technical Debt Entries — March 2026

### TD-011: `requireRole` Missing from Auth Mock in 5 Unit Test Files (CLOSED 2026-03-02)

| Field        | Value                           |
| ------------ | ------------------------------- |
| **ID**       | TD-011                          |
| **Closed**   | 2026-03-02                      |
| **Impact**   | Quality                         |
| **Severity** | LOW                             |
| **Tracked**  | Spec 007 review fix, 2026-03-02 |

**Description**: `requireRole` was not exported from `vi.mock('../../middleware/auth.js')` in 5 unit test files. When RBAC was added to route `preHandler` options (Spec 007 HIGH #3), the auth mock in the following files did not include `requireRole`, causing 63 test failures:

- `core-services-flows.e2e.unit.test.ts`
- `jobs.routes.unit.test.ts`
- `notification.routes.unit.test.ts`
- `search.routes.unit.test.ts`
- `storage.routes.unit.test.ts`

**Resolution**: Fixed 2026-03-02 as part of Spec 007 review remediation. All 5 files updated with `requireRole: vi.fn(() => vi.fn(...))` in their `vi.mock('../../middleware/auth.js')` calls.

**Standing pattern**: Future route unit tests must include `requireRole: vi.fn(() => vi.fn(...))` in all `vi.mock('../../middleware/auth.js')` calls when routes use `preHandler` RBAC guards.

---

_Archived: March 2, 2026 — 1 entry moved from active decision log_

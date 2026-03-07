# User Journeys — Spec 012: Plugin Observability

> **Spec**: `.forge/specs/012-plugin-observability/spec.md`
> **Date**: 2026-03-07
> **Author**: forge-ux
> **Status**: Draft
> **FR Coverage**: FR-022 through FR-037 (dashboard FRs); US-005, US-006

---

## 1. Persona

### Persona: Platform Operator ("Sam")

| Field               | Value                                                                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role                | Super Admin / Platform Operator                                                                                                                                                  |
| Goal                | Keep all plugins healthy, respond to incidents fast, understand performance trends                                                                                               |
| Pain points         | 1. No visibility into plugin health until users complain. 2. Debugging cross-plugin failures requires SSH into containers. 3. No alerting — incidents are discovered reactively. |
| Tech literacy       | High — comfortable with PromQL, trace waterfalls, and log querying                                                                                                               |
| Device preference   | Desktop (1440px primary); occasionally checks alerts on tablet                                                                                                                   |
| Accessibility needs | None specific, but WCAG 2.1 AA required by Constitution Art. 1.3                                                                                                                 |
| Quote               | "I should know a plugin is degrading before any tenant notices."                                                                                                                 |

---

## 2. User Journeys

### Journey 1: Daily Health Check

**Trigger**: Sam opens the Super Admin panel during morning routine to check platform status.

**Steps**:

1. **Navigate to Observability** → Sam clicks "Observability" in the Super Admin sidebar. The Health tab loads as the default.
   - System feedback: Page renders within 2 seconds. Health table shows all ACTIVE plugins with status badges.

2. **Scan the health grid** → Sam visually scans the table for any non-green status badges. Each row shows: plugin name, status (Healthy/Degraded/Down), P95 latency, error rate, uptime, and last health check time.
   - System feedback: Rows with Degraded or Down status sort to the top. Auto-refresh indicator shows "Last updated: 30s ago".

3. **Spot a degraded plugin** → Sam sees the "CRM" plugin shows "Degraded" (yellow badge) with P95 latency of 680ms and error rate 3.2%.
   - System feedback: The P95 latency cell is highlighted in red text (>500ms threshold).

4. **Navigate to plugin metrics** → Sam clicks "View Metrics" on the CRM row (or clicks the plugin name). The Metrics tab opens, pre-filtered to the CRM plugin.
   - System feedback: Four charts render with the last 1 hour of data. The latency chart shows a P95 spike starting ~40 minutes ago.

5. **Adjust time range** → Sam changes the time range selector to "6h" to see if this is a trend or a spike.
   - System feedback: Charts re-render with 6-hour data. The spike started at 06:15 and is ongoing.

6. **Return to Health tab** → Sam is satisfied the issue is limited to one plugin and returns to Health to check the rest.
   - System feedback: All other plugins show "Healthy". Sam closes the dashboard.

**Outcome**: Sam identified a latency issue in the CRM plugin early, before any tenant reported problems. Sam can now decide whether to investigate further or wait for it to self-resolve.

**Emotional Map**:

- Step 1: 😐 Neutral — routine task
- Step 2: 😐 Neutral → 😟 Concerned — spots a non-green badge
- Step 3: 😟 Concerned — latency is above threshold
- Step 4: 🧐 Investigating — charts provide context
- Step 5: 🧐 Investigating — trend confirms it's a recent issue, not a long-standing problem
- Step 6: 😌 Reassured — issue is isolated to one plugin

**Edge Cases**:

- **Empty state**: No ACTIVE plugins exist. Health tab shows: "No active plugins. Plugins must be installed and activated before health data is available." with a link to the Plugins page.
- **Backend unavailable**: Prometheus is unreachable. Health tab shows an alert banner: "Unable to retrieve health data. The observability backend (Prometheus) is not responding. Plugin operations are unaffected." (per NFR-013 fail-open).
- **All plugins healthy**: Every row is green. No special treatment needed — the user sees a clean grid and moves on.

---

### Journey 2: Incident Response — Alert Investigation

**Trigger**: Sam receives a notification (or sees the alert count badge on the Observability nav item) that alerts are firing.

**Steps**:

1. **Navigate to Observability → Alerts tab** → Sam clicks the Observability sidebar item (which shows a badge count "2") and switches to the Alerts tab.
   - System feedback: Active Alerts section shows 2 alert cards, sorted by severity. A `critical` "PluginDown" alert for the Billing plugin is at the top. A `warning` "PluginHighErrorRate" alert for the Analytics plugin is below.

2. **Read the critical alert** → Sam reads the PluginDown card: severity "Critical", plugin "billing", description "Plugin container is unreachable (up == 0 for > 1 minute)", firing since "2 minutes ago".
   - System feedback: Alert card is visually prominent — red left border, red severity badge, bold plugin name.

3. **Navigate to plugin detail** → Sam clicks "View Plugin" on the Billing alert card. This navigates to the Metrics tab filtered to the Billing plugin.
   - System feedback: Metrics tab shows flat-lined charts (no data points in the last 2 minutes). A notice at the top: "This plugin's metrics target is currently down. Charts may show gaps."

4. **Check traces for the last working request** → Sam switches to the Traces tab and searches for `service=billing` in the last 1 hour. Sam wants to see if the last requests before the crash had errors.
   - System feedback: Trace list shows 3 recent traces with "Error" status badges just before the gap. Sam clicks one.

5. **Inspect trace detail** → The trace waterfall opens. Sam sees: `HTTP POST /api/v1/billing/invoice → core-api handler (12ms) → plugin-billing proxy (timeout after 5000ms) → ERROR`. The span shows a timeout error.
   - System feedback: Error spans are highlighted in red. The trace includes a "View in Grafana" deep-link for further investigation.

6. **Return to Alerts → Acknowledge** → Sam returns to the Alerts tab. The PluginDown alert is still firing (expected — plugin is still down). Sam has enough context to open an incident ticket.
   - System feedback: Alert History section below shows previous resolved alerts for reference.

**Outcome**: Sam diagnosed that the Billing plugin crashed due to request timeouts. The trace showed the exact failure point. Sam can now restart the plugin container or escalate.

**Emotional Map**:

- Step 1: 😰 Urgent — critical alert is firing
- Step 2: 😨 Alarmed — a plugin is completely down
- Step 3: 🧐 Investigating — charts confirm the outage
- Step 4: 🧐 Investigating — looking for root cause in traces
- Step 5: 💡 Insight — found the timeout error in the span tree
- Step 6: 😤 Action-oriented — has enough data to act

**Edge Cases**:

- **No active alerts**: Alerts tab shows: "No active alerts. All plugins are operating normally." The Alert History section still displays resolved alerts from the past 7 days.
- **Alert History empty**: "No resolved alerts in the last 7 days."
- **Prometheus Alertmanager unavailable**: Alert banner: "Unable to retrieve alerts. The alerting backend is not responding." Active alerts section shows error state; Alert History shows cached data if available, or the same error.

---

### Journey 3: Tracing a Slow Cross-Plugin Request

**Trigger**: A tenant reports that a specific operation (creating an invoice that triggers CRM and Billing plugins) is intermittently slow. Sam wants to find the bottleneck.

**Steps**:

1. **Navigate to Observability → Traces tab** → Sam opens the Traces tab.
   - System feedback: Search form with three inputs: Service/Plugin (dropdown), Trace ID (text), Time Range (date picker, default 1h).

2. **Search by time range and service** → Sam selects the time range covering the reported incident (last 6 hours). Sam does NOT filter by service — wants to see all cross-plugin traces.
   - System feedback: Trace list loads showing recent traces sorted by timestamp descending. Each row: Trace ID (truncated), root service, duration, span count, status.

3. **Sort by duration** → Sam clicks the "Duration" column header to sort traces by duration (descending) to find the slowest requests.
   - System feedback: The top trace shows `842ms` duration, 7 spans, root service `core-api`, status `OK`.

4. **Open the slow trace** → Sam clicks the 842ms trace row. The span waterfall opens.
   - System feedback: Hierarchical timeline shows:
     ```
     ├─ core-api: POST /api/v1/invoices (842ms)
     │  ├─ core-api: validate-input (3ms)
     │  ├─ plugin-billing: create-invoice (680ms) ← bottleneck
     │  │  ├─ plugin-billing: db-query (420ms)   ← root cause
     │  │  └─ plugin-billing: format-response (5ms)
     │  └─ plugin-crm: update-contact (45ms)
     └─ total: 842ms
     ```
   - Each span bar shows relative timing. The 420ms DB query in billing is visually obvious as the widest bar.

5. **Inspect the slow span** → Sam clicks on `plugin-billing: db-query (420ms)`. A detail panel shows span attributes: `db.statement: SELECT ...`, `db.duration_ms: 420`, `db.system: postgresql`.
   - System feedback: Span detail shows all attributes in a key-value table. A "View Logs" link opens correlated logs for this trace ID.

6. **Deep-link to Grafana** → For advanced analysis, Sam clicks "Open in Grafana" which opens the full Tempo trace view in a new browser tab.
   - System feedback: New tab opens Grafana at `http://localhost:3000/explore?traceId=<id>` with the full Tempo UI.

**Outcome**: Sam identified that the Billing plugin's database query is the bottleneck. The trace shows the exact query and duration. Sam can now file a performance issue for the plugin developer.

**Emotional Map**:

- Step 1: 😐 Neutral — familiar workflow
- Step 2: 😐 Neutral — searching
- Step 3: 🧐 Focused — found candidate trace
- Step 4: 💡 Insight — waterfall makes the bottleneck visually obvious
- Step 5: 💡 Detailed insight — knows the exact DB query
- Step 6: 😊 Satisfied — has all the data needed to file a ticket

**Edge Cases**:

- **No traces found**: Empty state: "No traces found for the selected time range. Ensure plugins are actively processing requests." (per Edge Case #13 in spec).
- **Trace ID search with no results**: "No trace found with ID `abc123`. The trace may have expired (retention: 7 days) or the ID may be incorrect."
- **Tempo unavailable**: Error banner: "Unable to search traces. The trace backend (Tempo) is not responding. Request processing is unaffected."
- **Very large trace (>100 spans)**: Waterfall renders with collapsed sub-trees. Sam can expand individual branches. A note shows "Showing 100 of 234 spans. Click 'Show All' to load full trace."

---

### Journey 4: Viewing Per-Plugin Resource Usage Trends

**Trigger**: Sam wants to understand resource consumption trends for the CRM plugin to decide whether to increase its container memory limit.

**Steps**:

1. **Navigate to Observability → Metrics tab** → Sam opens the Metrics tab.
   - System feedback: Plugin selector dropdown and time range selector visible. Default: "All Plugins" (aggregate), time range 1h.

2. **Select plugin** → Sam selects "CRM" from the plugin dropdown.
   - System feedback: Charts re-render with CRM-specific data. Four chart panels: Request Rate, Latency Distribution, Error Rate, Resource Usage.

3. **Focus on Resource Usage chart** → Sam looks at the bottom-right chart: Memory (left axis, bytes) and CPU (right axis, percentage). The memory line shows a steady upward trend.
   - System feedback: The chart has a tooltip showing exact values on hover. The Y-axis auto-scales to the data range.

4. **Change time range to 7 days** → Sam selects "7d" to see the weekly trend.
   - System feedback: Charts re-render with 7-day data at lower resolution (larger step interval). The memory line shows a clear upward slope over the week — a potential memory leak.

5. **Compare with another plugin** → Sam changes the plugin selector to "Analytics" to see if the trend is platform-wide or plugin-specific.
   - System feedback: Analytics plugin shows flat memory usage — the trend is CRM-specific.

6. **Return to CRM and check P95 latency correlation** → Sam re-selects CRM and compares the latency chart with the resource usage chart. P95 latency is increasing in step with memory usage.
   - System feedback: Both charts share the same X-axis (time), making visual correlation easy.

**Outcome**: Sam has evidence that the CRM plugin has a memory leak causing latency degradation. Sam can file a ticket for the plugin developer with 7-day trend data.

**Emotional Map**:

- Step 1: 😐 Neutral — routine investigation
- Step 2: 😐 Neutral — selecting the plugin
- Step 3: 🧐 Concerned — sees upward memory trend
- Step 4: 😟 Confirmed — 7-day trend shows it's a real leak, not a spike
- Step 5: 🧐 Ruling out — not a platform-wide issue
- Step 6: 💡 Correlated — latency and memory are linked

**Edge Cases**:

- **No metrics data for a plugin**: Charts show empty state: "No metrics data available for this plugin in the selected time range. Metrics collection starts when the plugin becomes ACTIVE."
- **Plugin just activated (< 1 hour of data)**: Charts show a short line. Time range options longer than the available data show: "Data available for the last 45 minutes only."
- **Extremely high cardinality (chart performance)**: Charts aggregate data server-side via PromQL `step` parameter. The frontend never receives >500 data points per series (per NFR-018 page load target).

---

## 3. Journey Summary Matrix

| Journey                   | Tabs Used                 | Key FR Coverage                        | Primary Emotion     |
| ------------------------- | ------------------------- | -------------------------------------- | ------------------- |
| J1: Daily Health Check    | Health → Metrics          | FR-025, FR-026, FR-027, FR-028         | Concern → Reassured |
| J2: Alert Investigation   | Alerts → Metrics → Traces | FR-022, FR-029, FR-030, FR-031, FR-032 | Urgency → Action    |
| J3: Slow Request Tracing  | Traces                    | FR-029, FR-030, FR-031                 | Focused → Insight   |
| J4: Resource Usage Trends | Metrics                   | FR-027, FR-028                         | Concern → Evidence  |

---

## 4. Cross-Tab Navigation Patterns

The four journeys reveal these common cross-tab navigation flows:

```
Health → Metrics       (click plugin name or "View Metrics" button)
Alerts → Metrics       (click "View Plugin" on alert card)
Alerts → Traces        (investigate what happened before an alert)
Traces → Grafana       (deep-link for advanced trace exploration)
Metrics → (any tab)    (plugin selector persists across tabs)
```

**Design implication**: The plugin context (selected plugin ID) should persist when switching between tabs. If Sam selects "CRM" on the Health tab and navigates to Metrics, the Metrics tab should pre-select CRM in the plugin dropdown.

---

_End of user-journey.md_

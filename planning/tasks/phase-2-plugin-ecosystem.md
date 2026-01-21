# Phase 2 - Plugin Ecosystem

# Detailed Task Breakdown

**Phase Duration**: Q2-Q3 2026 (26 weeks)  
**Status**: 🔴 Not Started  
**Prerequisites**: Phase 1 MVP Complete (94% - M2.3 Testing ongoing)  
**Team Size**: 5-7 developers (2 Backend, 2 Frontend, 1 DevOps, 1 QA, 1 Tech Lead)

---

## Dependencies & Risks

### Critical Dependencies

#### External Dependencies

```
Phase 1 MVP → Must be 100% complete
├─ M2.3 (Testing & Deployment) → 100%
└─ M2.4 (Workspaces) → 100%

Infrastructure
├─ Kubernetes cluster access (Week 17)
├─ Container registry (Docker Hub or private)
├─ CDN provider (CloudFront, Cloudflare, or similar)
└─ SSL certificates for production

Third-Party Services
├─ Stripe account for billing plugin
├─ ClamAV for virus scanning
└─ (Optional) Snyk for security scanning
```

#### Internal Dependencies

```
M2.1 (Event System)
└─ Blocks: M2.3, M2.6

M2.2 (Module Federation)
└─ Blocks: M2.4, M2.6

M2.3 (Plugin Communication)
└─ Blocks: M2.4, M2.6

M2.4 (Plugin Registry)
└─ Blocks: M2.6

M2.5 (Kubernetes)
└─ Can run in parallel with M2.1-M2.4
└─ Must complete before production deployment
```

### Risk Matrix

| Risk                                 | Probability | Impact   | Mitigation                                                                 |
| ------------------------------------ | ----------- | -------- | -------------------------------------------------------------------------- |
| **Redpanda complexity**              | Medium      | High     | Start with simple setup, scale later. Have Kafka fallback plan.            |
| **Module Federation learning curve** | High        | Medium   | Allocate extra time for R&D (Week 5). Use official examples.               |
| **K8s operator development**         | Medium      | High     | Use Kubebuilder framework. Extensive testing. Fallback: manual deployment. |
| **Plugin marketplace adoption**      | Medium      | Medium   | Focus on UX. Provide excellent documentation. Seed with quality plugins.   |
| **Performance at scale**             | Low         | High     | Load test early and often. Optimize before production.                     |
| **Security vulnerabilities**         | Medium      | Critical | Implement scanning. Security review per milestone. Bug bounty program.     |
| **Team capacity**                    | Medium      | High     | Hire early if needed. Cross-train team members. Prioritize ruthlessly.     |
| **Third-party integrations**         | Low         | Medium   | Have mock implementations for testing. Document integration steps.         |

### Risk Mitigation Strategies

#### Technical Risks

**Event System Complexity**:

- Start with simple Redpanda setup (single-node dev, multi-node prod)
- Extensive testing with different failure scenarios
- Document common issues and solutions
- Have Kafka fallback option

**Module Federation Challenges**:

- Allocate 2 weeks for R&D and prototyping (already in plan)
- Use webpack/vite official plugins
- Reference implementation before full rollout
- Fallback: Static plugin compilation

**Kubernetes Learning Curve**:

- DevOps team training (pre-Phase 2)
- Use managed Kubernetes (EKS, GKE, AKS) initially
- Leverage Helm charts from community
- Fallback: Enhanced Docker Compose for staging

#### Organizational Risks

**Team Capacity**:

- Hire additional developers if needed (by Week 10)
- Cross-train team members on critical areas
- Outsource non-critical tasks (documentation, testing)
- Adjust timeline if needed (built-in buffer)

**Scope Creep**:

- Strict milestone acceptance criteria
- Change control process
- Weekly planning reviews
- Phase 3 features parked in backlog

#### Business Risks

**Plugin Adoption**:

- Focus on developer experience
- Comprehensive documentation and examples
- Active community support (Discord, forums)
- Incentivize early plugin developers

**Performance Issues**:

- Load testing every milestone
- Performance budgets
- Monitoring from day one
- Optimization sprints if needed

### Contingency Plans

#### If M2.1 (Events) Delayed:

- Plugins can still work without events (REST only)
- Implement event system in Phase 3
- Focus on synchronous communication patterns

#### If M2.2 (Module Federation) Blocked:

- Use iframe-based plugin loading (temporary)
- Static plugin compilation
- Defer dynamic loading to Phase 3

#### If M2.5 (Kubernetes) Too Complex:

- Use enhanced Docker Compose for production
- Implement K8s in Phase 3
- Focus on Docker Swarm as alternative

#### If Timeline Slips:

- Prioritize: M2.1, M2.2, M2.4 (core functionality)
- Defer: M2.5 (K8s) to Phase 3
- Reduce scope: M2.6 (2 plugins instead of 3)

---

## Phase 2 Summary

### Timeline Overview

```
Week 1-4:   M2.1 - Event System ✅ (Critical Path)
Week 5-8:   M2.2 - Module Federation ✅ (Critical Path)
Week 9-12:  M2.3 - Plugin Communication ✅ (Critical Path)
Week 13-16: M2.4 - Plugin Registry & Marketplace ✅ (Critical Path)
Week 17-20: M2.5 - Kubernetes Deployment (Parallel)
Week 21-26: M2.6 - Official Plugins

Total: 26 weeks (6.5 months)
```

### Resource Allocation

**Team Composition**:

```
Backend Developers (2)
├─ M2.1: Event System (both)
├─ M2.3: Plugin Communication (both)
├─ M2.4: Registry API (1)
└─ M2.6: Plugin backends (split)

Frontend Developers (2)
├─ M2.2: Module Federation (both)
├─ M2.4: Marketplace UI (both)
└─ M2.6: Plugin frontends (split)

DevOps Engineer (1)
├─ M2.1: Redpanda setup
├─ M2.2: CDN setup
├─ M2.5: Kubernetes (full-time)
└─ Support: CI/CD throughout

QA Engineer (1)
├─ Test planning each milestone
├─ E2E tests
├─ Load testing
└─ Security testing

Tech Lead (1)
├─ Architecture decisions
├─ Code reviews
├─ Risk management
└─ Stakeholder communication
```

### Estimated Costs

**Development**:

- 5 developers × 26 weeks × 40h = 5,200 hours
- Average rate: $80/hour (blended)
- **Total: $416,000**

**Infrastructure** (monthly):

- Kubernetes cluster (3 masters, 5 workers): $2,000
- Container registry (private): $50
- CDN: $200
- Monitoring (Prometheus, Grafana): included
- **Monthly: $2,250** × 6 months = **$13,500**

**Third-Party Services** (one-time + monthly):

- SSL certificates: $200/year
- Stripe integration: free (transaction fees only)
- ClamAV: open-source
- **Total: $200**

**Training & Misc**:

- Kubernetes certification: $2,000
- Conference/workshops: $3,000
- **Total: $5,000**

**Grand Total: ~$435,000** (development + infrastructure + misc)

### Success Metrics

**By End of Phase 2**:

- [x] **10+ plugins** available in marketplace
- [x] **Plugin install** < 60s
- [x] **Event delivery** < 100ms p95
- [x] **Production K8s** deployment ready
- [x] **Zero-downtime** plugin updates
- [x] **100+ concurrent** plugin instances supported
- [x] **Developer satisfaction** > 8/10 (survey)
- [x] **Plugin SDK downloads** > 500
- [x] **Marketplace visits** > 1,000/month

### Key Deliverables

**Infrastructure**:

- ✅ Redpanda event streaming platform
- ✅ Module Federation infrastructure
- ✅ Service discovery system
- ✅ Plugin registry API
- ✅ Kubernetes cluster with Helm charts
- ✅ CI/CD pipelines

**SDK & Tools**:

- ✅ Enhanced Plugin SDK v0.3.0
- ✅ plexica-cli with build/publish commands
- ✅ Plugin templates
- ✅ Developer documentation

**Applications**:

- ✅ Marketplace UI (Super Admin + Tenant)
- ✅ Plugin management UI
- ✅ 3 official plugins (CRM, Billing, Analytics)

**Documentation**:

- ✅ Plugin Developer Guide (100+ pages)
- ✅ Event system architecture
- ✅ Module Federation guide
- ✅ Kubernetes deployment guide
- ✅ API reference documentation

### Next Steps After Phase 2

**Immediate (Week 27)**:

- Beta launch of marketplace
- Onboard early plugin developers
- Collect feedback
- Bug fixes and optimizations

**Phase 3 Planning (Weeks 27-30)**:

- Advanced features roadmap
- ABAC policy engine design
- Advanced theming system
- Complete i18n system
- Core services (Storage, Notifications, Search)

**Community Building**:

- Plugin developer community (Discord)
- Monthly plugin showcase
- Developer office hours
- Plugin of the month program

---

## Appendix

### Tools & Technologies Reference

**Backend**:

- Redpanda: Event streaming (Kafka-compatible)
- KafkaJS: Kafka client for Node.js
- Kubernetes: Container orchestration
- Helm: Kubernetes package manager
- ArgoCD: GitOps continuous delivery

**Frontend**:

- Module Federation: Dynamic plugin loading
- @originjs/vite-plugin-federation: Vite Module Federation plugin
- TanStack Router: Routing with code-splitting

**DevOps**:

- Docker: Containerization
- GitHub Actions: CI/CD
- Prometheus: Metrics
- Grafana: Dashboards
- Velero: Kubernetes backup

**Development**:

- Vitest: Testing framework
- Playwright: E2E testing
- k6: Load testing
- Chaos Mesh: Chaos engineering

### Related Documentation

- `specs/PLUGIN_STRATEGY.md` - Plugin architecture
- `specs/TECHNICAL_SPECIFICATIONS.md` - Technical details
- `planning/ROADMAP.md` - Overall roadmap
- `planning/MILESTONES.md` - Milestone tracking
- `apps/core-api/README.md` - Core API documentation
- `packages/sdk/README.md` - Plugin SDK documentation

---

_Plexica Phase 2 Plan v1.0_  
_Created: January 21, 2026_  
_Status: Planning Complete - Ready for Execution_  
_Team: Plexica Engineering_

**Duration**: 4 weeks (Weeks 17-20)  
**Owner**: DevOps Team  
**Priority**: 🔥 Critical  
**Estimated Hours**: 160h  
**Dependencies**: M2.1-M2.4 Complete

### Objectives

- Create Helm charts for all services
- Implement Kubernetes manifests
- Automate plugin deployment on K8s
- Configure production-ready infrastructure
- Implement auto-scaling and HA

### Week 17: Helm Charts Foundation (40h)

#### Core Services Helm Charts (24h)

**Tasks**:

```
[ ] Helm chart structure (4h)
    [ ] Create helm/ directory
    [ ] Chart.yaml for each service
    [ ] values.yaml templates
    [ ] Common helpers (_helpers.tpl)

[ ] Core API Helm chart (8h)
    [ ] helm/core-api/
        [ ] Deployment with 3+ replicas
        [ ] HorizontalPodAutoscaler (HPA)
            - Min: 3, Max: 10
            - CPU target: 70%
            - Memory target: 80%
        [ ] Service (ClusterIP)
        [ ] ConfigMap for config
        [ ] Secret for sensitive data
        [ ] PodDisruptionBudget (min 2 available)
        [ ] Resource limits:
            requests: { cpu: 500m, memory: 512Mi }
            limits: { cpu: 2000m, memory: 2Gi }
        [ ] Health checks (liveness, readiness)
        [ ] Affinity rules (spread across nodes)

[ ] PostgreSQL Helm chart (6h)
    [ ] helm/postgresql/
        [ ] StatefulSet for HA (3 replicas)
        [ ] PersistentVolumeClaim (100Gi)
        [ ] Service (headless + ClusterIP)
        [ ] Backup CronJob
        [ ] Resource limits
        [ ] Connection pooling (PgBouncer)

[ ] Redis Helm chart (6h)
    [ ] helm/redis/
        [ ] StatefulSet (3-node cluster)
        [ ] Sentinel for failover
        [ ] Service
        [ ] PersistentVolumeClaim
        [ ] Resource limits
```

**Deliverables**:

- ✅ Helm charts for core services
- ✅ HPA configured
- ✅ Resource limits defined
- ✅ HA setup

#### Supporting Services Helm Charts (16h)

**Tasks**:

```
[ ] Redpanda Helm chart (6h)
    [ ] helm/redpanda/
        [ ] StatefulSet (3 brokers)
        [ ] PersistentVolumeClaim per broker
        [ ] Service (internal + external)
        [ ] Resource limits
        [ ] Rack awareness

[ ] Keycloak Helm chart (4h)
    [ ] helm/keycloak/
        [ ] Deployment (2 replicas)
        [ ] Database integration
        [ ] Ingress configuration
        [ ] Resource limits

[ ] MinIO Helm chart (4h)
    [ ] helm/minio/
        [ ] StatefulSet (4 servers, distributed mode)
        [ ] PersistentVolumeClaim
        [ ] Service
        [ ] Erasure coding configuration

[ ] Nginx Ingress Controller (2h)
    [ ] helm/ingress-nginx/
        [ ] DaemonSet or Deployment
        [ ] TLS termination
        [ ] Rate limiting
        [ ] CORS configuration
```

**Deliverables**:

- ✅ Helm charts for all infrastructure
- ✅ HA configurations
- ✅ Ingress setup
- ✅ TLS support

### Week 18: Plugin Deployment Automation (40h)

#### Plugin Deployment System (24h)

**Tasks**:

```
[ ] Plugin K8s operator (16h)
    [ ] apps/k8s-operator/
        [ ] Custom Resource Definition (CRD):
            apiVersion: plexica.io/v1
            kind: Plugin
            spec:
              pluginId: string
              version: string
              tenantId: string
              enabled: boolean
              replicas: number
              resources: object
              configuration: object
        [ ] Operator controller (~500 lines)
            - Watch Plugin resources
            - Create Deployment for plugin
            - Create Service for plugin
            - Create ConfigMap for config
            - Update status
            - Handle deletion
        [ ] Reconciliation loop
        [ ] Status reporting
    [ ] Dockerfile for operator
    [ ] Helm chart for operator

[ ] Plugin deployment templates (8h)
    [ ] Deployment template for plugins
    [ ] Service template (ClusterIP)
    [ ] ConfigMap template
    [ ] Secret template
    [ ] NetworkPolicy (isolation)
    [ ] ResourceQuota per plugin
    [ ] Dynamic resource allocation
```

**Deliverables**:

- ✅ K8s operator for plugins
- ✅ CRD for Plugin resource
- ✅ Deployment automation
- ✅ Status reporting

#### Plugin Lifecycle on K8s (16h)

**Tasks**:

```
[ ] Installation flow (8h)
    [ ] Pull Docker image from registry
    [ ] Create K8s resources via operator
    [ ] Wait for pod ready
    [ ] Run plugin migrations (K8s Job)
    [ ] Register in service discovery
    [ ] Update plugin status (ACTIVE)

[ ] Update flow (4h)
    [ ] Rolling update strategy
    [ ] Zero-downtime deployment
    [ ] Automatic rollback on failure
    [ ] Version tracking

[ ] Uninstallation flow (4h)
    [ ] Drain traffic gracefully
    [ ] Delete K8s resources
    [ ] Cleanup data (optional)
    [ ] Deregister from service discovery
```

**Deliverables**:

- ✅ Automated plugin lifecycle
- ✅ Rolling updates
- ✅ Graceful shutdown
- ✅ Rollback support

### Week 19: Production Infrastructure (40h)

#### Cluster Setup & Configuration (20h)

**Tasks**:

```
[ ] Kubernetes cluster setup (8h)
    [ ] Multi-node cluster (3+ master, 5+ worker)
    [ ] Node pools:
        - System pool (control plane, monitoring)
        - Application pool (core services)
        - Plugin pool (plugin workloads)
    [ ] Cluster autoscaler
    [ ] Network configuration (CNI: Calico or Cilium)
    [ ] Storage classes (SSD, HDD)
    [ ] Namespace strategy:
        - plexica-system
        - plexica-core
        - plexica-plugins
        - plexica-monitoring

[ ] Security & RBAC (8h)
    [ ] Service accounts per service
    [ ] RBAC roles and bindings
    [ ] Pod security policies
    [ ] Network policies (default deny)
    [ ] Secret management (sealed secrets or Vault)
    [ ] Image pull secrets

[ ] Monitoring setup (4h)
    [ ] Prometheus operator
    [ ] Grafana dashboards
    [ ] Alertmanager rules
    [ ] Service monitors
```

**Deliverables**:

- ✅ Production K8s cluster
- ✅ Security hardened
- ✅ Monitoring configured
- ✅ Namespaces organized

#### CI/CD Pipeline (20h)

**Tasks**:

```
[ ] GitHub Actions for K8s (12h)
    [ ] .github/workflows/deploy-production.yml
        [ ] Build Docker images
        [ ] Push to container registry
        [ ] Update Helm charts
        [ ] Deploy to K8s via kubectl/Helm
        [ ] Run smoke tests
        [ ] Notify on success/failure
    [ ] Environment-specific workflows:
        - deploy-staging.yml
        - deploy-production.yml
    [ ] Secrets management in CI
    [ ] Deployment approvals for production

[ ] ArgoCD setup (8h)
    [ ] GitOps deployment model
    [ ] ArgoCD installation
    [ ] Application definitions
    [ ] Auto-sync policies
    [ ] Rollback capabilities
    [ ] UI for deployment visibility
```

**Deliverables**:

- ✅ CI/CD pipeline for K8s
- ✅ ArgoCD for GitOps
- ✅ Automated deployments
- ✅ Rollback support

### Week 20: Scaling, HA & Testing (40h)

#### Auto-Scaling Configuration (16h)

**Tasks**:

```
[ ] Horizontal Pod Autoscaler (8h)
    [ ] HPA for core-api (CPU + custom metrics)
    [ ] HPA for plugins (per-plugin)
    [ ] Custom metrics (request rate, queue depth)
    [ ] Scale-up/down policies
    [ ] Min/max replica limits

[ ] Cluster Autoscaler (4h)
    [ ] Node pool auto-scaling
    [ ] Scale-up triggers
    [ ] Scale-down policies
    [ ] Node affinity for plugins

[ ] Vertical Pod Autoscaler (4h)
    [ ] VPA for resource optimization
    [ ] Recommendation mode
    [ ] Auto-update mode (carefully)
```

**Deliverables**:

- ✅ HPA configured for all services
- ✅ Cluster autoscaler operational
- ✅ VPA recommendations
- ✅ Scaling policies documented

#### High Availability & Disaster Recovery (12h)

**Tasks**:

```
[ ] HA configuration (6h)
    [ ] Multi-zone deployment
    [ ] Database replication (Postgres)
    [ ] Redis Sentinel for cache HA
    [ ] Redpanda multi-broker
    [ ] Load balancing across zones
    [ ] PodDisruptionBudgets for all services

[ ] Backup & Restore (6h)
    [ ] Velero for cluster backups
    [ ] Database backup CronJobs
    [ ] S3 backup storage
    [ ] Restore testing procedure
    [ ] Disaster recovery runbook
```

**Deliverables**:

- ✅ Multi-zone HA setup
- ✅ Backup automation
- ✅ Restore procedures
- ✅ DR runbook

#### Load Testing & Validation (12h)

**Tasks**:

```
[ ] Load testing on K8s (8h)
    [ ] k6 load test scripts
    [ ] Simulate 1000 concurrent users
    [ ] Test plugin auto-scaling
    [ ] Test database failover
    [ ] Test cache failover
    [ ] Measure:
        - Request latency (p50, p95, p99)
        - Throughput (req/s)
        - Error rate
        - Resource utilization

[ ] Chaos engineering (4h)
    [ ] Chaos Mesh installation
    [ ] Pod kill experiments
    [ ] Network latency injection
    [ ] Validate auto-recovery
```

**Deliverables**:

- ✅ Load test results
- ✅ Chaos test reports
- ✅ Performance benchmarks
- ✅ Scaling validated

### Milestone 2.5 Completion Criteria

**Functionality**:

- [x] All services deployed on K8s
- [x] Plugin operator functional
- [x] Auto-scaling working
- [x] HA configured and tested
- [x] CI/CD pipeline operational

**Performance**:

- [x] Support 100+ concurrent plugin instances
- [x] Auto-scale from 3 to 10 replicas in < 2 min
- [x] Zero downtime during deployments
- [x] RTO < 5 minutes, RPO < 1 hour

**Quality**:

- [x] Load tests pass (1000 concurrent users)
- [x] Chaos tests pass
- [x] Backup/restore tested
- [x] Documentation complete

**Deliverables**:

- ✅ Helm charts for all services
- ✅ K8s operator for plugins
- ✅ Production K8s cluster configuration
- ✅ CI/CD pipeline with ArgoCD
- ✅ Monitoring and alerting
- ✅ HA and DR setup
- ✅ Deployment documentation

---

## Milestone 2.6 - Official Plugins

**Duration**: 6 weeks (Weeks 21-26)  
**Owner**: Full Stack Team  
**Priority**: ⭐ High  
**Estimated Hours**: 240h  
**Dependencies**: M2.1-M2.5 Complete

### Objectives

- Develop 3 production-quality official plugins
- Create comprehensive plugin developer documentation
- Establish plugin development best practices
- Provide plugin templates and examples

### Week 21-22: CRM Plugin (80h)

#### Backend Implementation (40h)

**Tasks**:

```
[ ] Database schema (8h)
    [ ] Models:
        - Contact (name, email, phone, company, tags, customFields)
        - Company (name, industry, size, address, contacts[])
        - Deal (title, value, stage, probability, contact, company)
        - Activity (type, subject, description, contact, company, dueDate)
        - Tag (name, color)
    [ ] Relationships and indexes
    [ ] Migrations

[ ] CRM Service layer (24h)
    [ ] ContactService (~300 lines)
    [ ] CompanyService (~250 lines)
    [ ] DealService (~280 lines)
    [ ] ActivityService (~200 lines)
    [ ] Full CRUD + search
    [ ] Custom fields support
    [ ] Import/export (CSV, vCard)

[ ] CRM API (8h)
    [ ] 20+ REST endpoints
    [ ] Bulk operations
    [ ] Advanced filtering
    [ ] Pagination and sorting
```

**Deliverables**:

- ✅ CRM backend service
- ✅ Database schema
- ✅ API endpoints
- ✅ Import/export

#### Frontend Implementation (32h)

**Tasks**:

```
[ ] CRM pages (24h)
    [ ] ContactListPage (~400 lines)
        - Grid/List view toggle
        - Advanced filters
        - Bulk actions
        - Quick create
    [ ] ContactDetailPage (~350 lines)
        - Contact info
        - Activity timeline
        - Associated deals
        - Notes and files
    [ ] CompanyListPage (~350 lines)
    [ ] CompanyDetailPage (~300 lines)
    [ ] DealPipelinePage (~450 lines)
        - Kanban view
        - Drag & drop
        - Deal details modal
    [ ] ActivityCalendarPage (~300 lines)

[ ] CRM components (8h)
    [ ] ContactCard
    [ ] DealCard
    [ ] ActivityTimeline
    [ ] QuickCreateForm
    [ ] ImportWizard
```

**Deliverables**:

- ✅ Complete CRM frontend
- ✅ 6 main pages
- ✅ Responsive design
- ✅ Production-ready UI

#### Testing & Documentation (8h)

**Tasks**:

```
[ ] Testing (4h)
    [ ] Unit tests
    [ ] Integration tests
    [ ] E2E tests

[ ] Documentation (4h)
    [ ] User guide
    [ ] API documentation
    [ ] Developer notes
```

### Week 23-24: Billing Plugin (80h)

#### Backend Implementation (40h)

**Tasks**:

```
[ ] Database schema (8h)
    [ ] Models:
        - Customer (contact info, billing address, payment methods)
        - Product (name, description, price, recurring)
        - Subscription (customer, product, status, billing cycle)
        - Invoice (customer, items, total, status, dueDate)
        - Payment (invoice, amount, method, status, transactionId)
        - PaymentMethod (type, details, default)
    [ ] Indexes and relationships

[ ] Billing Service layer (24h)
    [ ] SubscriptionService (~350 lines)
        - Create subscription
        - Cancel/pause/resume
        - Upgrade/downgrade
        - Prorated billing
    [ ] InvoiceService (~300 lines)
        - Generate invoices
        - Send reminders
        - Mark paid/unpaid
    [ ] PaymentService (~280 lines)
        - Process payment
        - Refund
        - Payment methods CRUD
    [ ] Stripe integration
    [ ] PayPal integration (optional)

[ ] Billing API (8h)
    [ ] 25+ REST endpoints
    [ ] Webhook handlers (Stripe)
    [ ] Reporting endpoints
```

**Deliverables**:

- ✅ Billing backend service
- ✅ Payment gateway integration
- ✅ Subscription management
- ✅ Invoice generation

#### Frontend Implementation (32h)

**Tasks**:

```
[ ] Billing pages (24h)
    [ ] SubscriptionListPage (~350 lines)
    [ ] SubscriptionDetailPage (~300 lines)
    [ ] InvoiceListPage (~320 lines)
    [ ] InvoiceDetailPage (~280 lines)
    [ ] PaymentMethodsPage (~250 lines)
    [ ] BillingReportsPage (~400 lines)
        - Revenue charts
        - MRR/ARR tracking
        - Churn analysis

[ ] Billing components (8h)
    [ ] SubscriptionCard
    [ ] InvoiceCard
    [ ] PaymentForm
    [ ] PricingTable
    [ ] RevenueChart
```

**Deliverables**:

- ✅ Complete billing frontend
- ✅ Payment forms
- ✅ Reporting dashboard
- ✅ Responsive design

#### Testing & Documentation (8h)

### Week 25-26: Analytics Plugin (80h)

#### Backend Implementation (40h)

**Tasks**:

```
[ ] Database schema (8h)
    [ ] Models:
        - Metric (name, value, timestamp, dimensions)
        - Dashboard (name, widgets, layout)
        - Report (name, query, schedule)
        - Alert (name, condition, notification)
    [ ] Time-series optimized tables
    [ ] Data aggregation tables

[ ] Analytics Service layer (24h)
    [ ] MetricCollectionService (~250 lines)
        - Collect metrics via events
        - Batch processing
        - Data aggregation
    [ ] QueryService (~300 lines)
        - SQL query builder
        - Time-series queries
        - Aggregations (sum, avg, count, etc.)
    [ ] DashboardService (~200 lines)
    [ ] ReportService (~220 lines)
        - Scheduled reports
        - Export (PDF, CSV, Excel)

[ ] Analytics API (8h)
    [ ] 20+ REST endpoints
    [ ] WebSocket for real-time updates
    [ ] Export endpoints
```

**Deliverables**:

- ✅ Analytics backend service
- ✅ Metric collection
- ✅ Query engine
- ✅ Reporting system

#### Frontend Implementation (32h)

**Tasks**:

```
[ ] Analytics pages (24h)
    [ ] DashboardPage (~500 lines)
        - Widget grid (drag & drop)
        - Chart widgets (line, bar, pie, etc.)
        - Metric widgets
        - Real-time updates
    [ ] ReportBuilderPage (~450 lines)
        - Query builder UI
        - Preview
        - Schedule configuration
    [ ] ReportListPage (~250 lines)
    [ ] MetricsExplorerPage (~400 lines)
        - Metric search
        - Custom queries
        - Visualizations

[ ] Analytics components (8h)
    [ ] ChartWidget (multiple types)
    [ ] MetricCard
    [ ] QueryBuilder
    [ ] DateRangePicker
    [ ] ExportButton
```

**Deliverables**:

- ✅ Complete analytics frontend
- ✅ Interactive dashboards
- ✅ Report builder
- ✅ Real-time updates

#### Testing & Documentation (8h)

### Plugin Developer Documentation (Week 26)

**Tasks**:

```
[ ] Comprehensive plugin guide (20h)
    [ ] Getting started tutorial
    [ ] Architecture overview
    [ ] Backend development guide
    [ ] Frontend development guide
    [ ] Event-driven patterns
    [ ] API design best practices
    [ ] Testing strategies
    [ ] Deployment guide
    [ ] Security considerations
    [ ] Performance optimization

[ ] Plugin templates (12h)
    [ ] Backend template with examples
    [ ] Frontend template with examples
    [ ] Full-stack plugin template
    [ ] Minimal plugin template
    [ ] CLI scaffolding command

[ ] Example plugins (8h)
    [ ] Hello World plugin
    [ ] Todo app plugin
    [ ] Weather widget plugin
    [ ] Integration plugin example
```

**Deliverables**:

- ✅ Plugin developer guide (100+ pages)
- ✅ Plugin templates
- ✅ Example plugins
- ✅ Best practices document

### Milestone 2.6 Completion Criteria

**Functionality**:

- [x] 3 official plugins complete (CRM, Billing, Analytics)
- [x] All plugins published to marketplace
- [x] Plugin developer documentation complete
- [x] Plugin templates available

**Quality**:

- [x] Test coverage > 80% per plugin
- [x] E2E tests for all plugins
- [x] User documentation complete
- [x] API documentation complete

**Performance**:

- [x] Plugin load time < 3s
- [x] API response time < 200ms p95
- [x] Real-time updates < 100ms latency

**Deliverables**:

- ✅ CRM Plugin (production-ready)
- ✅ Billing Plugin (production-ready)
- ✅ Analytics Plugin (production-ready)
- ✅ Plugin Developer Guide
- ✅ Plugin Templates
- ✅ Example Plugins
- ✅ Video tutorials (optional)

---

**Duration**: 4 weeks (Weeks 13-16)  
**Owner**: Full Stack Team  
**Priority**: ⭐ High  
**Estimated Hours**: 160h  
**Dependencies**: M2.2 (Module Federation), M2.3 (Plugin Communication)

### Objectives

- Build comprehensive plugin registry API
- Implement plugin publishing workflow
- Create marketplace UI (Super Admin + Tenant)
- Add plugin versioning system
- Enable plugin installation from registry

### Week 13: Registry API & Database (40h)

#### Registry Data Model (16h)

**Tasks**:

```
[ ] Database schema for registry (8h)
    [ ] Core schema models:
        Model PluginRegistry {
          id: UUID
          pluginId: String @unique
          name: String
          description: String
          category: String
          author: String
          authorEmail: String
          authorUrl: String?
          repositoryUrl: String?
          licenseType: String
          pricing: JSON
          featured: Boolean
          verified: Boolean
          downloadCount: Int
          rating: Float
          reviewCount: Int
          tags: String[]
          createdAt: DateTime
          updatedAt: DateTime
          versions: PluginVersion[]
        }

        Model PluginVersion {
          id: UUID
          registryId: UUID
          version: String
          releaseNotes: String
          manifestUrl: String
          backendImageUrl: String
          frontendBundleUrl: String
          minCoreVersion: String
          maxCoreVersion: String?
          deprecated: Boolean
          yanked: Boolean
          publishedAt: DateTime
          downloads: Int
        }

        Model PluginReview {
          id: UUID
          registryId: UUID
          userId: UUID
          tenantId: UUID
          rating: Int (1-5)
          comment: String?
          createdAt: DateTime
        }
    [ ] Indexes for search and filtering
    [ ] Migration script

[ ] Seed initial plugins (8h)
    [ ] Sample plugins metadata
    [ ] Categories and tags
    [ ] Test data for development
```

**Deliverables**:

- ✅ Registry database schema
- ✅ Migrations applied
- ✅ Seed data loaded
- ✅ Indexes optimized

#### Registry API (24h)

**Tasks**:

```
[ ] Registry endpoints (16h)
    [ ] GET /api/registry/plugins
        Query params: category, tag, search, sort, page, limit
        Response: Paginated plugin list
    [ ] GET /api/registry/plugins/:pluginId
        Response: Full plugin details with all versions
    [ ] GET /api/registry/plugins/:pluginId/versions/:version
        Response: Specific version details
    [ ] POST /api/registry/plugins (Admin only)
        Body: Plugin metadata
        Response: Created plugin registry entry
    [ ] PUT /api/registry/plugins/:pluginId (Admin or Author)
        Body: Updated metadata
    [ ] DELETE /api/registry/plugins/:pluginId (Admin only)
    [ ] POST /api/registry/plugins/:pluginId/versions
        Body: New version data
        Response: Created version
    [ ] POST /api/registry/plugins/:pluginId/reviews (Authenticated)
        Body: { rating, comment }
    [ ] GET /api/registry/plugins/:pluginId/reviews
        Response: Paginated reviews
    [ ] GET /api/registry/categories
        Response: List of categories with counts
    [ ] GET /api/registry/stats
        Response: Registry statistics

[ ] Search implementation (8h)
    [ ] Full-text search (PostgreSQL ts_vector)
    [ ] Fuzzy matching
    [ ] Relevance scoring
    [ ] Search filters (category, tags, verified, etc.)
    [ ] Search suggestions/autocomplete
```

**Deliverables**:

- ✅ 11 registry API endpoints
- ✅ Search functionality
- ✅ Pagination and filtering
- ✅ Authentication and authorization

### Week 14: Plugin Publishing Workflow (40h)

#### CLI Publishing Tool (20h)

**Tasks**:

```
[ ] plexica-cli publish command (16h)
    [ ] packages/cli/src/commands/publish.ts (~400 lines)
        [ ] Authentication with API key
        [ ] Validation:
            - Manifest completeness
            - Version format (semver)
            - Required files present
            - Backend image exists
            - Frontend bundle valid
            - License file exists
            - README exists
        [ ] Build if not already built
        [ ] Upload backend Docker image to registry
        [ ] Upload frontend bundle to CDN
        [ ] Upload manifest and metadata
        [ ] Create registry entry/version
        [ ] Tag version (latest, stable, beta, alpha)
        [ ] Generate changelog from git history
        [ ] Publish notifications (webhook)
    [ ] Dry-run mode (--dry-run)
    [ ] Interactive mode (prompts)
    [ ] CI/CD mode (non-interactive)

[ ] Version management (4h)
    [ ] Semantic versioning enforcement
    [ ] Automatic version bumping (--major, --minor, --patch)
    [ ] Pre-release versions (beta, alpha, rc)
    [ ] Version conflict detection
```

**Deliverables**:

- ✅ plexica-cli publish command
- ✅ Validation pipeline
- ✅ Version management
- ✅ CI/CD ready

#### Publishing API & Webhooks (20h)

**Tasks**:

```
[ ] Publishing API (12h)
    [ ] POST /api/registry/publish/initiate
        Body: Plugin metadata
        Response: Upload URLs and session ID
    [ ] POST /api/registry/publish/upload-backend
        Multipart: Docker image tarball
    [ ] POST /api/registry/publish/upload-frontend
        Multipart: Frontend bundle zip
    [ ] POST /api/registry/publish/complete
        Body: Session ID
        Response: Success + plugin URL
    [ ] Rate limiting (10 publishes/day per user)
    [ ] Virus scanning integration (ClamAV)
    [ ] Automated security scanning (Snyk or similar)

[ ] Webhook system (8h)
    [ ] Webhook registration API
    [ ] Events:
        - plugin.published
        - plugin.updated
        - plugin.installed
        - plugin.reviewed
    [ ] Webhook delivery with retries
    [ ] Webhook logs and monitoring
```

**Deliverables**:

- ✅ Publishing API endpoints
- ✅ Security scanning
- ✅ Webhook system
- ✅ Rate limiting

### Week 15: Marketplace UI - Super Admin (40h)

#### Super Admin Marketplace (24h)

**Tasks**:

```
[ ] Plugin Registry Management (12h)
    [ ] apps/super-admin/src/pages/PluginRegistry.tsx (~400 lines)
        [ ] Plugin list with filters
        [ ] Search functionality
        [ ] Plugin approval workflow
        [ ] Featured plugin management
        [ ] Verify plugin (admin action)
        [ ] Yank version (remove from marketplace)
        [ ] View analytics (downloads, installs, reviews)
    [ ] Components:
        [ ] PluginCard with stats
        [ ] PluginDetailModal
        [ ] VersionHistoryTable
        [ ] ReviewModerationPanel

[ ] Publishing Management (12h)
    [ ] apps/super-admin/src/pages/PublishingQueue.tsx (~300 lines)
        [ ] Pending publications queue
        [ ] Approve/reject publication
        [ ] View security scan results
        [ ] Virus scan status
        [ ] Manual review interface
    [ ] Automated checks dashboard
    [ ] Publisher management (ban, restrict)
```

**Deliverables**:

- ✅ Super Admin marketplace pages
- ✅ Approval workflow UI
- ✅ Analytics dashboard
- ✅ Moderation tools

#### Marketplace Analytics (16h)

**Tasks**:

```
[ ] Analytics dashboard (12h)
    [ ] apps/super-admin/src/pages/MarketplaceAnalytics.tsx (~350 lines)
        [ ] Top plugins by downloads
        [ ] Top plugins by revenue
        [ ] Plugin growth trends
        [ ] Category distribution
        [ ] User engagement metrics
        [ ] Geographic distribution
    [ ] Charts and visualizations
    [ ] Export to CSV

[ ] Analytics API (4h)
    [ ] GET /api/registry/analytics/overview
    [ ] GET /api/registry/analytics/trends
    [ ] GET /api/registry/analytics/plugins/:pluginId
```

**Deliverables**:

- ✅ Analytics dashboard
- ✅ Charts and reports
- ✅ Export functionality
- ✅ Analytics API

### Week 16: Marketplace UI - Tenant App (40h)

#### Tenant Marketplace (28h)

**Tasks**:

```
[ ] Plugin Browse & Discovery (16h)
    [ ] apps/web/src/pages/Marketplace.tsx (~500 lines)
        [ ] Plugin grid/list view
        [ ] Category navigation
        [ ] Search with autocomplete
        [ ] Filters:
            - Category
            - Price (free, paid, freemium)
            - Rating (4+ stars, etc.)
            - Verified only
            - Features (has webhook, has API, etc.)
        [ ] Sort options:
            - Most popular
            - Highest rated
            - Newest
            - Price (low to high, high to low)
        [ ] Plugin cards with:
            - Name, icon, description
            - Rating and review count
            - Download count
            - Price
            - Verified badge
            - Install button
    [ ] Responsive design (mobile, tablet, desktop)
    [ ] Loading states and skeletons
    [ ] Empty states

[ ] Plugin Detail Page (12h)
    [ ] apps/web/src/pages/PluginDetail.tsx (~400 lines)
        [ ] Plugin overview:
            - Full description
            - Screenshots/demo video
            - Key features
            - Pricing details
            - Requirements (core version)
        [ ] Tabs:
            - Overview
            - Documentation
            - Reviews
            - Versions
            - Support
        [ ] Install/uninstall actions
        [ ] Review submission form
        [ ] Version selector
        [ ] Related plugins
        [ ] Support contact
```

**Deliverables**:

- ✅ Marketplace browse page
- ✅ Plugin detail page
- ✅ Search and filters
- ✅ Responsive design

#### Installation Flow (12h)

**Tasks**:

```
[ ] Installation wizard (8h)
    [ ] apps/web/src/components/PluginInstallWizard.tsx (~300 lines)
        [ ] Step 1: Review plugin details
        [ ] Step 2: Select version
        [ ] Step 3: Configure plugin (if needed)
        [ ] Step 4: Review permissions
        [ ] Step 5: Confirm installation
        [ ] Progress indicator during install
        [ ] Success/error handling
        [ ] Post-install actions (enable, configure)

[ ] Installation API integration (4h)
    [ ] POST /api/tenants/:tenantId/plugins/install-from-registry
        Body: { pluginId, version, configuration }
    [ ] Progress tracking via WebSocket or polling
    [ ] Error handling and rollback
```

**Deliverables**:

- ✅ Installation wizard
- ✅ Progress tracking
- ✅ Error handling
- ✅ API integration

### Milestone 2.4 Completion Criteria

**Functionality**:

- [x] Plugin registry API operational
- [x] Publishing workflow functional
- [x] Marketplace UI in Super Admin
- [x] Marketplace UI in Tenant App
- [x] Plugin installation from registry working
- [x] Version management implemented
- [x] Review and rating system working

**Performance**:

- [x] Registry search < 200ms
- [x] Plugin installation < 60s
- [x] Marketplace page load < 2s
- [x] Search autocomplete < 100ms

**Quality**:

- [x] Test coverage > 75%
- [x] E2E tests for installation flow
- [x] Security scans on all uploads
- [x] Documentation complete

**Deliverables**:

- ✅ Plugin Registry API (11 endpoints)
- ✅ plexica-cli publish command
- ✅ Super Admin marketplace UI
- ✅ Tenant marketplace UI
- ✅ Installation wizard
- ✅ Review and rating system
- ✅ Analytics dashboard
- ✅ Publishing guide documentation

---

**Duration**: 4 weeks (Weeks 9-12)  
**Owner**: Backend Team  
**Priority**: ⭐ High  
**Estimated Hours**: 160h  
**Dependencies**: M2.1 (Event System), M2.2 (Module Federation)

### Objectives

- Implement advanced service discovery
- Enable REST API inter-plugin communication
- Create shared data service
- Implement plugin dependency resolution
- Build plugin orchestration patterns

### Week 9: Service Discovery (40h)

#### Service Registry (24h)

**Tasks**:

```
[ ] Service registry implementation (16h)
    [ ] packages/service-discovery/src/registry.service.ts (~350 lines)
        [ ] registerService(pluginId, serviceInfo)
        [ ] deregisterService(pluginId)
        [ ] discoverService(pluginId, serviceName)
        [ ] listServices(filter)
        [ ] healthCheck(pluginId)
    [ ] ServiceInfo interface:
        {
          pluginId: string
          serviceName: string
          baseUrl: string
          version: string
          endpoints: Array<{
            method: string
            path: string
            description: string
            schema: object
          }>
          health: {
            status: 'UP' | 'DOWN' | 'DEGRADED'
            lastCheck: Date
          }
        }
    [ ] Redis-based registry (for speed)
    [ ] PostgreSQL backup (for persistence)
    [ ] Automatic cleanup of stale services

[ ] Health check system (8h)
    [ ] Periodic health checks (every 30s)
    [ ] Circuit breaker integration
    [ ] Automatic deregistration on failure
    [ ] Health check endpoint per plugin
    [ ] Metrics collection
```

**Deliverables**:

- ✅ Service registry operational
- ✅ Health check system
- ✅ Redis + PostgreSQL storage
- ✅ Automatic cleanup

#### Service Discovery Client (16h)

**Tasks**:

```
[ ] SDK service discovery client (12h)
    [ ] packages/sdk/src/service-discovery/client.ts (~250 lines)
        [ ] discover(pluginId)
        [ ] call(pluginId, method, path, data)
        [ ] callWithRetry(...)
        [ ] streamEvents(pluginId, eventType)
    [ ] Auto-registration on plugin start
    [ ] Caching discovered services (5 min TTL)
    [ ] Load balancing (round-robin)
    [ ] Retry logic with backoff

[ ] REST client wrapper (4h)
    [ ] Type-safe API client
    [ ] Request/response interceptors
    [ ] Error mapping
    [ ] Timeout configuration
```

**Deliverables**:

- ✅ Service discovery client in SDK
- ✅ Auto-registration
- ✅ Load balancing
- ✅ Retry logic

### Week 10: Inter-Plugin REST API (40h)

#### API Gateway for Plugins (20h)

**Tasks**:

```
[ ] Plugin API Gateway (16h)
    [ ] apps/core-api/src/services/plugin-gateway.service.ts (~400 lines)
        [ ] routeRequest(targetPlugin, request)
        [ ] Authentication propagation
        [ ] Tenant context forwarding (X-Tenant-ID)
        [ ] Workspace context forwarding (X-Workspace-ID)
        [ ] Rate limiting per plugin
        [ ] Request/response logging
        [ ] Circuit breaker per plugin
    [ ] Dynamic routing based on manifest
    [ ] Permission verification
    [ ] Response caching (optional)

[ ] API Gateway routes (4h)
    [ ] POST /api/plugins/:pluginId/call
        Body: { method, path, data, headers }
    [ ] Proxy endpoint: /api/plugins/:pluginId/proxy/*
    [ ] WebSocket support for streaming
```

**Deliverables**:

- ✅ Plugin API Gateway
- ✅ Dynamic routing
- ✅ Context forwarding
- ✅ Rate limiting

#### Plugin Communication Patterns (20h)

**Tasks**:

```
[ ] Request-Response pattern (8h)
    [ ] Synchronous API calls
    [ ] Timeout handling (30s default)
    [ ] Error propagation
    [ ] Example: CRM → Notifications

[ ] Pub-Sub pattern (8h)
    [ ] Event-based communication (using M2.1)
    [ ] Topic-based routing
    [ ] Example: Billing → Email notifications

[ ] Saga pattern (4h)
    [ ] Distributed transaction coordination
    [ ] Compensation logic
    [ ] Example: Order processing across plugins
```

**Deliverables**:

- ✅ Communication patterns documented
- ✅ SDK helpers for patterns
- ✅ Example implementations
- ✅ Best practices guide

### Week 11: Shared Data Service (40h)

#### Shared Storage Layer (24h)

**Tasks**:

```
[ ] Shared data service (16h)
    [ ] packages/shared-data/src/shared-data.service.ts (~350 lines)
        [ ] set(key, value, options)
        [ ] get(key)
        [ ] delete(key)
        [ ] list(pattern)
        [ ] subscribe(pattern, callback) - for changes
    [ ] Storage options:
        - Scope: 'global' | 'tenant' | 'workspace' | 'plugin'
        - TTL: number (seconds)
        - Encrypted: boolean
    [ ] Redis-based implementation
    [ ] Key namespacing:
        - shared:global:{key}
        - shared:tenant:{tenantId}:{key}
        - shared:workspace:{workspaceId}:{key}
        - shared:plugin:{pluginId}:{key}
    [ ] Access control (permission-based)
    [ ] Audit logging for sensitive data

[ ] SDK integration (8h)
    [ ] Add sharedData client to SDK
    [ ] Type-safe key-value operations
    [ ] Reactive subscriptions
    [ ] Examples in documentation
```

**Deliverables**:

- ✅ Shared data service
- ✅ Redis storage with namespacing
- ✅ Access control
- ✅ SDK integration

#### Cross-Plugin State Management (16h)

**Tasks**:

```
[ ] State synchronization (8h)
    [ ] Real-time state sync via events
    [ ] Conflict resolution (last-write-wins)
    [ ] State versioning
    [ ] Example: Shared cart across plugins

[ ] Distributed cache (8h)
    [ ] Multi-layer caching (L1: memory, L2: Redis)
    [ ] Cache invalidation strategies
    [ ] Cache warming
    [ ] Metrics and monitoring
```

**Deliverables**:

- ✅ State sync mechanism
- ✅ Distributed cache
- ✅ Conflict resolution
- ✅ Examples

### Week 12: Plugin Dependencies & Testing (40h)

#### Dependency Resolution (20h)

**Tasks**:

```
[ ] Dependency graph (12h)
    [ ] apps/core-api/src/services/plugin-dependency.service.ts (~300 lines)
        [ ] buildDependencyGraph(plugins)
        [ ] validateDependencies(manifest)
        [ ] resolveInstallOrder(plugins)
        [ ] detectCircularDependencies()
        [ ] checkVersionCompatibility()
    [ ] Dependency interface (in manifest):
        {
          plugins: [
            { id: 'notifications', version: '>=1.0.0 <2.0.0' },
            { id: 'storage', version: '^1.2.0', optional: true }
          ]
        }
    [ ] Automatic dependency installation
    [ ] Dependency conflict resolution
    [ ] Warning for missing optional dependencies

[ ] Plugin lifecycle with dependencies (8h)
    [ ] Install dependencies before plugin
    [ ] Enable dependencies before plugin
    [ ] Disable dependents when disabling plugin
    [ ] Prevent uninstall if dependents exist
    [ ] Cascade operations (optional)
```

**Deliverables**:

- ✅ Dependency resolution system
- ✅ Dependency graph validation
- ✅ Lifecycle management
- ✅ Conflict detection

#### Integration Testing (20h)

**Tasks**:

```
[ ] Multi-plugin tests (12h)
    [ ] Test CRM → Notifications communication
    [ ] Test Billing → Email communication
    [ ] Test shared data between plugins
    [ ] Test dependency resolution
    [ ] Test cascading enables/disables

[ ] Performance testing (8h)
    [ ] Test inter-plugin latency
    [ ] Test service discovery performance
    [ ] Test shared data throughput
    [ ] Test under load (100 concurrent requests)
```

**Deliverables**:

- ✅ Integration test suite
- ✅ Performance benchmarks
- ✅ Load test results
- ✅ Documentation

### Milestone 2.3 Completion Criteria

**Functionality**:

- [x] Service discovery operational
- [x] Inter-plugin REST communication working
- [x] Shared data service functional
- [x] Dependency resolution implemented
- [x] Multiple plugins can communicate

**Performance**:

- [x] Service discovery < 10ms (cached)
- [x] Inter-plugin call < 100ms p95
- [x] Shared data access < 5ms p95
- [x] Dependency resolution < 500ms

**Quality**:

- [x] Test coverage > 80%
- [x] Integration tests pass
- [x] Load tests pass
- [x] Documentation complete

**Deliverables**:

- ✅ Service registry and discovery
- ✅ Plugin API Gateway
- ✅ Shared data service
- ✅ Dependency management system
- ✅ Communication patterns documented
- ✅ Enhanced Plugin SDK (v0.3.0)

---

**Duration**: 4 weeks (Weeks 5-8)  
**Owner**: Frontend Team  
**Priority**: 🔥 Critical  
**Estimated Hours**: 160h  
**Dependencies**: M2.1 (Event System)

### Objectives

- Implement Module Federation in tenant app
- Create CDN infrastructure for plugin bundles
- Enable dynamic plugin route registration
- Build plugin menu system
- Create sample frontend plugins

### Week 5: Module Federation Infrastructure (40h)

#### Webpack Configuration (16h)

**Tasks**:

```
[ ] Configure Module Federation in apps/web (12h)
    [ ] Update vite.config.ts to use @originjs/vite-plugin-federation
    [ ] Configure host application:
        {
          name: 'plexica_host',
          remotes: {}, // Dynamic registration
          shared: {
            react: { singleton: true, requiredVersion: '^18.0.0' },
            'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
            '@tanstack/react-router': { singleton: true },
            '@tanstack/react-query': { singleton: true }
          }
        }
    [ ] Create dynamic remote loader
    [ ] Configure shared dependencies
    [ ] Setup type definitions for remotes

[ ] Plugin remote template (4h)
    [ ] Create apps/plugin-template-frontend
    [ ] Configure as Module Federation remote:
        {
          name: 'plugin_{pluginId}',
          filename: 'remoteEntry.js',
          exposes: {
            './Plugin': './src/Plugin.tsx',
            './routes': './src/routes.ts',
            './widgets': './src/widgets/index.ts'
          },
          shared: { /* same as host */ }
        }
    [ ] Template folder structure
    [ ] Build and dev scripts
```

**Deliverables**:

- ✅ Module Federation configured in apps/web
- ✅ Plugin frontend template
- ✅ Build configuration working
- ✅ Type safety maintained

#### Dynamic Plugin Loader (16h)

**Tasks**:

```
[ ] PluginLoader service (12h)
    [ ] apps/web/src/lib/plugin-loader.ts (~300 lines)
        [ ] loadRemotePlugin(manifestUrl, remoteEntryUrl)
        [ ] unloadPlugin(pluginId)
        [ ] getLoadedPlugins()
        [ ] preloadPlugin(pluginId) - for faster activation
    [ ] Remote module resolution
    [ ] Error handling (load failure, version mismatch)
    [ ] Loading state management
    [ ] Cache management
    [ ] Hot reload support (dev mode)

[ ] PluginRegistry frontend service (4h)
    [ ] apps/web/src/lib/plugin-registry.ts (~150 lines)
        [ ] registerPlugin(manifest)
        [ ] getPlugin(pluginId)
        [ ] listPlugins(filter)
        [ ] Integration with backend API
```

**Deliverables**:

- ✅ Dynamic plugin loading
- ✅ Plugin registry frontend
- ✅ Error handling
- ✅ Dev mode hot reload

#### Testing (8h)

**Tasks**:

```
[ ] Unit tests (4h)
    [ ] Test plugin loader
    [ ] Test registry
    [ ] Test error scenarios

[ ] Integration tests (4h)
    [ ] Test loading real plugin
    [ ] Test unloading
    [ ] Test version conflicts
```

### Week 6: CDN Infrastructure (40h)

#### Storage & CDN Setup (24h)

**Tasks**:

```
[ ] Plugin asset storage (12h)
    [ ] MinIO bucket for plugin bundles:
        - Bucket: plexica-plugins
        - Path: {pluginId}/{version}/
        - Files: remoteEntry.js, chunks/, assets/
    [ ] Upload service in Core API:
        [ ] POST /api/plugins/upload (multipart)
        [ ] Validation (file size, structure)
        [ ] Virus scanning (ClamAV integration)
        [ ] Automatic versioning
    [ ] Asset serving:
        [ ] Public read access
        [ ] CORS configuration
        [ ] Cache headers (1 year for versioned assets)

[ ] CDN configuration (8h)
    [ ] Setup CloudFront or similar CDN (prod)
    [ ] Configure MinIO as origin
    [ ] Setup SSL/TLS
    [ ] Configure cache behaviors
    [ ] Setup invalidation rules
    [ ] For dev: Direct MinIO access

[ ] URL generation service (4h)
    [ ] Generate CDN URLs for plugin assets
    [ ] Version-based URL structure
    [ ] Fallback to direct storage
```

**Deliverables**:

- ✅ Plugin bundle storage (MinIO)
- ✅ CDN configuration (prod-ready)
- ✅ Upload API for plugins
- ✅ URL generation service

#### Plugin Build & Publish Pipeline (16h)

**Tasks**:

```
[ ] Plugin build script (8h)
    [ ] packages/cli/src/commands/build-plugin.ts (~200 lines)
        [ ] Build backend (TypeScript → JS)
        [ ] Build frontend (Vite build)
        [ ] Bundle Docker image
        [ ] Generate manifest.json
        [ ] Validate bundle structure
        [ ] Create tarball
    [ ] Optimize bundle size
    [ ] Source maps generation
    [ ] Asset optimization

[ ] Plugin publish script (8h)
    [ ] packages/cli/src/commands/publish-plugin.ts (~250 lines)
        [ ] Authenticate with registry
        [ ] Upload backend image to Docker registry
        [ ] Upload frontend bundle to CDN
        [ ] Register plugin in registry
        [ ] Update marketplace metadata
        [ ] Tag version (latest, stable, beta)
    [ ] Validation before publish
    [ ] Rollback on failure
```

**Deliverables**:

- ✅ plexica-cli build command
- ✅ plexica-cli publish command
- ✅ CI/CD integration ready
- ✅ Automated validation

### Week 7: Dynamic Routing & Menu System (40h)

#### Dynamic Route Registration (20h)

**Tasks**:

```
[ ] Plugin route registration (12h)
    [ ] apps/web/src/lib/plugin-routes.ts (~250 lines)
        [ ] registerPluginRoutes(pluginId, routes)
        [ ] unregisterPluginRoutes(pluginId)
        [ ] Route interface:
            {
              path: string
              component: React.ComponentType
              layout?: 'default' | 'fullscreen' | 'minimal'
              permissions?: string[]
              title?: string
              icon?: string
            }
    [ ] TanStack Router integration
    [ ] Lazy loading per route
    [ ] Route guards (permissions)
    [ ] 404 handling for plugin routes

[ ] Plugin layout system (8h)
    [ ] PluginLayout component
    [ ] Support for custom layouts
    [ ] Breadcrumb integration
    [ ] Page title management
    [ ] Error boundaries per plugin
```

**Deliverables**:

- ✅ Dynamic route registration
- ✅ Plugin layouts
- ✅ Route guards
- ✅ Error boundaries

#### Menu System (20h)

**Tasks**:

```
[ ] Dynamic menu registration (12h)
    [ ] apps/web/src/lib/plugin-menu.ts (~200 lines)
        [ ] registerMenuItem(pluginId, item)
        [ ] unregisterMenuItem(pluginId)
        [ ] MenuItem interface:
            {
              id: string
              label: string
              icon?: string
              path?: string
              children?: MenuItem[]
              permissions?: string[]
              badge?: { text: string, variant: 'info' | 'success' | 'warning' }
              order?: number
            }
    [ ] Menu sorting and grouping
    [ ] Permission-based visibility
    [ ] Active state management

[ ] Sidebar integration (8h)
    [ ] Update Sidebar component to use plugin menu
    [ ] Dynamic menu rendering
    [ ] Collapsible plugin groups
    [ ] Search in menu items
    [ ] Recently used items
```

**Deliverables**:

- ✅ Dynamic menu system
- ✅ Sidebar integration
- ✅ Permission-based menus
- ✅ Search functionality

### Week 8: Sample Plugins & Testing (40h)

#### Sample Frontend Plugins (24h)

**Tasks**:

```
[ ] Sample CRM Plugin Frontend (12h)
    [ ] apps/plugins/crm-frontend/
    [ ] Pages:
        [ ] ContactListPage (~200 lines)
        [ ] ContactDetailPage (~150 lines)
        [ ] CreateContactPage (~120 lines)
    [ ] Components:
        [ ] ContactCard
        [ ] ContactForm
        [ ] ActivityTimeline
    [ ] Routes configuration
    [ ] Menu items configuration
    [ ] API integration

[ ] Sample Analytics Plugin Frontend (12h)
    [ ] apps/plugins/analytics-frontend/
    [ ] Pages:
        [ ] DashboardPage (~250 lines)
        [ ] ReportsPage (~180 lines)
    [ ] Components:
        [ ] ChartWidget (multiple chart types)
        [ ] MetricCard
        [ ] DataTable
    [ ] Real-time updates via events
    [ ] Export functionality
```

**Deliverables**:

- ✅ 2 sample frontend plugins
- ✅ Module Federation working
- ✅ Routes and menus integrated
- ✅ Production-quality UI

#### Testing & Documentation (16h)

**Tasks**:

```
[ ] E2E testing (8h)
    [ ] Test plugin installation flow
    [ ] Test plugin activation/deactivation
    [ ] Test route registration
    [ ] Test menu visibility
    [ ] Test plugin uninstallation
    [ ] Test version updates

[ ] Documentation (8h)
    [ ] Module Federation guide
    [ ] Plugin frontend development guide
    [ ] Routing best practices
    [ ] Menu system documentation
    [ ] CDN and asset management
    [ ] Publishing guide
```

### Milestone 2.2 Completion Criteria

**Functionality**:

- [x] Module Federation configured and working
- [x] Plugin bundles hosted on CDN
- [x] Dynamic route registration functional
- [x] Menu system integrated
- [x] 2+ sample frontend plugins working

**Performance**:

- [x] Plugin load time < 3s (on fast connection)
- [x] Initial bundle size < 100KB (gzipped)
- [x] Route transitions < 300ms
- [x] CDN cache hit rate > 90%

**Quality**:

- [x] Test coverage > 75% for plugin system
- [x] E2E tests pass
- [x] Type safety maintained
- [x] Documentation complete

**Deliverables**:

- ✅ Working Module Federation infrastructure
- ✅ CDN setup with asset hosting
- ✅ plexica-cli build/publish commands
- ✅ Dynamic routing and menu system
- ✅ Sample frontend plugins
- ✅ Developer documentation

---

**Duration**: 4 weeks (Weeks 1-4)  
**Owner**: Backend Team  
**Priority**: 🔥 Critical  
**Estimated Hours**: 160h

### Objectives

- Integrate Redpanda as event streaming platform
- Implement Event Bus service in Core API
- Add event publishing/subscription to Plugin SDK
- Create Dead Letter Queue (DLQ) handling
- Implement event decorators for plugins

### Week 1: Redpanda Setup & Integration (40h)

#### Backend Infrastructure (24h)

**Tasks**:

```
[ ] Redpanda Docker Compose setup (4h)
    [ ] Add Redpanda service to docker-compose.yml
    [ ] Configure 3-node cluster for HA
    [ ] Setup Redpanda Console for monitoring
    [ ] Configure retention policies (7 days default)
    [ ] Setup authentication (SASL/SCRAM)
    [ ] Configure resource limits (CPU, memory)

[ ] Redpanda client library setup (8h)
    [ ] Install kafkajs in packages/event-bus
    [ ] Create RedpandaClient wrapper class
    [ ] Implement connection pooling
    [ ] Add health check integration
    [ ] Configure producer settings (acks, retries)
    [ ] Configure consumer settings (group, offset)

[ ] Topic management service (12h)
    [ ] TopicManager service (~200 lines)
        [ ] createTopic(name, config)
        [ ] deleteTopic(name)
        [ ] listTopics()
        [ ] getTopicConfig(name)
    [ ] Topic naming convention:
        - core.{domain}.{event} (e.g., core.tenant.created)
        - plugin.{pluginId}.{event} (e.g., plugin.crm.contact.created)
    [ ] Automatic topic creation for plugins
    [ ] Topic retention configuration
    [ ] Partition strategy (by tenantId)
```

**Deliverables**:

- ✅ Working Redpanda cluster (3 nodes)
- ✅ Redpanda Console accessible at http://localhost:8080
- ✅ TopicManager service with CRUD operations
- ✅ Health checks integrated

#### Documentation (8h)

**Tasks**:

```
[ ] Event architecture documentation (4h)
    [ ] Event flow diagrams
    [ ] Topic naming conventions
    [ ] Partition strategy
    [ ] Consumer group patterns

[ ] Developer guide (4h)
    [ ] How to publish events
    [ ] How to subscribe to events
    [ ] Event schema best practices
    [ ] Error handling patterns
```

#### Testing (8h)

**Tasks**:

```
[ ] Unit tests for TopicManager (4h)
    [ ] Test topic creation/deletion
    [ ] Test configuration management
    [ ] Test error handling

[ ] Integration tests (4h)
    [ ] Test Redpanda connection
    [ ] Test topic creation
    [ ] Test basic publish/consume
```

### Week 2: Event Bus Service (40h)

#### Core Event Bus Implementation (32h)

**Tasks**:

```
[ ] EventBus service core (16h)
    [ ] packages/event-bus/src/event-bus.service.ts (~400 lines)
        [ ] publish(topic, event, options)
        [ ] subscribe(topic, handler, options)
        [ ] unsubscribe(subscription)
        [ ] publishBatch(events)
        [ ] getMetrics()
    [ ] Event interface:
        {
          id: string (UUID)
          type: string
          tenantId: string
          workspaceId?: string
          timestamp: Date
          data: T
          metadata: {
            source: string (pluginId or 'core')
            userId?: string
            correlationId?: string
            causationId?: string
          }
        }
    [ ] Producer implementation with batching
    [ ] Consumer implementation with auto-commit
    [ ] Error handling and retries
    [ ] Circuit breaker pattern

[ ] Event serialization/deserialization (8h)
    [ ] JSON serialization with schema validation
    [ ] Compression support (gzip, snappy)
    [ ] Schema registry integration prep
    [ ] Type-safe event payloads

[ ] Event filtering and routing (8h)
    [ ] Tenant-based filtering
    [ ] Workspace-based filtering
    [ ] Event type filtering
    [ ] Custom filter predicates
    [ ] Dead letter queue routing
```

**Deliverables**:

- ✅ EventBus service with publish/subscribe
- ✅ Type-safe event interfaces
- ✅ Filtering and routing logic
- ✅ Error handling and retries

#### Testing (8h)

**Tasks**:

```
[ ] Unit tests for EventBus (4h)
    [ ] Test publish/subscribe
    [ ] Test filtering
    [ ] Test error handling

[ ] Integration tests (4h)
    [ ] End-to-end publish/consume
    [ ] Test batching
    [ ] Test retries and DLQ
```

### Week 3: Plugin SDK Event Integration (40h)

#### SDK Enhancement (24h)

**Tasks**:

```
[ ] Update @plexica/sdk with events (16h)
    [ ] packages/sdk/src/events/event-client.ts (~300 lines)
        [ ] publishEvent(type, data, options)
        [ ] subscribeToEvent(type, handler)
        [ ] subscribeToEvents(types, handler)
        [ ] unsubscribe(subscriptionId)
        [ ] waitForEvent(type, timeout) - for testing
    [ ] Event decorators:
        [ ] @EventHandler(eventType) decorator
        [ ] @EventPublisher() decorator
        [ ] Auto-registration on plugin load
    [ ] Integration with PlexicaPlugin base class
    [ ] Context propagation (tenant, workspace, user)

[ ] Event schema validation (8h)
    [ ] Zod schemas for event payloads
    [ ] Schema validation on publish
    [ ] Schema validation on consume
    [ ] Schema versioning support
    [ ] Type generation from schemas
```

**Deliverables**:

- ✅ Enhanced SDK with event client
- ✅ Event decorators for plugins
- ✅ Schema validation integrated
- ✅ Type-safe event publishing

#### Sample Plugin Update (8h)

**Tasks**:

```
[ ] Update sample-analytics plugin (8h)
    [ ] Subscribe to core.tenant.created
    [ ] Subscribe to core.user.created
    [ ] Publish plugin.analytics.report.generated
    [ ] Demonstrate event patterns
    [ ] Add event-driven analytics aggregation
```

#### Documentation (8h)

**Tasks**:

```
[ ] SDK event documentation (4h)
    [ ] Event client API reference
    [ ] Decorator usage examples
    [ ] Best practices guide

[ ] Event patterns guide (4h)
    [ ] Common event patterns
    [ ] Event sourcing patterns
    [ ] Saga patterns
    [ ] CQRS examples
```

### Week 4: Dead Letter Queue & Monitoring (40h)

#### DLQ Implementation (20h)

**Tasks**:

```
[ ] Dead Letter Queue service (12h)
    [ ] packages/event-bus/src/dlq.service.ts (~250 lines)
        [ ] captureFailed(event, error, retryCount)
        [ ] retry(dlqId)
        [ ] retryAll(filter)
        [ ] delete(dlqId)
        [ ] list(filter, pagination)
    [ ] DLQ storage (PostgreSQL core schema):
        Model DeadLetterEvent {
          id: UUID
          topic: string
          event: JSON
          error: string
          stackTrace: string
          retryCount: int
          maxRetries: int
          createdAt: DateTime
          lastRetryAt: DateTime?
          status: enum (PENDING, RETRYING, FAILED, RESOLVED)
        }
    [ ] Automatic retry with exponential backoff
    [ ] Max retry limit (3 attempts)
    [ ] Manual retry capability

[ ] DLQ REST API (8h)
    [ ] GET /api/admin/dlq - list failed events
    [ ] GET /api/admin/dlq/:id - get details
    [ ] POST /api/admin/dlq/:id/retry - retry single
    [ ] POST /api/admin/dlq/retry-all - retry all pending
    [ ] DELETE /api/admin/dlq/:id - delete event
```

**Deliverables**:

- ✅ DLQ service with retry logic
- ✅ DLQ persistence in PostgreSQL
- ✅ DLQ management API
- ✅ Exponential backoff strategy

#### Monitoring & Observability (12h)

**Tasks**:

```
[ ] Event metrics (8h)
    [ ] Prometheus metrics:
        - events_published_total (counter)
        - events_consumed_total (counter)
        - events_failed_total (counter)
        - event_publish_duration_seconds (histogram)
        - event_consume_duration_seconds (histogram)
        - dlq_events_total (gauge)
    [ ] Metrics endpoint /api/metrics/events
    [ ] Redpanda lag monitoring
    [ ] Consumer group monitoring

[ ] Event logging (4h)
    [ ] Structured logging for all events
    [ ] Log levels (DEBUG, INFO, WARN, ERROR)
    [ ] Correlation ID tracking
    [ ] Event audit trail
```

**Deliverables**:

- ✅ Prometheus metrics for events
- ✅ Metrics dashboard configuration
- ✅ Structured logging
- ✅ Audit trail

#### Testing & Documentation (8h)

**Tasks**:

```
[ ] End-to-end testing (4h)
    [ ] Test full event lifecycle
    [ ] Test DLQ handling
    [ ] Test retry logic
    [ ] Test monitoring

[ ] Load testing (4h)
    [ ] Test 1000 events/sec throughput
    [ ] Test consumer lag under load
    [ ] Test DLQ under failure scenarios
```

### Milestone 2.1 Completion Criteria

**Functionality**:

- [x] Redpanda cluster running and healthy
- [x] EventBus service operational
- [x] Plugin SDK supports events
- [x] DLQ captures and retries failed events
- [x] Sample plugin uses events

**Performance**:

- [x] Event publish < 10ms p95
- [x] Event delivery < 100ms p95
- [x] Throughput > 1000 events/sec
- [x] Consumer lag < 1 second under normal load

**Quality**:

- [x] Test coverage > 80% for event code
- [x] Load tests pass
- [x] Monitoring dashboards configured
- [x] Documentation complete

**Deliverables**:

- ✅ Working event-driven architecture
- ✅ Enhanced Plugin SDK (v0.2.0)
- ✅ DLQ system operational
- ✅ Monitoring and metrics
- ✅ Developer documentation

---

1. [Overview](#overview)
2. [Milestone 2.1 - Event System](#milestone-21---event-system)
3. [Milestone 2.2 - Module Federation](#milestone-22---module-federation)
4. [Milestone 2.3 - Plugin-to-Plugin Communication](#milestone-23---plugin-to-plugin-communication)
5. [Milestone 2.4 - Plugin Registry & Marketplace](#milestone-24---plugin-registry--marketplace)
6. [Milestone 2.5 - Kubernetes Deployment](#milestone-25---kubernetes-deployment)
7. [Milestone 2.6 - Official Plugins](#milestone-26---official-plugins)
8. [Dependencies & Risks](#dependencies--risks)

---

## Overview

**Phase 2 Objectives**:

- Complete event-driven architecture with Redpanda
- Implement Module Federation for dynamic frontend plugins
- Enable plugin-to-plugin communication
- Build full plugin marketplace with registry
- Production-ready Kubernetes deployment
- Deliver 3+ production-quality official plugins

**Success Metrics**:

- ✅ 10+ plugins available in registry
- ✅ Plugin install < 60s
- ✅ Event delivery < 100ms p95
- ✅ Production-ready Kubernetes deploy
- ✅ Zero-downtime plugin updates
- ✅ Support 100+ concurrent plugin instances

**Key Technologies**:

- **Event Bus**: Redpanda (Kafka-compatible)
- **Frontend**: Module Federation (Webpack 5)
- **Orchestration**: Kubernetes + Helm
- **Service Mesh**: Istio (optional, Phase 2.5)
- **Monitoring**: Prometheus + Grafana
- **Tracing**: OpenTelemetry (Phase 2.5+)

---

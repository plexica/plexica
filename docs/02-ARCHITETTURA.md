# Plexica v2 — Documento Architetturale

> Architettura target per la riscrittura completa della piattaforma.
> Ogni decisione è motivata dal confronto con la v1, dalle decisioni
> confermate dal product owner e dalla priorità di funzionamento reale,
> semplicità DX e verificabilità end-to-end.
>
> **Revisione 2** — aggiornata dopo conferma decisioni architetturali.
> Tutte le decisioni in §14 della Revisione 1 sono state risolte.

**Data**: 25 Marzo 2026
**Stato**: Draft — Base per riscrittura
**Versione**: 2.0-draft-r2

---

## Indice

1. [Principi Architetturali](#1-principi-architetturali)
2. [Revisione Critica dell'Architettura v1](#2-revisione-critica-dellarchitettura-v1)
3. [Architettura di Sistema](#3-architettura-di-sistema)
4. [Multi-Tenancy — Schema-per-Tenant](#4-multi-tenancy--schema-per-tenant)
5. [Backend](#5-backend)
6. [Frontend](#6-frontend)
7. [Sistema Plugin Semplificato](#7-sistema-plugin-semplificato)
8. [Autenticazione e Autorizzazione](#8-autenticazione-e-autorizzazione)
9. [Modello Dati](#9-modello-dati)
10. [Sistema Eventi — Kafka/Redpanda](#10-sistema-eventi--kafkaredpanda)
11. [Comunicazione e Integrazioni](#11-comunicazione-e-integrazioni)
12. [Infrastruttura e Deployment](#12-infrastruttura-e-deployment)
13. [Architettura di Testing E2E Full-Stack](#13-architettura-di-testing-e2e-full-stack)
14. [Osservabilità](#14-osservabilita)

---

## 1. Principi Architetturali

### 1.1 Principi Guida

| N. | Principio | Implicazione |
|----|-----------|-------------|
| 1 | **Semplicità misurabile** | Ogni componente deve poter essere compreso in 30 minuti da uno sviluppatore nuovo. Se richiede più tempo, è troppo complesso |
| 2 | **Verificabilità end-to-end** | Ogni feature deve essere testabile con un test che attraversa tutto lo stack: browser, API, database, Keycloak, Kafka |
| 3 | **Plugin in mezza giornata** | L'architettura plugin deve consentire a uno sviluppatore di creare un plugin completo (UI + backend + event subscription) in 4 ore |
| 4 | **Zero divergenza test-produzione** | Il codice eseguito nei test deve essere identico a quello in produzione. Nessun code path speciale per i test |
| 5 | **Minimo necessario** | Non implementare nulla "perché potrebbe servire". Implementare solo ciò che serve ora con test che lo dimostrano |
| 6 | **UX determina l'architettura** | Le scelte tecniche servono l'esperienza utente, non il contrario |
| 7 | **Complessità incapsulata** | Le scelte architetturali complesse (MF, Kafka, schema-per-tenant) sono corrette, ma la complessità deve essere nascosta dietro tooling e astrazione |

### 1.2 Anti-Pattern da Evitare (Lezioni dalla v1)

| Anti-Pattern | Come si è manifestato nella v1 | Regola v2 |
|-------------|-------------------------------|-----------|
| **Over-specification** | 19 specifiche, 33 ADR, la maggior parte non implementata | Specifica solo ciò che stai per implementare nella prossima iterazione |
| **Mock-driven testing** | 4000 test con 38% asserzioni su mock, sistema non funzionante | I test E2E e integrazione non usano mock per servizi core |
| **Complessità esposta** | MF config esposta al plugin dev, Kafka config manuale, SDK con 6 classi | La complessità va incapsulata: il plugin dev non vede MF, Kafka, o schema management |
| **Architettura da slide** | Service Registry, Container orchestration, Extension Points con 5 tabelle | L'architettura deve emergere dal codice che funziona, non precedere il codice |
| **Design system cosmetico** | 49 componenti UI ma interfaccia inutilizzabile | Design system che parte dai flussi utente, non dalla component library |
| **Governance che blocca** | Dual-model review, costituzione 9 articoli, sprint formali | Governance leggera: test E2E + code review umana |

---

## 2. Revisione Critica dell'Architettura v1

### 2.1 Stack Tecnologico v1 — Cosa Tenere, Cosa Cambiare

| Tecnologia | Ruolo v1 | Verdetto | Motivazione |
|-----------|---------|----------|-------------|
| **Node.js + TypeScript** | Runtime + linguaggio | TENERE | Ecosistema maturo, type-safety, competenze del team |
| **Fastify** | Framework backend | TENERE | Performante, ben strutturato, buon ecosistema plugin |
| **PostgreSQL** | Database | TENERE | Robusto, feature-rich, ottimo supporto JSON |
| **Prisma** | ORM | TENERE | Type-safety eccellente, migrazioni gestibili |
| **React + Vite** | Frontend | TENERE | Ecosistema maturo, build veloce |
| **TanStack Router** | Routing | TENERE | Type-safe, data loading integrato |
| **TanStack Query** | Server state | TENERE | Unico pattern di data fetching (v1 ne aveva 3) |
| **Keycloak multi-realm** | Identity + AuthN | TENERE | Confermato: ogni tenant necessita auth diversa (SAML, OIDC, social) |
| **pnpm monorepo** | Package management | TENERE | Funziona bene, buon supporto workspace |
| **Module Federation** | Plugin UI loading | TENERE + SEMPLIFICARE | Confermato: iframe scartato. DX da semplificare radicalmente con CLI + Vite preset |
| **Kafka/Redpanda** | Event bus | TENERE + SEMPLIFICARE | Confermato: necessario per plugin event subscription. DX da semplificare con SDK |
| **Redis** | Cache + sessioni | TENERE | Cache, rate limiting, session |
| **MinIO** | Object storage | TENERE | S3-compatibile, necessario per file upload |
| **ABAC tree-walk** | Autorizzazione workspace | TENERE | Confermato: necessario per isolamento dati workspace-level |

### 2.2 Pattern Architetturali v1 — Analisi

| Pattern v1 | Verdetto | Motivazione |
|-----------|----------|-------------|
| Schema-per-tenant | **TENERE** — confermato per GDPR, isolamento fisico. Migliorare tooling migrazioni | La complessità è reale ma giustificata da compliance |
| ABAC con tree-walk ricorsivo | **TENERE** — confermato per workspace isolation. Migliorare DX e testabilità | Necessario per il modello di permessi workspace-level |
| Event bus (Kafka/Redpanda) | **TENERE** — confermato per plugin event subscription. Semplificare setup dev (1 nodo) e DX (SDK) | Necessario per l'architettura enterprise |
| Module Federation | **TENERE** — confermato come approccio UI. Semplificare con CLI + Vite preset | iframe scartato per styling, performance, UX |
| Service Registry per plugin | **ELIMINARE** — nessun valore reale. Plugin comunicano via REST API e eventi | Complessità senza caso d'uso |
| Container orchestration (Dockerode) | **ELIMINARE** — plugin backend come servizi HTTP, non container orchestrati | Complessità operativa ingiustificata |
| Extension Points (5 tabelle) | **RIDURRE** — manifest-driven per UI slots, unica tabella per workspace visibility | 5 tabelle eccessive per la funzionalità |
| AsyncLocalStorage tenant context | **TENERE** — pattern efficace e testato | Funziona bene |
| Layered architecture | **TENERE** — Controller > Service > Repository | Buona separazione delle responsabilità |

### 2.3 Cosa Eliminare

| Componente v1 | Motivazione Eliminazione |
|---------------|------------------------|
| **Service Registry** | Nessun plugin lo usa, REST + eventi sono sufficienti |
| **Container orchestration (Dockerode)** | Plugin backend non richiedono orchestrazione container |
| **Extension Points 5 tabelle** | Ridotto a manifest + 1 tabella workspace visibility |
| **Plugin SDK 6 classi** | Consolidate in 1 classe con API fluent |
| **7 stati lifecycle plugin** | Ridotti a 3 stati visibili (INSTALLED, ACTIVE, DISABLED) |
| **`isTestToken` code path** | Zero divergenza test-produzione |
| **`test-app.ts` separata** | L'app di test = l'app di produzione |
| **Dead code** (`App.tsx`, `pages/`, `views/`, `apps/plugins/`, `packages/config/`) | Non referenziato |
| **Codice duplicato frontend** (2 auth store, 3 pattern fetch, 3 pattern form) | Un solo pattern per tipo |

---

## 3. Architettura di Sistema

### 3.1 Vista d'Insieme

Il sistema è composto da 6 componenti principali:

| Componente | Descrizione |
|-----------|-------------|
| **Core API** | Backend Fastify monolitico che gestisce tutta la logica di piattaforma |
| **Web App** | Frontend React per utenti tenant (SPA con Module Federation host) |
| **Admin App** | Frontend React per super-admin (SPA) |
| **Plugin Apps** | Frontend React dei plugin (Module Federation remotes) |
| **Event Bus** | Kafka/Redpanda per comunicazione asincrona core-plugin e plugin-plugin |
| **Infrastruttura** | PostgreSQL, Keycloak, Redis, MinIO, Kafka/Redpanda |

### 3.2 Flusso di una Richiesta

1. Il browser carica la SPA (Web App o Admin App)
2. L'utente fa login tramite redirect Keycloak (realm del tenant)
3. Keycloak restituisce un JWT RS256 con claims tenant + ruoli + workspace permissions
4. Ogni richiesta API include il JWT nell'header Authorization
5. Il Core API valida il JWT tramite JWKS del realm corretto
6. Il middleware di tenant context estrae il `tenantId`, esegue `SET search_path = tenant_{slug}`
7. Il middleware ABAC valida i permessi workspace-level se la risorsa è workspace-scoped
8. Il controller processa la richiesta, il service esegue la logica, il repository accede ai dati
9. Se l'operazione è una mutazione CRUD su un'entità principale, il service emette un evento su Kafka
10. La risposta torna al frontend con i dati richiesti

### 3.3 Separazione delle Responsabilità

| Layer | Responsabilità | Non Fa |
|-------|---------------|--------|
| **Frontend (Shell)** | Rendering UI, routing, form validation, caching locale, caricamento plugin MF | Logica di business, accesso dati diretto |
| **Frontend (Plugin MF)** | UI specifica del plugin, integrata nativamente nella shell | Gestione auth, gestione tenant context |
| **API Gateway (middleware)** | Auth, tenant context (search_path), ABAC, rate limiting, CSRF, logging | Logica di business |
| **Service Layer** | Logica di business, orchestrazione, validazione, emissione eventi Kafka | Accesso diretto al database |
| **Repository Layer** | Query database, mapping dati | Logica di business, emissione eventi |
| **Event Bus (Kafka)** | Distribuzione eventi asincroni a plugin consumer | Storage persistente, query |
| **Database** | Storage, integrità referenziale, isolamento via schema | Logica applicativa |

---

## 4. Multi-Tenancy — Schema-per-Tenant

### 4.1 Decisione Confermata

**Schema-per-tenant è confermato** come strategia di isolamento dati.
La motivazione è la compliance GDPR:

| Requisito GDPR | Come Schema-per-Tenant lo Soddisfa |
|----------------|-----------------------------------|
| **Isolamento dati** | Ogni tenant ha uno schema PostgreSQL separato (`tenant_acme`, `tenant_beta`). Nessun dato condiviso |
| **Right to erasure** | `DROP SCHEMA tenant_acme CASCADE` elimina fisicamente tutti i dati del tenant in un'operazione atomica |
| **Data portability** | `pg_dump --schema=tenant_acme` esporta tutti i dati del tenant |
| **Data residency** | In futuro, schema diversi possono risiedere su database server diversi per regione |
| **Audit** | Le query sono automaticamente isolate via `search_path` — impossibile accedere a dati cross-tenant per errore applicativo |

RLS è stata valutata e scartata perché:
- Un bug applicativo potrebbe esporre dati cross-tenant se la policy non è impostata correttamente
- `DROP SCHEMA` è più pulito e verificabile di `DELETE FROM ... WHERE tenant_id = ?` per la cancellazione completa
- L'isolamento fisico è preferito per il target enterprise

### 4.2 Complessità da Gestire (Miglioramenti v2)

Schema-per-tenant introduce complessità reale. La v2 deve mitigarla:

| Complessità | Come la v1 la Gestiva | Miglioramento v2 |
|------------|----------------------|-----------------|
| **Migrazioni N schema** | Iterazione sequenziale su tutti gli schema | Migrazioni parallele con pool di worker, retry su failure, report di stato |
| **Connection pooling** | Un pool per schema | Pool condiviso con `SET search_path` per richiesta (meno connessioni) |
| **Test database** | Schema di test creati manualmente | Script automatico che crea N schema di test con seed deterministico |
| **Provisioning** | 7 step con error handling fragile | Provisioning transazionale: se uno step fallisce, rollback di tutti i precedenti |
| **Monitoraggio** | Non implementato | Migrazione health check: dashboard che mostra stato migrazioni per schema |

### 4.3 Schema Architecture

Tre tipi di schema nel database:

| Schema | Contenuto | Accesso |
|--------|-----------|---------|
| `core` | Tabelle globali (tenants, plugins marketplace, system config) | Sempre accessibile, non richiede tenant context |
| `tenant_{slug}` | Tabelle per-tenant (users, workspaces, plugin installations, plugin data, audit) | Accessibile solo con tenant context impostato |
| `tenant_{slug}` (plugin tables) | Tabelle dei plugin (es: `crm_contacts`, `crm_deals`) | Nello stesso schema tenant, create dalle migrazioni del plugin |

### 4.4 Tenant Context — Flusso

1. Il JWT contiene il `tenantId` (dal realm Keycloak del tenant)
2. Il middleware Fastify estrae il `tenantId` e risolve lo `slug` del tenant
3. Il middleware esegue `SET search_path = tenant_{slug}, core` sulla connessione dal pool
4. L'`AsyncLocalStorage` memorizza il tenant context per tutta la durata della richiesta
5. Tutte le query Prisma successive operano automaticamente nello schema del tenant
6. A fine richiesta, la connessione torna al pool con `RESET search_path`

### 4.5 Tenant Provisioning

Il provisioning di un nuovo tenant nella v2:

1. Creare il record tenant nello schema `core`
2. Creare lo schema `tenant_{slug}` in PostgreSQL
3. Eseguire tutte le migrazioni core nello schema
4. Eseguire le migrazioni dei plugin pre-installati (se presenti)
5. Creare il realm Keycloak per il tenant con configurazione auth
6. Creare l'utente admin nel realm Keycloak
7. Creare il bucket MinIO per i file del tenant
8. Inviare email di benvenuto all'admin

Se qualsiasi step fallisce: rollback di tutti gli step precedenti (transazione).

### 4.6 Tenant Deletion (GDPR Right to Erasure)

La cancellazione completa di un tenant:

1. `DROP SCHEMA tenant_{slug} CASCADE` — tutti i dati (core + plugin) eliminati
2. Delete del realm Keycloak — tutti gli utenti e la configurazione auth eliminati
3. Delete del bucket MinIO — tutti i file eliminati
4. Delete del record tenant nello schema `core`
5. Pubblicazione evento `tenant.deleted` su Kafka per notificare i plugin

---

## 5. Backend

### 5.1 Struttura

Il backend resta un monolito Fastify organizzato per feature module.

#### Organizzazione Directory

La struttura target:

- `src/modules/` — un folder per ogni dominio (auth, tenant, workspace, plugin, admin, notification, user-profile)
- Ogni modulo contiene: routes, service, repository (se necessario), types, validators
- `src/middleware/` — middleware condivisi (auth, tenant-context, abac, rate-limit, csrf, error-handler)
- `src/lib/` — utility condivise (database, logger, config, kafka-producer)
- `src/events/` — definizioni eventi core e producer

### 5.2 API Design

| Principio | Dettaglio |
|-----------|----------|
| REST puro | Resource-based URL, HTTP verbs per azioni |
| Versioning | `/api/v1/` come prefisso per tutti gli endpoint |
| Paginazione | `page` e `pageSize` query params, max 100 per pagina |
| Filtri | Query params per filtri (`?status=active&search=acme`) |
| Ordinamento | `sort=field&order=asc|desc` |
| Errori | Formato standard con code, message, details |
| Validazione | Zod schema su ogni endpoint, errori 400 con dettaglio campi |

### 5.3 Middleware Stack

L'ordine dei middleware è fisso e **identico in test e produzione**:

1. **Request ID** — genera un UUID per ogni richiesta
2. **Logger** — log strutturato con request ID (Pino JSON)
3. **CORS** — configurazione per-origin
4. **Rate Limiting** — 3 livelli (globale, per-IP, per-endpoint)
5. **JWT Validation** — verifica token Keycloak RS256 via JWKS del realm corretto
6. **Tenant Context** — estrae tenantId, risolve slug, esegue `SET search_path`
7. **ABAC Authorization** — per endpoint workspace-scoped, valuta condition tree
8. **CSRF** — protezione su endpoint state-changing
9. **Route Handler** — controller > service > repository

**Regola critica v2**: questo stack è identico in produzione e nei test.
Nessun middleware disabilitato nei test. Se un test non passa con il
middleware attivo, il test o il codice ha un bug.

### 5.4 Error Handling

Tre categorie di errore con handling specifico:

| Categoria | HTTP Status | Risposta | Logging |
|-----------|------------|---------|---------|
| Validazione input | 400 | Dettaglio per campo | info |
| Non autorizzato / Non trovato | 401/403/404 | Messaggio generico | warn |
| Errore server | 500 | Messaggio generico senza stack trace | error con stack trace |

Tutti gli errori seguono il formato standard con `code`, `message`,
`details` opzionale. Nessuno stack trace in produzione.

### 5.5 Event Emission

Ogni operazione CRUD su entità principali emette un evento Kafka:

- Il service, dopo aver completato l'operazione sul database, pubblica l'evento
- La pubblicazione è fire-and-forget (non transazionale con il DB — eventual consistency)
- Se Kafka è temporaneamente non disponibile, l'evento viene messo in una coda locale e riprovato
- Il formato evento è standard: `{ eventType, tenantId, entityId, payload, timestamp, correlationId }`

---

## 6. Frontend

### 6.1 Stack Confermato

| Tecnologia | Ruolo | Motivazione |
|-----------|-------|-------------|
| React 19 | UI framework | Ecosistema, competenze |
| Vite | Build tool | Velocità dev, build ottimizzato |
| Module Federation (via `@module-federation/vite`) | Plugin UI loading | Confermato: integrazione nativa, shared deps |
| TanStack Router | Routing | Type-safe, data loading |
| TanStack Query | Server state | Caching, retry, invalidation — unico pattern di data fetching |
| Zustand | Client state | Solo per stato che non viene dal server (theme, sidebar open, auth) |
| Tailwind CSS | Styling | Utility-first, veloce, consistente |
| react-hook-form + Zod | Form handling | Un solo pattern per tutti i form |
| react-intl | i18n | Traduzione stringhe, formato date/numeri |
| Radix UI | Primitivi accessibili | Base per il design system |

### 6.2 Architettura Module Federation

#### Shell (Host)

La Web App è il Module Federation host:
- Carica i plugin remoti dichiarati nel manifest dei plugin attivi
- Condivide le dipendenze core (React, React DOM, TanStack Query, `@plexica/ui`, `@plexica/i18n`)
- Gestisce il fallback se un plugin remoto non è disponibile (error boundary)
- Gestisce il lazy loading dei componenti plugin

#### Plugin (Remote)

Ogni plugin con UI è un Module Federation remote:
- Espone componenti React standard
- Le dipendenze condivise (React, Router, Query, UI lib) vengono dalla shell — non duplicate
- Il plugin dev non configura MF direttamente: il `@plexica/vite-plugin` lo fa automaticamente
- Il componente plugin riceve il contesto (tenant, user, workspace, theme) via React context dalla shell

#### Vantaggi rispetto a iframe (motivazione della scelta)

| Aspetto | Module Federation | iframe |
|---------|------------------|--------|
| **Styling** | CSS condiviso, design system nativo | CSS isolato, design system duplicato o non applicabile |
| **Performance** | Shared deps non duplicate, un solo DOM | DOM separato, deps duplicate, overhead comunicazione |
| **Comunicazione** | Props e React context nativi | postMessage asincrono, serializzazione/deserializzazione |
| **UX** | Scrollbar unificata, focus management, animazioni fluide | Scrollbar doppia, focus trap, resize manuale |
| **Routing** | TanStack Router condiviso | Routing separato, sync URL manuale |
| **DX** | Con Vite preset: trasparente. Senza: complessa | Semplice ma limitante |

### 6.3 Regole di Architettura Frontend

| Regola | Motivazione |
|--------|-------------|
| Nessun file componente sopra le 200 righe | File troppo grandi sono i file route da 1000 righe della v1 |
| Un solo modo di fare data fetching (TanStack Query) | v1 aveva 3 modi diversi |
| Un solo modo di fare form (react-hook-form + Zod) | v1 aveva 3 modi diversi |
| Un solo auth store (Zustand) | v1 aveva 2 auth store |
| Logica di business negli hook, non nei componenti | Componenti puri che ricevono dati e rendono UI |
| Nessun console.log in produzione | v1 ne è piena |
| Nessun emoji come icona | v1 usa emoji. Usare una icon library (Lucide o simile) |
| Nessun window.confirm() nativo | v1 lo usa. Usare dialog component del design system |
| Tutte le stringhe UI da i18n | v1 ha stringhe hardcoded ovunque |
| Error boundary per ogni plugin slot | Un crash del plugin non crasha la shell |

### 6.4 Design System

#### Requisiti Fondamentali

- **Font**: sans-serif professionale (Inter o system-ui), non monospace
- **Colori**: palette brand definita, palette semantica, dark mode, override per tenant
- **Spacing**: scala 4px (4, 8, 12, 16, 20, 24, 32, 40, 48, 64)
- **Border radius**: coerente su tutta l'app (4px per piccoli, 8px per medi, 12px per grandi)
- **Ombre**: 3 livelli definiti (sm, md, lg)
- **Componenti**: basati su primitivi accessibili (Radix UI)
- **Documentazione**: Storybook con tutte le varianti
- **Condivisione**: `@plexica/ui` condiviso tra shell, admin app e plugin via MF shared deps

#### Componenti Core

| Componente | Varianti | Accessibilità |
|-----------|----------|--------------|
| Button | primary, secondary, destructive, ghost, link | focus ring, aria-label su icon-only |
| Input | text, email, password, number, search | aria-describedby per errori |
| Select | single, multi, async | aria-expanded, keyboard navigation |
| Dialog | alert, confirm, form | focus trap, aria-modal |
| Toast | success, error, warning, info | role="alert", auto-dismiss con timer |
| Table | sortable, paginated, selectable | scope headers, keyboard navigation |
| Form | con validazione inline, loading state, error summary | aria-invalid, aria-errormessage |
| Navigation | sidebar, topbar, breadcrumb | aria-current, skip link |
| Card | standard, clickable, collapsible | keyboard accessible |
| Badge | status, count, label | aria-label per context |
| Avatar | image, initials, fallback | alt text |
| Empty State | illustrazione + messaggio + azione | non decorativo, informativo |
| Error Boundary | fallback UI per crash plugin | messaggio user-friendly, retry button |

### 6.5 Information Architecture

#### App Tenant (web)

**Navigazione principale** (sidebar):

- Dashboard
- Workspace (con sub-navigation per workspace attivo)
- Plugin
- Impostazioni

**Dashboard**:
- Riepilogo workspace recenti
- Notifiche recenti
- Attività recente

**Workspace** (vista dettaglio):
- Overview (metriche workspace)
- Contenuto (pannelli contribuiti dai plugin attivi nel workspace)
- Membri
- Plugin attivi
- Impostazioni

**Plugin**:
- Marketplace (disponibili)
- Installati (gestione)
- Configurazione (per plugin)

**Impostazioni Tenant**:
- Generale (nome, slug, logo)
- Branding (colori, tema)
- Utenti e Ruoli
- Auth Configuration (Keycloak realm settings)
- Audit Log

#### App Super Admin

**Navigazione principale** (sidebar):

- Dashboard
- Tenant
- Plugin (Marketplace management)
- Utenti
- Sistema

**Dashboard**:
- Metriche piattaforma (tenant, utenti, plugin)
- Health status servizi
- Errori recenti
- Kafka consumer lag (per plugin)

**Tenant**:
- Lista tenant con ricerca e filtri
- Dettaglio tenant (info, utenti, plugin, audit)
- Provisioning wizard
- Sospensione / Riattivazione / Eliminazione

**Plugin**:
- Catalogo plugin
- Review queue
- Statistiche installazione

**Sistema**:
- Configurazione
- Log
- Health check dettagliato
- Event bus status

---

## 7. Sistema Plugin Semplificato

### 7.1 Filosofia

Il sistema plugin della v2 **mantiene l'architettura enterprise della v1**
(Module Federation, Kafka events, schema-per-tenant per i dati plugin)
ma **incapsula tutta la complessità dietro tooling e SDK**.

Il principio è: **lo sviluppatore plugin scrive componenti React normali
e handler di eventi normali. Non sa che sotto c'è Module Federation,
Kafka o schema management.**

### 7.2 Struttura di un Plugin

Un plugin è composto da:

| Componente | Obbligatorio | Descrizione |
|-----------|-------------|-------------|
| `manifest.json` | Sì | Dichiarazione del plugin: nome, versione, permessi, UI slots, eventi, config schema |
| `frontend/` | No | Componenti React (Module Federation remote — generato automaticamente dal Vite preset) |
| `backend/` | No | Endpoint API aggiuntivi (servizio HTTP) |
| `migrations/` | No | Migrazioni SQL/Prisma per le tabelle plugin nello schema tenant |
| `README.md` | Sì | Documentazione per l'utente e lo sviluppatore |

### 7.3 Module Federation Semplificato — Tre Livelli

**Livello 1 — CLI di scaffolding**:
- `npx create-plexica-plugin my-plugin` genera un progetto completo
- Il progetto generato ha già: vite config con MF pre-configurato via preset,
  manifest pre-compilato, componente React di esempio, test di esempio
- Lo sviluppatore non vede e non tocca mai la configurazione MF

**Livello 2 — Vite Plugin Preset** (`@plexica/vite-plugin`):
- Un plugin Vite dedicato che configura automaticamente Module Federation
- Il preset legge il `manifest.json` del plugin e genera la config MF completa
- Shared dependencies (React, React DOM, TanStack Router, TanStack Query,
  `@plexica/ui`, `@plexica/i18n`) sono dichiarate centralmente nel preset
- Lo sviluppatore aggiunge solo le sue dipendenze specifiche nel `package.json`
- Nessuna configurazione manuale di remote entry, exposes, shared

**Livello 3 — Dev Server integrato**:
- `npm run dev` nel plugin avvia un Vite dev server con hot reload
- Il dev server si registra automaticamente nella shell di sviluppo locale
- La shell di sviluppo carica il plugin dal dev server locale via MF
- Lo sviluppatore vede le sue modifiche in tempo reale nella shell reale
- Nessun mock della shell — il plugin gira nella shell vera durante lo sviluppo

**Risultato**: lo sviluppatore plugin scrive componenti React normali.
Non configura MF. Non gestisce shared deps. Non gestisce remote entry.

### 7.4 Manifest Plugin v2

Il manifest è la fonte di verità per tutto ciò che riguarda un plugin:

**Campi principali**:
- `id` — identificativo unico
- `name` — nome visualizzato (i18n key)
- `version` — semver
- `description` — descrizione (i18n key)
- `author` — autore/organizzazione
- `permissions` — permessi richiesti dalla piattaforma
- `ui.extensions[]` — punti di estensione UI (slot name + component export)
- `ui.routes[]` — route aggiuntive nel workspace
- `api.endpoints[]` — endpoint backend esposti
- `events.subscriptions[]` — eventi a cui il plugin si sottoscrive
- `events.publications[]` — eventi che il plugin emette
- `config.schema` — schema JSON della configurazione per-tenant
- `migrations` — path alle migrazioni database del plugin

### 7.5 Lifecycle Plugin

Tre stati visibili, transizioni chiare:

| Stato | Descrizione | Transizioni |
|-------|-------------|------------|
| `INSTALLED` | Plugin nel sistema, non visibile agli utenti. Migrazioni eseguite | → ACTIVE, → uninstall |
| `ACTIVE` | Plugin attivo e visibile agli utenti | → DISABLED |
| `DISABLED` | Plugin disabilitato, dati preservati | → ACTIVE, → uninstall |

**Installazione** (cosa succede):
1. Validazione manifest
2. Esecuzione migrazioni plugin nello schema di ogni tenant che lo installa
3. Creazione Kafka consumer group per gli eventi sottoscritti
4. Stato → INSTALLED

**Disinstallazione** (cosa succede):
1. Stop Kafka consumer
2. Drop tabelle plugin dallo schema tenant (o preserva con flag, per sicurezza dati)
3. Rimozione record installazione
4. Evento `plugin.uninstalled`

### 7.6 Plugin Data — Tabelle nello Schema Tenant

Ogni plugin che necessita di persistenza ha le proprie tabelle **nello
schema del tenant**.

**Flusso**:
1. Il plugin include le proprie migrazioni (SQL o Prisma) nella directory `migrations/`
2. Al momento dell'installazione in un tenant, il core esegue le migrazioni nello schema `tenant_{slug}`
3. Le tabelle del plugin vivono accanto alle tabelle core (es: `tenant_acme.crm_contacts`)
4. Le tabelle plugin possono referenziare entità core via FK (`crm_contacts.workspace_id` → `workspaces.id`)
5. Alla disinstallazione, le tabelle plugin vengono rimosse dallo schema

**Vantaggi**:
- Modello dati tipizzato e relazionale (non JSON blob)
- Query SQL standard (JOIN, index, constraint)
- Migrazioni versionabili e testabili
- GDPR: i dati plugin sono nello schema tenant, cancellati con `DROP SCHEMA`
- No cross-tenant data leak: il `search_path` isola automaticamente

**Convenzione naming**: le tabelle plugin hanno il prefisso `{pluginId}_` per evitare
conflitti con le tabelle core e di altri plugin (es: `crm_contacts`, `analytics_events`).

### 7.7 Extension Points UI

Approccio ibrido manifest + singola tabella:

- **Punti di estensione UI** (dove il plugin appare nella shell): dichiarati
  nel manifest. La shell legge i manifest dei plugin attivi e renderizza
  i componenti MF remote nei punti dichiarati. Nessuna tabella database
- **Visibilità per workspace**: tabella `plugin_workspace_visibility` per
  controllare quali plugin sono visibili in quali workspace. Un tenant admin
  può attivare/disattivare plugin per workspace specifici
- **Error boundary**: ogni slot di estensione ha un error boundary. Se un
  componente plugin crasha, la shell mostra un fallback senza impattare il resto

**Punti di estensione definiti dalla shell**:
- `sidebar-navigation` — voci nel menu laterale
- `workspace-panel` — pannelli nel workspace
- `workspace-tab` — tab nella vista workspace
- `settings-tab` — tab nella pagina impostazioni
- `dashboard-widget` — widget nella dashboard
- `header-action` — azioni nell'header

### 7.8 SDK Plugin v2

L'SDK v2 espone una API semplificata — un'unica classe base:

- `onEvent(eventType, handler)` — sottoscrive un evento Kafka (wrapper SDK, non config Kafka diretta)
- `emitEvent(eventType, payload)` — emette un evento custom su Kafka
- `getConfig()` — ottiene la configurazione per-tenant del plugin
- `callApi(method, path, data)` — chiama un'API core autenticata
- `getContext()` — ottiene tenant, user, workspace corrente
- `getDb()` — ottiene un client Prisma configurato per le tabelle del plugin nello schema tenant

### 7.9 Developer Experience Plugin

L'obiettivo è: **un plugin funzionante in 4 ore**.

Il flusso per uno sviluppatore plugin:

1. `npx create-plexica-plugin my-plugin` — scaffolding con template
2. Il template include: manifest pre-compilato, frontend React con MF auto-configurato, backend Express minimale, migrazioni di esempio
3. `cd my-plugin && npm run dev` — avvia dev server locale con hot reload
4. Il dev server si registra nella shell locale — il plugin appare nella shell
5. Lo sviluppatore modifica componenti React normali, vede le modifiche live nella shell
6. Per sottoscrivere un evento: `sdk.onEvent('workspace.created', async (event) => { ... })`
7. Per creare tabelle: aggiunge una migrazione SQL nella directory `migrations/`
8. `npm run test` — esegue i test del plugin (unit + integrazione con la piattaforma)
9. `npm run build && npm run publish` — pubblica nel marketplace

**Differenza con v1**: nella v1 serviva configurare Module Federation manualmente,
sincronizzare versioni React, configurare consumer Kafka, registrare nel service
registry, usare 6 classi SDK. Nella v2 la CLI configura MF, l'SDK wrappa Kafka,
e lo sviluppatore scrive React e handler normali.

---

## 8. Autenticazione e Autorizzazione

### 8.1 Autenticazione — Keycloak Multi-Realm

**Confermato: un realm per tenant.**

| Aspetto | Dettaglio |
|---------|----------|
| **Perché multi-realm** | Ogni tenant può avere autenticazione diversa: SAML aziendale, OIDC, social login (Google, Microsoft), MFA policies diverse. Un singolo realm non consente questa flessibilità |
| **Provisioning** | La creazione tenant include la creazione automatica del realm con client OIDC, ruoli base e utente admin |
| **JWT** | RS256 firmato dal realm del tenant. Il Core API verifica via JWKS endpoint del realm specifico |
| **SSO** | Possibile intra-tenant (stessi utenti su più workspace). Cross-tenant non supportato (realm separati) |
| **JWKS caching** | Il Core API cache le JWKS per realm con TTL (evita call a Keycloak su ogni richiesta) |
| **Realm discovery** | Il tenant slug nell'URL determina quale realm usare per il login redirect |

### 8.2 Autorizzazione — RBAC + ABAC

#### RBAC per Ruoli Standard

Ruoli predefiniti che coprono la maggior parte dei casi:

| Ruolo | Scope | Permessi |
|-------|-------|----------|
| `super-admin` | Piattaforma | Accesso completo cross-tenant |
| `tenant-admin` | Tenant | Gestione completa del tenant (utenti, plugin, workspace, configurazione) |
| `workspace-admin` | Workspace | Gestione del workspace (membri, impostazioni, plugin attivi) |
| `member` | Workspace | Accesso operativo al workspace e ai plugin |
| `viewer` | Workspace | Solo lettura |

#### ABAC per Isolamento Workspace

**Confermato: ABAC con condition tree è necessario per l'isolamento dati
workspace-level all'interno del tenant.**

L'ABAC si attiva per le risorse workspace-scoped e permette regole come:
- "L'utente X può vedere solo i dati del workspace Y"
- "L'utente con ruolo Z nel workspace W può modificare, ma non cancellare"
- "I dati del workspace A non sono visibili dal workspace B, anche per lo stesso utente"

**Miglioramenti v2 rispetto alla v1**:

| Aspetto | v1 | v2 |
|---------|----|----|
| **Testabilità** | ABAC difficile da testare unitariamente | Policy testate con test parametrici: dato contesto X, la decisione è Y |
| **Debugging** | Decision tree opaco | Decision logging: ogni valutazione ABAC logga input, regole valutate, risultato |
| **Cache** | Redis cache delle policy evaluation | Stessa cache Redis, ma con invalidazione più aggressiva |
| **DX** | Policy definite in codice complesso | Policy definite in formato dichiarativo con DSL semplice |

### 8.3 Autenticazione nei Test

**Regola v2 critica**: nessun `isTestToken`, nessun token HS256 auto-firmato.

I test E2E e di integrazione usano Keycloak reale:
- Un container Keycloak di test con realm pre-configurati (2 tenant di test)
- 3 utenti per tenant di test (admin, member, viewer)
- I test ottengono token reali chiamando l'endpoint token di Keycloak
- I token sono RS256 firmati da Keycloak, identici alla produzione
- Il Core API valida i token con la stessa logica della produzione
- Nessun code path diverso: il JWT validation middleware è lo stesso

---

## 9. Modello Dati

### 9.1 Schema `core` (Globale)

Tabelle che non sono tenant-scoped:

| Tabella | Descrizione |
|---------|-------------|
| `tenants` | Registro tenant (id, slug, name, status, config, created_at) |
| `plugins` | Catalogo plugin marketplace (id, name, version, manifest, status) |
| `plugin_versions` | Versioni pubblicate dei plugin |
| `system_config` | Configurazione piattaforma |

### 9.2 Schema `tenant_{slug}` (Per-Tenant)

Tabelle replicate in ogni schema tenant:

| Tabella | Descrizione |
|---------|-------------|
| `users` | Utenti del tenant con mapping Keycloak (keycloak_user_id, email, name) |
| `roles` | Ruoli definiti per il tenant (predefiniti + custom) |
| `user_roles` | Assegnazione ruoli a utenti |
| `workspaces` | Workspace del tenant (slug, name, parent_id per gerarchia) |
| `workspace_members` | Membri dei workspace con ruoli workspace-level |
| `plugin_installations` | Plugin installati nel tenant (plugin_id, status, config) |
| `plugin_workspace_visibility` | Visibilità plugin per workspace |
| `abac_policies` | Policy ABAC per workspace isolation |
| `notifications` | Notifiche per utente |
| `audit_logs` | Log di audit (chi, cosa, quando, su quale risorsa) |
| `{plugin}_*` | Tabelle dei plugin (es: `crm_contacts`, `crm_deals`) |

### 9.3 Relazioni Chiave

- Un `tenant` (in `core`) ha uno schema `tenant_{slug}` con tutte le sue tabelle
- Un `workspace` ha molti `workspace_members` e una gerarchia parent/child
- Un `user` ha molti `user_roles` e `workspace_members`
- Un `plugin` (in `core`) ha molte `plugin_installations` (per-tenant)
- Le tabelle plugin possono avere FK verso tabelle core tenant (es: `workspace_id`)

### 9.4 Confronto con v1

La v1 aveva circa 30 modelli Prisma. La v2 target:
- **Schema core**: 4 tabelle (da ~10 nella v1 — eliminati service registry, extension slots)
- **Schema tenant**: ~10 tabelle core + tabelle plugin (da ~20 nella v1 — eliminati extension tables)

Eliminati:
- 5 tabelle Extension Points (extension_slots, extension_contributions, workspace_extension_visibility, extensible_entities, data_extensions) — sostituite da manifest + 1 tabella visibility
- Tabelle Service Registry
- Tabelle marketplace complesse (semplificate)

---

## 10. Sistema Eventi — Kafka/Redpanda

### 10.1 Perché Kafka è Confermato

Il sistema eventi è il meccanismo che permette ai plugin di **reagire
a ciò che succede nella piattaforma** e di **contribuire logiche
personalizzate**. Senza eventi, i plugin sono solo UI e API isolate.

| Requisito | Perché Kafka/Redpanda |
|-----------|----------------------|
| **Durabilità** | Gli eventi non si perdono se un consumer è temporaneamente offline |
| **Ordering** | Gli eventi per entità sono ordinati (partition key = entityId) |
| **Replay** | Un plugin può riprocessare eventi storici (utile per recovery e nuove installazioni) |
| **Dead letter queue** | Eventi che falliscono non bloccano il consumer, vanno in DLQ per analisi |
| **Multi-consumer** | Più plugin possono sottoscrivere lo stesso evento indipendentemente |
| **Target enterprise** | Kafka è lo standard enterprise per event streaming |

### 10.2 Semplificazioni v2

| Aspetto | v1 | v2 |
|---------|----|----|
| **Setup dev locale** | Cluster Redpanda 3 nodi | Singolo nodo Redpanda per dev |
| **Setup staging/prod** | Cluster 3 nodi | Cluster 3 nodi (invariato) |
| **Plugin subscription** | Configurare KafkaJS consumer manualmente | `sdk.onEvent('workspace.created', handler)` |
| **Event publishing core** | Manuale per operazione | Automatico: il service layer emette eventi su ogni CRUD |
| **Topic naming** | Manuale | Convention: `plexica.{entity}.{action}` |
| **Consumer group** | Configurazione manuale | Automatico: `plugin-{pluginId}-{tenantId}` |
| **Dead letter queue** | Non implementato | Automatica per ogni consumer plugin: `dlq.plugin-{pluginId}` |
| **Monitoring** | Non implementato | Consumer lag per plugin esposto in Prometheus |
| **Schema validation** | Non implementato | Schema registro per validare payload eventi |

### 10.3 Eventi Core Emessi Automaticamente

Il core emette eventi per ogni operazione CRUD sulle entità principali:

| Entità | Eventi |
|--------|--------|
| Tenant | `plexica.tenant.created`, `plexica.tenant.updated`, `plexica.tenant.suspended`, `plexica.tenant.deleted` |
| User | `plexica.user.created`, `plexica.user.updated`, `plexica.user.deleted`, `plexica.user.invited` |
| Workspace | `plexica.workspace.created`, `plexica.workspace.updated`, `plexica.workspace.deleted` |
| Workspace Member | `plexica.workspace-member.added`, `plexica.workspace-member.removed`, `plexica.workspace-member.role-changed` |
| Plugin Installation | `plexica.plugin.installed`, `plexica.plugin.activated`, `plexica.plugin.deactivated`, `plexica.plugin.uninstalled` |

Tutti gli eventi includono: `tenantId`, `entityId`, `payload` (stato completo dell'entità), `timestamp`, `correlationId`.

### 10.4 Plugin Custom Events

I plugin possono emettere eventi custom:
- Topic naming: `plugin.{pluginId}.{entity}.{action}` (es: `plugin.crm.contact.created`)
- I plugin dichiarano nel manifest `events.publications[]` e `events.subscriptions[]`
- Il core valida che un plugin sottoscriva solo eventi per cui ha permesso
- Cross-plugin subscription: il plugin Analytics può sottoscrivere `plugin.crm.contact.created`

---

## 11. Comunicazione e Integrazioni

### 11.1 Frontend-Backend

- **HTTP REST** per tutte le operazioni CRUD
- **Server-Sent Events (SSE)** per notifiche real-time
- **TanStack Query** per caching e invalidation automatica

### 11.2 Core-Plugin (UI)

- **Module Federation** per caricamento componenti plugin nella shell
- **React Context** per passaggio contesto (tenant, user, workspace, theme) dalla shell al plugin
- **Error Boundary** per isolamento crash plugin

### 11.3 Core-Plugin (Backend)

- **HTTP proxy** per le chiamate API verso plugin backend
- **Kafka** per eventi core → plugin e plugin → plugin
- Il Core API aggiunge auth context e tenant context prima di inoltrare le chiamate proxy

### 11.4 Integrazioni Esterne

| Servizio | Protocollo | Scopo |
|---------|-----------|-------|
| Keycloak | HTTP REST (Admin API + OIDC) | Autenticazione, gestione utenti/realm |
| PostgreSQL | TCP (Prisma) | Storage dati con schema-per-tenant |
| Kafka/Redpanda | Kafka protocol | Event streaming |
| Redis | TCP (ioredis) | Caching, rate limiting, ABAC policy cache |
| MinIO | S3 API | File storage per tenant |
| SMTP | SMTP | Email (notifiche, inviti) |

---

## 12. Infrastruttura e Deployment

### 12.1 Componenti di Infrastruttura

| Servizio | Sviluppo Locale | Staging/Produzione |
|---------|-----------------|-------------------|
| PostgreSQL 15+ | Docker (singola istanza) | Managed PostgreSQL |
| Keycloak 26+ | Docker (singola istanza) | Cluster con HA |
| Redis | Docker (singola istanza) | Managed Redis |
| MinIO | Docker (singola istanza) | MinIO o S3 |
| Kafka/Redpanda | Docker (**singolo nodo**) | Cluster **3 nodi** |
| SMTP | Mailhog (mock) | Provider email reale |
| Prometheus | Docker (opzionale) | Managed o self-hosted |
| Grafana | Docker (opzionale) | Managed o self-hosted |

### 12.2 Ambienti

| Ambiente | Scopo | Stack |
|---------|-------|-------|
| **Sviluppo locale** | Sviluppo quotidiano | Docker Compose con tutti i servizi (Redpanda singolo nodo) |
| **Test CI** | Pipeline CI/CD | Docker Compose identico a dev |
| **Staging** | Pre-produzione | Identico a produzione (Redpanda 3 nodi) |
| **Produzione** | Utenti reali | Kubernetes o Docker Compose (Redpanda 3 nodi) |

### 12.3 Docker Compose per Sviluppo

Un singolo `docker-compose.yml` che avvia tutto:
- PostgreSQL (con init script per schema `core`)
- Keycloak (con realm di test importati automaticamente)
- Redis
- MinIO
- Redpanda (**singolo nodo** — non 3 come la v1)
- Core API (con hot reload)
- Web App (Vite dev server — MF host)
- Admin App (Vite dev server)

`docker compose up` e tutto funziona. Nessuna configurazione manuale.

### 12.4 Deployment Strategy

- **Feature flags** per tutte le feature user-facing
- **Rolling update** con zero downtime
- **Database migrations**: eseguite prima del deploy, backward compatible
- **Rollback**: < 5 minuti tramite redeploy versione precedente
- **Schema migrations multi-tenant**: eseguite in parallelo con worker pool, retry su failure

---

## 13. Architettura di Testing E2E Full-Stack

### 13.1 Perché è la Sezione più Importante

La v1 ha dimostrato che **senza test E2E full-stack affidabili, il numero
di test unitari è irrilevante**. La v2 mette il testing E2E al centro
dell'architettura, non come afterthought.

### 13.2 Piramide di Test v2

| Livello | Cosa Testa | Ambiente | Mock Permessi | Bloccante CI |
|---------|-----------|---------|--------------|-------------|
| **E2E Full-Stack** | Intero flusso utente: browser → API → database → Keycloak → Kafka | Stack Docker completo | Nessuno | Sì |
| **Integrazione API** | Endpoint API con tutti i middleware | API reale + DB + Keycloak + Redis + Kafka | Solo SMTP | Sì |
| **Unitario** | Logica di business isolata | In-memory | Solo I/O esterno | Sì |

### 13.3 Test E2E Full-Stack — Design

#### Ambiente

- Stack Docker identico alla produzione (stessi container, stesse config)
- Keycloak con realm di test (2 tenant, 3 utenti ciascuno)
- PostgreSQL con schema-per-tenant di test pre-creati
- Kafka/Redpanda per testare event flow (plugin riceve eventi)
- Tutto avviato da `docker compose -f docker-compose.test.yml up`

#### Tool

- **Playwright** per controllo browser
- Test organizzati per flusso utente, non per pagina

#### Flussi Testati

Ogni flusso critico ha almeno un test E2E:

| Flusso | Cosa Verifica |
|--------|-------------|
| Login tenant user | Redirect Keycloak (realm del tenant), token RS256, redirect dashboard, dati utente |
| Creazione workspace | Form compilato, API chiamata, workspace visibile nella lista, membro automatico |
| Gerarchia workspace | Creazione child workspace, navigazione parent/child |
| Installazione plugin | Marketplace, click installa, permessi confermati, migrazioni eseguite, plugin attivo con UI MF |
| Plugin event subscription | Plugin installato, creazione workspace, plugin riceve evento `workspace.created` |
| Gestione utenti | Invito via email, accettazione via Keycloak, ruolo assegnato, visibilità corretta |
| Tenant provisioning (admin) | Wizard completato, schema creato, realm creato, admin può fare login |
| Gestione ruoli + ABAC | Ruolo assegnato, ABAC policy applicata, utente vede/non vede risorse workspace |
| Isolamento tenant | Utente tenant A non vede dati tenant B (test di sicurezza critico) |
| Plugin disabilitazione | Plugin attivo, disabilitazione, UI non visibile, riattivazione, UI visibile |
| Branding tenant | Admin carica logo/colori, l'interfaccia riflette il branding |
| Notifiche SSE | Azione che genera notifica, utente la riceve in tempo reale |
| Tenant deletion | Super admin elimina tenant, schema droppato, realm eliminato, dati spariti |
| i18n switch | Utente cambia lingua, tutta l'interfaccia si aggiorna |

#### Dati di Test

- Set di dati deterministico versionato nel repository
- 2 tenant pre-configurati (per test isolamento)
- 3 utenti per tenant (admin, member, viewer)
- 2 workspace per tenant (per test ABAC cross-workspace)
- 1 plugin di test installato (con UI MF, backend, event subscription, tabelle plugin)

#### Reset tra Test

- Ogni suite di test ripristina il database allo stato iniziale
- Nessun test dipende dall'ordine di esecuzione
- Il reset è veloce (truncate + re-seed per schema tenant, non drop + recreate)

### 13.4 Test Integrazione API — Design

#### Ambiente

- Core API avviato come processo reale (non `app.inject()`)
- Database reale, Keycloak reale, Redis reale, Kafka reale
- Client HTTP reale (fetch o axios)

#### Differenze con v1

| Aspetto | v1 | v2 |
|---------|----|----|
| Invocazione API | `app.inject()` in-process | HTTP client reale contro server in ascolto |
| Autenticazione | Token HS256 auto-firmati | Token RS256 da Keycloak reale |
| Middleware | CSRF disabilitato, rate limit 10000/min | Tutti i middleware attivi |
| Event bus | Non testato | Kafka reale — verifica che eventi vengano emessi |
| Database | Connessione condivisa | Schema tenant di test, `SET search_path` reale |
| Reset | Transazione con rollback | Truncate + seed tra suite |

### 13.5 Test Unitari — Design

I test unitari testano logica di business pura:
- Validazione input
- Trasformazioni dati
- Calcoli
- Regole di business
- ABAC policy evaluation (con contesto mockato)

**Non testano** wiring (chi chiama chi con quali parametri). Se il 38%
delle asserzioni è `toHaveBeenCalledWith`, non si sta testando logica
di business.

### 13.6 CI Pipeline

La pipeline CI segue questo ordine:

1. **Lint + TypeScript** — errori di compilazione bloccano subito
2. **Build** — tutti i package e le app (inclusi plugin MF remotes)
3. **Avvio stack Docker** — PostgreSQL, Keycloak, Redis, MinIO, Redpanda, API, Frontend
4. **Seed dati test** — schema tenant creati, dati deterministici, realm Keycloak importati
5. **Test unitari** — veloci, primi a eseguire
6. **Test integrazione API** — contro stack reale
7. **Test E2E Playwright** — contro stack reale con browser (inclusi plugin MF)
8. **Report copertura** — unificato (unit + integration + E2E)
9. **Teardown** — cleanup

**Tempo target**: intera pipeline in meno di 15 minuti.

---

## 14. Osservabilità

### 14.1 Requisiti Minimi

| Requisito | Implementazione |
|-----------|----------------|
| Health check | Endpoint `/health` che verifica database, Redis, Keycloak, Kafka |
| Log strutturati | Pino JSON con request ID, tenant ID, user ID, correlation ID |
| Metriche | Prometheus endpoint con metriche HTTP, database, Kafka consumer lag |
| Tracing | OpenTelemetry con Tempo (opzionale in dev, attivo in staging/prod) |
| Kafka monitoring | Consumer lag per plugin per tenant, DLQ size |

### 14.2 Metriche Specifiche v2

Oltre alle metriche standard (HTTP latency, error rate, DB query time):

| Metrica | Scopo |
|---------|-------|
| `kafka_consumer_lag{plugin, tenant}` | Monitorare se un plugin è indietro nel processing eventi |
| `kafka_dlq_size{plugin}` | Monitorare eventi falliti per plugin |
| `tenant_schema_migration_status{tenant}` | Monitorare stato migrazioni per tenant |
| `plugin_mf_load_time{plugin}` | Monitorare tempo caricamento Module Federation per plugin |
| `plugin_mf_load_error{plugin}` | Monitorare errori di caricamento MF |
| `abac_evaluation_time{policy}` | Monitorare performance valutazione ABAC |

### 14.3 Confronto con v1

La v1 ha specificato un sistema di osservabilità completo (4 ADR, Spec 012)
ma l'implementazione è parziale e non testata end-to-end. La v2 implementa
il minimo necessario e lo testa:

- Health check testato nel test E2E di smoke test
- Log strutturati verificabili nei test (output JSON parsabile)
- Metriche Prometheus verificabili con curl nel CI
- Kafka consumer lag verificato nel test di event subscription
- Tracing opzionale — attivabile con feature flag

---

*Fine del Documento Architetturale — Revisione 2*

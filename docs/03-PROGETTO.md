# Plexica v2 — Documento di Progetto

> Piano di riscrittura completa della piattaforma Plexica. Definisce le fasi,
> le priorità, i criteri di successo e l'approccio alla riscrittura.
>
> **Revisione 2** — aggiornata dopo conferma decisioni architetturali.
> Tutte le decisioni aperte della Revisione 1 sono state risolte.
> Scope rivisto: feature parity completa al lancio.

**Data**: 25 Marzo 2026
**Stato**: Draft — Base per riscrittura
**Versione**: 2.0-draft-r2

---

## Indice

1. [Sintesi Esecutiva](#1-sintesi-esecutiva)
2. [Analisi dello Stato Attuale](#2-analisi-dello-stato-attuale)
3. [Strategia di Riscrittura](#3-strategia-di-riscrittura)
4. [Fasi del Progetto](#4-fasi-del-progetto)
5. [Cosa Riusare dalla v1](#5-cosa-riusare-dalla-v1)
6. [Cosa Eliminare dalla v1](#6-cosa-eliminare-dalla-v1)
7. [Gestione del Rischio](#7-gestione-del-rischio)
8. [Criteri di Successo](#8-criteri-di-successo)
9. [Governance del Progetto v2](#9-governance-del-progetto-v2)

---

## 1. Sintesi Esecutiva

### 1.1 Perché una Riscrittura

La versione 1 di Plexica ha raggiunto un punto in cui **l'investimento
incrementale non produce più valore proporzionale**. Le ragioni:

1. **Il sistema non funziona nonostante 4000+ test**: i test verificano
   mock, non il sistema reale. L'app di test diverge dall'app di produzione.
   L'autenticazione è simulata. Il risultato è una falsa sicurezza che
   maschera bug reali.

2. **L'UX è inutilizzabile**: font monospace, nessun colore brand,
   pattern inconsistenti (3 modi per fare data fetching, 3 per i form,
   2 auth store diversi), file route da 1000 righe, emoji come icone,
   nessuna i18n collegata.

3. **Il sistema plugin è troppo complesso per essere usato**: SDK con
   6 classi client, Module Federation non documentata, container Docker,
   7 stati lifecycle, 5 tabelle Extension Points. Nessun plugin reale
   funzionante.

4. **Over-engineering generalizzato**: 33 ADR, 19 specifiche, costituzione
   a 9 articoli, ma la maggior parte delle feature core non è
   implementata.

5. **Il controllo del progetto è perso**: troppa documentazione, poco
   software funzionante. Il rapporto costo/beneficio della governance
   attuale è negativo.

### 1.2 Obiettivo della Riscrittura

Costruire una piattaforma Plexica v2 che:

- **Funziona** — verificato da test E2E full-stack che attraversano tutto lo stack
- **È semplice** — uno sviluppatore nuovo capisce l'architettura in un giorno
- **Ha una UX professionale** — design system coerente, accessibile, tematizzabile
- **Permette plugin facili** — un plugin funzionante in mezza giornata
- **È sotto controllo** — ogni feature è verificata end-to-end prima di essere considerata "fatta"
- **Feature parity completa** — tutte le feature specificate nella v1 sono implementate e funzionanti

### 1.3 Approccio

**Riscrittura pulita in un nuovo repository** (clean rewrite):

- Nuovo repo, nuova codebase, nessun bagaglio dalla v1
- Si cherry-pickano idee e pattern buoni dalla v1 (non codice)
- Ogni feature è implementata come vertical slice completa (UI + API + DB + test E2E)
- Le scelte architetturali sono confermate (schema-per-tenant, multi-realm Keycloak, ABAC, Kafka, Module Federation)
- La complessità rimane, ma è incapsulata dietro tooling e SDK

### 1.4 Decisioni Confermate (Nessuna Decisione Aperta)

Tutte le decisioni architetturali della Revisione 1 §14 sono state
risolte dal product owner:

| Decisione | Scelta Confermata | Motivazione |
|-----------|------------------|-------------|
| Multi-tenancy | Schema-per-tenant | GDPR compliance, isolamento fisico |
| Keycloak | Multi-realm (realm-per-tenant) | Auth diversa per tenant (SAML, OIDC, social) |
| Plugin UI | Module Federation (semplificata con CLI + Vite preset) | iframe scartato per UX |
| Plugin backend | Proxy HTTP | Semplice, auth delegata al core |
| Autorizzazione | RBAC + ABAC tree-walk | ABAC necessario per workspace isolation |
| Event system | Kafka/Redpanda | Plugin event subscription (enterprise target) |
| Plugin data | Tabelle nello schema tenant | Plugin porta migrazioni, core le esegue |
| Dev setup Kafka | Singolo nodo Redpanda (dev), 3 nodi (staging/prod) | v1 usava 3 nodi anche in dev — troppo pesante |
| Repository | Nuovo repository (clean rewrite) | Partire puliti, cherry-pick idee buone |
| Monorepo | Monorepo per core, repo separati per plugin | Come v1, funziona bene |

---

## 2. Analisi dello Stato Attuale

### 2.1 Inventario Asset v1

| Asset | Dimensione | Valore per v2 | Tipo di Riuso |
|-------|-----------|--------------|--------------|
| Backend API (core-api) | ~25.000 righe | MEDIO | Riuso concettuale: logica di business, pattern middleware |
| Frontend Web (web) | ~15.000 righe | BASSO | Riscrittura totale: UX inutilizzabile, pattern inconsistenti |
| Frontend Admin (super-admin) | ~10.000 righe | BASSO | Riscrittura totale |
| UI Library (packages/ui) | 49 componenti | MEDIO | Riuso selettivo: base Radix valida, design tokens da rifare |
| Database Schema (Prisma) | 30 modelli | MEDIO | Riuso strutturale: core entities valide, eliminare extension/registry |
| Plugin SDK | 6 classi | BASSO | Riscrittura: consolidare in 1 classe |
| Event Bus package | Completo | MEDIO | Riuso concettuale: pattern Kafka valido, DX da semplificare |
| i18n Package | Completo | ALTO | Riuso quasi diretto: ben fatto, collegare al frontend |
| API Client | Completo | MEDIO | Riuso selettivo: retry/429 handling valido |
| Test Suite | 4000+ test | BASSO | Scartare: quasi tutti testano mock |
| Specifiche (001-019) | 19 documenti | ALTO | Riuso come requisiti: i requisiti funzionali sono validi |
| ADR (001-033) | 33 documenti | MEDIO | Riuso come knowledge: le motivazioni sono documentate |
| Docker/Infra | Docker Compose + scripts | ALTO | Riuso quasi diretto: adattare per singolo nodo Redpanda |
| CI/CD | GitHub Actions | MEDIO | Riuso base: estendere con test E2E Playwright |
| Security hardening (Spec 015) | 36 fix | ALTO | Riuso pattern: stessi pattern di sicurezza |

### 2.2 Debito che NON si Porta nella v2

| Debito v1 | Come si Risolve nella v2 |
|-----------|------------------------|
| Test che testano mock | La v2 parte con test E2E reali, nessun `isTestToken`, nessun `test-app.ts` |
| 2 auth store frontend | La v2 ha un solo Zustand store |
| 3 pattern di data fetching | La v2 usa solo TanStack Query |
| 3 pattern di form | La v2 usa solo react-hook-form + Zod |
| Module Federation esposta | La v2 incapsula MF dietro CLI + Vite preset |
| SDK 6 classi | La v2 ha 1 classe |
| 7 stati lifecycle plugin | La v2 ha 3 stati |
| 5 tabelle Extension Points | La v2 ha manifest + 1 tabella visibility |
| Service Registry | Eliminato |
| Container orchestration | Eliminato |
| Dead code | Nuovo repo = nessun dead code |
| Font monospace, emoji, window.confirm | Design system professionale dalla Fase 0 |

### 2.3 Cosa Funziona Bene nella v1 (da Portare Concettualmente)

| Area | Perché Funziona | Come si Porta |
|------|----------------|--------------|
| Schema-per-tenant con AsyncLocalStorage | Isolamento efficace, GDPR compliant | Stessa architettura, tooling migliorato |
| Keycloak multi-realm auth flow | OAuth funziona, ruoli gestiti | Stessa integrazione, provisioning migliorato |
| ABAC tree-walk | Modello di permessi potente | Stessa logica, DX e testing migliorati |
| Kafka event bus | Architettura corretta per plugin events | Stesso pattern, SDK wrappa la complessità |
| Security patterns (Spec 015) | Rate limiting, Zod validation, CSRF, CSP | Stessi pattern, applicate dal giorno 0 |
| Prisma schema core | Modello dati tenant/workspace/user solido | Stesse entità, schema ripulito |
| Docker Compose infrastructure | Stack avviabile con un comando | Stessa infra, Redpanda singolo nodo |
| i18n package | Architettura solida | Portare quasi direttamente, collegare al frontend |

---

## 3. Strategia di Riscrittura

### 3.1 Clean Rewrite in Nuovo Repository

La v2 è una riscrittura completa in un nuovo repository:

- **Nuovo repo**: nessun codice v1 nel repo v2. Si parte da zero
- **Cherry-pick di idee**: si copiano pattern, logiche, approcci — non file
- **Nessuna migrazione dati**: la v2 è un prodotto nuovo. Se in futuro serve migrazione da v1 a v2, si costruisce un tool dedicato
- **Nessun ponte v1-v2**: le due piattaforme non coesistono. La v2 sostituisce la v1 quando è pronta

### 3.2 Vertical Slice Incrementale

Non si riscrive "il backend" separatamente dal "frontend". Si riscrive
**una funzionalità alla volta**, completa dal browser al database:

**Esempio — "Login utente"**:
1. Frontend: pagina login con design system v2
2. Backend: endpoint auth con tutti i middleware attivi
3. Keycloak: realm di test configurato con utenti
4. Database: schema tenant con tabella users
5. Test E2E: Playwright apre browser, fa login via Keycloak (realm del tenant), verifica dashboard
6. Test integrazione: HTTP client chiama API auth con token RS256 reale
7. Test unitario: logica di validazione/trasformazione

Solo quando il test E2E passa, la feature è "fatta".

### 3.3 Regola d'Oro

**Nessuna feature senza test E2E che la verifica end-to-end.**

Se non puoi scrivere un test E2E per una feature, la feature non è abbastanza
definita per essere implementata.

### 3.4 Feature Parity Completa

La v2 deve implementare **tutte le feature** specificate nei documenti
01-SPECIFICHE e 02-ARCHITETTURA. Non è un MVP ridotto — è la piattaforma
completa con tutte le funzionalità previste.

Questo include:
- Multi-tenancy completa (provisioning, sospensione, eliminazione, GDPR)
- Autenticazione multi-realm con SSO e social login
- RBAC + ABAC con workspace isolation
- Workspace con gerarchia e template
- Sistema plugin completo (MF UI, backend proxy, event subscription, data persistence)
- Plugin marketplace con ricerca e rating
- CLI per scaffolding plugin
- Super admin con gestione completa
- Notifiche (SSE + email)
- i18n completa (EN + IT)
- Profilo utente
- Audit log
- Osservabilità (health, metriche, log, tracing)
- Design system professionale con dark mode e branding tenant

### 3.5 Ordine di Lavoro

Le funzionalità vengono implementate in ordine di dipendenza:

1. Prima le fondamenta (infra, Docker Compose, design system, auth, multi-tenancy, schema-per-tenant)
2. Poi le feature core (workspace, utenti, ruoli, ABAC)
3. Poi i plugin (MF, Kafka events, data persistence, marketplace)
4. Poi il super admin
5. Poi le feature trasversali (notifiche, i18n, profilo, observability)
6. Poi il consolidamento (performance, accessibilità, documentazione)

---

## 4. Fasi del Progetto

### Fase 0: Setup Infrastruttura (1-2 settimane)

**Obiettivo**: preparare l'infrastruttura di sviluppo, il design system
base e la pipeline CI con test E2E.

| N. | Attività | Output |
|----|---------|--------|
| 0.1 | Creare il nuovo repository monorepo (pnpm workspace) | Struttura directory, package.json, tsconfig, eslint, prettier |
| 0.2 | Docker Compose completo per sviluppo | PostgreSQL, Keycloak, Redis, MinIO, Redpanda (1 nodo), Mailhog |
| 0.3 | Docker Compose per test CI | Identico a dev, avviabile in GitHub Actions |
| 0.4 | Keycloak setup automatico | Realm di test importati, utenti pre-configurati, script di provisioning realm |
| 0.5 | PostgreSQL setup con schema-per-tenant | Script init per schema `core`, utility per creare/migrare schema tenant |
| 0.6 | Kafka/Redpanda setup | Singolo nodo dev, topic auto-creation, consumer group management |
| 0.7 | Design system base | Font (Inter), colori, spacing, border-radius. Storybook con Button, Input, Dialog, Toast, Table |
| 0.8 | Pipeline CI | Lint + TypeScript + Build + Docker up + Seed + Test (unit + integration + E2E) + Teardown |
| 0.9 | Primo test E2E (smoke test) | Playwright apre il frontend, vede la pagina di login. Conferma che lo stack funziona |

**Criterio di completamento**: `docker compose up` avvia tutto lo stack.
Un test Playwright vuoto si connette al frontend e passa. La pipeline CI
esegue e riporta. Il design system ha i token base e 5 componenti in Storybook.

**Durata stimata**: 1-2 settimane

---

### Fase 1: Fondamenta (3-4 settimane)

**Obiettivo**: autenticazione multi-realm, multi-tenancy schema-per-tenant,
ABAC base e prima pagina funzionante con test E2E.

#### 1.1 Autenticazione Multi-Realm (1.5 settimane)

| N. | Feature | Test E2E |
|----|---------|----------|
| 1.1.1 | Pagina login con redirect Keycloak (realm del tenant) | Browser apre login, redirect al realm corretto, credenziali, redirect dashboard |
| 1.1.2 | JWT RS256 validation middleware (JWKS per realm) | Richiesta con token valido → 200, senza token → 401, token realm sbagliato → 401 |
| 1.1.3 | JWKS caching per realm | Performance: non chiama Keycloak ad ogni richiesta |
| 1.1.4 | Logout con invalidazione sessione | Utente fa logout, token precedente non funziona più |
| 1.1.5 | Refresh token automatico | Token scaduto viene rinnovato lato frontend |
| 1.1.6 | Realm discovery da tenant slug | URL `acme.plexica.io` → realm `tenant-acme` |

#### 1.2 Multi-Tenancy Schema-per-Tenant (1.5 settimane)

| N. | Feature | Test E2E |
|----|---------|----------|
| 1.2.1 | Tenant context middleware (`SET search_path`) | Richiesta con tenant A vede dati tenant A, non dati tenant B |
| 1.2.2 | AsyncLocalStorage per tenant context | Il tenant context è disponibile in tutto lo stack senza parametri espliciti |
| 1.2.3 | Schema creation utility | Utility che crea schema + applica migrazioni core |
| 1.2.4 | Provisioning tenant completo | Super admin crea tenant → schema + realm + bucket creati → admin del nuovo tenant fa login |
| 1.2.5 | Test isolamento cross-tenant (critico) | Utente tenant A chiama API con ID risorsa tenant B → 403/404 |
| 1.2.6 | Migrazione multi-schema | Utility che applica una migrazione a tutti gli schema tenant esistenti |

#### 1.3 Shell Frontend e Design System (1 settimana)

| N. | Feature | Test E2E |
|----|---------|----------|
| 1.3.1 | Layout shell con sidebar, header, content area | Browser apre app, vede layout professionale con navigazione |
| 1.3.2 | Design system applicato (font Inter, colori brand, spacing, radius) | Visual: nessun monospace, colori definiti, border-radius coerente |
| 1.3.3 | Dashboard con messaggio di benvenuto | Utente fa login, vede dashboard con il suo nome |
| 1.3.4 | Error boundary a livello route | Componente che lancia errore non crasha l'intera app |
| 1.3.5 | i18n connesso (react-intl, almeno inglese) | Tutte le stringhe vengono da react-intl |
| 1.3.6 | Un solo auth store (Zustand) | Login/logout/refresh gestiti da un unico store |
| 1.3.7 | Un solo pattern data fetching (TanStack Query) | Tutte le chiamate API passano per useQuery/useMutation |

**Criterio di completamento Fase 1**: un utente può fare login via
Keycloak (realm del tenant), vedere la dashboard del proprio tenant,
non vedere dati di altri tenant. Tutto verificato da test E2E Playwright.

**Durata stimata**: 3-4 settimane

---

### Fase 2: Feature Core (4-5 settimane)

**Obiettivo**: workspace con gerarchia, utenti, ruoli con ABAC,
impostazioni — le funzionalità che rendono la piattaforma usabile.

#### 2.1 Gestione Workspace (2 settimane)

| N. | Feature | Test E2E |
|----|---------|----------|
| 2.1.1 | Lista workspace | Utente vede i workspace a cui ha accesso |
| 2.1.2 | Creazione workspace | Tenant admin crea workspace, appare nella lista |
| 2.1.3 | Dettaglio workspace con navigazione | Utente apre workspace, vede overview con sidebar navigazione |
| 2.1.4 | Gerarchia workspace (parent/child, materialised path) | Admin crea child workspace, navigazione parent → child funziona |
| 2.1.5 | Membri workspace | Admin aggiunge membro, membro vede il workspace |
| 2.1.6 | Impostazioni workspace | Admin modifica nome/descrizione, salvataggio funziona |
| 2.1.7 | Eliminazione workspace | Admin elimina workspace, non appare più nella lista, figli gestiti |
| 2.1.8 | Template workspace | Admin crea workspace da template pre-definito |

#### 2.2 Gestione Utenti, Ruoli e ABAC (2 settimane)

| N. | Feature | Test E2E |
|----|---------|----------|
| 2.2.1 | Lista utenti tenant | Tenant admin vede tutti gli utenti del proprio tenant |
| 2.2.2 | Invito utente via email | Admin invita utente, email arriva (Mailhog in test), utente accetta e fa login |
| 2.2.3 | Assegnazione ruoli RBAC | Admin assegna ruolo, utente ha i permessi corretti |
| 2.2.4 | ABAC workspace isolation | Utente con ruolo nel workspace A non vede dati del workspace B |
| 2.2.5 | ABAC condition tree | Policy ABAC valutata: dato contesto X, la decisione è Y |
| 2.2.6 | ABAC decision logging | Ogni valutazione ABAC logga input, regole, risultato (per debug) |
| 2.2.7 | Rimozione utente | Admin rimuove utente, utente non può più accedere |
| 2.2.8 | Profilo utente base | Utente vede e modifica il proprio profilo |
| 2.2.9 | Controllo permessi end-to-end | Utente viewer non può creare workspace, member non può gestire utenti |

#### 2.3 Impostazioni Tenant (1 settimana)

| N. | Feature | Test E2E |
|----|---------|----------|
| 2.3.1 | Pagina impostazioni generali | Admin modifica nome, slug tenant |
| 2.3.2 | Branding (logo, colore primario, dark mode toggle) | Admin carica logo, cambia colore, l'interfaccia riflette il branding |
| 2.3.3 | Audit log | Admin visualizza le azioni recenti filtrabili |
| 2.3.4 | Configurazione auth del realm (visibilità) | Admin vede le opzioni auth del proprio realm |

**Criterio di completamento Fase 2**: un tenant admin può gestire
workspace (con gerarchia), invitare utenti, assegnare ruoli, le policy
ABAC isolano i dati tra workspace. Il branding è personalizzabile.
Tutto verificato da test E2E.

**Durata stimata**: 4-5 settimane

---

### Fase 3: Sistema Plugin (5-6 settimane)

**Obiettivo**: sistema plugin completo con Module Federation, Kafka
events, data persistence, marketplace e CLI. Plugin CRM reale funzionante.

Questa è la fase più complessa perché integra MF, Kafka, schema
migrations e marketplace.

#### 3.1 Infrastruttura Plugin Core (1.5 settimane)

| N. | Feature | Test E2E |
|----|---------|----------|
| 3.1.1 | Registry plugin (schema `core`, API CRUD) | Super admin vede lista plugin disponibili |
| 3.1.2 | Manifest validation (Zod schema) | Plugin con manifest invalido non si installa |
| 3.1.3 | Installazione plugin per tenant (migrazioni nello schema tenant) | Tenant admin installa plugin, tabelle plugin create nello schema |
| 3.1.4 | Attivazione/disattivazione plugin | Plugin disattivato non appare nell'interfaccia |
| 3.1.5 | Disinstallazione plugin (cleanup tabelle) | Plugin rimosso, tabelle plugin droppate dallo schema |
| 3.1.6 | Plugin workspace visibility | Admin attiva/disattiva plugin per workspace specifici |

#### 3.2 Plugin UI — Module Federation (1.5 settimane)

| N. | Feature | Test E2E |
|----|---------|----------|
| 3.2.1 | Vite Plugin Preset (`@plexica/vite-plugin`) | Plugin con preset genera MF remote automaticamente |
| 3.2.2 | Shell MF host carica plugin remoti | Plugin attivo mostra la sua interfaccia nella shell |
| 3.2.3 | Shared dependencies (React, Query, UI lib, i18n) | Plugin usa le deps dalla shell, non duplicate |
| 3.2.4 | React Context propagation (tenant, user, workspace, theme) | Plugin accede al contesto dalla shell |
| 3.2.5 | Extension points (sidebar, workspace-panel, dashboard-widget) | Plugin dichiara slot nel manifest, appare nel punto corretto |
| 3.2.6 | Error boundary per plugin slot | Plugin crasha → shell mostra fallback, resto dell'app funziona |
| 3.2.7 | Hot reload in sviluppo | Plugin dev server si registra nella shell locale, modifiche visibili live |

#### 3.3 Plugin Events — Kafka (1 settimana)

| N. | Feature | Test E2E |
|----|---------|----------|
| 3.3.1 | Core event emission automatica (CRUD su entità principali) | Creazione workspace → evento `plexica.workspace.created` su Kafka |
| 3.3.2 | SDK event subscription (`sdk.onEvent()`) | Plugin sottoscrive evento, handler viene chiamato quando l'evento arriva |
| 3.3.3 | Plugin custom events | Plugin CRM emette `plugin.crm.contact.created`, Plugin Analytics lo riceve |
| 3.3.4 | Consumer group auto-management | Consumer group `plugin-{id}-{tenant}` creato automaticamente |
| 3.3.5 | Dead letter queue | Evento che fallisce 3 volte va in DLQ, non blocca il consumer |
| 3.3.6 | Consumer lag monitoring | Metriche Prometheus per consumer lag per plugin |

#### 3.4 Plugin Backend — Proxy (0.5 settimane)

| N. | Feature | Test E2E |
|----|---------|----------|
| 3.4.1 | Proxy API: `/api/v1/plugins/:pluginId/*` → backend plugin | Chiamata a plugin API arriva al backend del plugin |
| 3.4.2 | Auth + tenant context propagato | Backend plugin riceve tenant ID e user info negli header |
| 3.4.3 | Health check plugin backend | Core verifica che il backend plugin sia raggiungibile |

#### 3.5 Plugin CRM di Esempio — Reale (1 settimana)

| N. | Feature | Test E2E |
|----|---------|----------|
| 3.5.1 | Plugin CRM con UI MF (lista contatti, form) | Utente installa CRM, apre vista contatti nella shell |
| 3.5.2 | Plugin CRM backend (CRUD contatti via proxy) | Utente crea contatto, contatto persistito nel DB |
| 3.5.3 | Plugin CRM data (tabelle `crm_contacts`, `crm_deals` nello schema tenant) | Dati persistenti, sopravvivono a restart |
| 3.5.4 | Plugin CRM events (crea pipeline su workspace.created) | Nuovo workspace → CRM crea pipeline automaticamente |
| 3.5.5 | Plugin CRM cross-workspace isolation | Contatti workspace A non visibili da workspace B |

#### 3.6 Marketplace e CLI (0.5 settimane)

| N. | Feature | Test E2E |
|----|---------|----------|
| 3.6.1 | Marketplace UI (ricerca, categorie, rating) | Tenant admin cerca plugin, vede dettagli, installa |
| 3.6.2 | CLI `create-plexica-plugin` | Comando genera progetto completo con MF preset, manifest, backend template |
| 3.6.3 | Plugin SDK consolidato (1 classe) | SDK con `onEvent`, `callApi`, `getContext`, `getDb` |

**Criterio di completamento Fase 3**: un plugin CRM reale funziona
end-to-end con UI Module Federation, backend proxy, Kafka event
subscription e dati persistenti nello schema tenant. La CLI genera un
progetto plugin funzionante. Tutto verificato da test E2E.

**Durata stimata**: 5-6 settimane

---

### Fase 4: Super Admin (2-3 settimane)

**Obiettivo**: interfaccia di amministrazione piattaforma completa.

| N. | Feature | Test E2E |
|----|---------|----------|
| 4.1 | Dashboard con metriche piattaforma | Super admin vede numero tenant, utenti, plugin attivi |
| 4.2 | Lista tenant con ricerca e filtri | Super admin cerca tenant, filtra per stato |
| 4.3 | Dettaglio tenant (info, utenti, plugin, audit) | Super admin vede tutti i dettagli di un tenant |
| 4.4 | Provisioning wizard tenant | Super admin completa wizard → tenant operativo |
| 4.5 | Sospensione tenant | Super admin sospende → utenti non possono accedere |
| 4.6 | Riattivazione tenant | Super admin riattiva → utenti accedono di nuovo |
| 4.7 | Eliminazione tenant (GDPR) | Super admin elimina → schema droppato, realm eliminato, bucket eliminato |
| 4.8 | Gestione catalogo plugin | Super admin pubblica/depubblica plugin, review queue |
| 4.9 | Health check sistema | Super admin vede stato di tutti i servizi (DB, Keycloak, Redis, Kafka) |
| 4.10 | Log sistema filtrabili | Super admin vede log con filtri per tenant, livello, timestamp |
| 4.11 | Kafka status | Super admin vede consumer lag per plugin, DLQ size |

**Criterio di completamento Fase 4**: un super admin può gestire l'intera
piattaforma dalla UI: creare/sospendere/eliminare tenant, gestire il
catalogo plugin, monitorare il sistema. Tutto verificato da test E2E.

**Durata stimata**: 2-3 settimane

---

### Fase 5: Feature Trasversali (3-4 settimane)

**Obiettivo**: notifiche, i18n completa, profilo utente, osservabilità.

#### 5.1 Notifiche (1.5 settimane)

| N. | Feature | Test E2E |
|----|---------|----------|
| 5.1.1 | Notifiche in-app in tempo reale (SSE) | Utente riceve notifica quando viene invitato a un workspace |
| 5.1.2 | Centro notifiche (lista, mark as read) | Utente apre centro notifiche, segna come lette |
| 5.1.3 | Notifiche email | Invito workspace arriva via email (Mailhog in test) |
| 5.1.4 | Preferenze notifiche per utente | Utente sceglie quali notifiche ricevere (in-app, email, entrambe) |
| 5.1.5 | Plugin possono generare notifiche | Plugin CRM emette notifica su nuovo contatto |

#### 5.2 Internazionalizzazione Completa (1 settimana)

| N. | Feature | Test E2E |
|----|---------|----------|
| 5.2.1 | Tutte le stringhe frontend da react-intl | Nessuna stringa hardcoded (avviato in Fase 1) |
| 5.2.2 | Switch lingua (inglese/italiano) | Utente cambia lingua, tutta l'interfaccia si aggiorna |
| 5.2.3 | Formato date/numeri locale-aware | Date e numeri nel formato corretto per la lingua |
| 5.2.4 | Plugin possono registrare le proprie traduzioni | Plugin CRM ha traduzioni EN/IT caricate via SDK |
| 5.2.5 | Override traduzioni per tenant | Tenant admin personalizza traduzioni specifiche |

#### 5.3 Profilo Utente (0.5 settimane)

| N. | Feature | Test E2E |
|----|---------|----------|
| 5.3.1 | Pagina profilo con dati personali | Utente vede e modifica nome, email |
| 5.3.2 | Avatar (da Keycloak JWT picture claim) | Avatar utente visualizzato nell'header e nel profilo |
| 5.3.3 | Gestione sessioni attive | Utente vede sessioni attive, può chiuderle |
| 5.3.4 | Cambio password | Redirect a Keycloak per cambio password |

#### 5.4 Osservabilità (1 settimana)

| N. | Feature | Test E2E |
|----|---------|----------|
| 5.4.1 | Health check endpoint (`/health`) | Endpoint verifica DB, Redis, Keycloak, Kafka |
| 5.4.2 | Log strutturati (Pino JSON) con correlation ID | Log parsabili con request ID, tenant ID, user ID |
| 5.4.3 | Metriche Prometheus (`/metrics`) | HTTP latency, error rate, Kafka consumer lag |
| 5.4.4 | Dashboard Grafana base | Dashboard pre-configurata con metriche chiave |
| 5.4.5 | OpenTelemetry tracing (opzionale, feature flag) | Tracing distribuito attivabile in staging/prod |
| 5.4.6 | Kafka monitoring dashboard | Consumer lag per plugin, DLQ size, event throughput |

**Durata stimata**: 3-4 settimane

---

### Fase 6: Consolidamento e Rilascio (2-3 settimane)

**Obiettivo**: stabilizzazione, performance, accessibilità, documentazione.

| N. | Attività | Output |
|----|---------|--------|
| 6.1 | Review completa test E2E — ogni flusso critico coperto | Report copertura E2E: 100% flussi critici |
| 6.2 | Performance testing | Report: API P95 < 200ms, page load < 2s su 3G |
| 6.3 | Security review (OWASP top 10, revisione permessi, ABAC audit) | Report sicurezza |
| 6.4 | Accessibilità review (WCAG 2.1 AA) | Report accessibilità, fix dei problemi trovati |
| 6.5 | Dark mode completo | Dark mode funzionante su tutta l'app |
| 6.6 | Responsive design (mobile) | Viste principali usabili su mobile |
| 6.7 | Documentazione utente finale | Guide per tenant admin e super admin |
| 6.8 | Documentazione sviluppatore plugin | Tutorial passo-passo + reference API |
| 6.9 | Runbook operativo | Procedure per deploy, rollback, incident response |
| 6.10 | Stress test multi-tenant | 10+ tenant con dati realistici, verifica performance e isolamento |

**Durata stimata**: 2-3 settimane

---

### Riepilogo Timeline

| Fase | Durata | Cumulativa |
|------|--------|-----------|
| Fase 0: Setup Infrastruttura | 1-2 settimane | Settimane 1-2 |
| Fase 1: Fondamenta | 3-4 settimane | Settimane 3-6 |
| Fase 2: Feature Core | 4-5 settimane | Settimane 7-11 |
| Fase 3: Sistema Plugin | 5-6 settimane | Settimane 12-17 |
| Fase 4: Super Admin | 2-3 settimane | Settimane 18-20 |
| Fase 5: Feature Trasversali | 3-4 settimane | Settimane 21-24 |
| Fase 6: Consolidamento | 2-3 settimane | Settimane 25-27 |
| **Totale** | **20-27 settimane** | **~5-7 mesi** |

**Note sulla timeline**:
- La stima assume 1 sviluppatore full-time. Con 2-3 sviluppatori, le Fasi 2-5 possono essere parzialmente parallelizzate
- La Fase 3 (Plugin) è la più rischiosa e potenzialmente la più lunga per la complessità di integrazione MF + Kafka + schema migrations
- Il range 5-7 mesi è realistico per la feature parity completa con l'architettura confermata
- Ogni fase produce valore indipendente: se il progetto si ferma alla Fase 2, si ha comunque una piattaforma multi-tenant funzionante

---

## 5. Cosa Riusare dalla v1

### 5.1 Riuso Concettuale (Pattern e Idee, Non Codice)

| Cosa | Come si Porta nella v2 |
|------|----------------------|
| Schema-per-tenant con `SET search_path` | Stessa architettura, tooling migliorato per migrazioni |
| AsyncLocalStorage per tenant context | Stesso pattern, stessa implementazione |
| Keycloak multi-realm integration | Stessa logica, provisioning automatizzato |
| ABAC tree-walk engine | Stessa logica, DSL dichiarativo per policy, testing migliorato |
| Kafka event bus pattern | Stessa architettura, SDK wrappa la complessità |
| Rate limiting 3 livelli | Stessa configurazione |
| Security patterns (Zod, parameterized queries, CSRF, CSP) | Stessi pattern applicati dal giorno 0 |
| Layered architecture (Controller > Service > Repository) | Stessa struttura, file più piccoli |
| Module Federation per plugin UI | Stessa architettura, DX incapsulata in CLI + Vite preset |

### 5.2 Riuso Quasi Diretto (Adattamento Minore)

| Cosa | Adattamento |
|------|-------------|
| i18n package (`@plexica/i18n`) | Portare nella v2, collegare a react-intl nel frontend |
| Docker Compose infrastructure | Adattare: Redpanda singolo nodo dev, aggiungere topic auto-creation |
| Prisma schema (entità core) | Portare modelli tenant/workspace/user, rimuovere extension/registry tables |
| CI/CD pipeline (GitHub Actions) | Portare base, aggiungere stage E2E Playwright |
| API Client retry/429 logic | Portare la logica, riscrivere il wrapper |

### 5.3 Riuso Documentale

| Cosa | Come |
|------|------|
| Specifiche funzionali (001-019) | I requisiti funzionali sono input per 01-SPECIFICHE.md |
| ADR (001-033) | Le motivazioni informano le decisioni v2 |
| Decision log | Le lezioni apprese evitano gli stessi errori |
| Lessons learned | Anti-pattern documentati nella v1 diventano regole v2 |

---

## 6. Cosa Eliminare dalla v1

### 6.1 Eliminato Definitivamente

| Cosa | Motivazione |
|------|-------------|
| **Service Registry** | Nessun plugin lo usa. Plugin comunicano via REST API + Kafka events |
| **Container orchestration (Dockerode)** | Plugin backend sono servizi HTTP normali |
| **5 tabelle Extension Points** | Sostituite da manifest + 1 tabella visibility |
| **SDK 6 classi** | Consolidate in 1 classe |
| **7 stati lifecycle** | Ridotti a 3 stati visibili |
| **`isTestToken` code path** | Zero divergenza test-produzione |
| **`test-app.ts` separata** | L'app di test = l'app di produzione |
| **Test suite v1 (4000+ test)** | Testano mock, non il sistema. Si ricomincia con test E2E reali |
| **2 auth store, 3 fetch pattern, 3 form pattern** | Un solo pattern per tipo |
| **Font JetBrains Mono, emoji icone, window.confirm** | Design system professionale |
| **console.log in produzione** | Logger strutturato (Pino) |
| **File route 500-1000 righe** | Max 200 righe per file |
| **Dead code** (App.tsx, pages/, views/, apps/plugins/, packages/config/) | Nuovo repo, zero dead code |
| **FORGE governance pesante** | 19 spec, 33 ADR, dual-model review, sprint formali → governance leggera |

### 6.2 Non Eliminato — Complessità Incapsulata

Queste tecnologie/pattern **restano** ma la complessità viene nascosta
al plugin developer:

| Cosa | Complessità Incapsulata In |
|------|--------------------------|
| **Module Federation** | CLI + `@plexica/vite-plugin` → plugin dev scrive React normale |
| **Kafka/Redpanda** | SDK `onEvent()` → plugin dev scrive handler normale |
| **Schema-per-tenant** | Core gestisce `SET search_path` → plugin dev non lo sa |
| **ABAC tree-walk** | Middleware automatico → sviluppatore frontend non lo vede |
| **Multi-realm Keycloak** | Provisioning automatico → tenant admin non lo vede |
| **Plugin migrations** | Core esegue → plugin dev scrive SQL/Prisma normale nella sua dir `migrations/` |

---

## 7. Gestione del Rischio

### 7.1 Rischi del Progetto

| N. | Rischio | Probabilità | Impatto | Mitigazione |
|----|---------|------------|---------|-------------|
| R1 | La riscrittura richiede più tempo del previsto | Alta | Alto | Vertical slice: ogni fase produce valore indipendente. Se il progetto si ferma alla Fase 2, si ha comunque una piattaforma funzionante |
| R2 | Module Federation troppo complesso da incapsulare | Media | Alto | Prototipo in Fase 0: il Vite preset genera config MF corretta. Se non si riesce a incapsulare, fallback a web component con lazy import |
| R3 | Schema-per-tenant: migrazioni multi-schema troppo lente | Media | Medio | Migrazioni parallele con worker pool. Benchmark in Fase 0 con 100 schema |
| R4 | Kafka setup: singolo nodo non rappresenta produzione | Bassa | Basso | Il singolo nodo ha le stesse API del cluster. Differenze solo in availability/replication |
| R5 | ABAC tree-walk: performance sotto carico | Bassa | Medio | Redis cache delle policy evaluation con invalidazione aggressiva. Benchmark in Fase 2 |
| R6 | Multi-realm Keycloak: provisioning lento | Media | Medio | Keycloak Admin API per creazione realm programmatica. Lazy realm creation |
| R7 | Plugin data migrations: conflitti tra plugin | Bassa | Alto | Naming convention con prefisso plugin ID. Validazione conflitti al momento dell'installazione |
| R8 | Il team non adotta test E2E first | Media | Alto | CI bloccante: nessun merge senza test E2E verde. Pair programming per le prime feature |
| R9 | Performance MF: caricamento lento dei plugin remoti | Media | Medio | Lazy loading con skeleton UI. Preload dei plugin più usati |
| R10 | Feature parity completa richiede più di 7 mesi | Media | Medio | Le fasi sono indipendenti. Si può rilasciare dopo Fase 4 con feature "core" e aggiungere il resto iterativamente |

### 7.2 Prototipi di Validazione (Fase 0)

La Fase 0 include prototipi per validare le decisioni a rischio più alto:

| Prototipo | Cosa Valida | Criterio di Successo |
|-----------|-------------|---------------------|
| MF Vite Preset | La CLI genera un progetto plugin che si carica nella shell senza config manuale | Plugin React component visibile nella shell con hot reload |
| Schema-per-tenant migration | Utility che applica migrazione a 100 schema in parallelo | 100 schema migrati in < 30 secondi |
| Keycloak realm provisioning | Script che crea realm + client + utente admin | Realm creato in < 10 secondi, utente può fare login |
| Kafka event flow | Core emette evento, plugin consumer lo riceve | Evento ricevuto in < 1 secondo (dev environment) |

Se un prototipo fallisce, si rivaluta la decisione prima di iniziare la Fase 1.

---

## 8. Criteri di Successo

### 8.1 Criteri Misurabili

| N. | Criterio | Target | Come Misurare |
|----|---------|--------|--------------|
| S1 | Test E2E coprono tutti i flussi critici | 100% dei flussi elencati nelle Fasi 1-5 | Conteggio test E2E vs flussi specificati |
| S2 | Zero divergenza test-produzione | Nessun `isTestToken`, nessun `test-app.ts` | Grep nel codice |
| S3 | Tempo creazione plugin | < 4 ore per uno sviluppatore esperto | Cronometro su sviluppatore che segue il tutorial |
| S4 | Tempo caricamento pagina | < 2s su 3G | Lighthouse audit |
| S5 | Accessibilità | WCAG 2.1 AA | Lighthouse + audit manuale |
| S6 | Tempo risposta API (P95) | < 200ms | Benchmark con test di carico |
| S7 | Isolamento tenant | Zero data leak in test dedicati | Test E2E cross-tenant |
| S8 | Pipeline CI | < 15 minuti | Timer CI |
| S9 | Comprensione architettura | Nuovo sviluppatore produttivo in 1 giorno | Feedback dal primo nuovo membro |
| S10 | i18n completa | Tutte le stringhe tradotte in EN e IT | Conteggio stringhe hardcoded = 0 |
| S11 | Feature parity | Tutte le feature di 01-SPECIFICHE implementate | Checklist feature vs spec |
| S12 | Plugin event latency | < 1s dall'emissione alla ricezione | Misurazione nei test E2E |
| S13 | Schema migration 100 tenant | < 30 secondi | Benchmark automatizzato |

### 8.2 Criteri Qualitativi

| N. | Criterio | Valutazione |
|----|---------|-------------|
| Q1 | L'UX è professionale e coerente | Feedback utente: "sembra un prodotto finito" |
| Q2 | Il codice è leggibile e manutenibile | Review da sviluppatore esterno |
| Q3 | La documentazione è sufficiente | Sviluppatore plugin segue tutorial senza chiedere aiuto |
| Q4 | Il sistema "funziona davvero" | Deploy su staging, uso reale per 1 settimana senza bug bloccanti |
| Q5 | La complessità è incapsulata | Plugin dev non vede MF config, Kafka config, o schema management |

---

## 9. Governance del Progetto v2

### 9.1 Cosa Cambia rispetto alla v1

La v1 aveva una governance pesante (FORGE completo con costituzione,
19 specifiche, 33 ADR, dual-model adversarial review, sprint files).
Il risultato è stato **troppa documentazione, poco software funzionante**.

La v2 adotta una governance leggera:

| Aspetto | v1 | v2 |
|---------|----|----|
| Specifiche | 19 documenti formali prima di iniziare a codificare | 3 documenti base (spec, architettura, progetto) + feature specificate just-in-time |
| ADR | 33 documenti formali | ADR solo per decisioni che cambiano il modello dati, l'auth o l'infrastruttura |
| Costituzione | 9 articoli immutabili | 5 regole semplici (vedi sotto) |
| Review | Dual-model adversarial review (Claude + GPT-Codex) su 7 dimensioni |  Dual-model adversarial review (Claude + GPT-Codex) su 7 dimensioni + Code review umana + test E2E che passano |
| Sprint | File sprint formali con velocity tracking | Kanban semplice: Todo, In Progress, Done |
| Documentazione | Documenta prima, implementa poi | Implementa con test E2E, documenta dopo |
| Test policy | 80% coverage target, ma i test testano mock | Test E2E obbligatorio per ogni feature. Coverage emersa dal testing reale |

### 9.2 Le 5 Regole della v2

1. **Ogni feature ha un test E2E** — nessuna eccezione, CI bloccante
2. **Nessun merge senza CI verde** — test unitari, integrazione e E2E devono passare
3. **Un pattern per tipo di operazione** — un modo di fare data fetching, un modo di fare form, un auth store
4. **Nessun file sopra 200 righe** — se serve di più, decomporre
5. **Le decisioni architetturali significative hanno un ADR** — significative = cambiano il modello dati, l'auth, l'infrastruttura, le dipendenze core

### 9.3 Processo di Lavoro Quotidiano

1. Scegliere la prossima feature dal backlog (colonna Todo)
2. Spostare in "In Progress"
3. Scrivere il test E2E che definisce "fatto"
4. Implementare (backend + frontend + test unitari + test integrazione)
5. Verificare che il test E2E passa
6. Dual-model adversarial review (Claude + GPT-Codex) su 7 dimensioni
7. Code review umana
8. Merge
9. Spostare in "Done"

Non c'è specifica formale per ogni feature, non c'è ADR a meno che la
feature cambi l'architettura, non c'è dual-model review. C'è un test
E2E e una code review.

---

## Appendice A: Checklist Pre-Avvio

Prima di iniziare la Fase 0, verificare:

- [ ] I 3 documenti base sono rivisti e approvati (01-SPECIFICHE, 02-ARCHITETTURA, 03-PROGETTO)
- [ ] Il nuovo repository è stato creato
- [ ] L'ambiente di sviluppo è pronto (Docker, Node.js 20+, pnpm)
- [ ] Il team è assegnato e ha tempo dedicato
- [ ] Il backlog iniziale (Fase 0 + Fase 1) è stato rivisto
- [ ] I prototipi di validazione sono definiti (MF preset, schema migration, Keycloak realm, Kafka event flow)

---

## Appendice B: Confronto Sintetico v1 vs v2

| Dimensione | v1 | v2 Target |
|-----------|----|----|
| **Repository** | Repository esistente con bagaglio | Nuovo repository pulito |
| **Test** | 4000+ test su mock, sistema non funzionante | Test E2E full-stack per ogni feature, zero divergenza test-produzione |
| **UX** | 3/10 — font monospace, nessun colore, inconsistente | Design system professionale, coerente, accessibile, dark mode, branding |
| **Plugin DX** | 6 classi SDK, MF config manuale, Docker containers, 7 stati, 5 tabelle ExtPoints | 1 SDK classe, MF incapsulata in CLI/preset, HTTP proxy, 3 stati, manifest-based |
| **Architettura** | Corretta (schema-per-tenant, ABAC, Kafka, MF) ma complessità esposta | Stessa architettura, complessità incapsulata dietro tooling e SDK |
| **Event system** | Kafka configurato ma zero eventi in produzione | Kafka con eventi automatici su CRUD, SDK `onEvent()` per plugin |
| **Governance** | 19 spec, 33 ADR, costituzione 9 articoli, dual-model review | 5 regole, ADR solo se necessario, test E2E + code review |
| **Documentazione** | Abbondante ma disconnessa dal codice | Minima ma accurata, scritta dopo l'implementazione |
| **Complessità** | Alta — la complessità architetturale è esposta ovunque | La complessità c'è ma è nascosta: plugin dev non vede MF/Kafka/schema |
| **Feature parity** | Molte feature specificate, poche implementate | Tutte le feature specificate, tutte implementate e testate E2E |
| **Timeline** | ~12 mesi di sviluppo v1 | 5-7 mesi per riscrittura completa |
| **Affidabilità** | Falsa sicurezza dai test su mock | Fiducia reale dai test E2E full-stack |

---

*Fine del Documento di Progetto — Revisione 2*

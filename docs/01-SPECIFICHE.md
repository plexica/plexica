# Plexica v2 — Documento di Specifiche

> Documento di base per la riprogettazione completa della piattaforma Plexica.
> Ogni sezione contiene le specifiche target e una revisione critica delle
> scelte fatte nella versione attuale (v1).
>
> **Revisione 2** — aggiornata dopo feedback del product owner.

**Data**: 25 Marzo 2026
**Stato**: Draft — Base per riscrittura
**Versione**: 2.0-draft-r2

---

## Indice

1. [Visione e Obiettivi](#1-visione-e-obiettivi)
2. [Revisione Critica della v1](#2-revisione-critica-della-v1)
3. [Decisioni Architetturali Confermate](#3-decisioni-architetturali-confermate)
4. [Utenti e Personas](#4-utenti-e-personas)
5. [Requisiti Funzionali](#5-requisiti-funzionali)
6. [Requisiti Non Funzionali](#6-requisiti-non-funzionali)
7. [Sistema Plugin — Riprogettazione](#7-sistema-plugin--riprogettazione)
8. [Sistema Eventi — Plugin Event Subscription](#8-sistema-eventi--plugin-event-subscription)
9. [UX e UI — Riprogettazione Completa](#9-ux-e-ui--riprogettazione-completa)
10. [Sistema di Testing E2E Full-Stack](#10-sistema-di-testing-e2e-full-stack)
11. [Sicurezza e GDPR](#11-sicurezza-e-gdpr)
12. [Internazionalizzazione](#12-internazionalizzazione)
13. [Osservabilita e Operativita](#13-osservabilita-e-operativita)

---

## 1. Visione e Obiettivi

### 1.1 Missione

Plexica e una piattaforma multi-tenant SaaS enterprise modulare che
consente alle organizzazioni di costruire applicazioni isolate per
tenant con estensibilita basata su plugin.

### 1.2 Obiettivi della Riscrittura

| Obiettivo | Motivazione |
|-----------|-------------|
| **Funzionamento reale verificabile** | La v1 ha 4000+ test ma il sistema non funziona correttamente. I test testano mock, non il sistema reale |
| **Semplicita dello sviluppo plugin** | La DX plugin della v1 e percepita come molto complessa: config MF difficile, SDK vasto, documentazione assente |
| **UX/UI professionale** | La v1 ha un'interfaccia inutilizzabile: font monospace, nessun colore brand, pattern inconsistenti, nessuna i18n collegata |
| **Riprendere il controllo del progetto** | 33 ADR, 19 specifiche, ma il codice diverge dai documenti e il sistema non funziona |
| **Testing che garantisca il funzionamento** | Test E2E full-stack obbligatori per ogni feature, che attraversino tutto lo stack |

### 1.3 Principi Guida v2

1. **Funziona prima, documenta dopo** — Nessuna specifica senza prototipo funzionante verificato da test E2E
2. **Complessita giustificata** — Ogni componente complesso deve avere un caso d'uso reale che lo richiede
3. **Plugin in un pomeriggio** — Uno sviluppatore deve poter creare un plugin funzionante in mezza giornata, con documentazione chiara
4. **Zero gap test-produzione** — I test devono esercitare lo stesso codice che gira in produzione
5. **UX-first** — Ogni feature nasce dal journey dell'utente, non dall'architettura tecnica

---

## 2. Revisione Critica della v1

### 2.1 Cosa ha Funzionato

| Area | Valutazione |
|------|-------------|
| **Schema-per-tenant** | Scelta corretta e confermata per GDPR e sicurezza — da mantenere |
| **Keycloak multi-realm** | Necessario per configurare meccanismi di auth diversi per tenant — da mantenere |
| **ABAC tree-walk** | Necessario per isolamento dati workspace-level all'interno del tenant — da mantenere |
| **Kafka/Redpanda event bus** | Necessario per plugin event subscription (CRUD entity events) — da mantenere con semplificazioni DX |
| **Sicurezza (Spec 015)** | Le 36 vulnerabilita CodeQL sono state risolte correttamente |
| **Struttura monorepo** | Organizzazione logica dei package, buona separazione delle responsabilita |
| **Prisma come ORM** | Type-safety eccellente, migrazioni gestibili |
| **Fastify come framework backend** | Performante, buon ecosistema plugin |
| **Module Federation per plugin UI** | Approccio corretto (integrazione nativa, shared deps, no iframe) — da semplificare nella DX |

### 2.2 Cosa NON ha Funzionato

#### 2.2.1 Testing — Il Problema Centrale

Il problema piu grave della v1 e che **4000+ test non garantiscono il
funzionamento del sistema**. L'analisi rivela perche:

- **I test "E2E" backend non sono E2E**: usano `app.inject()` in-process,
  non HTTP reale. CSRF disabilitato, rate limiting disabilitato,
  OpenTelemetry assente, middleware di notifica assente
- **L'autenticazione e simulata**: tutti i test usano token HS256
  auto-firmati. In produzione si usano token RS256 da Keycloak JWKS.
  Esiste un code path `isTestToken` che accetta HS256 quando
  `NODE_ENV !== 'production'` — l'auth reale non viene mai testata
- **Il 38% delle asserzioni unit verifica mock**: `toHaveBeenCalledWith`
  su funzioni mock, non output reali di business logic
- **I test Playwright frontend non sono in CI**: 31 file spec con API
  completamente mockate via `page.route()`. Non toccano mai un backend reale
- **L'app di test diverge dall'app di produzione**: `test-app.ts` registra
  route e middleware in modo diverso da `index.ts`

**Risultato**: alta copertura numerica, zero fiducia nel funzionamento reale.

#### 2.2.2 UX/UI — Inutilizzabile

**Design System**:
- Font unico JetBrains Mono (monospace) — l'app sembra un terminale
- Palette completamente in scala di grigi, nessun colore brand
- Border radius zero ovunque — aspetto rigido e datato
- Nessun sistema di spacing coerente

**Inconsistenze di Pattern**:
- Due auth store coesistenti (`auth.store.ts` e `auth-store.ts`) con API diverse
- Tre pattern di data fetching diversi (React Query, fetch raw, useEffect+apiClient)
- Tre pattern di form handling (useForm hook, Form context, useState inline)
- Componenti Radix, HTML nativo e div raw usati in modo intercambiabile

**Problemi Strutturali**:
- 5 file route da 500+ righe (uno da 1052) — impossibili da mantenere
- `console.log` sparsi nel codice di produzione
- Emoji usate come icone al posto di una icon library
- `window.confirm()` nativo per conferme distruttive
- Link `<a href>` al posto di componenti router

**Internazionalizzazione**:
- Sistema i18n backend completo ma solo 1 pagina su 30+ usa `react-intl`
- Tutte le stringhe sono hardcoded in inglese

**Accessibilita**:
- Nessun audit WCAG, focus management assente, contrasto non verificato

#### 2.2.3 Sistema Plugin — DX Troppo Complessa

Il sistema plugin della v1 ha l'architettura giusta ma la developer
experience e problematica:

- **SDK con 6 classi client**: troppe astrazioni da imparare prima di
  poter scrivere un plugin
- **Module Federation config complessa**: lo sviluppatore plugin deve
  capire shared deps, remote entry, vite config MF — barriera d'ingresso alta
- **7 stati lifecycle**: troppi stati, troppe transizioni da gestire
- **Container Docker per backend plugin**: deployment complesso
- **Nessun plugin reale funzionante**: i plugin demo (CRM, Analytics)
  usano dati in-memory — il sistema non e mai stato validato E2E
- **Documentazione assente**: nessun tutorial passo-passo per creare un plugin

#### 2.2.4 Governance — Rapporto Costi/Benefici Negativo

- 33 ADR formali, 19 specifiche dettagliate, costituzione a 9 articoli
- Ma la maggior parte delle specifiche (001-009, 011, 014) non sono
  mai state implementate
- Il rapporto documentazione/codice funzionante e sbilanciato

---

## 3. Decisioni Architetturali Confermate

Queste decisioni della v1 sono **confermate e non negoziabili** nella v2:

| Decisione | Motivazione | Note v2 |
|-----------|-------------|---------|
| **Schema-per-tenant PostgreSQL** | GDPR compliance: isolamento fisico dei dati per tenant. Ogni tenant ha il proprio schema, i dati sono fisicamente separati. Fondamentale per data residency e right to erasure | Migliorare la gestione migrazioni e il tooling per rendere la complessita gestibile |
| **Keycloak multi-realm** | Ogni tenant puo avere meccanismi di autenticazione diversi (SAML, OIDC, social login, MFA policies). Un singolo realm non lo consente | Migliorare il provisioning automatico e la gestione dei realm |
| **ABAC tree-walk per workspace isolation** | All'interno di un tenant, i workspace devono avere isolamento dati granulare. L'ABAC con condition tree permette di esprimere regole come "utente X vede solo i dati del workspace Y con ruolo Z" | L'implementazione e corretta, la DX e il testing devono migliorare |
| **Kafka/Redpanda event bus** | I plugin devono poter sottoscrivere eventi CRUD sulle entita core e di altri plugin. Questo e il meccanismo che permette ai plugin di contribuire logiche personalizzate e gestire campi aggiuntivi su altre entita. Target enterprise richiede durabilita, ordering, replay | Semplificare la DX: il plugin deve sottoscrivere eventi con una riga, non configurare Kafka |
| **Module Federation per plugin UI** | iframe scartato per: styling inconsistente, performance (DOM separato), comunicazione limitata (postMessage), UX frammentata (scrollbar, focus). MF permette integrazione nativa nel DOM della shell | Semplificare drasticamente la configurazione: lo sviluppatore plugin non deve toccare la config MF |

---

## 4. Utenti e Personas

### 4.1 Super Admin (Operatore Piattaforma)

**Chi e**: il team tecnico che gestisce l'intera piattaforma Plexica.

**Bisogni principali**:
- Creare e gestire tenant (provisioning, sospensione, eliminazione)
- Gestire il catalogo plugin (marketplace)
- Monitorare la salute del sistema (health, metriche, log)
- Gestire utenti cross-tenant
- Configurazione piattaforma

**Frequenza d'uso**: quotidiana
**Livello tecnico**: alto

### 4.2 Tenant Admin (Amministratore Organizzazione)

**Chi e**: l'amministratore di un'organizzazione che usa Plexica.

**Bisogni principali**:
- Configurare il proprio tenant (branding, impostazioni, auth)
- Gestire utenti e ruoli (inviti, permessi, team)
- Installare e configurare plugin
- Gestire workspace e relativi permessi
- Visualizzare audit log

**Frequenza d'uso**: settimanale
**Livello tecnico**: medio

### 4.3 Utente Tenant (Utente Finale)

**Chi e**: un membro dell'organizzazione che usa l'applicazione quotidianamente.

**Bisogni principali**:
- Navigare nei workspace assegnati
- Usare le funzionalita fornite dai plugin
- Gestire il proprio profilo
- Ricevere notifiche

**Frequenza d'uso**: quotidiana
**Livello tecnico**: basso-medio

### 4.4 Sviluppatore Plugin

**Chi e**: uno sviluppatore (interno o esterno) che crea estensioni.

**Bisogni principali**:
- Creare un plugin con UI e backend in mezza giornata
- Documentazione chiara con tutorial passo-passo
- Ambiente di sviluppo locale funzionante con hot reload
- Sottoscrivere eventi e estendere entita core con semplicita
- Debug facile e test automatizzati
- Pubblicazione nel marketplace

**Frequenza d'uso**: durante lo sviluppo
**Livello tecnico**: alto

---

## 5. Requisiti Funzionali

### 5.1 Multi-Tenancy

| ID | Requisito | Priorita | Note |
|----|-----------|----------|------|
| MT-001 | Creazione tenant con provisioning automatico (schema + Keycloak realm + MinIO bucket) | Alta | v1 ha orchestratore 7 step — mantenere, migliorare error handling |
| MT-002 | Isolamento completo dei dati tra tenant via schema-per-tenant | Alta | Confermato per GDPR |
| MT-003 | Tenant context iniettato automaticamente su ogni richiesta | Alta | v1 usa AsyncLocalStorage + SET search_path — funziona |
| MT-004 | Sospensione/riattivazione tenant | Alta | Non implementato in v1 |
| MT-005 | Eliminazione tenant con cleanup completo (GDPR right to erasure) | Alta | Non implementato in v1 — critico per GDPR |
| MT-006 | Configurazione per-tenant (branding, limiti, feature flag) | Alta | v1 parziale |
| MT-007 | Migrazione schema automatica su tutti i tenant | Alta | Critico per schema-per-tenant |

### 5.2 Autenticazione e Autorizzazione

| ID | Requisito | Priorita | Note |
|----|-----------|----------|------|
| AA-001 | SSO via Keycloak con realm-per-tenant | Alta | Confermato — consente auth diversa per tenant |
| AA-002 | RBAC con ruoli predefiniti e custom | Alta | v1 funzionante |
| AA-003 | ABAC con condition tree per isolamento workspace | Alta | v1 implementazione corretta — mantenere |
| AA-004 | Invito utenti via email con onboarding | Alta | Da implementare/verificare |
| AA-005 | Self-service password reset (Keycloak) | Alta | Delegato a Keycloak |
| AA-006 | Multi-factor authentication (per-tenant configurable) | Media | Delegato a Keycloak realm config |
| AA-007 | Social login configurabile per tenant (Google, Microsoft, SAML) | Media | Motivazione multi-realm |

### 5.3 Workspace

| ID | Requisito | Priorita | Note |
|----|-----------|----------|------|
| WS-001 | CRUD workspace con slug univoco per tenant | Alta | v1: 11/14 endpoint esistenti |
| WS-002 | Gerarchia parent/child con materialised path | Alta | Spec 011 — richiesto per organizzazioni complesse |
| WS-003 | Template workspace | Media | Utile per onboarding tenant |
| WS-004 | Gestione membri workspace con ruoli | Alta | v1 esistente |
| WS-005 | Permessi per workspace (ABAC-driven) | Alta | Integrato con ABAC tree-walk |
| WS-006 | Plugin scoping per workspace (plugin attivi per workspace) | Alta | Plugin possono essere attivi solo in specifici workspace |

### 5.4 Sistema Plugin

| ID | Requisito | Priorita | Note |
|----|-----------|----------|------|
| PL-001 | Installazione plugin da marketplace | Alta | v1 ha infrastruttura, mai testata E2E |
| PL-002 | Lifecycle semplificato (3 stati: installato, attivo, disattivato) | Alta | v1 ha 7 stati — ridurre |
| PL-003 | Plugin manifest dichiarativo e semplice | Alta | v1 troppo verboso |
| PL-004 | Plugin UI via Module Federation semplificato (zero-config per plugin dev) | Alta | MF confermato, DX da semplificare radicalmente |
| PL-005 | Plugin backend con proxy API | Alta | v1 usa Docker — mantenere ma semplificare DX |
| PL-006 | Plugin event subscription (CRUD events su entita core e altri plugin) | Alta | v1 Kafka — mantenere, semplificare DX |
| PL-007 | Plugin data extension (tabelle plugin nello schema tenant) | Alta | v1 sidecar pattern — cambiare a tabelle dedicate |
| PL-008 | Marketplace con ricerca, categorie e rating | Alta | v1 ha modello dati |
| PL-009 | Configurazione plugin per-tenant | Alta | Manifest dichiara config schema, tenant admin compila |
| PL-010 | CLI per scaffolding plugin (`create-plexica-plugin`) | Alta | Non esiste in v1 |
| PL-011 | Documentazione tutorial passo-passo per creare un plugin | Alta | Non esiste in v1 |

### 5.5 Amministrazione

| ID | Requisito | Priorita | Note |
|----|-----------|----------|------|
| AD-001 | Dashboard super-admin con metriche chiave | Alta | v1 ha pagine, UX da rifare |
| AD-002 | Gestione tenant (CRUD + provisioning wizard + sospensione) | Alta | v1 ha pagine, UX da rifare |
| AD-003 | Gestione plugin marketplace (catalogo, review queue) | Alta | v1 ha pagine, UX da rifare |
| AD-004 | Audit log consultabile e filtrabile | Alta | v1 ha modello dati |
| AD-005 | Dashboard tenant-admin | Alta | v1 ha pagine, UX da rifare |
| AD-006 | Gestione utenti e ruoli per tenant | Alta | v1 ha pagine, UX da rifare |
| AD-007 | Impostazioni tenant (branding, auth config, limiti) | Alta | v1 parziale |
| AD-008 | Health monitoring e system status | Alta | Super admin vede stato servizi |

### 5.6 Notifiche

| ID | Requisito | Priorita | Note |
|----|-----------|----------|------|
| NT-001 | Notifiche in-app in tempo reale (SSE) | Alta | v1 ha ADR-023 |
| NT-002 | Notifiche email | Alta | v1 ha servizio |
| NT-003 | Preferenze notifiche per utente | Media | Non implementato in v1 |
| NT-004 | Plugin possono generare notifiche | Alta | Via event system |

### 5.7 Profilo Utente

| ID | Requisito | Priorita | Note |
|----|-----------|----------|------|
| UP-001 | Pagina profilo con dati personali | Alta | Spec 017 draft |
| UP-002 | Avatar utente (da Keycloak JWT picture claim) | Media | TD-030 v1 |
| UP-003 | Gestione sessioni attive | Media | Spec 017 draft |
| UP-004 | Cambio password (Keycloak) | Alta | Delegato a Keycloak |

---

## 6. Requisiti Non Funzionali

### 6.1 Performance

| ID | Requisito | Target |
|----|-----------|--------|
| NF-001 | Tempo risposta API (P95) | < 200ms |
| NF-002 | Tempo query database (P95) | < 50ms |
| NF-003 | Tempo caricamento pagina (3G) | < 2s |
| NF-004 | Time to Interactive | < 3s |

### 6.2 Scalabilita

| ID | Requisito | Target |
|----|-----------|--------|
| NF-010 | Tenant supportati | 1000+ |
| NF-011 | Utenti concorrenti per tenant | 500+ |
| NF-012 | Plugin installati per tenant | 50+ |

### 6.3 Affidabilita

| ID | Requisito | Target |
|----|-----------|--------|
| NF-020 | Uptime | 99.9% |
| NF-021 | Rollback deployment | < 5 minuti |
| NF-022 | Recovery da failure | < 15 minuti |

### 6.4 GDPR e Compliance

| ID | Requisito | Target |
|----|-----------|--------|
| NF-040 | Isolamento dati fisico tra tenant | Schema-per-tenant PostgreSQL |
| NF-041 | Right to erasure (cancellazione completa dati tenant) | DROP SCHEMA + Keycloak realm delete + MinIO bucket delete |
| NF-042 | Data portability (export dati tenant) | API di export in formato standard |
| NF-043 | Audit trail per accessi ai dati | Audit log per ogni operazione sensibile |

### 6.5 Testing

| ID | Requisito | Target | Motivazione |
|----|-----------|--------|-------------|
| NF-030 | Test E2E full-stack obbligatori per ogni feature | 100% delle feature | v1 non ha test E2E reali |
| NF-031 | Zero divergenza test-produzione | App test = app produzione | v1 ha `test-app.ts` diverso |
| NF-032 | Autenticazione reale nei test | Token RS256 da Keycloak reale | v1 usa token HS256 auto-firmati |
| NF-033 | Test Playwright in CI bloccanti | Pipeline blocca se E2E fallisce | v1 non ha Playwright in CI |
| NF-034 | Nessun mock nei test E2E | Servizi core reali | v1 mocka tutto |

---

## 7. Sistema Plugin — Riprogettazione

### 7.1 Filosofia

Il sistema plugin mantiene l'architettura enterprise della v1 (Module
Federation, Kafka events, schema-per-tenant) ma **la developer experience
deve essere radicalmente semplificata**.

Lo sviluppatore plugin non deve:
- Configurare Module Federation (la CLI/template lo fa automaticamente)
- Configurare Kafka consumer (l'SDK offre un decoratore/metodo semplice)
- Gestire la complessita dello schema-per-tenant (il core gestisce le migrazioni)
- Imparare 6 classi SDK (un SDK semplificato con API fluent)

### 7.2 Module Federation Semplificato — Proposta

**Problema v1**: lo sviluppatore plugin deve capire e configurare
Module Federation (shared deps, remote entry, vite/webpack config).
Barriera d'ingresso altissima.

**Soluzione v2**: Plugin Vite Preset + CLI

La semplificazione avviene su 3 livelli:

**Livello 1 — CLI di scaffolding**:
- `npx create-plexica-plugin my-plugin` genera un progetto completo
- Il progetto generato ha gia: vite config con MF pre-configurato,
  manifest pre-compilato, componente React di esempio, test di esempio
- Lo sviluppatore non vede e non tocca mai la configurazione MF

**Livello 2 — Vite Plugin Preset**:
- Un plugin Vite dedicato (`@plexica/vite-plugin`) che configura
  automaticamente Module Federation
- Il preset legge il manifest del plugin e genera la config MF
- Shared dependencies (React, React DOM, TanStack Query, UI library,
  i18n) sono dichiarate centralmente nel preset
- Lo sviluppatore aggiunge solo le sue dipendenze specifiche

**Livello 3 — Dev Server integrato**:
- `npm run dev` nel plugin avvia un dev server con hot reload
- Il dev server si registra automaticamente nella shell di sviluppo locale
- La shell di sviluppo carica il plugin dal dev server locale
- Lo sviluppatore vede le sue modifiche in tempo reale nella shell

**Risultato**: lo sviluppatore plugin scrive componenti React normali.
Non sa che sotto c'e Module Federation. La complessita e incapsulata
nel tooling.

### 7.3 Lifecycle Semplificato

Tre stati, transizioni chiare:

| Stato | Descrizione | Transizioni |
|-------|-------------|------------|
| `INSTALLED` | Plugin nel sistema, non visibile agli utenti | → ACTIVE, → (uninstall) |
| `ACTIVE` | Plugin attivo e visibile | → DISABLED |
| `DISABLED` | Plugin disabilitato, dati preservati | → ACTIVE, → (uninstall) |

Operazioni aggiuntive (INSTALLING, UNINSTALLING della v1) diventano
stati transitori gestiti internamente — il plugin dev non li vede.

### 7.4 Plugin Data — Tabelle nello Schema Tenant

Ogni plugin che necessita di persistenza ha le proprie tabelle nello
schema del tenant.

**Flusso**:
1. Il plugin include le proprie migrazioni SQL/Prisma nel pacchetto
2. Al momento dell'installazione in un tenant, il core esegue le
   migrazioni del plugin nello schema del tenant
3. Le tabelle del plugin vivono accanto alle tabelle core nello schema
   (es: `tenant_acme.crm_contacts`, `tenant_acme.crm_deals`)
4. Le tabelle plugin possono referenziare entita core via FK (es:
   `crm_contacts.workspace_id` → `workspaces.id`)
5. Alla disinstallazione, le tabelle plugin vengono rimosse dallo schema

**Vantaggi rispetto alla v1 (sidecar/DataExtensionClient)**:
- Modello dati tipizzato e relazionale (non JSON blob)
- Query SQL standard (JOIN, index, constraint)
- Le migrazioni sono versionabili e testabili
- GDPR: i dati plugin sono nello schema tenant, cancellati con DROP SCHEMA

### 7.5 Manifest Plugin v2

Il manifest deve essere semplice ma completo:

**Campi principali**:
- `id` — identificativo unico
- `name` — nome visualizzato (i18n key)
- `version` — semver
- `description` — descrizione (i18n key)
- `author` — autore/organizzazione
- `permissions` — permessi richiesti dalla piattaforma
- `ui.extensions[]` — punti di estensione UI (slot name + component)
- `ui.routes[]` — route aggiuntive nel workspace
- `api.endpoints[]` — endpoint backend esposti
- `events.subscriptions[]` — eventi a cui il plugin si sottoscrive
- `events.publications[]` — eventi che il plugin emette
- `config.schema` — schema JSON della configurazione per-tenant
- `migrations` — path alle migrazioni database del plugin

### 7.6 SDK Plugin v2

L'SDK v2 espone una API semplificata:

**Un'unica classe base** con metodi chiari:
- `onEvent(eventType, handler)` — sottoscrive un evento
- `emitEvent(eventType, payload)` — emette un evento
- `getConfig()` — ottiene la configurazione per-tenant
- `callApi(method, path, data)` — chiama un'API core autenticata
- `getContext()` — ottiene tenant, user, workspace corrente

Le 6 classi della v1 (ApiClient, EventClient, ServiceClient,
SharedDataClient, DataExtensionClient, PluginBase) vengono consolidate
in una singola classe con metodi organizzati per dominio.

### 7.7 Extension Points UI v2

L'approccio v1 con 5 tabelle database (extension_slots, extension_contributions,
workspace_extension_visibility, extensible_entities, data_extensions) e
ridondante. La v2 usa un approccio ibrido:

- **Punti di estensione UI** (dove il plugin appare nella shell): dichiarati
  nel manifest, nessuna tabella database necessaria. La shell legge i manifest
  dei plugin attivi e renderizza i componenti nei punti dichiarati
- **Visibilita per workspace**: unica tabella `plugin_workspace_visibility`
  per controllare quali plugin sono visibili in quali workspace
- **Data extensions**: tabelle plugin nello schema tenant (vedi §7.4), non
  piu Extension Points con sidecar storage

---

## 8. Sistema Eventi — Plugin Event Subscription

### 8.1 Perche il Sistema Eventi e Necessario

I plugin devono poter:
1. **Reagire a eventi CRUD** sulle entita core (es: "quando un workspace
   viene creato, il plugin CRM crea automaticamente un pipeline di vendita")
2. **Reagire a eventi di altri plugin** (es: "quando il plugin CRM crea
   un contatto, il plugin Analytics aggiorna le metriche")
3. **Contribuire con logiche personalizzate** (es: "quando un utente viene
   invitato, il plugin Onboarding invia un messaggio di benvenuto personalizzato")
4. **Gestire campi aggiuntivi su entita core** (es: "quando un workspace
   viene aggiornato, il plugin CRM aggiorna i propri campi custom collegati")

Senza un sistema eventi, i plugin non possono estendere il comportamento
della piattaforma — possono solo aggiungere UI e API indipendenti.

### 8.2 Architettura v2

**Kafka/Redpanda confermato** per il target enterprise (durabilita,
ordering, replay, dead letter queue).

**Semplificazioni v2 rispetto alla v1**:

| Aspetto | v1 | v2 |
|---------|----|----|
| Setup dev locale | Cluster Redpanda 3 nodi | Singolo nodo Redpanda per dev, 3 per staging/prod |
| Plugin subscription | Configurare KafkaJS consumer, gestire offset, deserializzazione | `onEvent('workspace.created', handler)` nell'SDK |
| Event publishing | EventBusService con topic management | Il core emette eventi automaticamente su CRUD (convention) |
| Topic naming | Manuale | Convention: `plexica.{entity}.{action}` (es: `plexica.workspace.created`) |
| Dead letter queue | Configurazione manuale | Automatica per ogni consumer plugin |
| Monitoring | Non implementato | Metriche consumer lag per plugin esposte in Prometheus |

### 8.3 Eventi Core Emessi Automaticamente

Il core emette eventi per ogni operazione CRUD sulle entita principali:

| Entita | Eventi |
|--------|--------|
| Tenant | `tenant.created`, `tenant.updated`, `tenant.suspended`, `tenant.deleted` |
| User | `user.created`, `user.updated`, `user.deleted`, `user.invited` |
| Workspace | `workspace.created`, `workspace.updated`, `workspace.deleted` |
| Plugin Installation | `plugin.installed`, `plugin.activated`, `plugin.deactivated`, `plugin.uninstalled` |
| Workspace Member | `workspace.member.added`, `workspace.member.removed`, `workspace.member.role_changed` |

### 8.4 Plugin Custom Events

I plugin possono emettere eventi custom che altri plugin sottoscrivono:

- Topic naming: `plugin.{pluginId}.{entity}.{action}`
- Esempio: `plugin.crm.contact.created`, `plugin.crm.deal.closed`
- I plugin dichiarano nel manifest quali eventi emettono e quali sottoscrivono
- Il core valida che un plugin sottoscriva solo eventi per cui ha permesso

---

## 9. UX e UI — Riprogettazione Completa

### 9.1 Problemi della v1 da Risolvere

La UX/UI della v1 e stata valutata 3/10 nell'audit. I problemi sono
elencati nella sezione 2.2.2.

### 9.2 Design System v2

#### Principi

- **Chiaro e professionale**: design pulito, moderno, adatto a un prodotto SaaS B2B enterprise
- **Consistente**: un solo pattern per ogni tipo di interazione
- **Accessibile**: WCAG 2.1 AA come requisito minimo
- **Responsive**: mobile-first per le viste principali
- **Tematizzabile**: i tenant devono poter personalizzare colori e logo

#### Tipografia

- Font primario sans-serif (Inter, System UI, o equivalente)
- Font monospace solo per codice e dati tecnici
- Scala tipografica coerente
- Line-height ottimizzate per leggibilita

#### Colori

- Palette primaria con colore brand definito
- Palette semantica per stati (success, warning, error, info)
- Supporto dark mode nativo
- Contrasto WCAG AA su tutte le combinazioni testo/sfondo
- Palette override per tenant (branding)

#### Componenti

- Component library basata su primitivi accessibili (Radix UI)
- Un solo set di componenti per l'intera applicazione
- Storybook come documentazione vivente del design system
- Condivisi tra app tenant, app super-admin e plugin (via `@plexica/ui`)

### 9.3 Architettura Frontend v2

#### Regole Non Negoziabili

| Regola | Motivazione |
|--------|-------------|
| Nessun file componente sopra le 200 righe | v1 aveva file da 1000 righe |
| Un solo modo di fare data fetching (TanStack Query) | v1 ne aveva 3 |
| Un solo modo di fare form (react-hook-form + Zod) | v1 ne aveva 3 |
| Un solo auth store | v1 ne aveva 2 |
| Tutte le stringhe UI da i18n (react-intl) | v1 aveva stringhe hardcoded |
| Nessun console.log, emoji-icon, window.confirm in produzione | v1 ne era piena |
| Logica di business in hook, componenti puri | v1 mescolava tutto |

#### Stato dell'Applicazione

- **Un solo store** per l'autenticazione (Zustand)
- **TanStack Query** come unico pattern di data fetching e server state
- **URL state** per filtri, paginazione, ordinamento (TanStack Router)
- **Zustand** solo per stato UI locale (sidebar, theme)

### 9.4 Flussi Utente Critici

Ogni flusso qui descritto avra un test E2E dedicato:

#### Login e Onboarding
1. L'utente accede all'URL del proprio tenant
2. Redirect a Keycloak (realm del tenant) per autenticazione
3. Dopo il login, redirect alla dashboard del workspace predefinito
4. Al primo accesso: wizard di benvenuto

#### Gestione Workspace
1. Dashboard mostra i workspace accessibili (filtrati da ABAC)
2. Click su workspace apre la vista dettaglio
3. Sidebar mostra navigazione workspace (contenuto, membri, plugin, impostazioni)
4. I plugin attivi nel workspace contribuiscono pannelli/tab

#### Installazione Plugin
1. Tenant admin apre la sezione Plugin
2. Marketplace mostra plugin con descrizione e rating
3. Click "Installa" mostra permessi ed eventi richiesti
4. Conferma: installazione (schema migration) + attivazione
5. Il plugin appare nel workspace senza reload (MF hot loading)

---

## 10. Sistema di Testing E2E Full-Stack

### 10.1 Strategia

Ogni feature ha **obbligatoriamente** un test E2E che la verifica
end-to-end: browser → API → database → Keycloak → event bus.

### 10.2 Piramide di Test

| Livello | Cosa Testa | Ambiente | Mock Permessi |
|---------|-----------|---------|--------------|
| **E2E Full-Stack** | Intero flusso utente | Stack Docker completo (identico a prod) | Nessuno |
| **Integrazione API** | Endpoint API con tutti i middleware | API + DB + Keycloak + Redis + Kafka reali | Solo SMTP |
| **Unitario** | Logica di business pura | In-memory | Solo I/O esterno |

### 10.3 Regole

1. **Nessuna feature senza test E2E**
2. **Nessun `isTestToken`**: il codice di produzione non ha code path diversi per i test
3. **Nessun `test-app.ts`**: i test usano la stessa app di produzione
4. **Nessun mock di servizi core nei test E2E/integrazione**
5. **Test deterministici**: nessun test flaky tollerato
6. **CI bloccante**: la pipeline rifiuta il merge se un test E2E fallisce

### 10.4 Infrastruttura

- Docker Compose con stack identico alla produzione
- Keycloak con realm di test pre-configurati (utenti, ruoli, auth flows)
- PostgreSQL con schema-per-tenant di test pre-creati
- Kafka/Redpanda per testare event flow
- Seed data deterministico e versionato
- Reset tra test suite (truncate + re-seed)

---

## 11. Sicurezza e GDPR

### 11.1 Principi Confermati dalla v1

- Parameterized query obbligatorie
- Validazione input con Zod
- CSRF protection
- Rate limiting a 3 livelli
- TLS obbligatorio
- Nessun segreto nel codice

### 11.2 GDPR

| Requisito | Implementazione |
|-----------|----------------|
| Isolamento dati | Schema-per-tenant: ogni tenant ha schema PostgreSQL separato |
| Right to erasure | DROP SCHEMA + Keycloak realm delete + MinIO bucket delete |
| Data portability | API export dati tenant in formato standard |
| Audit trail | Audit log per ogni accesso/modifica dati sensibili |
| Consent management | Gestito da Keycloak realm configuration |

### 11.3 Miglioramenti v2

| Area | v2 Target |
|------|-----------|
| Autenticazione test | Rimosso `isTestToken` — test usano Keycloak reale |
| Content Security Policy | CSP rigoroso |
| Plugin security | MF sandbox con shared deps controllate + permessi granulari |
| Dependency scanning | Automatico in CI |

---

## 12. Internazionalizzazione

| ID | Requisito | Priorita |
|----|-----------|----------|
| I18N-001 | Tutte le stringhe UI estraibili e traducibili | Alta |
| I18N-002 | Supporto almeno inglese e italiano al lancio | Alta |
| I18N-003 | Override traduzioni per tenant | Media |
| I18N-004 | Formato date/numeri locale-aware | Alta |
| I18N-005 | Plugin possono registrare le proprie traduzioni | Alta |

---

## 13. Osservabilita e Operativita

| ID | Requisito | Priorita |
|----|-----------|----------|
| OB-001 | Health check endpoint con controllo dipendenze | Alta |
| OB-002 | Metriche applicative Prometheus | Alta |
| OB-003 | Log strutturati JSON con correlation ID | Alta |
| OB-004 | Tracing distribuito (OpenTelemetry + Tempo) | Media |
| OB-005 | Dashboard Grafana | Media |
| OB-006 | Alerting su error rate e latenza | Media |
| OB-007 | Metriche per-plugin per-tenant | Media |
| OB-008 | Consumer lag Kafka per plugin | Media |

---

*Fine del Documento di Specifiche — Revisione 2*

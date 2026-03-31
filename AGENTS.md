# Project Rules — Plexica v2

> Questo file viene caricato automaticamente da OpenCode. Definisce le
> convenzioni, gli standard e i riferimenti di progetto che tutti gli
> agenti devono rispettare.

---

## Descrizione del Progetto

**Plexica v2** è una piattaforma SaaS multi-tenant enterprise modulare che
consente alle organizzazioni di costruire applicazioni isolate per tenant
con estensibilità basata su plugin.

Questa è una **riscrittura pulita** della v1, con le stesse scelte architetturali
(schema-per-tenant, Keycloak multi-realm, ABAC, Kafka, Module Federation)
ma con complessità incapsulata dietro tooling e SDK, testing E2E reale e
una UX professionale.

**Documenti di riferimento principali**:
- `docs/01-SPECIFICHE.md` — requisiti funzionali e non funzionali
- `docs/02-ARCHITETTURA.md` — architettura tecnica e decisioni confermate
- `docs/03-PROGETTO.md` — fasi, rischi, criteri di successo
- `.forge/constitution.md` — le 6 regole non negoziabili

---

## Stack Tecnologico

### Backend

| Layer           | Tecnologia        | Versione  | Note                                      |
| --------------- | ----------------- | --------- | ----------------------------------------- |
| Runtime         | Node.js           | >= 20     |                                           |
| Linguaggio      | TypeScript        | ^5.9      | Strict mode obbligatorio                  |
| Framework       | Fastify           | ^5        | Monolite, organizzato per feature module  |
| Database        | PostgreSQL        | 15+       | Schema-per-tenant per isolamento GDPR     |
| ORM             | Prisma            | ^6        | Con escape hatch SQL raw                  |
| Cache           | Redis (ioredis)   | ^5        | Caching, rate limiting, ABAC policy cache |
| Object Storage  | MinIO             | ^8        | S3-compatibile, bucket per tenant         |
| Event Bus       | Kafka / Redpanda  | KafkaJS ^2| Singolo nodo in dev, 3 nodi in prod       |
| Auth            | Keycloak          | 26+       | Multi-realm (un realm per tenant)         |

### Frontend

| Layer           | Tecnologia                  | Versione  | Note                                      |
| --------------- | --------------------------- | --------- | ----------------------------------------- |
| UI Framework    | React                       | ^19       |                                           |
| Build           | Vite                        | latest    |                                           |
| Micro-frontends | Module Federation           | —         | DX incapsulata in CLI + Vite preset       |
| Routing         | TanStack Router             | latest    | Type-safe, data loading integrato         |
| Data Fetching   | TanStack Query              | latest    | **Unico** pattern di data fetching        |
| State           | Zustand                     | latest    | **Un solo** store per auth, theme, sidebar|
| Styling         | Tailwind CSS                | latest    | Utility-first                             |
| Forms           | react-hook-form + Zod       | latest    | **Unico** pattern per tutti i form        |
| i18n            | react-intl                  | latest    | Tutte le stringhe UI devono passare da qui|
| Primitives      | Radix UI                    | latest    | Base del design system, accessibilità WCAG|
| Icons           | Lucide                      | latest    | Nessuna emoji come icona                  |

### Tooling

| Scopo           | Tool              | Versione  |
| --------------- | ----------------- | --------- |
| Package Manager | pnpm              | >= 10     |
| Monorepo        | pnpm workspaces   | —         |
| E2E Testing     | Playwright        | latest    |
| Unit/Int Testing| Vitest            | ^4        |
| Linter          | ESLint            | latest    |
| Formatter       | Prettier          | latest    |
| CI/CD           | GitHub Actions    | —         |

**Nuove dipendenze richiedono un ADR.**

---

## Convenzioni di Codice

### Naming

- **File**: kebab-case (`user-service.ts`, `tenant-context.ts`)
- **Classi**: PascalCase (`UserService`, `TenantMiddleware`)
- **Funzioni/metodi**: camelCase (`getUserById`, `validateToken`)
- **Costanti**: UPPER_SNAKE_CASE (`MAX_RETRIES`, `DEFAULT_TIMEOUT`)
- **Tipi/Interfacce**: PascalCase, senza prefisso `I` (`User`, `TenantConfig`)
- **Enum**: PascalCase con membri PascalCase (`UserRole.Admin`)

### Struttura Directory

```
apps/
  web/              # Frontend React tenant (MF host)
  admin/            # Frontend React super-admin
packages/
  ui/               # @plexica/ui — design system condiviso
  i18n/             # @plexica/i18n — traduzioni
  vite-plugin/      # @plexica/vite-plugin — Vite preset per plugin
  sdk/              # @plexica/sdk — SDK plugin (1 classe)
services/
  core-api/
    src/
      modules/      # Feature modules (auth, tenant, workspace, plugin, admin, notification, user-profile)
      middleware/   # Middleware condivisi (auth, tenant-context, abac, rate-limit, csrf, error-handler)
      lib/          # Utility condivise (database, logger, config, kafka-producer)
      events/       # Definizioni eventi core e producer
```

### Regole Strutturali (Non Negoziabili)

- **Nessun file sopra 200 righe.** Se necessario, decomporre.
- **Nessun `console.log` in produzione.** Usare il logger strutturato Pino.
- **Nessuna emoji come icona.** Usare Lucide.
- **Nessun `window.confirm()` nativo.** Usare il Dialog component del design system.
- **Nessun link `<a href>` al posto di componenti router.**
- **Logica di business negli hook, non nei componenti.**

### Ordine degli Import

1. Moduli built-in di Node.js
2. Dipendenze esterne (npm packages)
3. Package interni (`@plexica/*`)
4. Import relativi
5. Import type-only

Separare ogni gruppo con una riga vuota.

---

## Git Workflow

### Branch Naming

| Tipo    | Pattern                     | Esempio                          |
| ------- | --------------------------- | -------------------------------- |
| Feature | `feat/<spec-id>-<slug>`     | `feat/WS-001-workspace-crud`     |
| Fix     | `fix/<spec-id>-<slug>`      | `fix/AA-002-jwt-validation`      |
| Hotfix  | `hotfix/<slug>`             | `hotfix/tenant-context-leak`     |
| Epic    | `epic/<fase>-<slug>`        | `epic/fase1-fondamenta`          |

### Formato Commit

> **REGOLA NON NEGOZIABILE (Costituzione Rule 6)**: tutti i messaggi di commit
> devono essere scritti **esclusivamente in inglese** — tipo, scope, subject line,
> body e footer. Nessuna eccezione per contributor, agenti o tool automatici.
> Un commit in un'altra lingua **deve essere rifiutato e riscritto** prima del merge.

Usare [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description in English>

[optional body in English]

[optional footer in English]
```

Tipi: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`

**Esempi corretti**:
```
feat(auth): add Keycloak token validation middleware
fix(tenant): prevent schema creation for duplicate slugs
chore(sprint): initialize Sprint 1 — Phase 0 infrastructure setup
```

**Esempi NON validi** (rifiutati):
```
feat(auth): aggiungi validazione token Keycloak   ← italiano: RIFIUTATO
fix(tenant): correggi creazione schema duplicato   ← italiano: RIFIUTATO
```

### Pull Request

- Ogni PR deve avere **dual-model adversarial review** (`/forge-review`) prima della review umana
- Ogni PR deve avere **code review umana** (almeno 1 approvazione)
- La descrizione della PR deve referenziare il requisito o la fase (`WS-001`, `Fase 2.1`)
- **Tutti i check CI devono essere verdi** — nessun merge con CI rossa

---

## Testing

### Filosofia (Lezione dalla v1)

La v1 aveva 4000+ test che non garantivano il funzionamento del sistema.
I test verificavano mock, non il sistema reale. **Questo non si ripete nella v2.**

**Gerarchia di valore**:
1. **Test E2E full-stack** — attraversano browser → API → DB → Keycloak → Kafka
2. **Test di integrazione API** — tutti i middleware attivi, Keycloak reale, DB reale
3. **Test unitari** — solo per logica di business pura

### Regole Obbligatorie

1. **Ogni feature ha un test E2E.** La CI blocca il merge se mancante o fallisce.
2. **Nessun `isTestToken`.** Zero code path diversi per i test.
3. **Nessun `test-app.ts` separata.** L'app di test è l'app di produzione.
4. **Nessun mock di servizi core** nei test E2E e di integrazione.
5. **Token RS256 reali.** I test usano Keycloak reale, non token HS256 auto-firmati.
6. **Test deterministici.** Nessun test flaky tollerato.

### Metriche di Copertura

| Metrica                        | Target |
| ------------------------------ | ------ |
| Flussi critici con test E2E    | 100%   |
| Copertura linee (unit + int)   | >= 80% |
| Endpoint API testati (int)     | 100%   |

### Tipi di Test Richiesti

- **E2E (Playwright)**: ogni flusso utente completo (login, workspace, plugin, admin)
- **Integrazione API (Vitest)**: ogni endpoint con tutti i middleware attivi
- **Unitari (Vitest)**: logica di validazione, trasformazioni, policy ABAC, calcoli

---

## Architettura — Decisioni Confermate

Queste decisioni **non sono negoziabili** e non richiedono ulteriori ADR:

| Decisione                  | Perché                                                      |
| -------------------------- | ----------------------------------------------------------- |
| Schema-per-tenant          | GDPR compliance, isolamento fisico, right to erasure        |
| Keycloak multi-realm       | Auth diversa per tenant (SAML, OIDC, social, MFA policies)  |
| ABAC tree-walk             | Isolamento dati workspace-level all'interno del tenant       |
| Kafka/Redpanda event bus   | Plugin event subscription (durabilità, ordering, replay)    |
| Module Federation per plugin UI | iframe scartato per UX, styling, performance           |
| Plugin data = tabelle nello schema tenant | Plugin porta migrazioni, core le esegue       |
| Monolite Fastify (no microservices) | Un solo deployable, feature module interni        |

### Pattern Frontend (Un Solo Pattern per Tipo)

| Operazione    | Pattern Obbligatorio       | Vietato                                  |
| ------------- | -------------------------- | ---------------------------------------- |
| Data fetching | TanStack Query             | `fetch` raw, `useEffect + useState`      |
| Form handling | react-hook-form + Zod      | Form context, `useState` inline          |
| Auth state    | Zustand (un solo store)    | Context API separata, store multipli     |
| Stringhe UI   | react-intl                 | Stringhe hardcoded                       |
| Icone         | Lucide                     | Emoji, SVG inline non sistemizzati       |
| Dialog/Confirm| Dialog component           | `window.confirm()`, `window.alert()`     |

---

## Governance

### Le 5 Regole (dalla Costituzione)

1. **Ogni feature ha un test E2E.** Playwright in CI, blocca il merge.
2. **Nessun merge senza CI verde.** Unit, integration e E2E devono tutti passare.
3. **Un pattern per tipo di operazione.** Un modo di fare data fetching, form, auth.
4. **Nessun file sopra 200 righe.** Se serve di più, decomporre.
5. **Le decisioni architetturali significative hanno un ADR.** Significativo = cambia modello dati, auth, infrastruttura, dipendenze core.

### Quando Aprire un ADR

Aprire un ADR **solo** per:
- Cambiamenti al modello dati (schema, nuove entità core)
- Cambiamenti all'autenticazione o all'autorizzazione
- Cambiamenti all'infrastruttura (nuovi servizi, sostituzioni)
- Nuove dipendenze core (`package.json` root o `services/core-api`)

**Non aprire ADR** per: nuove route API, nuovi componenti UI, refactoring interni.

### Knowledge Base

Prima di prendere decisioni architetturali, consultare:
- **ADR**: `.forge/knowledge/adr/` — decisioni architetturali formali
- **Decision Log**: `.forge/knowledge/decision-log.md` — decisioni di sessione
- **Lessons Learned**: `.forge/knowledge/lessons-learned.md` — anti-pattern dalla v1

### Processo di Lavoro Quotidiano

1. Scegliere la feature dal backlog (Kanban: Todo → In Progress → Done)
2. Scrivere il test E2E che definisce "fatto"
3. Implementare (backend + frontend + test unitari + test integrazione)
4. Verificare che il test E2E passa localmente
5. **Dual-model adversarial review** (`/forge-review`) — Claude + GPT-Codex su 7 dimensioni
6. Code review umana
7. Merge (solo con CI verde)

**Non è richiesta** una specifica formale per ogni feature. **Non è richiesto** un ADR a meno che la feature cambi l'architettura.

### Traceabilità Spec-Codice

- Le implementazioni devono referenziare l'ID requisito dalla specifica (es. `WS-001`, `PL-004`)
- I test E2E devono avere descrizioni che riflettono il flusso utente testato
- Le PR linkano al requisito o alla fase di progetto

---

## Sicurezza (Non Negoziabile)

1. **Isolamento tenant**: schema-per-tenant a livello database. Data leak cross-tenant = incidente critico.
2. **Autenticazione**: Keycloak su ogni endpoint. Gli endpoint pubblici sono esplicitamente opt-in e documentati.
3. **SQL injection**: solo query parametrizzate. Mai interpolazione di stringhe in SQL.
4. **Validazione input**: schema Zod su tutti gli input esterni.
5. **Segreti**: mai nel codice. Solo variabili d'ambiente.
6. **PII**: mai nei log, nei messaggi di errore, o nelle risposte client-side.

---

## Ambiente

Variabili d'ambiente richieste:

| Variabile                  | Scopo                                          |
| -------------------------- | ---------------------------------------------- |
| `DATABASE_URL`             | Connessione PostgreSQL                         |
| `KEYCLOAK_URL`             | URL Keycloak (es. `http://localhost:8080`)     |
| `KEYCLOAK_ADMIN_USER`      | Credenziali admin Keycloak per provisioning    |
| `KEYCLOAK_ADMIN_PASSWORD`  | Credenziali admin Keycloak per provisioning    |
| `REDIS_URL`                | Connessione Redis                              |
| `KAFKA_BROKERS`            | Broker Kafka/Redpanda (comma-separated)        |
| `MINIO_ENDPOINT`           | Endpoint MinIO                                 |
| `MINIO_ACCESS_KEY`         | Access key MinIO                               |
| `MINIO_SECRET_KEY`         | Secret key MinIO                               |
| `SMTP_HOST`                | SMTP per notifiche email (Mailhog in dev)      |
| `GITHUB_TOKEN`             | GitHub personal access token (MCP integration) |

**Avvio sviluppo locale**: `docker compose up` avvia l'intero stack.
Nessuna configurazione manuale richiesta.

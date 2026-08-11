# Review Generale del Codebase — Ottimizzazione e Riduzione

> **Data**: 31 luglio 2026
> **Branch**: `review/codebase-revision`
> **Base**: `main` @ `21fcfed`
> **Perimetro**: 107.011 LOC su 743 file TypeScript/TSX, più config, CI, Docker, E2E e documentazione

---

## Indice

| Documento | Perimetro | Findings |
| --------- | --------- | -------- |
| [01 — Backend: moduli funzionali](./01-backend-moduli.md) | `services/core-api/src/modules/` — 13.123 LOC, 12 moduli | 28 |
| [02 — Backend: infrastruttura e test](./02-backend-infrastruttura.md) | `middleware/`, `lib/`, `events/`, `cli/`, `__tests__/`, Prisma — 15.651 LOC | 24 |
| [03 — Frontend: applicazioni](./03-frontend-apps.md) | `apps/web` + `apps/admin` — 14.374 LOC | 18 |
| [04 — Package condivisi](./04-packages-condivisi.md) | `packages/*` + `examples/` — 7.614 LOC | 20 |
| [05 — Build, CI, infrastruttura, docs](./05-build-ci-infra.md) | config, workflow, Docker, E2E, documentazione | 31 |

**Totale: 121 findings.**

---

## Sintesi esecutiva

### Il numero

| Area | LOC analizzate | Findings | LOC riducibili | % dell'area |
| ---- | -------------: | -------: | -------------: | ----------: |
| Backend — moduli | 13.123 | 28 | ~1.018 | 7,8 % |
| Backend — infrastruttura + test | 15.651 | 24 | ~1.236 | 8,0 % |
| Frontend — apps | 14.374 | 18 | ~1.740 | 12,1 % |
| Package condivisi + examples | 7.614 | 20 | ~800–1.030 | 12–15 % |
| Build / CI / infra / docs | — | 31 | ~450 righe di config | — |
| **Totale** | **50.762 analizzate** | **121** | **~5.250–5.480 LOC** | **~10 %** |

A cui si aggiungono, fuori dal conteggio LOC:

- **87 file morti** committati in git (77 in `infra/keycloak/themes/`, 8 build artifact del plugin CRM, 1 database pnpm, 10 file MCP duplicati)
- **~1,9 MB** di artefatti di build tracciati
- **1.706 righe** di documentazione superata da archiviare
- **17 dipendenze npm** dichiarate e mai importate (~40–60 MB di `node_modules`)
- **~2–4 minuti** di tempo CI recuperabili per run, più 20–60 minuti/giorno di capacità runner

### La lettura onesta del numero

Il 10 % non è tutto "grasso da tagliare". Va scomposto in tre categorie con valore molto diverso:

| Categoria | LOC | Natura | Rischio |
| --------- | --: | ------ | ------- |
| **Cancellazione pura** — codice morto, duplicati esatti, file orfani | ~1.900 | Guadagno netto immediato | Molto basso |
| **Consolidamento** — estrazione di astrazioni con ≥3 consumatori reali | ~2.100 | Riduce manutenzione, aggiunge un livello di indirezione | Medio |
| **Astrazione prematura** — pattern con soli 2 consumatori | ~1.300 | Riduce le righe ma può produrre l'astrazione sbagliata | Medio-alto |

**Raccomandazione**: eseguire integralmente la prima categoria, la seconda con giudizio caso per caso, e trattare la terza come proposte da validare con chi conosce la roadmap.

### Il tema dominante non è la duplicazione

L'analisi ha fatto emergere uno schema ricorrente che è più interessante del conteggio delle righe: **esiste l'astrazione corretta, ma nessuno la usa, e il consumatore reimplementa a mano.**

| Astrazione esistente | Chi la ignora e reimplementa |
| -------------------- | ---------------------------- |
| `createAuthBaseSlice` (`packages/auth`) | Entrambi gli auth store di `web` e `admin` |
| `PluginSDK` (`packages/sdk`) | Il plugin CRM riscrive db, api e eventi |
| `PasswordField` (keycloak-theme) | `Login.tsx` riscrive il toggle, SVG inclusi |
| `Toast` (`packages/ui`) | `session-expired-handler` riscrive il banner |
| `unregisterBackend` (SDK) | Il template CLI riscrive il `fetch` |
| `--font-sans` (design token) | 4 file riscrivono lo stack a mano |
| `EmptyState`/`PageError`/`Skeleton` (web) | `apps/admin` li reimplementa inline 16 volte |
| `withOptimisticLock` (backend) | `suspend`/`reactivate` lo riscrivono con `updateMany` |
| `paginationSchema` (`lib/`) | 4 moduli lo ricopiano, 3 convenzioni divergenti |
| `readTenantLifecycle` (cache) | Nessuno legge la cache, ma tutti ci scrivono |

**Aggiungere altre astrazioni non risolve questo problema.** La priorità è collegare quelle esistenti ai loro consumatori e poi eliminare ciò che resta scollegato.

---

## Findings critici — da affrontare per primi

Sei findings di severità **Critica**. Tre sono bug attivi, tre sono debito strutturale.

### Bug attivi in produzione

| # | Finding | Documento | Impatto |
| - | ------- | --------- | ------- |
| B1 | `writeAuditLog` scrive su un client Prisma già disconnesso — **17 call site senza `await`** | [01](./01-backend-moduli.md#1) | L'audit trail viene perso in modo silenzioso e non deterministico. Invalida i requisiti FR-021/NFR-03 e i test E2E che vi si appoggiano. |
| B2 | `logDecision` non attende la `create` → race con `$disconnect` | [02](./02-backend-infrastruttura.md#7) | Il decision log ABAC (compliance FR-015/NFR-08) è di fatto inaffidabile. |
| B3 | `profile-api.ts:11` costruisce `/api/api/v1/profile/avatar` | [03](./03-frontend-apps.md#6) | L'upload dell'avatar riceve 404. Endpoint rotto. |

Questi tre non sono ottimizzazioni: sono difetti che il refactor renderebbe solo più difficili da trovare. **Vanno chiusi prima di qualunque altra cosa.**

### Debito strutturale

| # | Finding | Documento | Impatto |
| - | ------- | --------- | ------- |
| S1 | `withTenantDb` istanzia un `PrismaClient` per **ogni chiamata** (67 call site, 4+ per richiesta) | [01](./01-backend-moduli.md#2) · [02](./02-backend-infrastruttura.md#1) | Rischio concreto di esaurire `max_connections`. Impatto diretto sull'NFR di latenza. Il caso peggiore è `O(tenant × installazioni)` connessioni. **Richiede ADR.** |
| S2 | 15 dipendenze con specificatore `"latest"` | [05](./05-build-ci-infra.md#1) | Build non riproducibili. `lucide-react` è installato in **5 copie** con due major diverse tra design system e app. |
| S3 | La CI avvia **due stack Docker completi in parallelo** | [05](./05-build-ci-infra.md#5) | ~4,5 GB su un runner da 7 GB. Causa probabile di flakiness e OOM. |

E due findings Critici di natura architetturale, che richiedono una decisione prima del codice:

| # | Finding | Documento | Domanda aperta |
| - | ------- | --------- | -------------- |
| A1 | `@plexica/sdk` non ha **nessun consumatore** — il plugin CRM lo bypassa integralmente | [04](./04-packages-condivisi.md#1) | L'SDK è il contratto pubblico della piattaforma plugin. Va adottato dal CRM (dogfooding) o rimosso. Lo stato attuale — pubblicato ma mai eseguito — è il peggiore dei due. |
| A2 | Gli auth store di `web` e `admin` sono duplicati all'85 %, mentre la factory pensata per unificarli è codice morto | [04](./04-packages-condivisi.md#2) | ~180 LOC, ma è il codice più critico del sistema. Da fare solo con gli E2E verdi come rete di sicurezza. |

---

## Temi trasversali

### 1. Type safety azzerata sul percorso dati tenant

Il `@ts-ignore` a `lib/tenant-database.ts:27` degrada `TenantPrismaClient` ad `any`. La conseguenza si propaga a tutto il codebase:

- **37 occorrenze** di `as any`, **45–50 direttive** `eslint-disable no-explicit-any`
- **5 funzioni-ponte identiche** (`function db(x: unknown): any`) scritte in 5 file diversi
- **88 parametri** dichiarati `db: unknown`

**Nessun errore di schema tenant viene rilevato a compile time.** Un rename di colonna passa `tsc --noEmit` e fallisce solo a runtime. Questo è il singolo blocco che impedisce diversi altri miglioramenti: i `select` mirati (finding 01#20) non sono verificabili finché i tipi sono erasi.

Vedi [01#5](./01-backend-moduli.md#5) e [02#12](./02-backend-infrastruttura.md#12).

### 2. Frammentazione indotta dalla Rule 4

**Nessun file supera le 200 righe: la regola è formalmente rispettata ovunque.** Ma il modo in cui è rispettata merita attenzione:

- **7 file sono esattamente a 200 LOC**, altri 8 tra 190 e 197
- Gli split sono dichiaratamente artificiali. `app-error-domain.ts:3`: *"Kept separate from app-error.ts to stay within the 200-line file limit"*. `helpers/server.helpers.ts:3`: *"Extracted to keep individual test files under the 200-line constitution limit"*
- Questi split **hanno generato duplicazione**: `MAX_DEPTH` e `pathDepth()` esistono in due copie perché `workspace/service.ts` è stato spezzato ([01#27](./01-backend-moduli.md#27))
- 8 file `keycloak-admin-*.ts` per 929 LOC complessivi, di cui ~130 duplicate ([02#10](./02-backend-infrastruttura.md#10))

**Osservazione**: la regola sta producendo *frammentazione* invece di *decomposizione*. Il conteggio include commenti e import, quindi premia file densi e poco documentati. Vale la pena valutare se contare solo le righe di codice — è una modifica alla costituzione, quindi una decisione da prendere consapevolmente, non un effetto collaterale.

Nota positiva: i findings [02#13](./02-backend-infrastruttura.md#13) (factory per le 31 classi di errore) e [02#10](./02-backend-infrastruttura.md#10) riducono le LOC *reali*, non le spostano — e riconducono naturalmente i file sotto soglia.

### 3. Violazioni della Rule 3 ("un pattern per tipo di operazione")

| Operazione | Pattern coesistenti | Riferimento |
| ---------- | ------------------- | ----------- |
| Paginazione | **3** contratti di risposta divergenti (`limit` vs `pageSize` vs nessun page) | [01#9](./01-backend-moduli.md#9) |
| Rate limiting | **2** implementazioni (in-memory vs Redis) sovrapposte sugli endpoint admin | [02#4](./02-backend-infrastruttura.md#4) |
| Hook TanStack Query | **2** stili (wrapper tipizzati in admin, `useMutation` grezzo in web) | [03#8](./03-frontend-apps.md#8) |
| `React.useId` | **2** pattern, uno dei quali è un hook condizionale (bug) | [04#14](./04-packages-condivisi.md#14) |
| Localizzazione nel design system | **2** approcci (props di label vs stringhe hardcoded) | [04#13](./04-packages-condivisi.md#13) |
| Registrazione plugin dev | **3** implementazioni della stessa POST | [04#4](./04-packages-condivisi.md#4) |
| Validazione slug | **3** varianti di `SLUG_REGEX` con semantiche diverse | [02#5](./02-backend-infrastruttura.md#5) |

Il caso della paginazione è il più costoso: il frontend deve gestire tre shape diverse, e unificarlo è un **breaking change** dell'API pubblica che va coordinato con entrambe le app nello stesso rilascio.

### 4. La filosofia di testing è disattesa in punti precisi

`AGENTS.md` è esplicito: *"La v1 aveva 4000+ test che non garantivano il funzionamento del sistema. I test verificavano mock, non il sistema reale. Questo non si ripete nella v2."* La v2 è largamente fedele a questo principio, ma con eccezioni concrete:

- **47 `vi.mock()`** in `__tests__/unit/`. `outbox-publisher.test.ts` mocka *tutte* le dipendenze: ciò che resta sotto test è un `for` loop ([02#23](./02-backend-infrastruttura.md#23))
- **`packages/cli`**: i test riscrivono `toSlug` inline invece di importarlo, e le due implementazioni **divergono**. I test passano verdi mentre la funzione reale ha copertura zero ([04#20](./04-packages-condivisi.md#20))
- **Smoke test** che verificano ioredis e non il sistema — 562 LOC ([02#22](./02-backend-infrastruttura.md#22))
- **`shared-deps.test.ts`**: 3 test tautologici su un oggetto `as const`, già verificati da TypeScript ([04#20](./04-packages-condivisi.md#20))
- **Nessuna configurazione di coverage** nonostante il target dichiarato dell'80 %. Il valore attuale è **ignoto** ([02#24](./02-backend-infrastruttura.md#24))
- **`apps/admin` gira gli E2E contro il dev server**, violando *"l'app di test è l'app di produzione"* ([05#18](./05-build-ci-infra.md#18))

Il finding sulla coverage è il prerequisito degli altri: senza misurare non si può sapere quanta della copertura attuale sia reale.

### 5. Accessibilità: divergenza tra le due app

`apps/web` implementa correttamente focus trap WCAG 2.1 §2.1.2, gestione `Escape`, focus restore, `role="dialog"`, skip link ed error boundary. `apps/admin` **non ha nessuno di questi**, pur avendo lo stesso identico drawer mobile ([03#7](./03-frontend-apps.md#7)).

Altri gap verificati:

- `TableHead` del design system dichiara *"keyboard-accessible sort indicators"* nel commento — è **falso**, non c'è `tabIndex` né `onKeyDown` (violazione WCAG 2.1.1) ([04#15](./04-packages-condivisi.md#15))
- 7 `aria-label` hardcoded in inglese: sono esattamente il testo che gli screen reader annunciano ([03#13](./03-frontend-apps.md#13))
- `Pagination` mostra *"Page 2 of 7"* a un utente italiano ([04#13](./04-packages-condivisi.md#13))
- `web/status-badge.tsx` veicola lo stato **col solo colore** (violazione WCAG 1.4.1), a differenza degli altri 3 badge ([03#16](./03-frontend-apps.md#16))

### 6. Sicurezza: guardie duplicate e divergenti

Non sono vulnerabilità aperte, ma classi di bug latenti:

- `SCHEMA_NAME_REGEX` è la guardia anti-SQL-injection prima di `$queryRawUnsafe`. Esiste in **2 varianti**, una senza limite di lunghezza ([01#13](./01-backend-moduli.md#13))
- `SLUG_REGEX` a 63 caratteri viene usato dove `toSchemaName()` presume ≤51: una troncatura silenziosa **farebbe collidere due tenant sullo stesso schema PostgreSQL** ([02#5](./02-backend-infrastruttura.md#5))
- La chiave della cache ABAC è costruita in due punti indipendenti: se il formato diverge, l'invalidazione fallisce in silenzio e gli utenti mantengono permessi revocati per 300 s ([02#9](./02-backend-infrastruttura.md#9))
- `LOGGER_REDACT_PATHS` duplica a mano `SENSITIVE_KEYS` con profondità wildcard incoerente (2, 3 o 4 livelli senza criterio): `adminEmail` e `recipient` sono coperte solo a 2 livelli ([02#18](./02-backend-infrastruttura.md#18))
- Finestra **TOCTOU** in `visibility.routes.ts`: l'autorizzazione avviene su un client Prisma e la scrittura su un altro ([01#7](./01-backend-moduli.md#7))

---

## Piano di esecuzione proposto

Cinque fasi, ordinate per rapporto valore/rischio. Le fasi 1 e 2 sono raccomandate senza riserve; dalla 3 in poi servono decisioni.

### Fase 1 — Correttezza (~2 giorni, rischio nullo)

Bug reali. Non sono ottimizzazioni e non vanno mescolati con i refactor.

| Intervento | Rif. | Effort |
| ---------- | ---- | ------ |
| `writeAuditLog`: rendere `async` e attendere nei 17 call site | [01#1](./01-backend-moduli.md#1) | M |
| `logDecision`: aggiungere il `return` mancante | [02#7](./02-backend-infrastruttura.md#7) | S |
| `profile-api.ts`: correggere `API_BASE` (URL `/api/api/v1`) | [03#6](./03-frontend-apps.md#6) | S |
| `reactivateTenant`: allineare lo `status` nel branch pending | [01#3](./01-backend-moduli.md#3) | S |
| Chiave cache ABAC: usare `membershipCacheKey()` anche in invalidazione | [02#9](./02-backend-infrastruttura.md#9) | S |
| Kafka: eliminare l'IIFE eager (race sul producer non connesso) | [02#16](./02-backend-infrastruttura.md#16) | S |
| `input.tsx`: `useId()` fuori dal `??` (hook condizionale) | [04#14](./04-packages-condivisi.md#14) | S |
| Allineare il tipo di `/api/v1/admin/system/kafka` tra le due app | [03#12](./03-frontend-apps.md#12) | S |

**Prerequisito trasversale**: attivare la misurazione della coverage ([02#24](./02-backend-infrastruttura.md#24)) con soglia iniziale pari al valore misurato, per poter quantificare l'impatto delle fasi successive.

### Fase 2 — Cancellazioni pure (~3 giorni, rischio molto basso)

~1.900 LOC di guadagno netto. Nessun cambio di contratto, nessuna nuova astrazione.

| Intervento | Rif. | LOC |
| ---------- | ---- | --: |
| Rimuovere `infra/keycloak/themes/` (77 file, 1,4 MB) | [05#10](./05-build-ci-infra.md#10) | 77 file |
| Rimuovere `.opencode/mcp-server/` (duplicato byte-per-byte) | [05#11](./05-build-ci-infra.md#11) | ~400 |
| Untrack `dist-ui/` del CRM e `.pnpm-store/v11/index.db` | [04#19](./04-packages-condivisi.md#19) · [05#13](./05-build-ci-infra.md#13) | 9 file |
| Rimuovere le 17 dipendenze mai importate | [05#2](./05-build-ci-infra.md#2) | 17 righe |
| Rimuovere `create-topics.sh` e `verify-env.sh` orfani | [05#12](./05-build-ci-infra.md#12) · [05#14](./05-build-ci-infra.md#14) | ~103 |
| 37 export morti nei moduli backend + `optimistic-lock.ts` | [01#6](./01-backend-moduli.md#6) | ~230 |
| 15 export morti in `lib/`/`events/`/`middleware/` | [02#17](./02-backend-infrastruttura.md#17) | ~70 |
| 3 file frontend morti + 15 export mai importati | [03#4](./03-frontend-apps.md#4) | ~180 |
| `login-page.tsx` di web (form `useState`, morto) | [03#5](./03-frontend-apps.md#5) | 67 |
| Server Fastify creato e mai usato in 3 test ABAC | [02#20](./02-backend-infrastruttura.md#20) | ~18 |
| `dev/migration.ts` stub, `kafkajs` inutilizzata nell'SDK | [04#16](./04-packages-condivisi.md#16) | ~24 |
| `reset.css`: blocco `body` duplicato letteralmente | [04#10](./04-packages-condivisi.md#10) | ~30 |
| `TableHead sortable` morto e non accessibile | [04#15](./04-packages-condivisi.md#15) | ~25 |
| 31 righe `env:` no-op in `ci.yml` | [05#7](./05-build-ci-infra.md#7) | 31 |
| Step Typecheck + Admin build ridondanti in CI | [05#6](./05-build-ci-infra.md#6) | 4 righe, ~40 s |
| `readStream`, `AVATAR_ALLOWED_MIME_TYPES`, `MAX_DEPTH` duplicati | [01#10](./01-backend-moduli.md#10) · [01#11](./01-backend-moduli.md#11) · [01#27](./01-backend-moduli.md#27) | ~27 |
| Archiviare `docs/04` e `docs/05` (superati da ADR-009) | [05#28](./05-build-ci-infra.md#28) | 1.706 |

**Cautela**: alcuni "export morti" corrispondono a endpoint backend già implementati (`useWorkspaceHierarchy`, `useReparentWorkspace`, `useCreateTemplate`) e a feature di osservabilità incomplete (`stopPeriodicHealthPolling` — la sua assenza è probabilmente un *bug*, non codice da cancellare). **Verificare in `.forge/specs/` prima di rimuovere.**

### Fase 3 — Quick win su CI e dipendenze (~2 giorni, rischio basso)

Non tocca il codice applicativo. È l'intervento con il miglior rapporto effort/beneficio dell'intera analisi.

| Intervento | Rif. | Beneficio |
| ---------- | ---- | --------- |
| Aggiungere `concurrency` ai 3 workflow | [05#8](./05-build-ci-infra.md#8) | 20–60 min runner/giorno |
| Fermare lo stack `plexica-ci` prima degli E2E | [05#5](./05-build-ci-infra.md#5) | −2,2 GB di picco, elimina il rischio OOM |
| Sostituire i 15 `"latest"` con range espliciti | [05#1](./05-build-ci-infra.md#1) | Build riproducibili |
| Allineare React in `keycloak-theme` a `^19.2.8` | [05#4](./05-build-ci-infra.md#4) | −30/50 MB, dedup di 4 alberi |
| Pinnare `trivy-action@master` | [05#30](./05-build-ci-infra.md#30) | Coerenza + Dependabot operativo |
| Correggere `AGENTS.md` (struttura errata, "5 vs 6 regole") | [05#29](./05-build-ci-infra.md#29) | Contesto agenti corretto |
| Sostituire i 9 `waitForTimeout` arbitrari | [05#21](./05-build-ci-infra.md#21) | ~9 s + meno flakiness |
| Cache pnpm in CI | [05#9](./05-build-ci-infra.md#9) | 20–60 s (hosted) |

### Fase 4 — Consolidamento (~1–2 settimane, rischio medio)

Estrazione di astrazioni con **almeno tre consumatori reali** verificati. Qui il "rule of three" è soddisfatto.

| Intervento | Rif. | LOC | Consumatori |
| ---------- | ---- | --: | ----------- |
| `parseOrThrow` per il boilerplate Zod | [01#4](./01-backend-moduli.md#4) | ~110 | 38 |
| Factory per le 31 classi di errore | [02#13](./02-backend-infrastruttura.md#13) | ~200 | 31 |
| Unificare `keycloak-admin-client` e `keycloak-tenant-client` | [02#10](./02-backend-infrastruttura.md#10) | ~130 | 2 (ma già divergenti per errore) |
| `adminRequestOk` per i 21 `if (!res.ok) throw` | [02#11](./02-backend-infrastruttura.md#11) | ~45 | 21 |
| `EmptyState`/`ErrorState`/`Skeleton` in `@plexica/ui` | [03#2](./03-frontend-apps.md#2) | ~150 | 16 |
| `makeProbe` per i 5 health check | [01#12](./01-backend-moduli.md#12) | ~55 | 5 |
| `createAdminTestServer` + `SYSTEM_TENANT_CONTEXT` | [02#19](./02-backend-infrastruttura.md#19) | ~110 | 9 |
| Consolidare `SLUG_REGEX`/`SCHEMA_NAME_REGEX` | [01#13](./01-backend-moduli.md#13) · [02#5](./02-backend-infrastruttura.md#5) | ~37 | 17 |
| Eliminare il rate limiter in-memory | [02#4](./02-backend-infrastruttura.md#4) | ~70 | 2 scope |
| `catalog:` pnpm per le 23 dipendenze duplicate | [05#3](./05-build-ci-infra.md#3) | ~45 | 11 workspace |
| Adottare `Toast` e `PasswordField` già esistenti | [04#7](./04-packages-condivisi.md#7) · [04#9](./04-packages-condivisi.md#9) | ~110 | — |
| Deduplicare `playwright.config.ts` e gli helper E2E | [05#17](./05-build-ci-infra.md#17) · [03#18](./03-frontend-apps.md#18) | ~100 | 2 |
| `tsconfig.dom.json` + fix dell'`exclude` sovrascritto | [05#15](./05-build-ci-infra.md#15) | ~20 | 6 |

### Fase 5 — Decisioni architetturali (richiedono ADR o chiarimento di prodotto)

**Non eseguibili come refactor.** Ogni voce è una domanda a cui rispondere prima di scrivere codice.

| Domanda | Rif. | Impatto |
| ------- | ---- | ------- |
| Come si gestisce il pooling dei client Prisma per tenant? | [01#2](./01-backend-moduli.md#2) | ADR. Il finding più impattante sul runtime. |
| I tipi Prisma generati vanno committati o generati in prebuild? | [02#12](./02-backend-infrastruttura.md#12) | Sblocca la type safety su tutto l'accesso DB |
| L'SDK va adottato dal CRM o rimosso? | [04#1](./04-packages-condivisi.md#1) | Definisce il contratto pubblico della piattaforma plugin |
| Si unifica la paginazione? (breaking change API) | [01#9](./01-backend-moduli.md#9) | Va coordinato con entrambe le app |
| Serve un package `@plexica/api-types`? | [03#12](./03-frontend-apps.md#12) | ADR. Cambia il modello di condivisione tra tier |
| Le funzionalità super-admin vivono in `web` o in `admin`? | [03#17](./03-frontend-apps.md#17) | ~200 LOC, ma è una decisione di prodotto |
| Si estrae l'intera shell o solo error boundary + `useMediaQuery`? | [03#7](./03-frontend-apps.md#7) | Il gap a11y va chiuso in ogni caso |
| Si unifica l'auth store? | [04#2](./04-packages-condivisi.md#2) | Solo con E2E verdi prima e dopo |
| Il feature "dev-server HMR" va completato o rimosso? | [04#3](./04-packages-condivisi.md#3) | 182 LOC di client WebSocket senza server |
| Si parallelizzano i 174 test E2E? | [05#20](./05-build-ci-infra.md#20) | Alto potenziale, alto rischio di flakiness |

---

## Cosa funziona bene

Un elenco di 121 problemi rischia di dare un'impressione sbagliata. Va detto con altrettanta precisione cosa è fatto bene, perché è la base su cui il resto si appoggia.

- **Rule 4 rispettata al 100 %**: nessun file supera le 200 righe in tutto il codebase, su 743 file
- **Nessun `console.log` in produzione**, nessun `window.confirm`, nessun `<a href>` per navigazione (salvo 2 casi documentati)
- **Le duplicazioni più costose sono già state estratte**: client OIDC PKCE, `createApiClient`, JWT decode e silent refresh vivono correttamente in `packages/auth`
- **9 form su 10 usano react-hook-form + Zod** come prescritto; l'unica eccezione è un file morto
- **Solo 4 occorrenze di `any` nel frontend**, tutte con `eslint-disable` motivato
- **Infrastruttura Docker di buona qualità**: tutte le immagini pinnate per digest SHA256, healthcheck su tutti i servizi long-running, compose splittati sotto le 200 righe
- **La fixture E2E con IP isolato** (`base-fixture.ts:42-57`) è lavoro accurato — costruita per un parallelismo che poi non è stato attivato, ma corretta
- **Copertura E2E 26 rotte su 27**: l'unico buco è `/admin/plugins`
- **`apps/web` implementa correttamente WCAG 2.1 AA** su focus trap, skip link ed error boundary

Il debito è concentrato in tre punti precisi: la **gestione delle versioni delle dipendenze**, la **type safety del percorso dati tenant**, e le **astrazioni scritte ma mai collegate ai consumatori**. Non è debito diffuso, ed è per questo che è aggredibile.

---

## Note metodologiche

**Come è stata condotta l'analisi.** Cinque agenti indipendenti hanno analizzato aree disgiunte del codebase con istruzioni di verificare ogni affermazione con `grep`/`read` e di citare `file:riga` come evidenza. Nessun finding è basato su supposizioni: le occorrenze sono state contate, i file confrontati con `diff`, il consumo reale degli export verificato cercando gli import effettivi.

**Limiti dichiarati.**

1. Le stime LOC sono **conservative** — contano righe nette rimosse, non spostate. Dove un'astrazione sostituisce N copie, il costo dell'astrazione è già sottratto.
2. **Nessuna misura di bundle o di performance runtime** è stata effettuata: non esisteva una `dist/` da analizzare. I findings su code-splitting e query N+1 indicano opportunità, non regressioni misurate.
3. Alcuni "codice morto" potrebbero essere **feature in anticipo sui consumatori** — legittimo in un design system o in un SDK. I findings [04#7](./04-packages-condivisi.md#7) e [04#15](./04-packages-condivisi.md#15) contano ~145 LOC che, se `DateRangePicker` e il sorting sono a roadmap, non sono un risparmio ma un lavoro da rifare.
4. Il totale di ~5.400 LOC **non va inteso come obiettivo**. Ridurre le righe non è un fine: alcuni findings ([04#13](./04-packages-condivisi.md#13), [04#14](./04-packages-condivisi.md#14), [05#22](./05-build-ci-infra.md#22)) *aggiungono* codice per correggere accessibilità, bug e copertura, e sono tra i più importanti dell'analisi.

**Cosa non è stato analizzato**: la logica di business rispetto alle specifiche funzionali, la correttezza dell'isolamento tenant a runtime, la sicurezza applicativa oltre le classi di bug latenti citate. Questa è una review di *forma e struttura*, non una review funzionale.

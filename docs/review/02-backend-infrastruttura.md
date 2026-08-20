# 02 — Backend: infrastruttura e test

> Perimetro: `services/core-api/src/` escluso `modules/` — 15.651 LOC
> (`lib/` 2.832 · `events/` 687 · `middleware/` 858 · `cli/` 296 · `__tests__/` 10.778 · `index.ts` 200), più `prisma/schema.prisma` e 10 migrations (736 LOC SQL)
> 24 findings · ~1.236 LOC riducibili (8,0 %)

[← Torna all'indice](./README.md)

---

<a id="1"></a>
## 1. `withTenantDb()` istanzia un nuovo `PrismaClient` a ogni invocazione

**Categoria**: performance · **Severità**: 🔴 Critica · **LOC**: ~10 · **Effort**: L · **Richiede ADR**

> Stesso problema visto da lato infrastruttura del finding [01#2](./01-backend-moduli.md#2).

**Posizione**: `lib/tenant-database.ts:59-78` (in particolare `:72` e `:76`)

```ts
const tenantDb = new TenantPrismaClient({ datasources: { db: { url: tenantUrl } } });
try { return await fn(tenantDb); } finally { await tenantDb.$disconnect(); }
```

**Evidenza**. **67 call site** in totale. Sul percorso di una singola richiesta tenant-scoped ne vengono attraversati almeno 4:

| Punto | File:riga |
| ----- | --------- |
| Risoluzione profilo utente | `middleware/user-profile-resolver.ts:33` |
| Valutazione ABAC | `middleware/abac.ts:71` |
| Log della decisione ABAC | `middleware/abac.ts:75` |
| Route handler del modulo | ≥1 |

Ogni `new PrismaClient()` apre un **pool di connessioni proprio** (default `connection_limit = num_cpus * 2 + 1`). Con 4 client per richiesta e 20 richieste concorrenti si superano facilmente i `max_connections` di PostgreSQL. Il `$disconnect()` è inoltre a costo pieno (teardown del query engine).

**Proposta**: `Map<schemaName, TenantPrismaClient>` a livello di modulo (LRU con cap, es. 100 schemi) che riusa i client e non chiama mai `$disconnect()` sul percorso richiesta. In alternativa: singleton `prisma` + `$transaction` con `SET LOCAL search_path`, oppure PgBouncer in transaction mode.

**Vantaggi**
- Elimina 3–4 handshake TCP + autenticazione PostgreSQL per richiesta
- Rimuove il rischio concreto di esaurimento `max_connections` in produzione
- Riduce la latenza P95 su ogni endpoint tenant (impatto diretto sull'NFR-01 "< 50 ms" dichiarato in `modules/abac/engine.ts:3`)

**Svantaggi / rischi**
- Una cache di client mantiene N pool aperti: serve un cap e una policy di eviction, altrimenti si sposta il problema
- Il tenant deprovisioning deve invalidare la entry (altrimenti connessioni verso schema droppati)
- Modifica invasiva: tocca tutti i 67 call site indirettamente, anche se la firma resta identica

---

<a id="2"></a>
## 2. La cache Redis del tenant lifecycle è write-only — `readTenantLifecycle` non è mai invocata

**Categoria**: codice morto / performance · **Severità**: 🟠 Alta · **LOC**: 21 · **Effort**: S

**Posizione**: `lib/tenant-context-cache.ts:29-49` (definizione) · `middleware/tenant-context.ts:69-98` (`resolveTenant`)

**Evidenza**. Ricerca esaustiva su tutto `src/`: `readTenantLifecycle` compare **solo** nella sua definizione. `resolveTenant()` esegue **sempre** la query al DB e poi scrive in Redis, senza mai leggere:

```ts
const tenant = await prisma.tenant.findUnique({ where: { slug }, ... });  // :70
await writeTenantLifecycle(slug, tenant, client);   // :78, :85, :96 — tre write path
```

Risultato netto per ogni richiesta autenticata: **1 query DB + 1 SETEX Redis**, con zero beneficio. La `SETEX` aggiunge latenza pura.

**Proposta**: aggiungere il read-through in testa a `resolveTenant()`. Il TTL di 4 s (`tenant-context-cache.ts:10`) è già calibrato per l'NFR dei 5 s dichiarato a `:1-2`, quindi la semantica è già progettata per questo uso. **Alternativa**: eliminare cache e funzione morta (−21 righe).

**Vantaggi**
- Elimina una query DB per richiesta autenticata — il percorso più caldo dell'applicazione
- Rende coerente il codice con l'intento dichiarato nei commenti
- In alternativa (rimozione), toglie 21 righe di codice morto e una `SETEX` inutile per richiesta

**Svantaggi / rischi**
- Attivare la lettura introduce una finestra di staleness fino a 4 s su sospensione/cancellazione tenant — è esattamente lo scenario che i commenti dichiarano accettabile, ma va validato con `admin/deletion-saga-start.int.test.ts`
- Il comportamento cambia sotto Redis degradato (fallback al DB, già gestito dal `catch` a `:46`)

---

<a id="3"></a>
## 3. `userProfileResolver` esegue un UPSERT su DB a ogni richiesta, senza cache

**Categoria**: performance · **Severità**: 🟠 Alta · **LOC**: ~5 · **Effort**: M

**Posizione**: `middleware/user-profile-resolver.ts:33-63`; registrato globalmente in `index.ts:141`

```ts
const internalUserId = await withTenantDb(async (tx) => {
  const profile = await db.userProfile.upsert({ where: { keycloakUserId }, update: {}, create: {...} });
```

L'`upsert` con `update: {}` è una **scrittura** eseguita su ogni singola richiesta tenant-scoped solo per risolvere `keycloakUserId → userId`. La mappatura è immutabile dopo il primo provisioning. Combinato con il [#1](#1): ogni richiesta paga nuovo PrismaClient + upsert + disconnect.

**Proposta**: cache Redis `userprofile:{tenantId}:{keycloakUserId} → userId` con TTL lungo (1 h) e invalidazione sulla cancellazione utente. L'upsert resta come fallback sul miss.

**Vantaggi**
- Elimina una scrittura DB (con relativo WAL e lock di riga) dal percorso caldo di ogni richiesta
- Riduce il write amplification su `user_profile` — attualmente una tabella append-only viene "toccata" a ogni GET

**Svantaggi / rischi**
- Invalidazione da gestire in `user-management/service-remove.ts`: se dimenticata, un utente rimosso continua a risolvere per 1 h
- Aggiunge una dipendenza da Redis su un percorso che oggi funziona senza

---

<a id="4"></a>
## 4. Due implementazioni di rate limiting coesistenti e incompatibili

**Categoria**: duplicazione / violazione Rule 3 · **Severità**: 🟠 Alta · **LOC**: ~70 · **Effort**: M

**Posizione**: `middleware/rate-limit.ts:1-46` (in-memory) vs `lib/rate-limit-config.ts:1-87` + `@fastify/rate-limit` Redis-backed (`index.ts:77-84`)

**Evidenza**. `index.ts` registra il plugin Redis-backed globale a `:77-84`, e poi **sovrappone** il limiter in-memory sugli scope più sensibili:

```ts
adminScope.addHook('preHandler', rateLimitMiddleware(config.ADMIN_RATE_LIMIT_MAX, 60000));  // :119
eventScope.addHook('preHandler', rateLimitMiddleware(100, 60000));                          // :131
```

`middleware/rate-limit.ts:9` usa una `Map` locale al processo. Il commento in `config.ts:76` lo ammette. Conseguenze:

- Con N repliche il limite effettivo sugli endpoint **admin** e **plugin-event** è `N × max`
- `middleware/rate-limit.ts:22` usa `request.ip` grezzo, **ignorando** la configurazione `TRUST_PROXY` (`config.ts:97-109`) che il plugin ufficiale rispetta → spoofing IP possibile

Esistono inoltre **due keyGenerator quasi identici**: `lib/rate-limit-config.ts:26-28` (che ritorna `request.ip`, identico al default della libreria — wrapper superfluo) e `lib/rate-limit-key.ts:17-20`. E `INVITATION_RATE_LIMIT` (`rate-limit-config.ts:66-69`) è definita ma **mai usata**.

**Proposta**: eliminare `middleware/rate-limit.ts`, usare `config: { rateLimit: { max, timeWindow, keyGenerator } }` per-scope del plugin ufficiale. Consolidare `rate-limit-key.ts` dentro `rate-limit-config.ts`.

**Vantaggi**
- Un solo pattern di rate limiting (Rule 3)
- Rate limit corretto in multi-replica su admin e plugin-events — oggi la superficie **meno** protetta
- Rispetto coerente di `TRUST_PROXY`, eliminando lo spoofing IP
- Rimuove un `setInterval` per ogni invocazione della factory (`rate-limit.ts:11`)

**Svantaggi / rischi**
- Il plugin Redis fallisce-aperto (ADR-012): sotto Redis down gli endpoint admin perderebbero del tutto il throttling che oggi il limiter in-memory garantisce
- I test `rate-limit.test.ts`, `rate-limit-distributed.test.ts`, `rate-limit-resolve.test.ts` (457 LOC) vanno rivisti

---

<a id="5"></a>
## 5. `SLUG_REGEX` esiste in tre varianti divergenti, una duplicata 12 volte

**Categoria**: duplicazione / rischio sicurezza · **Severità**: 🟠 Alta · **LOC**: ~25 · **Effort**: M

**Posizione**

| File:riga | Regex | Semantica |
| --------- | ----- | --------- |
| `lib/tenant-schema-helpers.ts:17` | `/^[a-z][a-z0-9-]{1,49}[a-z0-9]$/` | 3–51 char, no trailing hyphen |
| `lib/slug.ts:5` | `/^[a-z][a-z0-9-]{1,62}$/` | 2–63 char, trailing hyphen **ammesso** |
| `lib/keycloak-admin-helpers.ts:61` | literal inline `/^[a-z][a-z0-9-]{1,62}$/` | idem |

**Due export con lo stesso nome** e semantiche diverse. Il consumatore sceglie il comportamento in base all'import path. Il literal a 63 caratteri compare **12 volte** in totale.

**Rischio concreto**: `keycloak-admin-helpers.ts:61` valida uno slug tenant con la regex a 63 char, mentre `toSchemaName()` (`tenant-schema-helpers.ts:41-44`) presume ≤51 per non superare `NAMEDATALEN=64`. Il commento a `:7-9` avverte esplicitamente della troncatura silenziosa che **farebbe collidere due tenant sullo stesso schema PostgreSQL** — violazione dell'isolamento, classificata incidente critico da `AGENTS.md`.

**Proposta**: un unico `lib/slug.ts` con nomi non ambigui: `TENANT_SLUG_REGEX` (51) e `RESOURCE_SLUG_REGEX` (63, per workspace/plugin).

**Vantaggi**
- Elimina un'ambiguità di naming che può causare collisione di schema cross-tenant
- Una sola sorgente di verità per la validazione slug

**Svantaggi / rischi**
- Il rename tocca ~14 file
- Se qualche slug tenant esistente in produzione ha 52–63 caratteri, stringere la regex lo renderebbe irrisolvibile — serve una query di verifica preventiva

---

<a id="6"></a>
## 6. `withCoreDb` è un wrapper no-op usato in 34 punti

**Categoria**: complessità · **Severità**: 🟡 Media · **LOC**: ~40 · **Effort**: M

**Posizione**: `lib/tenant-database.ts:93-97`

```ts
export async function withCoreDb<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  return fn(coreDb);
}
```

Non fa nulla oltre a invocare la callback con il singleton già esportato da `lib/database.ts:12`. **34 call site**.

**Vantaggi**
- Rimuove uno strato di indirezione che non aggiunge semantica
- Migliora la leggibilità: oggi `withCoreDb` suggerisce falsamente una simmetria con `withTenantDb`, che invece fa qualcosa di sostanziale

**Svantaggi / rischi**
- Se in futuro si volesse introdurre replica read-only o tracing per-query, il wrapper sarebbe il punto d'aggancio naturale — rimuoverlo chiude quella porta (mitigabile con l'extension API di Prisma)
- Diff ampio (34 file) con rischio di merge conflict
- **Vedi la raccomandazione più conservativa in [01#24](./01-backend-moduli.md#24)**

---

<a id="7"></a>
## 7. `logDecision()` non attende la scrittura: race con `$disconnect()`

**Categoria**: correttezza · **Severità**: 🟠 Alta · **LOC**: ~4 · **Effort**: S

**Posizione**: `modules/abac/decision-logger.ts:31-45`, invocato da `middleware/abac.ts:75-77`

```ts
// decision-logger.ts:31 — nessun await, nessun return
db.abacDecisionLog.create({ data: {...} }).catch((err) => {...});
```

```ts
// abac.ts:75
withTenantDb((tx) => logDecision(tx, ctx, decision), tenantCtx).catch(...)
```

`withTenantDb` esegue `finally { await tenantDb.$disconnect(); }` non appena `logDecision` risolve — cioè **prima** che la `create()` sia stata inviata. La INSERT viene eseguita su un client in disconnessione: fallisce in modo non deterministico, e il `.catch` interno la assorbe silenziosamente. **L'audit trail ABAC (FR-015, NFR-08) è di fatto inaffidabile.**

**Proposta**: aggiungere `return` davanti alla catena a `decision-logger.ts:31`. Contestualmente, riusare la **stessa** transazione della `evaluate()` (`abac.ts:71`) per evitare il secondo PrismaClient.

**Vantaggi**
- Ripristina la scrittura effettiva del decision log (requisito di compliance)
- Dimezza i PrismaClient creati nel preHandler ABAC

**Svantaggi / rischi**
- Attendere la INSERT sul percorso richiesta aggiunge latenza — va compensato con `ABAC_DECISION_LOG_SAMPLE_RATE` (`config.ts:53`, oggi default 1.0 = sempre) o con una coda asincrona
- I test `abac-decision-log.test.ts` potrebbero passare oggi solo per tempismo fortunato; vanno riverificati

---

<a id="8"></a>
## 8. Outbox publisher: lo stato del tenant viene verificato 4 volte per evento

**Categoria**: performance / duplicazione · **Severità**: 🟠 Alta · **LOC**: ~15 · **Effort**: M

**Posizione**: `events/outbox-publisher.ts:26-53` · `events/outbox-repository.ts:78-81` · `events/event-key-service.ts:56-60`

Per **ogni** evento del batch (fino a 50, `outbox-repository.ts:67`):

1. `outbox-repository.ts:78-81` — la claim query già filtra `JOIN core.tenants ... AND tenant.status = 'active'`
2. `outbox-publisher.ts:28-32` — `db.tenant.findUnique({ select: { status: true } })`
3. `event-key-service.ts:56-60` — dentro `ensureTenantEventKey`, `SELECT status ... FOR UPDATE`
4. `outbox-publisher.ts:45-49` — **la stessa identica query del punto 2, ripetuta**

Inoltre `ensureTenantEventKey` apre una **transazione con `FOR UPDATE` per evento**, anche quando tutti gli eventi del batch appartengono allo stesso tenant. Con un batch di 50 eventi mono-tenant: ~150 query + 50 transazioni con lock esclusivo, **ogni secondo** (`periodMs = 1_000`).

**Proposta**: raggruppare il batch per `tenantId`; una sola verifica di stato e una sola `ensureTenantEventKey` per gruppo, memoizzate per la durata del batch.

**Vantaggi**
- Riduce il carico DB del publisher di circa un ordine di grandezza su batch mono-tenant
- Elimina il lock contention di `FOR UPDATE` ripetuto sulla stessa riga
- Rimuove una duplicazione letterale di query (righe 28-32 vs 45-49)

**Svantaggi / rischi**
- Il doppio check è verosimilmente **intenzionale** (TOCTOU: impedire la pubblicazione di eventi di un tenant passato a `pending_deletion` durante la cifratura — cfr. `unit/outbox-publisher.test.ts:69-70`). Rimuoverlo senza sostituirlo con un `FOR UPDATE` che copra send+ack riaprirebbe quella finestra
- La memoizzazione per batch allarga leggermente la finestra TOCTOU

---

<a id="9"></a>
## 9. Chiave della cache ABAC costruita in due punti indipendenti

**Categoria**: duplicazione / rischio sicurezza · **Severità**: 🟡 Media · **LOC**: ~2 · **Effort**: S

**Posizione**: `modules/abac/engine-helpers.ts:16-18` vs `modules/abac/engine.ts:111`

```ts
// engine-helpers.ts:17  (scrittura)
return `abac:${ctx.tenantSlug}:${ctx.userId}:${ctx.workspaceId}`;
// engine.ts:111  (invalidazione) — literal duplicato, non usa membershipCacheKey()
const key = `abac:${tenantSlug}:${userId}:${workspaceId}`;
```

`membershipCacheKey()` è esportata e disponibile, ma l'invalidazione non la usa. **Se il formato cambia in un solo punto, l'invalidazione fallisce silenziosamente**: gli utenti manterrebbero permessi revocati fino allo scadere del TTL di 300 s (`config.ts:52`). È un problema di sicurezza, non di pulizia.

**Vantaggi**
- Elimina un fallimento silenzioso di sicurezza latente
- Sorgente unica per il formato della chiave

**Svantaggi / rischi**
- La firma di `invalidateAbacCache` cambia; i call site (`workspace-member`, `abac.ts:90` re-export) vanno aggiornati

---

<a id="10"></a>
## 10. `keycloak-admin-client.ts` e `keycloak-tenant-client.ts` sono strutturalmente lo stesso modulo

**Categoria**: duplicazione · **Severità**: 🟡 Media · **LOC**: ~130 · **Effort**: L

**Posizione**: `lib/keycloak-admin-client.ts` (161 LOC) e `lib/keycloak-tenant-client.ts` (137 LOC)

| Funzione | admin-client | tenant-client |
| -------- | ------------ | ------------- |
| `interface KeycloakClient` | `:10-13` | `:8-11` |
| `interface KeycloakRole` | `:15-18` | `:13-16` |
| `resolveClientUuid` | `:47-56` | `:24-36` |
| `upsertClient` | `:58-79` | `:38-61` |
| `synchronizeRoleScope(s)` | `:99-108` | `:63-80` |
| `validateClient` | `:110-153` | `:82-117` |
| `reconcile*` | `:155-161` | `:119-124` |

Le differenze sono parametriche: realm (`master` vs `${realm}`), clientId (`plexica-admin` vs `plexica-web`), ruoli. Anche `buildAdminClientPayload` e `buildClientPayload` condividono 12 campi identici, e le interfacce `AdminClientUris` e `TenantWebClientUris` sono **letteralmente identiche**.

**Vantaggi**
- Una sola implementazione della logica reconcile → un solo punto in cui correggere bug di drift Keycloak
- Le due varianti oggi **divergono già** (il tenant-client fa merge degli `attributes` a `:54`, l'admin-client no a `:71-74`): unificando si elimina una divergenza probabilmente accidentale
- Un unico tipo URI invece di due

**Svantaggi / rischi**
- L'astrazione parametrica su 5 assi rischia di essere meno leggibile dei due file espliciti
- `validateClient` verifica campi diversi nei due casi (l'admin controlla anche i session timeout, `:135-140`): serve un elenco di campi configurabile, che aggiunge complessità
- Codice sul percorso di provisioning tenant: un errore qui **rompe l'onboarding**

---

<a id="11"></a>
## 11. Boilerplate `if (!res.ok) throw` ripetuto 21 volte, con convenzione di errore incoerente

**Categoria**: duplicazione / correttezza · **Severità**: 🟡 Media · **LOC**: ~45 · **Effort**: M

**Posizione**: 21 occorrenze nei file `lib/keycloak-*.ts`

Il tipo di errore lanciato è **incoerente**:

| File | Errore lanciato | Risposta HTTP |
| ---- | --------------- | ------------- |
| `keycloak-admin-realm.ts`, `keycloak-admin-users.ts` | `KeycloakError` | **502** `KEYCLOAK_ERROR` |
| `keycloak-admin.ts:30,120,126`, `keycloak-tenant-client.ts`, `keycloak-admin-client.ts` | `Error` grezzo | **500** `INTERNAL_SERVER_ERROR` |

Quindi un Keycloak irraggiungibile durante il provisioning restituisce 500 anziché 502. `AGENTS.md` vieta esplicitamente i raw `Error`.

**Proposta**: helper `adminRequestOk(path, method, body?, opts?)` in `keycloak-admin-internal.ts` che centralizza il check, la tolleranza 404/409 e il lancio di `KeycloakError`.

**Vantaggi**
- Codici HTTP corretti e coerenti verso il client (502 invece di 500 per fault upstream)
- Conformità alla regola "mai raw Error"
- Riduce di ~1/3 la superficie dei moduli Keycloak

**Svantaggi / rischi**
- Il cambio da 500 a 502 è un **breaking change di contratto API**: eventuali client/E2E che asseriscono 500 vanno aggiornati
- Le tolleranze variano (409 su create realm, 404 su delete/sessions): l'helper deve essere flessibile abbastanza da non forzare `try/catch` aggiuntivi

---

<a id="12"></a>
## 12. Type erasure totale del client tenant — 40+ `as any`

**Categoria**: type safety · **Severità**: 🟠 Alta · **LOC**: ~60 · **Effort**: L

**Posizione**: causa radice `lib/tenant-database.ts:27-28`

```ts
// @ts-ignore — generated at build time via 'pnpm db:generate'; not present in git checkout
import { PrismaClient as TenantPrismaClient } from '../../prisma/generated/tenant-client/index.js';
```

Il `@ts-ignore` degrada `TenantPrismaClient` ad `any`, quindi il parametro `db` di `withTenantDb` è di fatto non tipizzato. Conteggio reale:

- **19** occorrenze di `as any` / `: any` sul client tenant
- **50** direttive `eslint-disable no-explicit-any` nel codice non di test
- **5** `@ts-ignore` sullo stesso import replicati in `modules/tenant/tenant-provisioning.ts:7`, `modules/tenant/seed/003-*.ts`, `modules/plugin/services/visibility.service.ts:8`, `__tests__/helpers/db-tenant.helpers.ts:5`

**Conseguenza pratica**: nessun errore di schema tenant è rilevato a compile time. Un rename di colonna passa `tsc --noEmit` e fallisce solo a runtime.

**Proposta**: committare i tipi generati (o generarli in un prebuild obbligatorio con `"prepare"`) ed eliminare il `@ts-ignore`. In alternativa, un `tenant-client.d.ts` stub versionato.

**Vantaggi**
- Ripristina il type checking su tutto l'accesso al DB tenant — oggi **completamente assente**
- Elimina 5 funzioni-ponte identiche e 50 soppressioni del linter
- Conformità al requisito "TypeScript strict mode obbligatorio"

**Svantaggi / rischi**
- Committare artefatti generati è un anti-pattern (conflitti su ogni rigenerazione, repo più pesante)
- La soluzione con `prepare` richiede DB raggiungibile o schema-only generation in CI
- Una volta tipizzato, `tsc` potrebbe rivelare **errori reali preesistenti** mascherati dagli `any` — va messo in conto un lavoro di bonifica non banale

---

<a id="13"></a>
## 13. Gerarchia degli errori: 31 classi boilerplate su 3 file (343 LOC)

**Categoria**: duplicazione / aggiramento Rule 4 · **Severità**: 🟡 Media · **LOC**: ~200 · **Effort**: M

**Posizione**: `lib/app-error-base.ts` (18) · `lib/app-error.ts` (186) · `lib/app-error-domain.ts` (139)

31 sottoclassi di `AppError`, ciascuna con la stessa forma di 6–7 righe. Lo split in tre file è dichiaratamente artificiale — `app-error-domain.ts:3` recita: *"Kept separate from app-error.ts to stay within the 200-line file limit"*. `app-error.ts` contiene inoltre 17 righe (`:169-186`) di **puro re-export** per compatibilità.

**Proposta**: una factory `defineError(code, statusCode, defaultMessage)` che riduce a ~1 riga per errore, permettendo di ricondurre tutto a un unico file sotto i 200 LOC.

**Vantaggi**
- Elimina la dipendenza circolare che ha reso necessario `app-error-base.ts` (documentata in `app-error.ts:5-6`)
- Rende impossibile la divergenza `statusCode`/`code` tra classi simili
- Elimina 17 righe di re-export di sola compatibilità

**Svantaggi / rischi**
- Le classi generate da factory hanno `name` derivato dinamicamente: `AppError` (`app-error-base.ts:14`) usa `this.constructor.name`, che con classi anonime restituirebbe stringa vuota → serve assegnare esplicitamente il nome, altrimenti **si degradano i log**
- `instanceof` continua a funzionare, ma alcuni strumenti di stack-trace/IDE navigano peggio le classi generate
- `TenantConflictError` (`:156-165`) e `ServiceUnavailableError` (`:101-112`) hanno campi extra e restano da scrivere a mano

---

<a id="14"></a>
## 14. Schema Prisma tenant senza indici: drift garantito con le migrations

**Categoria**: performance / rischio operativo · **Severità**: 🟠 Alta · **LOC**: ~3 SQL (+15 di `@@index`) · **Effort**: M

**Posizione**: `prisma/tenant-schema/*.prisma` vs `prisma/migrations/003_core_features/migration.sql`

La migration crea **21 indici** sullo schema tenant, ma i modelli Prisma corrispondenti ne dichiarano quasi nessuno:

| Tabella | Indici in migration | `@@index` nel modello |
| ------- | ------------------: | --------------------: |
| `workspace` | 4 (`:100-103`) | **0** |
| `user_profile` | 2 (`:31-32`) | **0** |
| `workspace_member` | 2 (`:126-127`) | 0 (solo `@@unique`) |
| `invitation` | 4 (`:155-158`) | 1 |
| `audit_log` | 5 (`:180-184`) | — |

Poiché `prisma/tenant-schema/` **ha un generator proprio**, qualunque futuro `prisma migrate dev` su quello schema genererebbe una migration che **droppa i 21 indici** — inclusi `workspace_parent_id_idx` e `workspace_materialized_path_idx`, esattamente quelli su cui poggia il tree-walk ABAC.

Tre indici sono inoltre già **ridondanti** oggi (prefissi sinistri di indici compositi esistenti): `audit_log_created_at_idx`, `abac_decision_log_created_at_idx`, `workspace_member_workspace_id_idx`.

**Vantaggi**
- Evita che una futura migration cancelli silenziosamente gli indici del percorso ABAC
- Riduce il write amplification su `audit_log` e `abac_decision_log`, tabelle append-heavy scritte a ogni decisione
- Rende `prisma migrate diff` uno strumento affidabile per lo schema tenant

**Svantaggi / rischi**
- Il `DROP INDEX` su tabelle grandi richiede una finestra (mitigabile con `DROP INDEX CONCURRENTLY`)
- Aggiungere i `@@index` retroattivamente genera una migration "no-op" da marcare come applicata a mano sui DB esistenti

---

<a id="15"></a>
## 15. Duplicazione della costruzione di `TenantContext` e della risoluzione tenant

**Categoria**: duplicazione · **Severità**: 🟡 Media · **LOC**: ~35 · **Effort**: M

**Posizione**: `middleware/tenant-context.ts:89-94` · `middleware/public-invitation-tenant.ts:17-32` · `middleware/plugin-event-auth.ts:40-48`

Lo stesso oggetto `{ tenantId, slug, schemaName, realmName }` viene costruito in tre punti. `public-invitation-tenant.ts:17-23` reimplementa inoltre `resolveTenant()` con una `findUnique` quasi identica ma **senza** il write-through in cache e **senza** la gestione differenziata degli stati (`suspended`/`pending_deletion` vs `deleted`) di `tenant-context.ts:76-87`. Il percorso pubblico degli inviti ha quindi una semantica di lifecycle divergente.

Vi è anche una **tripla indirezione** sulla cache: `clearTenantCache` → `clearTenantLifecycle` → `invalidateTenantLifecycle`. Tre funzioni per una `DEL`.

**Vantaggi**
- Semantica di lifecycle tenant uniforme su tutti i punti d'ingresso (oggi il percorso invito pubblico ignora la cache e tratta `suspended` come `deleted`)
- Rimuove due livelli di wrapper senza semantica

**Svantaggi / rischi**
- Il resolver pubblico lancia `InvitationNotFoundError` (anti-enumeration), mentre `resolveTenant` ritorna `null`/status: la mappatura degli errori va mantenuta identica o **si introduce un oracolo di enumerazione**
- `publishTenantStatus` è usata da `modules/admin`: rimuoverla richiede un rename cross-modulo

---

<a id="16"></a>
## 16. Kafka: doppia logica di connessione del producer, con race sul producer non connesso

**Categoria**: duplicazione / correttezza · **Severità**: 🟡 Media · **LOC**: ~14 · **Effort**: S

**Posizione**: `lib/kafka.ts:26-39` (IIFE eager) e `:41-61` (`getProducer` lazy)

```ts
// :27-39  eager, a module load
const p = kafka.producer({ allowAutoTopicCreation: true });
producer = p;                              // :30  ← assegnato PRIMA di connect()
connectingProducer = Promise.resolve(p);   // :31  ← risolta PRIMA di connect()
await p.connect();                         // :32
```

```ts
// :47-58  lazy, identico ma con l'ordine CORRETTO
connectingProducer = (async () => { await p.connect(); producer = p; ... })();
```

Nell'IIFE eager, `producer` è valorizzato **prima** del `connect()`. Una `sendKafkaEnvelope` che arrivi in quella finestra riceve un producer non connesso, e KafkaJS lancia. Il ramo lazy ha l'ordine corretto — evidenza che uno dei due è sbagliato.

Nota minore: `createConsumer` (`:112-114`) ha un commento (`:109-110`) che descrive parametri `topics` e `eachMessage` **inesistenti** nella firma.

**Proposta**: eliminare l'IIFE eager; invocare `void getProducer()` a module load per ottenere lo stesso warm-up riusando l'unica implementazione corretta.

**Vantaggi**
- Rimuove la finestra di race in cui il primo evento pubblicato fallisce
- Un solo percorso di connessione da mantenere

**Svantaggi / rischi**
- Il comportamento con broker down all'avvio cambia leggermente: con `void getProducer()` serve un `.catch` esplicito o si ottiene un unhandled rejection

---

<a id="17"></a>
## 17. Codice morto: export mai referenziati e dipendenza non usata

**Categoria**: codice morto · **Severità**: 🔵 Bassa · **LOC**: ~70 + 1 dipendenza · **Effort**: S

Verificati per assenza totale di riferimenti fuori dal file di definizione:

| Simbolo | File:riga | Nota |
| ------- | --------- | ---- |
| `readTenantLifecycle` | `lib/tenant-context-cache.ts:29-49` | vedi [#2](#2) |
| `runWithTenant` | `lib/tenant-context-store.ts:34-36` | superata da `enterWithTenant` |
| `InvalidSlugError` | `lib/app-error.ts:31-38` | mai lanciata né importata |
| `INVITATION_RATE_LIMIT` | `lib/rate-limit-config.ts:66-69` | vedi [#4](#4) |
| `coordinateEventId`, `sourceCoordinatesSchema` | `events/dlq-contract.ts:35,9` | usate solo internamente |
| `SqlExecutor`, `SqlClient`, `ClaimedOutboxEvent` | `events/outbox-repository.ts:7,11,15` | usati solo internamente |
| `ResolvedTenant` | `middleware/tenant-context.ts:64-67` | tipo mai importato |
| `CreateRealmResult`, `MigrationResult`, `TenantCreationParams`, `SlugValidationResult`, `PaginationParams`, `AdminClientUris`, `TenantWebClientUris` | vari | tipi esportati mai importati |
| `JWKS_CACHE_TTL_MS` | `lib/config.ts:86` | `jwks-cache.ts:9` dichiara *"now unused here"* |
| `isValidSlug` | `lib/slug.ts:38-40` | usata **solo** in un unit test |
| `mixin() { return {}; }` | `lib/logger.ts:82-84` | no-op; il commento a `:81` promette una deep-redaction che non avviene |
| `@fastify/http-proxy` | `package.json:23` | **zero import** in tutto il repo |

**Vantaggi**
- Riduce la superficie API pubblica dei moduli lib, rendendo chiaro cosa è contratto e cosa è dettaglio
- Il `mixin()` no-op viene invocato a **ogni chiamata di log**: rimuoverlo elimina overhead misurabile su un percorso ad altissima frequenza
- Una dipendenza npm in meno da mantenere e sottoporre ad audit di sicurezza

**Svantaggi / rischi**
- `@fastify/http-proxy` potrebbe essere previsto per il plugin proxy in sviluppo: verificare le PR aperte prima di rimuoverlo
- Alcuni tipi (`ClaimedOutboxEvent`) potrebbero essere export intenzionali per il consumo futuro dai plugin SDK

---

<a id="18"></a>
## 18. `LOGGER_REDACT_PATHS` enumerata a mano, duplicando `SENSITIVE_KEYS`

**Categoria**: duplicazione / rischio PII · **Severità**: 🔵 Bassa · **LOC**: ~14 · **Effort**: S

**Posizione**: `lib/logging-contract.ts:21-34` (set) e `:38-53` (array di path)

Le stesse 12 chiavi vengono elencate due volte, la seconda espansa manualmente con i wildcard — e la **profondità è incoerente per chiave**:

```ts
'email', '*.email', '*.*.email',                    // 3 livelli
'adminEmail', '*.adminEmail',                       // 2 livelli
'token', '*.token', '*.*.token', '*.*.*.token',     // 4 livelli
```

Aggiungere una chiave sensibile richiede di ricordarsi di aggiornare entrambe le strutture. Un mancato aggiornamento è una **fuga di PII nei log**, vietata da `AGENTS.md`.

**Proposta**: generare l'array dal Set con un `flatMap` a profondità uniforme.

**Vantaggi**
- Impossibile che le due strutture divergano — elimina una classe di bug di data leakage
- Copertura uniforme a 4 livelli per tutte le chiavi (oggi `adminEmail` e `recipient` sono coperte solo a 2)

**Svantaggi / rischi**
- L'array passa da 30 a 50 path: Pino paga un costo di redazione leggermente superiore per record
- Pino richiede path costanti a build time per l'ottimizzazione; un array calcolato a module-load è supportato, ma va verificato con `unit/logger-contract.test.ts`

---

<a id="19"></a>
## 19. Test: `mockTenantContext` e boilerplate di setup duplicati in 9 file

**Categoria**: test / duplicazione · **Severità**: 🟡 Media · **LOC**: ~110 · **Effort**: M

**Posizione**: `__tests__/admin/*.int.test.ts` (7 file) + `plugin-registry.test.ts`, `plugin-manifest-validation.test.ts`

Blocco identico verbatim in 9 file:

```ts
const mockTenantContext: TenantContext = {
  slug: 'system', schemaName: 'core', realmName: 'master',
  tenantId: '00000000-0000-0000-0000-000000000000',
};
const ADMIN_PREFIX = '/api/v1/admin';
```

Più lo stesso blocco di registrazione scope in 5 file. Su 44 `beforeAll` e 46 `afterAll` totali nella suite, una quota rilevante è questo pattern.

**Vantaggi**
- Una modifica al contratto admin (prefisso, hook aggiuntivo) si propaga in un punto solo
- Riduce il rumore nei test, rendendo visibile ciò che ciascuno testa davvero

**Svantaggi / rischi**
- I test perdono un po' di esplicitezza: leggere il setup diventa un salto in più
- Il "system tenant" con `tenantId` tutto zeri è un costrutto di test discutibile che l'estrazione rischia di **istituzionalizzare**

---

<a id="20"></a>
## 20. Test: server Fastify creato, avviato e mai usato in 3 file ABAC

**Categoria**: test / codice morto · **Severità**: 🔵 Bassa · **LOC**: ~18 · **Effort**: S

**Posizione**: `__tests__/abac-cache.test.ts:35-36,42` · `abac-cache-isolation.test.ts:41-42,48` · `abac-workspace-isolation.test.ts:56,63`

In questi tre file l'unica interazione con `server` è crearlo, fare `ready()` e `close()`. Nessun `server.inject`, nessuna route registrata. I test invocano `evaluate()` direttamente. Per confronto, `abac-decision-log.test.ts` usa correttamente il server.

**Vantaggi**
- Elimina l'avvio e lo shutdown di 3 istanze Fastify per esecuzione (i test integration girano `maxWorkers: 1` — il tempo è seriale e si somma)
- Rimuove confusione su cosa il test stia effettivamente esercitando

**Svantaggi / rischi**
- Nessuno rilevante — è puro codice morto. Verificare solo che `server.close()` non stesse implicitamente chiudendo qualche connessione condivisa (non risulta)

---

<a id="21"></a>
## 21. Test: helper di raggiungibilità e stub di auth quasi identici

**Categoria**: test / duplicazione · **Severità**: 🔵 Bassa · **LOC**: ~30 · **Effort**: S

**Posizione**: `__tests__/helpers/server.helpers.ts:22-70` e `:87-130`

`makeAuthStub` (`:22-40`) e `makeFullStub` (`:47-70`) condividono 10 righe identiche di costruzione dell'`AuthUser`. Le quattro probe `isDbReachable`/`isKeycloakReachable`/`isRedisReachable`/`isMinioReachable` hanno tutte la forma `try { …; return true } catch { return false }` e sono usate in **30 file** di test.

**Vantaggi**
- Un solo stub di auth da mantenere allineato con l'`AuthUser` reale — oggi un campo aggiunto va replicato in due punti
- Riduce il file helper sotto le 100 LOC

**Svantaggi / rischi**
- Un parametro opzionale che cambia il comportamento è meno esplicito di due funzioni con nomi parlanti
- I due stub hanno usi semanticamente diversi (bypass parziale vs totale del middleware): fonderli può rendere meno evidente cosa un test sta saltando

---

<a id="22"></a>
## 22. Test: suite smoke infrastrutturale in larga parte ridondante

**Categoria**: test / duplicazione · **Severità**: 🔵 Bassa · **LOC**: ~250 · **Effort**: M

**Posizione**: `__tests__/smoke-*.test.ts` — 562 LOC totali

`smoke-redis.test.ts` (42 LOC) verifica SET/GET/DEL con un client creato ad hoc, senza toccare codice applicativo. `smoke-db.test.ts` (61), `smoke-minio.test.ts` (78), `smoke-redpanda.test.ts` (132) seguono lo stesso schema. Queste verifiche sono già coperte da:

- Le probe in `helpers/server.helpers.ts:87-130`, eseguite in 30 file di test
- `scripts/check-test-env.sh`, invocato prima dei test integration
- I test integration stessi, che falliscono se l'infra è down

`AGENTS.md` è esplicito sulla gerarchia di valore: i test devono verificare il sistema, non le librerie. **`smoke-redis.test.ts:26-28` sta testando ioredis.**

**Proposta**: mantenere `smoke-keycloak-security.test.ts` (109) e `smoke-keycloak.test.ts` (140) — verificano configurazione realm e proprietà di sicurezza, quindi hanno valore reale. Consolidare gli altri quattro.

**Vantaggi**
- Rimuove test che verificano librerie di terze parti (anti-pattern esplicitamente proibito)
- Riduce il tempo della suite integration, che gira seriale
- Meno client Redis/Kafka/MinIO creati e distrutti fuori dal codice applicativo

**Svantaggi / rischi**
- Gli smoke test danno **diagnostica rapida e leggibile** quando l'ambiente locale è rotto: perderli peggiora la DX del troubleshooting
- `smoke-redpanda.test.ts` (132 LOC) potrebbe coprire configurazioni topic/partizioni non testate altrove — va letto prima di tagliare

---

<a id="23"></a>
## 23. Test unitari che verificano i mock anziché il sistema

**Categoria**: test / violazione costituzione · **Severità**: 🟡 Media · **LOC**: ~80 · **Effort**: L

**Posizione**: `__tests__/unit/` — **47 chiamate `vi.mock()`** totali

| File | `vi.mock()` |
| ---- | ----------: |
| `unit/plugin-runtime-recovery.test.ts` | 8 |
| `unit/tenant-runtime-lifecycle.test.ts` | 6 |
| `unit/user-management-remove.test.ts` | 5 |
| `unit/outbox-publisher.test.ts` | 5 |
| `unit/event-consumer-security.test.ts` | 4 |

Caso emblematico, `unit/outbox-publisher.test.ts:11-22`: mocka `outbox-repository`, `event-key-service`, `database`, `kafka` e `logger` — cioè **tutte** le dipendenze. Ciò che resta sotto test è il `for` loop di `outbox-publisher.ts:26-63`. Il test a `:63` asserisce l'interazione col mock, non un comportamento osservabile.

**Va riconosciuto** che alcune asserzioni hanno valore reale: `:66` verifica che il payload cifrato non contenga il plaintext — una property di sicurezza genuina.

**Vantaggi**
- Conformità alla filosofia di testing dichiarata nel progetto
- I test iniziano a rilevare regressioni reali: oggi un bug nella query SQL di `claimOutboxEvents` non verrebbe intercettato da nessun test unit
- Setup più corti e leggibili

**Svantaggi / rischi**
- I test integration girano seriali: spostare test lì **allunga la pipeline CI**
- Alcuni scenari (Kafka che fallisce esattamente una volta e poi riesce) sono difficili da riprodurre in modo deterministico con infra reale — il rischio di flakiness è concreto e la costituzione tollera **zero** test flaky
- Non tutti i 47 mock sono ingiustificati: mockare `logger` o `config` è legittimo

---

<a id="24"></a>
## 24. Nessuna configurazione di coverage, nonostante il target dell'80 %

**Categoria**: violazione costituzione · **Severità**: 🟡 Media · **LOC**: −15 (aggiunge config) · **Effort**: S

**Posizione**: `services/core-api/vitest.config.ts` (73 LOC) e `package.json:18-20`

`AGENTS.md` fissa "Copertura linee (unit + int) >= 80 %" e "Endpoint API testati (int) 100 %". In `vitest.config.ts` non compare **alcun** blocco `coverage`, e nessuno script invoca `vitest --coverage`. Non esiste alcun meccanismo, né locale né in CI, per misurare o far rispettare la soglia. **Il valore attuale di copertura è ignoto.**

**Vantaggi**
- Rende verificabile una metrica oggi dichiarata ma non misurata
- Permette di **quantificare l'impatto reale delle rimozioni proposte in questo report prima di eseguirle**
- Rende visibile quanta della copertura attuale derivi da test che mockano tutto ([#23](#23))

**Svantaggi / rischi**
- Molto probabile che la soglia dell'80 % **fallisca al primo run**, bloccando la CI: va introdotta con soglia iniziale pari al valore misurato e alzata gradualmente
- `@vitest/coverage-v8` è una dipendenza aggiuntiva
- La strumentazione rallenta la suite integration

---

## Nota sulla Rule 4

**Nessuna violazione formale nel perimetro.** Il file più lungo è esattamente 200 LOC. Tuttavia **4 file si attestano esattamente a 200** (`index.ts`, `workspace-members.test.ts`, `unit/workspace-service.test.ts`, `unit/abac-engine.test.ts`) e altri 8 tra 190 e 197.

Combinato con gli split dichiaratamente artificiali (`app-error-domain.ts:3`, `helpers/server.helpers.ts:3`, 8 file `keycloak-admin-*.ts` per 929 LOC complessivi), il quadro indica che la regola sta producendo **frammentazione invece di decomposizione**. I findings [#10](#10) e [#13](#13) riducono le LOC *reali*, non le spostano.

---

## Tabella riepilogativa

| # | Finding | Severità | LOC | Effort |
| -: | ------- | -------- | --: | :----: |
| [1](#1) | `withTenantDb` crea un PrismaClient per chiamata (4+/richiesta) | 🔴 Critica | ~10 | L |
| [2](#2) | Cache tenant lifecycle write-only (`readTenantLifecycle` morta) | 🟠 Alta | 21 | S |
| [3](#3) | `userProfileResolver`: UPSERT su ogni richiesta, senza cache | 🟠 Alta | ~5 | M |
| [4](#4) | Doppio rate limiter (in-memory vs Redis) + keyGenerator duplicati | 🟠 Alta | ~70 | M |
| [5](#5) | `SLUG_REGEX` in 3 varianti divergenti, literal ×12 | 🟠 Alta | ~25 | M |
| [6](#6) | `withCoreDb` wrapper no-op (34 call site) | 🟡 Media | ~40 | M |
| [7](#7) | `logDecision` non attende la create → race con `$disconnect` | 🟠 Alta | ~4 | S |
| [8](#8) | Outbox: stato tenant verificato 4×/evento + N+1 su chiavi | 🟠 Alta | ~15 | M |
| [9](#9) | Chiave cache ABAC duplicata (scrittura vs invalidazione) | 🟡 Media | ~2 | S |
| [10](#10) | `keycloak-admin-client` ≡ `keycloak-tenant-client` | 🟡 Media | ~130 | L |
| [11](#11) | `if (!res.ok) throw` ×21 + `Error` vs `KeycloakError` incoerente | 🟡 Media | ~45 | M |
| [12](#12) | `TenantPrismaClient` type-erased → 19 `as any`, 50 eslint-disable | 🟠 Alta | ~60 | L |
| [13](#13) | 31 classi di errore boilerplate su 3 file (343 LOC) | 🟡 Media | ~200 | M |
| [14](#14) | Indici tenant assenti dallo schema Prisma (drift) + 3 ridondanti | 🟠 Alta | ~3 | M |
| [15](#15) | `TenantContext` costruito in 3 middleware + `resolveTenant` duplicata | 🟡 Media | ~35 | M |
| [16](#16) | Kafka: doppia logica di connessione + race producer non connesso | 🟡 Media | ~14 | S |
| [17](#17) | Export morti (15 simboli) + `@fastify/http-proxy` inutilizzata | 🔵 Bassa | ~70 | S |
| [18](#18) | `LOGGER_REDACT_PATHS` duplica `SENSITIVE_KEYS` a mano | 🔵 Bassa | ~14 | S |
| [19](#19) | Test: `mockTenantContext` + setup admin duplicati ×9 | 🟡 Media | ~110 | M |
| [20](#20) | Test: server Fastify creato e mai usato in 3 file ABAC | 🔵 Bassa | ~18 | S |
| [21](#21) | Test: `makeAuthStub`/`makeFullStub` + 4 probe near-identiche | 🔵 Bassa | ~30 | S |
| [22](#22) | Test: smoke test infrastrutturali ridondanti | 🔵 Bassa | ~250 | M |
| [23](#23) | Test unit che verificano mock (47 `vi.mock`) | 🟡 Media | ~80 | L |
| [24](#24) | Nessuna configurazione coverage nonostante target 80 % | 🟡 Media | −15 | S |
| | **Totale** | | **~1.236 (8 %)** | |

## Priorità suggerita per quest'area

1. **Subito, basso rischio, alto impatto** — [#7](#7), [#9](#9), [#2](#2), [#16](#16), [#17](#17): bug reali o codice morto, effort S, ~110 LOC
2. **Prossimo sprint** — [#24](#24) (misurare prima di tagliare), [#14](#14), [#4](#4), [#5](#5): correttezza e sicurezza
3. **Con pianificazione** — [#1](#1), [#3](#3), [#8](#8): performance, richiedono benchmark prima/dopo
4. **Refactoring di consolidamento** — [#13](#13), [#10](#10), [#12](#12), [#19](#19), [#22](#22): il grosso delle LOC, nessuna urgenza funzionale

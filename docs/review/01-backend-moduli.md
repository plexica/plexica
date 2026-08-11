# 01 — Backend: moduli funzionali

> Perimetro: `services/core-api/src/modules/` — 158 file, 13.123 LOC, 12 moduli
> (`abac`, `admin`, `audit-log`, `invitation`, `plugin`, `tenant`, `tenant-settings`, `user`, `user-management`, `user-profile`, `workspace`, `workspace-member`)
> 28 findings · ~1.018 LOC riducibili (7,8 %)

[← Torna all'indice](./README.md)

---

<a id="1"></a>
## 1. `writeAuditLog` fire-and-forget su client Prisma già chiuso

**Categoria**: correttezza · **Severità**: 🔴 Critica · **LOC**: 0 (è un fix) · **Effort**: M

**Posizione**: `modules/audit-log/writer.ts:17-39` + **17 call site**: `workspace/service.ts:131,193` · `workspace/service-archive.ts:62,101,167` · `workspace-member/service.ts:54,84,113` · `user-profile/service.ts:115,149` · `invitation/service.ts:112,147` · `invitation/service-accept.ts:105` · `tenant-settings/service.ts:37,87` · `tenant-settings/service-branding.ts:70` · `user-management/service-remove.ts:59`

**Evidenza**. `writeAuditLog` non è `async` e non ritorna la Promise:

```ts
// writer.ts:25-39
db.auditLog.create({ data: {...} }).catch((err) => { logger.error(...) });
```

Verificato con grep: **nessuno dei 17 call site fa `await` o `void`**. Il `tenantDb` proviene sempre da `withTenantDb`, che in `lib/tenant-database.ts:73-77` fa `try { return await fn(tenantDb); } finally { await tenantDb.$disconnect(); }`. Appena il callback risolve, il client viene disconnesso mentre la `create()` è ancora in volo.

Caso peggiore: `workspace/routes.ts:106-111` passa un **transaction client** (`db.$transaction((tx) => createWorkspaceService(tx, ...))`) e `workspace/service.ts:131` scrive l'audit su quel `tx` senza await — la transazione committa e chiude prima.

**Proposta**: rendere `writeAuditLog` `async` e fare `await` in tutti i call site (resta non-throwing grazie al `.catch` interno). In alternativa, spostare la scrittura in un outbox come già fatto per `enqueueEvent`.

**Vantaggi**
- Elimina la perdita silenziosa di record di audit (requisito FR-021/NFR-03)
- Rende deterministici i test E2E che asseriscono sull'audit log
- Rimuove una race condition non riproducibile

**Svantaggi / rischi**
- Aggiunge latenza sincrona (~1–3 ms) a ogni mutazione
- Se il write fallisce dentro una transazione ora può causare rollback: va decisa esplicitamente la semantica (best-effort vs transazionale)
- Tocca 17 file: rischio di merge conflict alto

---

<a id="2"></a>
## 2. `withTenantDb` istanzia un `PrismaClient` per ogni chiamata

**Categoria**: performance · **Severità**: 🔴 Critica · **LOC**: ~40 · **Effort**: L · **Richiede ADR**

**Posizione**: `lib/tenant-database.ts:59-78` + **53 call site** dentro `modules/`

Handler con chiamate multiple per singola request:

| File | Chiamate `withTenantDb` |
| ---- | ----------------------- |
| `workspace/routes.ts` | 10 (una per route) |
| `tenant-settings/routes.ts:69,84,133,144` | 4 |
| `invitation/routes.ts:58` e `:77` | **2 nella stessa request** |
| `plugin/routes/visibility.routes.ts:57` e `:81` | **2 nella stessa request** |
| `plugin/routes/lifecycle/install.routes.ts:83,105,141` | **3 nella stessa request** |
| `plugin/routes/marketplace.routes.ts:37+49`, `:77+102`, `:143+155` | tenant + core per request |

**Evidenza**. Il commento a `lib/tenant-database.ts:14-16` ammette il trade-off (*"one extra PrismaClient per request — no connection pooling"*), ma la realtà è peggiore: è **un client per chiamata**, non per request. `plugin/services/runtime-recovery.service.ts:122,137` lo chiama dentro un doppio loop `for (const tenant)` → `for (const installation)`, cioè **O(tenant × installazioni)** connessioni PostgreSQL.

**Proposta**: cache LRU di `TenantPrismaClient` per `schemaName` (con `$disconnect` su TTL/eviction), oppure passare il client già aperto lungo la chain. Come minimo: unificare le chiamate multiple nello stesso handler.

**Vantaggi**
- Elimina connect/disconnect per chiamata (decine di ms + handshake TLS/auth)
- Riduce drasticamente il rischio di esaurire `max_connections`
- Rende possibili transazioni oggi spezzate su client diversi (es. `visibility.routes.ts:57` valida ABAC su un client e `:81` scrive su un altro — **finestra TOCTOU reale**)

**Svantaggi / rischi**
- Cambio infrastrutturale → richiede ADR (Rule 5)
- Una cache di client va bounded, altrimenti con molti tenant si esaurisce comunque il pool
- Rischio di leak di `search_path` se la cache è sbagliata: va coperto da test di isolamento tenant

---

<a id="3"></a>
## 3. Bug: `reactivateTenant` ritorna `status: 'suspended'` nel branch pending

**Categoria**: correttezza · **Severità**: 🟠 Alta · **LOC**: 0 · **Effort**: S

**Posizione**: `admin/services/tenant-reactivate.service.ts:42-51`

```ts
if (await reconcile(prisma, operation.id)) {
  return { id: tenantId, status: 'active', version: targetVersion };   // :43
}
return {
  operationId: operation.id, id: tenantId,
  status: 'suspended',        // :48  ← incoerente
  version: targetVersion, reconciliation: 'pending',
};
```

Il `updateMany` a `:20-23` usa `status: 'suspended'` come *predicato*, ma il `data` **non setta `status`** — a differenza di `tenant-suspend.service.ts:27`. La risposta 202 dice `suspended`, la 200 dice `active`: il client riceve due contratti diversi per la stessa operazione.

**Proposta**: allineare il branch pending a `status: 'active'` (stato desiderato), oppure documentare che `status` riflette lo stato *corrente* — e in tal caso correggere anche `tenant-suspend.service.ts:53`, che restituisce già lo stato desiderato.

**Vantaggi**
- Contratto API coerente
- Evita che la UI mostri lo stato sbagliato dopo un 202

**Svantaggi / rischi**
- Se un test E2E esistente asserisce l'attuale valore errato, va aggiornato — verificare prima

---

<a id="4"></a>
## 4. Boilerplate di validazione Zod ripetuto 38 volte

**Categoria**: duplicazione · **Severità**: 🟠 Alta · **LOC**: ~110 · **Effort**: M

**Posizione**: 38 occorrenze in 21 file — `workspace/routes.ts:53,85,104,132,175` · `tenant-settings/routes.ts:66,128,140,172` · `workspace-member/routes.ts:27,43,82` · `invitation/routes.ts:38,51` · `admin/routes/*` (13 occorrenze) · `plugin/routes/*` (8) · `user-management/routes.ts:37,59` · `user-profile/routes.ts:32` · `audit-log/routes.ts`

**Evidenza**. Pattern identico ovunque:

```ts
const parsed = XSchema.safeParse(request.body);
if (!parsed.success) {
  throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
}
```

Si somma un secondo pattern: la ricostruzione manuale dell'oggetto filtri per `exactOptionalPropertyTypes` in 8 file (`workspace/routes.ts:89-91`, `workspace-member/routes.ts:30-31`, `user-management/routes.ts:42-47`, …) — altre ~40 righe.

**Proposta**: helper `parseOrThrow<T>(schema, input): T` in `lib/`, più `stripUndefined<T>(obj)`. In alternativa: `validatorCompiler` Zod nativo di Fastify, che elimina il boilerplate *e* dà validazione delle risposte.

**Vantaggi**
- Formato messaggi d'errore uniforme (oggi `dlq.routes.ts:68,82` già divergono: `'Invalid DLQ entry ID'` invece del join)
- Un solo punto per aggiungere il campo `path` agli errori di validazione
- Handler leggibili, meno rumore

**Svantaggi / rischi**
- Un helper che fa `throw` nasconde il control flow; il narrowing di TS va gestito con cura
- La strada Fastify+Zod è un cambio di pattern trasversale: richiede ADR e tocca 21 file
- Va fatto in un commit atomico o si crea inconsistenza temporanea

---

<a id="5"></a>
## 5. Type erasure `db as any` — 5 helper identici e 45 `eslint-disable`

**Categoria**: type safety · **Severità**: 🟠 Alta · **LOC**: ~95 · **Effort**: L

**Posizione**. Helper duplicati (stessa firma, stesso corpo, nome diverso):

| File:riga | Nome |
| --------- | ---- |
| `workspace/repository.ts:36-39` | `db(tenantDb: unknown): any` |
| `workspace/repository-templates.ts:18` | `db(...)` |
| `invitation/repository.ts:13-16` | `d(...)` |
| `invitation/service-accept.ts:25-28` | `d(...)` |
| `user-management/repository.ts:12-15` | `toClient(...)` |

Cast inline in `workspace-member/repository.ts:41,74,88,101,114` · `user-profile/repository.ts:38,49,79,99,125` · `tenant-settings/repository.ts:73,90,118` · e altri. Totale: **45** `eslint-disable no-explicit-any` in 23 file, **37** `as any`, **88** parametri `db: unknown`.

**Evidenza**. Il commento a `workspace/repository.ts:3` dichiara *"type-erased pending prisma generate"*, ma `lib/tenant-database.ts:28` **importa già** il client generato, e `plugin/services/visibility.service.ts:9,73` lo usa correttamente con `Prisma.TransactionClient`. La type erasure non è più necessaria: è debito residuo.

**Proposta**: sostituire `db: unknown` con `TenantPrismaClient | Prisma.TransactionClient` in tutte le repository, come già fatto in `visibility.service.ts`.

**Vantaggi**
- Errori di schema Prisma catturati a compile-time (oggi un typo in `where` passa silenziosamente)
- Autocomplete funzionante nelle repository — riduce il costo di ogni modifica futura
- Elimina interi cast `as unknown as` (vedi [#15](#15))

**Svantaggi / rischi**
- ~15 file da toccare; `Prisma.TransactionClient` del tenant-client differisce dal `PrismaClient` completo (`$transaction`, `$executeRawUnsafe` assenti): serve una union tipizzata con attenzione
- Richiede `pnpm db:generate` prima di ogni build/CI: se il client generato non è in git, ogni CI freddo fallisce con errori di tipo (oggi l'`as any` maschera questo)
- Potrebbe far emergere **bug reali** nascosti dai cast → più lavoro del previsto

---

<a id="6"></a>
## 6. Codice morto: 37 export mai referenziati + 1 modulo intero inutilizzato

**Categoria**: codice morto · **Severità**: 🟠 Alta · **LOC**: ~230 · **Effort**: S

**Funzioni completamente non referenziate** (verificate una a una con grep su tutto il repo):

| File:riga | Simbolo |
| --------- | ------- |
| `admin/lib/optimistic-lock.ts:24` | `withOptimisticLock` — **solo il suo test lo usa** |
| `plugin/services/health-check.service.ts:30,34,46,192` | `onHealthChange`, `removeHealthChangeHandler`, `getCircuitState`, `stopPeriodicHealthPolling` |
| `plugin/events/lag-metrics.service.ts:49,85` | `startLagMonitoring`, `stopLagMonitoring` |
| `plugin/services/registry.service.ts:83,134` | `findPluginById`, `addPluginVersion` |
| `plugin/schema/migrations.ts:21,158` | `migrationFileSchema`, `validateMigrationSql` |
| `plugin/lib/slug-prefix.ts:13` | `validateTableName` |
| `plugin/schema/api.ts:20,33` | `updatePluginSchema`, `installPluginResponseSchema` |
| `user-management/repository.ts:92,143` | `findUserById`, `findUserMemberships` |
| `user-profile/repository.ts:33` | `findProfileByUserId` |
| `workspace/repository.ts:115` | `findWorkspacesByIds` |

**Tipi/schemi mai importati**: `admin/schemas/audit-schemas.ts:73,74` · `kafka-schemas.ts:28,29` · `logs-schemas.ts:34,36` · `plugin-catalog-schemas.ts:40-43` · `tenant-schemas.ts:40` · `audit-log/schema.ts:26` · `user-profile/schema.ts:28` · `workspace-member/types.ts:17,22` · `workspace/types.ts:40,68` · `plugin/schema/manifest.ts:79,80` · `plugin/schema/api.ts:45`

**Dead branch**: `plugin/services/health-check.service.ts:74-79` — `else if (state.state === 'open') { }`, blocco vuoto con soli commenti.

**Il caso più indicativo**: `withOptimisticLock` è un'astrazione da 46 righe con un intero file di unit test, ma `tenant-suspend.service.ts:24-45` e `tenant-reactivate.service.ts:19-40` implementano l'optimistic locking **a mano** con `updateMany`. L'astrazione è stata scritta, testata, e mai adottata.

**Proposta**: eliminare i simboli confermati morti. Per `optimistic-lock.ts`: **o** rimuoverlo con il suo test, **o** adottarlo nei due service (vedi [#8](#8)).

**Vantaggi**
- Riduce la superficie di manutenzione e il tempo di build/typecheck
- Elimina test che danno falsa sicurezza (il test di `withOptimisticLock` passa ma non copre nessun path di produzione)
- Rende affidabile il segnale di coverage

**Svantaggi / rischi**
- Alcuni export sono plausibilmente API previste: `stopPeriodicHealthPolling` serve per uno shutdown pulito — **la sua assenza è probabilmente un bug**, non codice morto da cancellare
- `getCircuitState` e `onHealthChange` suggeriscono una feature di osservabilità incompleta: cancellarli rimuove la traccia del design
- Va verificato che nulla li usi da `packages/sdk` o dai plugin di esempio

---

<a id="7"></a>
## 7. `visibility.routes.ts` PATCH: doppia connessione + N valutazioni ABAC seriali

**Categoria**: performance · **Severità**: 🟠 Alta · **LOC**: ~15 · **Effort**: M

**Posizione**: `plugin/routes/visibility.routes.ts:57-92`

```ts
await withTenantDb(async (tx) => {          // :57  ← client #1
  for (const { workspaceId } of updates) {   // :66  ← N iterazioni seriali
    const decision = await evaluate(abacCtx, tx, redis);   // :74
  }
}, ctx);
const results = await withTenantDb(async (tx) => {   // :81  ← client #2
  return (tx as any).$transaction(async (innerTx) => {
    for (const { workspaceId, isEnabled } of updates) {  // :84  ← altre N seriali
      await setWorkspaceVisibility(innerTx, ...);         // :85
```

Con 20 workspace: 2 PrismaClient + 20 `evaluate()` seriali (ognuna fino a 2 query, cfr. `abac/engine.ts:74,82`) + 20 `upsert` seriali. L'autorizzazione avviene sul client #1 e la scrittura sul client #2 — **finestra TOCTOU**.

**Proposta**: un solo `withTenantDb`, `Promise.all` sulle valutazioni ABAC (indipendenti), scritture in batch, tutto nella stessa transazione della verifica.

**Vantaggi**
- Da ~42 round-trip a ~4 per una lista di 20 workspace
- Chiude la finestra TOCTOU tra autorizzazione e scrittura
- Riduce il tempo in cui la transazione tiene i lock

**Svantaggi / rischi**
- `Promise.all` su `evaluate()` aumenta la concorrenza su Redis/PG: va limitata (es. `p-limit`)
- Prisma non ha `upsertMany`: serve raw SQL `ON CONFLICT`, che perde type safety
- L'ordine dei messaggi d'errore cambia (oggi fallisce sul primo workspace non autorizzato in ordine)

---

<a id="8"></a>
## 8. `tenant-suspend` e `tenant-reactivate`: route e service quasi identici

**Categoria**: duplicazione · **Severità**: 🟡 Media · **LOC**: ~90 · **Effort**: M

**Posizione**: `admin/routes/tenant-suspend.routes.ts:1-75` vs `tenant-reactivate.routes.ts:1-77`; `admin/services/tenant-suspend.service.ts:16-57` vs `tenant-reactivate.service.ts:11-52`

I due file route differiscono solo per nome dello schema, path e funzione chiamata. Blocchi identici carattere per carattere alle righe `42-54`/`43-56` e `60-72`/`62-74`.

Gli schemi Zod sono anch'essi duplicati: `TenantSuspendParamsSchema` ≡ `TenantReactivateParamsSchema` ≡ `TenantDetailParamsSchema` ≡ `TenantDeleteParamsSchema` ≡ `TenantIdParamsSchema` — **5 definizioni identiche** di `z.object({ id: z.string().uuid() })`.

**Proposta**: factory `registerLifecycleTransition(fastify, { path, service })`; un solo `TenantIdParamsSchema` e `VersionBodySchema` in `admin/schemas/tenant-schemas.ts`.

**Vantaggi**
- Un bug fixato in un posto solo — il finding [#3](#3) esiste **proprio perché** i due file sono stati modificati separatamente
- Il pre-check `findUnique` + `NotFoundError` diventa garantito uniforme

**Svantaggi / rischi**
- Una factory di route riduce la leggibilità: il path non è più grep-abile dal file
- I due service hanno semantiche diverse (`suspend` scrive `status`, `reactivate` no): fondere anche i service richiede prima di risolvere [#3](#3)
- Effort moderato, guadagno su soli 2 endpoint

---

<a id="9"></a>
## 9. Schema di paginazione duplicato e 3 convenzioni divergenti

**Categoria**: duplicazione / violazione Rule 3 · **Severità**: 🟡 Media · **LOC**: ~45 · **Effort**: L

**Posizione**: `lib/pagination.ts:43-46` definisce `paginationSchema` — usato **solo** da `workspace/schema.ts:28`. Copie inline identiche in `workspace-member/schema.ts:17-18` · `invitation/schema.ts:14-15` · `audit-log/schema.ts:17-18` · `user-management/schema.ts:9-10`. Varianti `page/pageSize` in 5 file admin/plugin.

**Tre contratti di risposta paginata coesistenti**:

| # | Shape | Dove |
| - | ----- | ---- |
| 1 | `{ data, total, page, limit, totalPages }` | `lib/pagination.ts:28-38`, `workspace/service.ts:77`, `audit-log/repository.ts:63` |
| 2 | `{ data, total, page, pageSize }` | `admin/services/tenant-list.service.ts:67`, `registry.service.ts:112-117`, `dlq.routes.ts:47-55` |
| 3 | `{ data, total }` senza page | `workspace-member/repository.ts:65`, `invitation/repository.ts:120` |

Il campo `limit` vs `pageSize` è incoerente tra endpoint tenant e admin. Il frontend deve gestire tre shape.

**Proposta**: un solo `paginationSchema` e un solo `buildPaginatedResult`; scegliere `page/pageSize` o `page/limit` e migrare l'altro con un alias temporaneo.

**Vantaggi**
- Un solo tipo `PaginatedResult<T>` condivisibile con il frontend
- Rispetta la Rule 3, oggi violata
- Elimina la classe di bug "il client legge `limit` ma l'API manda `pageSize`"

**Svantaggi / rischi**
- **Breaking change dell'API pubblica**: rinominare `limit`↔`pageSize` rompe frontend e test E2E
- Va coordinato con `apps/web` e `apps/admin` nello stesso rilascio
- I limiti massimi divergono di proposito (`dlq` usa 50, `logs` usa 500): l'unificazione deve preservarli via `.extend()`

---

<a id="10"></a>
## 10. `readStream` duplicato integralmente in due file

**Categoria**: duplicazione · **Severità**: 🟡 Media · **LOC**: ~15 · **Effort**: S

**Posizione**: `tenant-settings/routes.ts:30-42` e `user-profile/service.ts:42-56`

Il `diff` dei due blocchi produce solo differenze di righe vuote. Esiste già `lib/file-upload.ts` che ospita `validateMimeType` e `validateFileSize` — è la sede naturale.

**Vantaggi**: un solo punto per il limite di memoria; testabile una volta sola.
**Svantaggi / rischi**: nessuno significativo — refactor a rischio quasi nullo.

---

<a id="11"></a>
## 11. `AVATAR_ALLOWED_MIME_TYPES` triplicato + doppia validazione MIME

**Categoria**: duplicazione / codice morto · **Severità**: 🟡 Media · **LOC**: ~6 · **Effort**: S

**Posizione**: `lib/file-upload.ts:7` (definizione canonica, **usata solo dai test**) · `user-profile/routes.ts:18` (copia) · `user-profile/service.ts:28` (seconda copia)

`validateMimeType` viene inoltre chiamato **due volte sullo stesso file**: `user-profile/routes.ts:54` e `user-profile/service.ts:134`.

**Vantaggi**
- Aggiungere `image/avif` all'allowlist diventa una modifica in un punto
- Elimina il rischio di divergenza silenziosa tra i due allowlist (oggi coincidono per caso)

**Svantaggi / rischi**
- Rimuovere il check dalla route sposterebbe la validazione **dopo** il buffering del file, perdendo il fail-fast. **Va tolto quello nel service, non quello nella route.**

---

<a id="12"></a>
## 12. Cinque probe di health quasi identici in cinque file

**Categoria**: duplicazione · **Severità**: 🟡 Media · **LOC**: ~55 · **Effort**: S

**Posizione**: `admin/services/health-check-postgres.ts` (21 LOC) · `health-check-redis.ts` (21) · `health-check-minio.ts` (22) · `health-check-keycloak.ts` (29) · `health-check-kafka.ts` (33)

I primi tre sono **identici modulo l'espressione della probe**:

```ts
export async function probeX(): Promise<HealthServiceResult> {
  const name = 'x'; const start = performance.now();
  try {
    await withProbeTimeout(<op>());
    return buildServiceResult(name, Math.round(performance.now() - start), null);
  } catch (error) {
    return buildServiceResult(name, Math.round(performance.now() - start), error);
  }
}
```

**Proposta**: `makeProbe(name, op)` in `health-checker.service.ts`; postgres/redis/minio diventano 3 righe.

**Vantaggi**
- Il calcolo della latenza (oggi ripetuto 10 volte) diventa impossibile da sbagliare
- Aggiungere una probe passa da "nuovo file + import + registrazione" a una riga

**Svantaggi / rischi**
- Perde la granularità file-per-servizio, che oggi rende ovvio dove intervenire
- Kafka e Keycloak hanno cleanup specifico (`admin.disconnect()`): l'astrazione o li esclude o si complica

---

<a id="13"></a>
## 13. `SLUG_REGEX` definito 6 volte, `SCHEMA_NAME_REGEX` 5 volte con 2 varianti divergenti

**Categoria**: duplicazione / rischio sicurezza · **Severità**: 🟡 Media · **LOC**: ~12 · **Effort**: S

**Posizione**
- `SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}$/` in `lib/slug.ts:5` + 6 copie nei file plugin/admin
- Variante divergente: `lib/tenant-schema-helpers.ts:17` → `/^[a-z][a-z0-9-]{1,49}[a-z0-9]$/`
- `SCHEMA_NAME_REGEX` in **due varianti**: `/^tenant_[a-z0-9_]+$/` (3 file) vs `/^tenant_[a-z0-9_]{1,55}$/` (2 file)

**Evidenza critica**: `SCHEMA_NAME_REGEX` è usato come **guardia anti-SQL-injection** prima di interpolare in `$queryRawUnsafe` (`tenant-detail.service.ts:91-94`, `metrics-aggregator.service.ts:67-69`). Due varianti significa che il livello di difesa non è uniforme: la versione senza limite di lunghezza accetta identificatori arbitrariamente lunghi.

**Vantaggi**
- Una singola guardia di sicurezza, auditabile e testabile una volta
- Elimina la classe di bug "ho stretto il regex in un file e non negli altri 4"

**Svantaggi / rischi**
- Adottare `{1,55}` ovunque potrebbe rompere tenant esistenti con slug lunghi → serve una verifica dei dati prima
- Le due varianti di `SLUG_REGEX` (62 vs 49) sono probabilmente **intenzionali** (plugin vs tenant): vanno tenute separate con nomi distinti, non fuse

---

<a id="14"></a>
## 14. N+1 nella purga GDPR degli audit log

**Categoria**: performance · **Severità**: 🟡 Media · **LOC**: ~5 · **Effort**: M

**Posizione**: `admin/services/deletion-step-gdpr-purge.ts:70-79`

```ts
const audits = await tx.platformAuditLog.findMany({ where: { tenantId }, ... });
for (const audit of audits) {
  await tx.platformAuditLog.update({ where: { id: audit.id }, data: {...} });
}
```

Una UPDATE per riga, **dentro una transazione**, su una tabella che per un tenant longevo può avere migliaia di righe. La transazione tiene i lock per tutta la durata e può superare `statement_timeout`.

**Vantaggi**
- Da N query a 2; la deletion saga smette di essere O(n) sul volume di audit
- Riduce il rischio di timeout che farebbe fallire lo step finale della saga GDPR

**Svantaggi / rischi**
- `retainedMetadata` dipende dal valore corrente di `metadata` riga per riga: un `updateMany` puro non basta, serve SQL con `jsonb` — perdita di type safety
- Compromesso ragionevole: `updateMany` per il caso generico (la maggioranza) + loop solo sulle righe `tenant.delete` (poche)

---

<a id="15"></a>
## 15. `PluginRecord`: duplicazione manuale del modello Prisma + 5 cast `as unknown as`

**Categoria**: type safety · **Severità**: 🟡 Media · **LOC**: ~22 · **Effort**: M

**Posizione**: `plugin/services/registry.service.ts:10-27`, cast a `:72, :80, :88, :113, :131`

`PluginRecord` ridichiara a mano 18 campi del modello Prisma `Plugin`. Non combaciando, ogni ritorno richiede un doppio cast che disattiva il type checking. La conseguenza è visibile in `plugin/routes/admin-catalog.routes.ts:17-20`, dove un commento ammette il problema e crea un tipo di patch:

```ts
// listPlugins() selects all Plugin columns, so reviewStatus is present at
// runtime; the PluginRecord interface just omits it.
type PluginRow = PluginRecord & { reviewStatus: string };
```

**Proposta**: `type PluginRecord = Prisma.PluginGetPayload<{}>`, con `manifest` ristretto via `Prisma.JsonValue` → `Manifest` in un punto solo.

**Vantaggi**
- Il tipo resta sincronizzato con lo schema automaticamente
- Elimina 5 cast che oggi nascondono qualunque drift di schema
- `PluginRow` sparisce

**Svantaggi / rischi**
- `manifest` è `JsonValue` in Prisma ma `Manifest` in `PluginRecord`: serve comunque un cast in un punto, o un branded type
- Espone campi che oggi il tipo nasconde deliberatamente (`registryCredentialsSecret`): va aggiunto un `Omit<>` esplicito per non leakare segreti

---

<a id="16"></a>
## 16. Mapper identità ridondanti nei service admin

**Categoria**: over-engineering · **Severità**: 🟡 Media · **LOC**: ~25 · **Effort**: S

**Posizione**: `admin/services/tenant-list.service.ts:58-65` · `tenant-detail.service.ts:123-133` · `admin/routes/deletion-status.routes.ts:48-57`

La query seleziona esattamente N campi via `TENANT_SELECT`, poi li rimappa uno a uno negli stessi nomi. Il `select` garantisce già che non ci sia altro.

**Vantaggi**
- Meno codice da tenere allineato: oggi aggiungere un campo richiede di toccare 3 posti (schema, select, mapper)
- Elimina la classe di bug "aggiunto al select ma dimenticato nel mapper"

**Svantaggi / rischi**
- Il mapper esplicito è una **seconda barriera** contro il leak di campi sensibili: rimuoverlo lascia solo il `select`. Data la sensibilità (`minioBucket`, `config`), il trade-off è reale
- **Mitigazione**: mantenere la validazione Zod in uscita (`TenantListResponseSchema`, già definita ma **non usata** in `tenant-list.routes.ts`) come barriera sostitutiva

---

<a id="17"></a>
## 17. `upsertBranding` e `updateLogoPath`: duplicazione + race condition

**Categoria**: duplicazione / correttezza · **Severità**: 🟡 Media · **LOC**: ~30 · **Effort**: M

**Posizione**: `tenant-settings/repository.ts:78-108` e `:110-136`

Entrambe implementano lo stesso pattern find-then-update-or-create (26 righe ciascuna, differiscono solo nel payload). Il pattern è **non atomico**: due PATCH concorrenti su `/tenant/branding` possono entrambe vedere `existing === null` e creare due righe, violando l'invariante "singleton per schema" documentata a `:70` e `:88`.

Stesso anti-pattern in `plugin/services/registry.service.ts:49-52,125-131` e `invitation/service.ts:56-61`.

**Vantaggi**
- Elimina la race che può produrre due righe di branding per tenant
- Rimuove un round-trip per operazione

**Svantaggi / rischi**
- `upsert` di Prisma richiede un campo univoco: se `TenantBranding` non ne ha uno oltre a `id` autogenerato, serve una **migrazione di schema** → ADR richiesto
- Il catch di `P2002` accoppia il codice a codici d'errore Prisma specifici
- I parametri `_tenantId` non usati (`:68, :81, :113`) vanno rimossi contestualmente, toccando i chiamanti

---

<a id="18"></a>
## 18. `resendInvitationService`: 4 query dove ne bastano 2

**Categoria**: performance · **Severità**: 🟡 Media · **LOC**: ~14 · **Effort**: S

**Posizione**: `invitation/service.ts:122-164`

```ts
const invitation = await findInvitationById(tenantDb, invitationId);   // query 1
await updateExpiry(tenantDb, invitationId, newExpiresAt);              // query 2
const updated = await findInvitationById(tenantDb, invitationId);      // query 3 (ri-legge)
const inviteUrl = buildInviteUrl(await getToken(tenantDb, invitationId));  // query 4
```

Il commento a `:139-141` documenta il workaround: *"We need the token but InvitationDto doesn't expose it. Re-use a direct query here via the cast db."* `getToken` (`:157-164`) esiste solo per aggirare il DTO.

**Vantaggi**
- Dimezza i round-trip su un endpoint già lento (fa anche invio email)
- Elimina un `as any` (`:159`)
- Rimuove un TOCTOU: oggi tra query 2 e 4 il token potrebbe cambiare

**Svantaggi / rischi**
- Il token è PII/capability: farlo transitare in un tipo intermedio aumenta la superficie di leak accidentale nei log. Va tipizzato come `InvitationWithToken` **interno**, mai esportato
- Modifica la firma di `updateExpiry` → tocca i chiamanti

---

<a id="19"></a>
## 19. `updateMaterializedPaths`: una UPDATE per discendente

**Categoria**: performance · **Severità**: 🟡 Media · **LOC**: ~8 · **Effort**: M

**Posizione**: `workspace/repository.ts:166-178`, chiamata da `workspace/service-archive.ts:163`

Un reparent su un sottoalbero di 200 workspace genera 200 UPDATE. La gerarchia arriva a `MAX_DEPTH = 10` livelli, quindi sottoalberi grandi sono realistici.

**Proposta**: una singola UPDATE parametrizzata con `overlay`/`replace` sul prefisso.

**Vantaggi**
- Da N query a 1; il reparent smette di degradare con la dimensione del sottoalbero
- La transazione tiene i lock per molto meno tempo

**Svantaggi / rischi**
- Passaggio a SQL raw → perde type safety, va testato su edge case di prefisso (es. `/a` che matcha anche `/ab`)
- `LIKE` su `materialized_path` richiede un indice dedicato per non degenerare in seq scan — verificare che esista

---

<a id="20"></a>
## 20. `findDescendants` e altre query senza `select`: leggono tutte le colonne

**Categoria**: performance · **Severità**: 🟡 Media · **LOC**: 0 (aggiunge righe) · **Effort**: M

**Posizione**: `workspace/repository.ts:105-113` (usata a `service-archive.ts:56,94,134`), `:87-92`, `:119` · `plugin/routes/lifecycle/deactivate.routes.ts:28` · `reactivate.routes.ts:37` · `marketplace.routes.ts:38,90` · `visibility.service.ts:85,121`

I chiamanti di `findDescendants` usano solo `id`, `name`, `status`, `materializedPath`, ma vengono trasferite anche `description`, `templateId`, `createdBy`, `version`, `archivedAt`, `updatedAt` per ogni discendente.

**Vantaggi**
- Riduce I/O e traffico di rete proporzionalmente al numero di colonne non usate
- Rende esplicito il contratto dati e blocca il leak accidentale di colonne future

**Svantaggi / rischi**
- Aggiunge verbosità; ogni nuovo campo richiesto va aggiunto al `select`
- **Prerequisito**: va fatto *dopo* il [#5](#5) — oggi con `db as any` un `select` sbagliato fallirebbe a runtime invece che a compile-time
- `findWorkspaceById` è usata da 4 chiamanti con esigenze diverse: un `select` unico rischia di essere l'unione di tutti, annullando il guadagno

---

<a id="21"></a>
## 21. `WorkspaceMemberDto` e `WorkspaceRole` definiti più volte con shape divergenti

**Categoria**: type safety / duplicazione · **Severità**: 🟡 Media · **LOC**: ~30 · **Effort**: M

**Posizione**: `WorkspaceMemberDto` in `workspace/types.ts:31-38` **e** `workspace-member/types.ts:7-15`. `WorkspaceRole` in `abac/types.ts:5` · `workspace-member/types.ts:5` · `invitation/types.ts:5`, più 5 definizioni inline.

**Evidenza**. Le due `WorkspaceMemberDto` **non coincidono**: quella in `workspace/types.ts` manca del campo `workspaceId`, presente in `workspace-member/types.ts:9` e ritornato realmente dall'API. La versione stale è importata **solo dai test**:

```
__tests__/workspace-members.test.ts:27: import type { WorkspaceMemberDto } from '../modules/workspace/types.js';
```

Il test asserisce quindi contro un tipo che non descrive la risposta reale — **problema di coerenza test-spec**, non solo di duplicazione.

**Vantaggi**
- Il test inizia effettivamente a verificare la shape della risposta
- Aggiungere un ruolo diventa una modifica in un punto invece di 8
- Tipo e validazione runtime non possono più divergere (derivazione da Zod)

**Svantaggi / rischi**
- Correggere il tipo nel test potrebbe **far fallire il test** se la risposta reale non combacia: è l'esito desiderato, ma va messo in conto
- Un `WorkspaceRole` condiviso accoppia `plugin/schema/manifest.ts` al modulo ABAC — accettabile ma da valutare

---

<a id="22"></a>
## 22. `dev.routes.ts`: tipo anonimo ripetuto 3 volte + registry in-memory duplicato

**Categoria**: duplicazione · **Severità**: 🟡 Media · **LOC**: ~35 · **Effort**: S

**Posizione**: `plugin/routes/dev.routes.ts:15-26`, `:82-90`, `:165-174`

La stessa struttura a 9 campi è scritta tre volte come type literal anonimo. Inoltre esistono **due registry in-memory paralleli** per lo stesso dominio: `devPlugins` (`dev.routes.ts:15`) e `devBackends` (`plugin/services/dev-backends.ts:18`), popolati separatamente. Possono divergere. Il guard `if (!isDev) return 404` è ripetuto a `:59`, `:131`, `:160`.

**Vantaggi**
- Elimina lo stato duplicato, fonte di bug difficili da diagnosticare in dev
- Non registrare le route in produzione è più sicuro di un check a runtime (riduce la superficie d'attacco)

**Svantaggi / rischi**
- Codice dev-only: ROI basso rispetto ad altri finding
- Non registrare le route cambia il codice di risposta da 404-con-body a 404 di Fastify: se un test lo asserisce, va aggiornato

---

<a id="23"></a>
## 23. Quattro blocchi try/catch "best-effort" identici in `uninstall.routes.ts`

**Categoria**: duplicazione · **Severità**: 🔵 Bassa · **LOC**: ~28 · **Effort**: S

**Posizione**: `plugin/routes/lifecycle/uninstall.routes.ts:112-148` (+ `:89-102`)

Quattro blocchi con la stessa forma, ripetuti per `dropPluginRole`, `removeContainer`, `deleteConsumerGroup`, `resetBreaker`. L'idioma `err instanceof Error ? err.message : String(err)` compare 6 volte nei moduli.

**Vantaggi**
- Formato di log uniforme, filtrabile in Loki
- Rende ovvia l'intenzione "questo passo può fallire senza abortire l'uninstall"
- `uninstall.routes.ts` è a 154 righe: il refactor aiuta anche il rispetto della Rule 4

**Svantaggi / rischi**
- Un helper `bestEffort` è facile da abusare: rischia di diventare il modo standard per ignorare errori ovunque

---

<a id="24"></a>
## 24. Wrapper pass-through senza valore aggiunto

**Categoria**: over-engineering · **Severità**: 🔵 Bassa · **LOC**: ~50 · **Effort**: S

**Posizione**: `lib/tenant-database.ts:93-97` → `withCoreDb` = `return fn(coreDb)`, **34 call site**. Più `workspace-member/service.ts:25-31`, `user-management/service.ts:41-47`, `audit-log/service.ts:12-17`, `tenant-settings/service.ts:25-27`, `plugin/index.ts:46-48`.

Caso peggiore: `admin/routes/logs.routes.ts:41` fa `withCoreDb((prisma) => queryLogs(prisma, options))` dove `queryLogs` dichiara il parametro come `_prisma` **inutilizzato** (`logs-query.service.ts:62`), con un commento che ammette *"accepted for signature symmetry"*.

**Vantaggi**
- Meno indirezione: si vede subito che si sta usando il pool condiviso
- Rimuove parametri fittizi che confondono su cosa serva davvero a una funzione

**Svantaggi / rischi**
- `withCoreDb` è un punto di estensione plausibile (retry, metriche, read-replica): eliminarlo lo rende costoso da reintrodurre su 34 call site
- I wrapper nei service mantengono la stratificazione route→service→repository: bypassarli invita le route a chiamare le repository direttamente
- **Raccomandazione**: rimuovere solo `_prisma` da `queryLogs` e i wrapper con parametri inutilizzati; **lasciare `withCoreDb`**

---

<a id="25"></a>
## 25. `requireSuperAdmin` applicato due volte su 12 file di route

**Categoria**: duplicazione · **Severità**: 🔵 Bassa · **LOC**: ~40 · **Effort**: S

**Posizione**: `admin/index.ts:42` (hook di scope) + `preHandler: [requireSuperAdmin]` in 13 route su 12 file. `health.routes.ts:16` è l'unico coerente: si affida allo scope.

**Vantaggi**
- Meno rumore; `middleware/require-super-admin.ts:17-33` fa solo check in memoria, eseguirlo due volte non serve
- Elimina il rischio che qualcuno aggiunga una route dimenticando il preHandler e creda erroneamente di essere scoperto

**Svantaggi / rischi**
- **Riduce genuinamente la difesa in profondità**: se qualcuno rimuove l'hook di scope in `index.ts`, tutte le route admin diventano aperte in un colpo solo
- Data la criticità (endpoint super-admin), il trade-off potrebbe non valere il risparmio. **Raccomandazione**: mantenere la ridondanza, rimuovere solo la duplicazione dei 12 blocchi di commento identici

---

<a id="26"></a>
## 26. Transazioni Prisma superflue su query di sola lettura

**Categoria**: performance / type safety · **Severità**: 🔵 Bassa · **LOC**: ~12 · **Effort**: S

**Posizione**: `plugin/routes/dlq.routes.ts:35-57` · `marketplace.routes.ts:155-179` · `admin-catalog.routes.ts:80-90`

Un `findMany` + `count` in `Promise.all` non trae beneficio da una transazione esplicita (aggiunge BEGIN/COMMIT), e il `Promise.all` dentro `$transaction` interattiva viene comunque serializzato sulla stessa connessione. Il `(prisma as any)` maschera il fatto che il tipo non torna. Confronto: `admin/services/tenant-list.service.ts:47-56` fa la stessa cosa correttamente senza transazione.

**Vantaggi**: un round-trip in meno per lista; nessun lock acquisito; rimuove 3 `as any`.

**Svantaggi / rischi**
- Perdita della consistenza snapshot tra `findMany` e `count`: il `total` può divergere dalla pagina con scritture concorrenti. Trascurabile per una UI paginata, ma va accettato consapevolmente
- `admin-catalog.routes.ts:82` usa la transazione per prevenire un TOCTOU su `validateManifest`+`createPlugin`: **quella va tenuta**

---

<a id="27"></a>
## 27. Costanti e helper duplicati tra `workspace/service.ts` e `service-archive.ts`

**Categoria**: duplicazione · **Severità**: 🔵 Bassa · **LOC**: ~6 · **Effort**: S

**Posizione**: `MAX_DEPTH = 10` in `workspace/service.ts:32` e `service-archive.ts:28`; `pathDepth()` in `:34-36` e `:30-32` (corpo identico).

Lo split del modulo è stato fatto per rispettare la Rule 4, e **ha prodotto duplicazione** — `workspace/service.ts` è comunque a esattamente 200 righe.

**Vantaggi**: `MAX_DEPTH` non può più divergere tra creazione e reparent (oggi entrambe valgono 10 per coincidenza mantenuta a mano).
**Svantaggi / rischi**: nessuno rilevante.

---

<a id="28"></a>
## 28. Rule 4: nessuna violazione, ma 3 file al limite esatto

**Categoria**: costituzione (rischio imminente) · **Severità**: 🔵 Bassa · **LOC**: 0 · **Effort**: —

| File | LOC |
| ---- | --: |
| `workspace/service.ts` | **200** |
| `workspace/routes.ts` | **200** |
| `plugin/services/container-manager.service.ts` | **200** |
| `plugin/services/health-check.service.ts` | 198 |
| `plugin/routes/marketplace.routes.ts` | 198 |
| `workspace/repository.ts` | 195 |

Verificato su tutti i 158 file: **nessuno supera 200 righe**. Tre sono però esattamente al limite: qualunque aggiunta li rende non conformi, il che spiega gli split artificiali già presenti (`service-archive.ts`, `service-accept.ts`, `service-remove.ts`, `service-branding.ts`) che hanno generato la duplicazione del [#27](#27).

**Proposta**: i findings [#4](#4), [#5](#5) e [#24](#24) riducono naturalmente questi file sotto soglia (es. `workspace/routes.ts` scende a ~160 con `parseOrThrow`). Non serve un intervento dedicato.

**Svantaggi / rischi**: il conteggio a 200 include commenti e import — la metrica premia file densi e poco documentati. Vale la pena valutare se contare solo le righe di codice.

---

## Tabella riepilogativa

| # | Finding | Categoria | Severità | LOC | Effort |
| -: | ------- | --------- | -------- | --: | :----: |
| [1](#1) | `writeAuditLog` su client disconnesso | correttezza | 🔴 Critica | 0 | M |
| [2](#2) | `withTenantDb` = 1 PrismaClient per chiamata (53 siti) | performance | 🔴 Critica | ~40 | L |
| [3](#3) | `reactivateTenant` ritorna `status` errato | correttezza | 🟠 Alta | 0 | S |
| [4](#4) | Boilerplate Zod ×38 + filtri ×8 | duplicazione | 🟠 Alta | ~110 | M |
| [5](#5) | Type erasure `db as any` (5 helper, 45 disable) | type safety | 🟠 Alta | ~95 | L |
| [6](#6) | 37 export morti + `optimistic-lock.ts` inutilizzato | codice morto | 🟠 Alta | ~230 | S |
| [7](#7) | `visibility.routes` doppia connessione + N ABAC seriali | performance | 🟠 Alta | ~15 | M |
| [8](#8) | `suspend`/`reactivate` route+service duplicati | duplicazione | 🟡 Media | ~90 | M |
| [9](#9) | 3 convenzioni di paginazione divergenti | duplicazione | 🟡 Media | ~45 | L |
| [10](#10) | `readStream` duplicato integralmente | duplicazione | 🟡 Media | ~15 | S |
| [11](#11) | `AVATAR_ALLOWED_MIME_TYPES` ×3 + doppia validazione | duplicazione | 🟡 Media | ~6 | S |
| [12](#12) | 5 probe di health quasi identici | duplicazione | 🟡 Media | ~55 | S |
| [13](#13) | `SLUG_REGEX` ×6, `SCHEMA_NAME_REGEX` ×5 (2 varianti) | duplicazione | 🟡 Media | ~12 | S |
| [14](#14) | N+1 purga GDPR audit log | performance | 🟡 Media | ~5 | M |
| [15](#15) | `PluginRecord` manuale + 5 `as unknown as` | type safety | 🟡 Media | ~22 | M |
| [16](#16) | Mapper identità in 3 service admin | over-engineering | 🟡 Media | ~25 | S |
| [17](#17) | `upsertBranding`/`updateLogoPath` duplicati + race | duplicazione | 🟡 Media | ~30 | M |
| [18](#18) | `resendInvitation`: 4 query invece di 2 | performance | 🟡 Media | ~14 | S |
| [19](#19) | `updateMaterializedPaths`: 1 UPDATE per riga | performance | 🟡 Media | ~8 | M |
| [20](#20) | Query senza `select` mirato | performance | 🟡 Media | 0 | M |
| [21](#21) | `WorkspaceMemberDto` ×2 divergenti, `WorkspaceRole` ×3 | type safety | 🟡 Media | ~30 | M |
| [22](#22) | `dev.routes`: tipo anonimo ×3 + registry duplicato | duplicazione | 🟡 Media | ~35 | S |
| [23](#23) | 4 blocchi best-effort try/catch identici | duplicazione | 🔵 Bassa | ~28 | S |
| [24](#24) | Wrapper pass-through (`withCoreDb`, `_prisma`, …) | over-engineering | 🔵 Bassa | ~50 | S |
| [25](#25) | `requireSuperAdmin` doppio su 12 file | duplicazione | 🔵 Bassa | ~40 | S |
| [26](#26) | `$transaction` superflua su liste read-only | performance | 🔵 Bassa | ~12 | S |
| [27](#27) | `MAX_DEPTH`/`pathDepth` duplicati | duplicazione | 🔵 Bassa | ~6 | S |
| [28](#28) | 3 file esattamente a 200 LOC | costituzione | 🔵 Bassa | 0 | — |
| | **TOTALE** | | | **~1.018 (7,8 %)** | |

## Sequenza consigliata per quest'area

1. **Correttezza, prima di ogni refactor** — [#1](#1), [#3](#3). Sono bug attivi. Il [#1](#1) in particolare significa che parte dell'audit trail oggi non viene scritta, il che invalida i test E2E che vi si appoggiano.
2. **Guadagni netti a rischio basso** — [#6](#6), [#10](#10), [#11](#11), [#12](#12), [#13](#13), [#16](#16), [#23](#23), [#24](#24), [#27](#27): ~450 LOC, effort S, nessun cambio di contratto API.
3. **Type safety** — [#5](#5), [#15](#15), [#21](#21). Abilita tutto il resto: senza rimuovere `db as any`, il [#20](#20) non è verificabile a compile-time e diventa pericoloso.
4. **Strutturali con ADR** — [#2](#2), [#9](#9), [#17](#17). Cambiano infrastruttura o contratto API; richiedono coordinamento con `apps/web` e `apps/admin`.

Il [#2](#2) è di gran lunga il finding più impattante sul runtime, ma anche l'unico che richiede una decisione architetturale formale: **non va affrontato insieme agli altri**.

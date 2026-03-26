# Plexica v2 — Comparazione Tecnologica Backend

> Analisi comparativa tra Rust e TypeScript per il core backend della
> piattaforma, e progettazione dell'architettura plugin poliglotta che
> consente ai plugin di avere backend in linguaggi diversi (TypeScript,
> Rust, Python, e altri).
>
> Questo documento integra 02-ARCHITETTURA.md e non lo sostituisce.
> Le decisioni qui contenute aggiornano la sezione 5 (Backend) e la
> sezione 7 (Sistema Plugin) del documento architetturale.

**Data**: 26 Marzo 2026
**Stato**: Draft — Base per riscrittura
**Versione**: 1.0-draft

---

## Indice

1. [Contesto e Motivazione](#1-contesto-e-motivazione)
2. [Core Backend: Rust vs TypeScript](#2-core-backend-rust-vs-typescript)
3. [Architettura Plugin Poliglotta](#3-architettura-plugin-poliglotta)
4. [Contratto Plugin Backend](#4-contratto-plugin-backend)
5. [SDK Multi-Linguaggio](#5-sdk-multi-linguaggio)
6. [Comunicazione Eventi in Contesto Poliglotta](#6-comunicazione-eventi-in-contesto-poliglotta)
7. [Accesso Dati Plugin in Contesto Poliglotta](#7-accesso-dati-plugin-in-contesto-poliglotta)
8. [Impatto sulla Developer Experience](#8-impatto-sulla-developer-experience)
9. [Impatto su Infrastruttura e Deployment](#9-impatto-su-infrastruttura-e-deployment)
10. [Approccio Ibrido: TypeScript Core + Servizi Rust](#10-approccio-ibrido-typescript-core--servizi-rust)
11. [Raccomandazione](#11-raccomandazione)
12. [Impatto sugli Altri Documenti](#12-impatto-sugli-altri-documenti)

---

## 1. Contesto e Motivazione

### 1.1 Situazione Attuale

Il documento 02-ARCHITETTURA conferma TypeScript con Fastify come
stack per il core backend. Questa scelta deriva dalla v1 ed e motivata
da: ecosistema maturo, type-safety, competenze team, condivisione
linguaggio con il frontend.

Emergono pero due domande:

1. **Il core backend beneficerebbe di Rust?** — Rust offre performance
   superiori, memory safety senza garbage collector, e un modello di
   concorrenza piu rigoroso. Per una piattaforma enterprise multi-tenant,
   questi vantaggi sono significativi?

2. **I plugin backend devono essere solo TypeScript?** — Se un'azienda
   che usa Plexica ha competenze Rust, Python o Go, dovrebbe essere
   costretta a scrivere il backend del suo plugin in TypeScript?

### 1.2 Vincoli del Contesto Plexica

Prima dell'analisi, e importante chiarire il profilo di carico del
core backend Plexica:

| Caratteristica | Dettaglio |
|---------------|----------|
| **Tipo di carico** | I/O bound: il backend passa la maggior parte del tempo in attesa di PostgreSQL, Keycloak, Redis, Kafka |
| **CPU-intensive** | Quasi nulla: nessuna elaborazione immagini, ML, crittografia pesante, o calcolo scientifico nel core |
| **Concorrenza** | Medio-alta: centinaia di richieste concorrenti per tenant, ma Node.js gestisce I/O concorrente nativamente con event loop |
| **Latenza target** | P95 < 200ms — raggiungibile con entrambi i linguaggi per workload I/O bound |
| **Complessita dominio** | Alta: multi-tenancy, ABAC, plugin lifecycle, event emission, schema management |
| **Velocita di sviluppo** | Critica: la riscrittura ha budget 5-7 mesi per feature parity completa |
| **Team** | Competenze attuali TypeScript/JavaScript |

---

## 2. Core Backend: Rust vs TypeScript

### 2.1 Confronto su 12 Dimensioni

#### Performance

| Aspetto | TypeScript (Node.js) | Rust (Axum/Actix) |
|---------|---------------------|-------------------|
| Throughput HTTP | ~30.000-50.000 req/s (Fastify) | ~100.000-200.000 req/s (Axum) |
| Latenza I/O bound | Dipende dal DB/Keycloak/Redis — identica per entrambi | Identica per entrambi — il collo di bottiglia e il servizio esterno |
| Memoria | ~100-300 MB per processo Node.js | ~10-50 MB per processo |
| Startup time | ~1-3 secondi | ~50-200 millisecondi |
| GC pauses | Presenti ma trascurabili per I/O bound (<10ms) | Assenti — nessun garbage collector |

**Verdetto**: Rust e piu performante in termini assoluti. Ma per il
profilo di carico Plexica (I/O bound), la differenza e trascurabile.
Il collo di bottiglia e sempre la latenza verso PostgreSQL (1-10ms),
Keycloak (5-50ms), Redis (0.5-2ms), Kafka (1-5ms). Che il framework
HTTP risponda in 0.1ms (Rust) o 0.5ms (Fastify) non cambia la latenza
complessiva percepita dall'utente.

La performance diventa un vantaggio reale di Rust solo con:
- Migliaia di tenant concorrenti (riduzione costi infrastruttura per consumo RAM)
- Workload CPU-intensive (che Plexica non ha nel core)
- Requisiti di latenza sub-millisecondo (non richiesti)

#### Type Safety e Correttezza

| Aspetto | TypeScript | Rust |
|---------|-----------|------|
| Type system | Strutturale, opzionale (`any` possibile), erased at runtime | Algebraico, obbligatorio, enforced a compile time |
| Null safety | `strictNullChecks` — buono ma aggirabile | `Option<T>` — impossibile dimenticare il caso null |
| Error handling | `try/catch` — errori non tipati, facile dimenticare un catch | `Result<T, E>` — il compilatore forza la gestione di ogni errore |
| Data races | Possibili con shared mutable state (raro in Node.js single-thread) | Impossibili — borrow checker a compile time |
| Runtime crashes | Possibili: undefined, null, type coercion | Quasi impossibili: `panic!` solo per bug logici |

**Verdetto**: Rust ha un sistema di tipi superiore a TypeScript.
Il compilatore Rust cattura a compile time errori che in TypeScript
emergono solo a runtime (o mai, se il test non li copre). Per una
piattaforma multi-tenant dove un bug di null reference puo esporre
dati cross-tenant, questa garanzia ha valore reale.

Tuttavia, TypeScript con `strict: true`, Zod per la validazione input,
e Prisma per le query tipate offre un livello di sicurezza adeguato
per il dominio SaaS — non perfetto come Rust, ma sufficiente.

#### Ecosistema per SaaS Multi-Tenant

| Aspetto | TypeScript | Rust |
|---------|-----------|------|
| ORM maturo | Prisma — eccellente, type-safe, migrazioni gestite | Diesel (maturo ma verboso), SeaORM (piu giovane), sqlx (raw queries tipate) |
| Keycloak SDK | `@keycloak/keycloak-admin-client` — ufficiale | Nessun SDK ufficiale. Esistono crate community (`keycloak`, `openidconnect`) ma meno maturi |
| Kafka client | KafkaJS — maturo, puro JavaScript | `rdkafka` (binding C librdkafka) — molto performante ma binding FFI |
| Redis client | ioredis — maturo, feature-complete | `redis-rs` — maturo, buono |
| Validazione input | Zod — eccellente DX, composabile | `serde` + `validator` — funzionale ma piu verboso |
| Rate limiting | `@fastify/rate-limit` — plug-and-play | Implementazione manuale o crate meno mature (`governor`, `tower::limit`) |
| Middleware pattern | Fastify plugin system — maturo | Axum extractors + Tower middleware — potente ma curva di apprendimento |
| Testing | Vitest — veloce, ottima DX | `cargo test` — buono ma test asincroni piu complessi da scrivere |
| Monitoring | `prom-client`, `pino` — standard | `metrics`, `tracing` — eccellenti, probabilmente superiori a Node.js |

**Verdetto**: L'ecosistema TypeScript per SaaS backend e significativamente
piu maturo. Prisma non ha equivalenti in Rust per DX. L'SDK Keycloak
ufficiale e solo JavaScript/TypeScript. Ricostruire queste integrazioni
in Rust richiede settimane di lavoro aggiuntivo.

L'ecosistema Rust per observability (tracing, metrics) e superiore a
quello Node.js. Per il resto, TypeScript ha librerie piu mature e
meglio mantenute per il dominio SaaS.

#### Velocita di Sviluppo

| Aspetto | TypeScript | Rust |
|---------|-----------|------|
| Tempo per un endpoint CRUD completo | ~30 minuti (con Prisma + Zod + Fastify) | ~2-4 ore (con Diesel/SeaORM + validazione + Axum) |
| Iterazione (edit-compile-test) | ~1-2 secondi (hot reload) | ~10-60 secondi (compilazione incrementale) |
| Prototipazione | Molto veloce — linguaggio flessibile | Lento — il compilatore richiede correttezza prima di eseguire |
| Refactoring | Buono con IDE, ma errori trovati a runtime | Eccellente — il compilatore trova tutti gli errori |
| Curva di apprendimento | Bassa per chi conosce JavaScript | Alta — borrow checker, lifetime, trait system |

**Verdetto**: TypeScript e significativamente piu veloce per lo
sviluppo di applicazioni SaaS. Per una riscrittura con budget 5-7
mesi, questa differenza e critica.

La stima di velocita di sviluppo suggerisce che lo stesso backend
richiederebbe circa il doppio del tempo in Rust rispetto a TypeScript,
specialmente per le parti di integrazione (Keycloak, schema-per-tenant,
ABAC) dove le librerie TypeScript sono piu mature.

#### Gestione Multi-Tenancy (Schema-per-Tenant)

| Aspetto | TypeScript | Rust |
|---------|-----------|------|
| `SET search_path` dinamico | Prisma `$executeRaw` o middleware Fastify | `sqlx` raw query o middleware Axum — equivalente |
| AsyncLocalStorage per tenant context | Pattern nativo Node.js — elegante e testato | `tokio::task_local!` — equivalente, meno documentato |
| Connection pooling | Prisma gestisce il pool | `sqlx::PgPool` o `deadpool-postgres` — equivalente |
| Schema migration utility | Prisma Migrate — gestione automatica | `refinery` o `sqlx-migrate` — funzionali ma meno integrati |

**Verdetto**: entrambi i linguaggi gestiscono schema-per-tenant in
modo equivalente. La differenza e nella maturita del tooling: Prisma
rende le migrazioni quasi automatiche, mentre in Rust servono piu
componenti separati da integrare.

#### Concorrenza e Affidabilita

| Aspetto | TypeScript | Rust |
|---------|-----------|------|
| Modello | Single-thread event loop + worker threads | Multi-thread con async runtime (Tokio) |
| Deadlock | Impossibili in single-thread | Possibili ma rari con async Rust |
| Memory leak | Possibili (closure, event emitter) | Molto rari — ownership previene la maggior parte |
| Crash recovery | `uncaughtException` handler — graceful shutdown possibile | `panic` + `catch_unwind` — piu controllabile |
| Stabilita lungo termine | Processo Node.js stabile per mesi (con attenzione a memory leak) | Processo Rust stabile per mesi (memory leaks quasi impossibili) |

**Verdetto**: Rust e oggettivamente piu affidabile per servizi
long-running. La garanzia di assenza di memory leak e un vantaggio
reale per un servizio multi-tenant che gestisce centinaia di connessioni.
Node.js e sufficientemente stabile ma richiede piu attenzione alla
gestione della memoria.

#### Hiring e Team

| Aspetto | TypeScript | Rust |
|---------|-----------|------|
| Pool di sviluppatori | Molto ampio — uno dei linguaggi piu diffusi | Ristretto — Rust e di nicchia, crescita rapida ma pool piccolo |
| Costo medio sviluppatore | Mercato competitivo, tariffe standard | Premium — gli sviluppatori Rust costano di piu |
| Onboarding | 1-2 settimane per uno sviluppatore JavaScript | 2-6 mesi per uno sviluppatore senza esperienza Rust |
| Full-stack | Stesso linguaggio frontend + backend | Linguaggi diversi — team separati o competenze doppie |

**Verdetto**: per il contesto Plexica (riscrittura con team esistente
TypeScript), passare a Rust per il core significherebbe un
investimento significativo in formazione o assunzione. Il vantaggio
di avere lo stesso linguaggio su frontend e backend (TypeScript)
e reale: tipi condivisi, refactoring cross-stack, team unico.

#### Deployment e Operazioni

| Aspetto | TypeScript | Rust |
|---------|-----------|------|
| Artifact | `node_modules` + codice transpilato (~100-500 MB) | Binary statico (~10-30 MB) |
| Container image | `node:20-slim` (~200 MB) | `scratch` o `distroless` (~5-15 MB) |
| Startup | 1-3 secondi | 50-200 millisecondi |
| Risorse in produzione | ~100-300 MB RAM per processo | ~10-50 MB RAM per processo |
| Scaling orizzontale | Piu istanze necessarie per saturare CPU | Meno istanze necessarie — piu efficiente per istanza |

**Verdetto**: Rust ha un vantaggio operativo chiaro: container piu
piccoli, meno RAM, startup piu veloce, meno istanze necessarie.
Per una piattaforma con decine di tenant, questo si traduce in costi
infrastrutturali inferiori. Il vantaggio diventa significativo a scale
di centinaia di tenant concorrenti.

### 2.2 Tabella Riassuntiva

| Dimensione | TypeScript | Rust | Importanza per Plexica |
|-----------|-----------|------|----------------------|
| Performance (I/O bound) | Adeguata | Superiore ma margine irrilevante per I/O | Bassa — collo di bottiglia e il DB |
| Type safety | Buona (strict + Zod + Prisma) | Eccellente (compile-time) | Media — Zod + Prisma compensano |
| Ecosistema SaaS | Eccellente (Prisma, Keycloak SDK) | Incompleto (no Prisma, no Keycloak SDK) | Alta — ricostruire richiede mesi |
| Velocita sviluppo | Alta | Media-bassa | Critica — budget 5-7 mesi |
| Multi-tenancy tooling | Prisma eccellente | sqlx/SeaORM funzionali | Alta |
| Affidabilita | Buona | Eccellente | Media |
| Hiring | Facile | Difficile | Alta |
| Costi operativi | Piu alti (piu RAM, piu istanze) | Piu bassi | Bassa a scala attuale |
| Full-stack story | Stesso linguaggio FE+BE | Linguaggi diversi | Media |
| Observability | Buona (Pino, prom-client) | Eccellente (tracing, metrics) | Bassa |
| Error handling | Adeguato (try/catch) | Superiore (Result<T,E>) | Media |
| Deployment | Container grandi, startup lento | Container piccoli, startup istantaneo | Bassa |

### 2.3 Valutazione Complessiva per il Core

Rust e un linguaggio tecnicamente superiore a TypeScript su molte
dimensioni: performance, type safety, error handling, affidabilita,
efficienza operativa. In un progetto greenfield senza vincoli di
tempo e team, Rust sarebbe una scelta difendibile per il core backend
di una piattaforma multi-tenant enterprise.

Tuttavia, nel contesto specifico di Plexica v2:

- Il carico e **I/O bound** — il vantaggio di performance di Rust e
  marginale quando il 90% del tempo e speso in attesa di DB/Keycloak/Redis
- L'ecosistema SaaS TypeScript e **significativamente piu maturo** —
  Prisma non ha equivalenti, Keycloak SDK ufficiale e solo TS/JS
- Il budget temporale e **vincolato** — 5-7 mesi per feature parity
  completa. Rust richiederebbe circa il doppio
- Il team ha **competenze TypeScript** — la curva di apprendimento
  Rust e di mesi, non settimane
- La condivisione **frontend-backend** dello stesso linguaggio ha
  valore reale per tipi condivisi e team unificato

---

## 3. Architettura Plugin Poliglotta

### 3.1 Il Principio

Il core backend rimane in TypeScript. Ma i **plugin backend possono
essere scritti in qualsiasi linguaggio**.

Questo e gia implicito nell'architettura proxy descritta in
02-ARCHITETTURA (sezione 11.3): il core inoltra le richieste al
plugin backend via HTTP. Se la comunicazione e HTTP, il linguaggio
del plugin backend e irrilevante.

La v2 rende questo principio **esplicito e supportato** con:
- Contratto API documentato (OpenAPI)
- Protocollo eventi standard (Kafka)
- SDK per i linguaggi piu comuni (TypeScript, Rust, Python)
- Template e CLI per scaffolding in ogni linguaggio supportato
- Documentazione per aggiungere supporto a nuovi linguaggi

### 3.2 Perche Plugin Poliglotti

| Motivazione | Dettaglio |
|-------------|----------|
| **Competenze dei clienti** | Un'azienda con team Python non dovrebbe essere costretta a imparare TypeScript per scrivere un plugin |
| **Requisiti tecnici** | Un plugin di image processing potrebbe beneficiare di Rust; un plugin di ML potrebbe richiedere Python |
| **Ecosistema** | Alcune librerie esistono solo in certi linguaggi (librerie scientifiche Python, librerie di sistema Rust) |
| **Adozione** | Piu linguaggi supportati = piu potenziali sviluppatori di plugin = marketplace piu ricco |
| **Separazione** | Il plugin backend e gia un servizio HTTP separato — non c'e ragione tecnica per vincolare il linguaggio |

### 3.3 Architettura

Il modello di comunicazione tra core e plugin backend e basato su
due protocolli standard:

| Canale | Protocollo | Direzione | Scopo |
|--------|-----------|-----------|-------|
| **API** | HTTP REST (JSON) | Bidirezionale (core ↔ plugin) | Operazioni sincrone: CRUD, query, configurazione |
| **Eventi** | Kafka (JSON) | Core → Plugin, Plugin → Plugin | Operazioni asincrone: reazioni a eventi, side effects |

Entrambi i protocolli sono language-agnostic per design.

### 3.4 Flusso di una Richiesta a Plugin Backend

1. Il frontend chiama `POST /api/v1/plugins/crm/contacts`
2. Il core API riceve la richiesta, autentica l'utente (JWT Keycloak)
3. Il core verifica che il plugin `crm` sia installato e attivo per il tenant
4. Il core aggiunge header di contesto:
   - `X-Plexica-Tenant-Id` — ID del tenant
   - `X-Plexica-Tenant-Slug` — slug del tenant (per schema DB)
   - `X-Plexica-User-Id` — ID dell'utente autenticato
   - `X-Plexica-User-Roles` — ruoli dell'utente (JSON)
   - `X-Plexica-Workspace-Id` — workspace corrente (se applicabile)
   - `X-Plexica-Request-Id` — correlation ID per tracing
5. Il core inoltra la richiesta al plugin backend (HTTP proxy)
6. Il plugin backend processa la richiesta nel linguaggio che preferisce
7. Il plugin backend accede alle proprie tabelle nello schema tenant
8. La risposta torna al core, che la inoltra al frontend

Il plugin backend non gestisce autenticazione, tenant resolution, o
ABAC — tutto questo e responsabilita del core. Il plugin riceve
solo richieste gia autenticate e autorizzate con il contesto completo.

### 3.5 Vincoli del Plugin Backend

Indipendentemente dal linguaggio, ogni plugin backend deve:

| Vincolo | Motivazione |
|---------|-------------|
| Esporre un servizio HTTP | Protocollo di comunicazione con il core |
| Rispettare il contratto API (sezione 4) | Interoperabilita e health check |
| Accettare gli header `X-Plexica-*` | Contesto tenant e utente |
| Accedere solo alle proprie tabelle nello schema tenant | Isolamento dati |
| Usare il protocollo Kafka per gli eventi | Comunicazione asincrona |
| Esporre un endpoint health check | Monitoraggio da parte del core |
| Rispondere in JSON | Formato standard di scambio dati |

---

## 4. Contratto Plugin Backend

### 4.1 Registrazione

Il plugin dichiara il suo backend nel manifest:

**Campi rilevanti del manifest**:
- `backend.url` — URL base del servizio backend del plugin (es: `http://plugin-crm:3001`)
- `backend.healthPath` — path per health check (default: `/health`)
- `backend.routes[]` — elenco dei path esposti (es: `/contacts`, `/deals`)

In ambiente di sviluppo locale, il plugin backend gira su un
porto locale (es: `localhost:3001`) e il core lo raggiunge direttamente.
In produzione, il plugin backend e un servizio nel cluster (Docker
Compose service o Kubernetes pod).

### 4.2 Endpoint Obbligatori

Ogni plugin backend, in qualsiasi linguaggio, deve esporre:

| Endpoint | Metodo | Scopo |
|----------|--------|-------|
| `{healthPath}` | GET | Health check. Risponde 200 con `{ "status": "ok" }` |
| `{healthPath}/ready` | GET | Readiness check. Risponde 200 quando il plugin e pronto a ricevere richieste |

### 4.3 Formato Risposta Standard

Tutte le risposte del plugin backend seguono il formato standard
Plexica per garantire coerenza nel frontend:

**Successo**:
- Risposta diretta con il payload JSON
- Header `Content-Type: application/json`
- Status code HTTP appropriato (200, 201, 204)

**Errore**:
- Campo `error` con `code` (stringa), `message` (stringa), `details` (opzionale)
- Status code HTTP appropriato (400, 404, 500)

**Paginazione** (per endpoint lista):
- Campi `data` (array), `total` (numero), `page` (numero), `pageSize` (numero)
- Query params `page` e `pageSize` supportati

### 4.4 Specifica OpenAPI

Il core genera una specifica OpenAPI per le API di contesto disponibili
ai plugin. Il plugin puo (opzionalmente) fornire la propria specifica
OpenAPI per i suoi endpoint.

Questa specifica serve a:
- Documentare il contratto tra core e plugin
- Generare client tipati automaticamente per ogni linguaggio
- Validare che il plugin rispetti il contratto

---

## 5. SDK Multi-Linguaggio

### 5.1 Strategia

L'SDK plugin non e un monolite. E una raccolta di librerie leggere,
una per linguaggio, che incapsulano:

- Parsing degli header `X-Plexica-*` per ottenere il contesto
- Client HTTP per chiamare le API core
- Client Kafka per sottoscrivere e emettere eventi
- Client PostgreSQL pre-configurato per accedere allo schema tenant
- Helper per health check e readiness

Ogni SDK e specifico per il linguaggio e segue le convenzioni e
l'ecosistema di quel linguaggio. Non e un wrapper generico — e una
libreria nativa.

### 5.2 SDK TypeScript (`@plexica/plugin-sdk`)

Linguaggio primario. SDK piu completo e mantenuto in linea col core.

| Componente | Tecnologia | Descrizione |
|-----------|-----------|-------------|
| Context | Header parsing | Estrae tenant, user, workspace dagli header |
| API Client | Axios/fetch | Chiama API core con auth automatica |
| Event Client | KafkaJS | `onEvent()` e `emitEvent()` |
| Database | Prisma | Client Prisma pre-configurato per lo schema tenant |
| Config | Built-in | `getConfig()` per configurazione per-tenant |

L'SDK TypeScript e quello descritto in 02-ARCHITETTURA sezione 7.8.
E il reference implementation per gli altri linguaggi.

### 5.3 SDK Rust (`plexica-plugin-sdk`)

Crate Rust pubblicato su crates.io.

| Componente | Tecnologia | Descrizione |
|-----------|-----------|-------------|
| Context | Axum/Actix extractor | Estrae contesto dagli header come extractor tipato |
| API Client | reqwest | Chiama API core con auth automatica |
| Event Client | rdkafka | `on_event()` e `emit_event()` con async/await |
| Database | sqlx | Connection pool pre-configurato per lo schema tenant, query tipate |
| Config | Built-in | `get_config()` per configurazione per-tenant |

**Vantaggi specifici di un plugin backend Rust**:
- Performance per operazioni CPU-intensive (image processing, parsing, trasformazioni dati)
- Bassissimo consumo di memoria — ideale per plugin che devono scalare
- Binary statico — deployment semplificato (container da 5 MB)
- Affidabilita — nessun crash per null reference o memory leak

**Quando scegliere Rust per un plugin**:
- Il plugin fa elaborazione pesante (immagini, video, dati)
- Il plugin deve gestire un volume altissimo di eventi Kafka
- Il team ha competenze Rust
- Il plugin e un servizio critico che richiede affidabilita massima

### 5.4 SDK Python (`plexica-plugin-sdk`)

Package Python pubblicato su PyPI.

| Componente | Tecnologia | Descrizione |
|-----------|-----------|-------------|
| Context | Middleware (FastAPI/Flask) | Estrae contesto dagli header come dependency injection |
| API Client | httpx | Chiama API core con auth automatica (async) |
| Event Client | confluent-kafka o aiokafka | `on_event()` e `emit_event()` |
| Database | SQLAlchemy o asyncpg | Connection pool pre-configurato per lo schema tenant |
| Config | Built-in | `get_config()` per configurazione per-tenant |

**Vantaggi specifici di un plugin backend Python**:
- Ecosistema ML/AI (PyTorch, scikit-learn, pandas) — impossibile da replicare in altri linguaggi
- Ecosistema data science e analytics
- Pool di sviluppatori enorme
- Velocita di prototipazione
- Librerie per integrazioni specifiche (Salesforce, SAP, ERP)

**Quando scegliere Python per un plugin**:
- Il plugin integra modelli ML/AI
- Il plugin fa data analytics pesante
- Il plugin si integra con sistemi che hanno SDK solo Python
- Il team ha competenze Python

### 5.5 Supporto per Altri Linguaggi

L'architettura non limita i linguaggi a TypeScript, Rust e Python.
Qualsiasi linguaggio che supporta HTTP server, client Kafka e driver
PostgreSQL puo essere usato.

Per linguaggi senza SDK ufficiale, lo sviluppatore:
1. Implementa un servizio HTTP che rispetta il contratto (sezione 4)
2. Parsa gli header `X-Plexica-*` manualmente
3. Usa un client Kafka nativo del linguaggio
4. Si connette a PostgreSQL con il driver del linguaggio, usando lo schema tenant

La barriera d'ingresso senza SDK e piu alta ma non proibitiva.
I protocolli (HTTP, Kafka, PostgreSQL) sono standard e hanno
client in qualsiasi linguaggio mainstream.

**Linguaggi potenzialmente supportabili in futuro**:

| Linguaggio | Caso d'uso | Ecosistema SDK |
|-----------|-----------|----------------|
| Go | Plugin ad alta concorrenza, infrastruttura | Kafka (confluent-kafka-go), PostgreSQL (pgx), HTTP (net/http) — tutto maturo |
| Java/Kotlin | Integrazioni enterprise (SAP, Oracle) | Kafka (client ufficiale), PostgreSQL (JDBC), HTTP (OkHttp) — ecosistema eccellente |
| C# (.NET) | Integrazioni Microsoft (Azure, Dynamics) | Kafka (confluent-dotnet), PostgreSQL (Npgsql), HTTP (HttpClient) — maturo |

L'aggiunta di un nuovo linguaggio richiede solo la creazione dell'SDK
(1-2 settimane per un SDK base) e dei template CLI.

---

## 6. Comunicazione Eventi in Contesto Poliglotta

### 6.1 Protocollo

Kafka e il protocollo eventi confermato (02-ARCHITETTURA sezione 10).
Kafka ha client nativi per tutti i linguaggi principali — il
protocollo e intrinsecamente poliglotta.

| Linguaggio | Client Kafka | Maturita |
|-----------|-------------|---------|
| TypeScript | KafkaJS | Alta — puro JS, nessuna dipendenza nativa |
| Rust | rdkafka (binding librdkafka) | Alta — molto performante, binding FFI stabile |
| Python | confluent-kafka (binding librdkafka) o aiokafka (puro Python) | Alta — entrambe le opzioni sono mature |
| Go | confluent-kafka-go | Alta |
| Java | Apache Kafka client (ufficiale) | Eccellente — reference implementation |

### 6.2 Formato Evento Standard

Indipendentemente dal linguaggio del consumer, il formato evento e
JSON con schema fisso:

**Campi obbligatori**:
- `eventType` — stringa, nome dell'evento (es: `plexica.workspace.created`)
- `tenantId` — UUID del tenant
- `entityId` — UUID dell'entita coinvolta
- `payload` — oggetto JSON con lo stato dell'entita
- `timestamp` — ISO 8601
- `correlationId` — UUID per tracing distribuito

**Campi opzionali**:
- `userId` — UUID dell'utente che ha causato l'evento
- `workspaceId` — UUID del workspace (se applicabile)
- `previousPayload` — stato precedente dell'entita (per eventi di update)

### 6.3 Serializzazione

Il payload e sempre JSON. Non si usa Avro, Protobuf o altri formati
binari per mantenere la semplicita e la debuggabilita:
- Qualsiasi linguaggio puo serializzare/deserializzare JSON
- Gli eventi sono ispezionabili con strumenti standard (kafkacat, Redpanda Console)
- La dimensione degli eventi e piccola (entita singole, non batch)

Per la validazione dello schema, si usa JSON Schema. Ogni evento ha
uno schema JSON pubblicato dal core. Gli SDK lo usano per validare
la conformita del payload.

### 6.4 Consumer Group Management

Il consumer group per un plugin e automatico:
- Nome: `plugin-{pluginId}-{tenantId}`
- Creato dall'SDK alla prima sottoscrizione
- Offset gestito automaticamente con commit dopo elaborazione

Gli SDK in ogni linguaggio incapsulano questa logica. Lo sviluppatore
plugin chiama `onEvent()` / `on_event()` e non gestisce offset,
partition assignment, o rebalancing.

---

## 7. Accesso Dati Plugin in Contesto Poliglotta

### 7.1 Il Problema

Le tabelle del plugin vivono nello schema tenant (es: `tenant_acme.crm_contacts`).
Il plugin backend deve:
1. Sapere qual e lo schema del tenant corrente
2. Impostare il `search_path` corretto
3. Eseguire query sulle proprie tabelle

### 7.2 Soluzione per Linguaggio

#### TypeScript

L'SDK fornisce un client Prisma pre-configurato:
- Il middleware dell'SDK legge `X-Plexica-Tenant-Slug` dall'header
- Esegue `SET search_path = tenant_{slug}` prima di ogni richiesta
- Il plugin usa Prisma con le proprie migrazioni come in un progetto normale

#### Rust

L'SDK fornisce un pool sqlx pre-configurato:
- L'extractor Axum/Actix legge `X-Plexica-Tenant-Slug` dall'header
- Il pool esegue `SET search_path = tenant_{slug}` per la connessione
- Il plugin usa sqlx con query tipate a compile time

#### Python

L'SDK fornisce un session SQLAlchemy pre-configurato:
- Il middleware FastAPI/Flask legge `X-Plexica-Tenant-Slug` dall'header
- La session esegue `SET search_path = tenant_{slug}` all'inizio della richiesta
- Il plugin usa SQLAlchemy o raw asyncpg come in un progetto normale

### 7.3 Migrazioni

Indipendentemente dal linguaggio del backend, le migrazioni del
plugin sono SQL (o Prisma, se il plugin e TypeScript):

- Il plugin include le proprie migrazioni nella directory `migrations/`
- Le migrazioni sono file SQL numerati (`001_create_contacts.sql`, `002_add_deals.sql`)
- Il **core** esegue le migrazioni nello schema tenant al momento dell'installazione
- Il plugin backend non gestisce mai l'esecuzione delle migrazioni — lo fa il core

Questo significa che anche un plugin Rust o Python usa migrazioni SQL
standard — non migrazioni Diesel o Alembic. Il formato SQL e
universale e il core TypeScript le esegue con la stessa utility che
gestisce le migrazioni core.

### 7.4 Convenzione Naming Tabelle

Le tabelle del plugin hanno il prefisso `{pluginId}_` per evitare
conflitti. Questa regola si applica indipendentemente dal linguaggio:
- Plugin CRM (TypeScript): `crm_contacts`, `crm_deals`
- Plugin Analytics (Python): `analytics_events`, `analytics_reports`
- Plugin ImageProcessor (Rust): `imgproc_jobs`, `imgproc_results`

---

## 8. Impatto sulla Developer Experience

### 8.1 CLI Multi-Linguaggio

La CLI `create-plexica-plugin` supporta la selezione del linguaggio:

- `npx create-plexica-plugin my-plugin --lang typescript` (default)
- `npx create-plexica-plugin my-plugin --lang rust`
- `npx create-plexica-plugin my-plugin --lang python`

Ogni template include:
- Manifest pre-compilato
- Backend scaffolding nel linguaggio scelto con SDK pre-configurato
- Health check implementato
- Dockerfile per il backend
- Test di esempio
- README con istruzioni specifiche per il linguaggio

### 8.2 Frontend Sempre React/TypeScript

Indipendentemente dal linguaggio del backend, il **frontend del plugin
e sempre React/TypeScript** caricato via Module Federation. La scelta
del linguaggio riguarda solo il backend.

Questo significa che un plugin con backend Rust ha comunque:
- Componenti React per la UI (Module Federation)
- L'SDK frontend TypeScript (`@plexica/plugin-sdk`) per il contesto
- Il Vite preset per MF auto-configurato

### 8.3 Dev Server in Contesto Poliglotta

In sviluppo locale:
- Il frontend del plugin gira su Vite dev server (come sempre)
- Il backend del plugin gira nel suo runtime:
  - TypeScript: `tsx watch` o `ts-node-dev`
  - Rust: `cargo watch -x run`
  - Python: `uvicorn --reload` (FastAPI) o `flask run --debug`
- Il Docker Compose di sviluppo puo avviare il backend del plugin
  come servizio aggiuntivo, oppure lo sviluppatore lo avvia manualmente

### 8.4 Testing Plugin Poliglotti

I test del plugin seguono le convenzioni del linguaggio:
- TypeScript: Vitest (come il core)
- Rust: cargo test
- Python: pytest

I test E2E del plugin (che verificano l'integrazione con la piattaforma)
sono sempre Playwright (browser) e usano lo stack Docker completo.
Il linguaggio del backend non cambia i test E2E.

---

## 9. Impatto su Infrastruttura e Deployment

### 9.1 Docker Compose

Ogni plugin con backend e un servizio Docker Compose aggiuntivo.
Il Dockerfile e incluso nel template generato dalla CLI:

| Linguaggio | Base Image | Dimensione | Startup |
|-----------|-----------|-----------|---------|
| TypeScript | `node:20-slim` | ~200 MB | 1-3 secondi |
| Rust | `debian:bookworm-slim` o `scratch` | ~5-30 MB | 50-200 ms |
| Python | `python:3.12-slim` | ~150 MB | 0.5-2 secondi |

### 9.2 Produzione

In produzione, ogni plugin backend e un servizio indipendente:
- Deployabile separatamente dal core
- Scalabile indipendentemente
- Monitorabile via health check dal core
- Loggabile con il `correlationId` propagato dagli header

Il core mantiene un registro dei plugin backend e i loro URL.
Il health check periodico verifica la raggiungibilita.

### 9.3 Resource Planning

Il plugin backend poliglotta ha implicazioni sulle risorse:
- Ogni plugin con backend aggiunge un processo/container
- I plugin Rust consumano meno risorse per istanza
- I plugin Python possono consumare piu risorse (GIL, GC)
- La pianificazione delle risorse deve tenere conto del numero
  e del tipo di plugin con backend

---

## 10. Approccio Ibrido: TypeScript Core + Servizi Rust

### 10.1 Scenario

Se in futuro emergono requisiti di performance nel core che TypeScript
non soddisfa, e possibile un approccio ibrido:

- Il core resta TypeScript (Fastify) per il 95% della logica
- Specifiche operazioni CPU-intensive vengono delegate a micro-servizi
  Rust interni

### 10.2 Casi d'Uso per Servizi Rust Interni

| Caso d'Uso | Perche Rust | Come si Integra |
|-----------|------------|----------------|
| Migrazione parallela di centinaia di schema | CPU + I/O misto, alta concorrenza | Servizio Rust che riceve lista schema via HTTP, esegue migrazioni in parallelo, riporta risultati |
| Validazione ABAC su alberi molto profondi | CPU-intensive per alberi con centinaia di nodi | Servizio Rust che valuta l'albero ABAC, chiamato dal middleware Node.js |
| Export dati tenant (GDPR data portability) | I/O + CPU per serializzare grandi volumi | Servizio Rust che legge lo schema e produce un file di export |
| Image processing (resize, thumbnail) | CPU-intensive | Servizio Rust che riceve immagini via HTTP e restituisce processate |

### 10.3 Pattern di Integrazione

Il servizio Rust interno segue lo stesso pattern dei plugin backend:
- HTTP per comunicazione sincrona
- Header `X-Plexica-*` per contesto
- Deploy come container Docker aggiuntivo

La differenza e che i servizi Rust interni sono gestiti dal team
Plexica (non dai plugin developer) e hanno accesso privilegiato
ai dati del core.

### 10.4 Quando Considerare Questo Approccio

Non al lancio. L'approccio ibrido si valuta quando:
- Il profiling dimostra un collo di bottiglia CPU nel core
- Il numero di tenant supera le centinaia e il costo infrastruttura Node.js diventa significativo
- Emerge un requisito CPU-intensive nel core (image processing, report generation)

L'architettura a servizi HTTP rende questa migrazione incrementale
e non disruptiva: si estrae una funzione dal core TypeScript, la
si riscrive in Rust come servizio separato, e si sostituisce la
chiamata interna con una chiamata HTTP.

---

## 11. Raccomandazione

### 11.1 Core Backend: TypeScript Confermato

**Si conferma TypeScript con Fastify per il core backend.**

Le motivazioni:

| N. | Motivazione |
|----|-------------|
| 1 | Il carico e I/O bound — il vantaggio di performance Rust e marginale |
| 2 | L'ecosistema SaaS TypeScript e piu maturo (Prisma, Keycloak SDK, KafkaJS) |
| 3 | Il budget temporale (5-7 mesi) non consente il rallentamento di Rust |
| 4 | Il team ha competenze TypeScript |
| 5 | Stesso linguaggio frontend + backend = tipi condivisi, team unificato |
| 6 | Node.js con Fastify e sufficientemente performante per il target attuale |
| 7 | L'approccio ibrido (sezione 10) permette di introdurre Rust incrementalmente se necessario |

Non si esclude Rust dal progetto — si esclude Rust per il core backend
al lancio. L'architettura a servizi HTTP permette di introdurre
componenti Rust in futuro senza riscrittura.

### 11.2 Plugin Backend: Architettura Poliglotta

**I plugin backend possono essere scritti in qualsiasi linguaggio.**

Supporto ufficiale con SDK e template CLI:
- **TypeScript** — linguaggio primario, SDK piu completo
- **Rust** — per plugin ad alte performance o con requisiti di affidabilita
- **Python** — per plugin ML/AI, data analytics, integrazioni specifiche

Supporto indiretto (senza SDK, con documentazione del contratto):
- Qualsiasi linguaggio con HTTP server, client Kafka e driver PostgreSQL

### 11.3 Priorita di Implementazione SDK

| Priorita | SDK | Quando |
|----------|-----|--------|
| 1 | TypeScript (`@plexica/plugin-sdk`) | Fase 3 — insieme al sistema plugin |
| 2 | Python (`plexica-plugin-sdk` PyPI) | Fase 5 o post-lancio — quando c'e domanda |
| 3 | Rust (`plexica-plugin-sdk` crate) | Post-lancio — quando c'e domanda |

L'SDK TypeScript e l'unico necessario al lancio. Python e Rust
vengono aggiunti quando c'e domanda reale dal marketplace o dai
clienti.

Il **contratto API** (sezione 4) e il **formato eventi** (sezione 6)
vengono definiti al lancio e sono sufficienti per permettere a
sviluppatori esperti di creare plugin in qualsiasi linguaggio
anche senza SDK ufficiale.

---

## 12. Impatto sugli Altri Documenti

### 12.1 Impatto su 01-SPECIFICHE.md

Aggiungere ai requisiti funzionali del sistema plugin:

| ID | Requisito | Priorita |
|----|-----------|----------|
| PL-012 | Plugin backend scrivibile in qualsiasi linguaggio (TypeScript, Rust, Python come supportati ufficialmente) | Alta |
| PL-013 | Contratto API HTTP documentato (OpenAPI) per plugin backend | Alta |
| PL-014 | Formato eventi Kafka standard (JSON Schema) per interoperabilita | Alta |
| PL-015 | CLI supporta scaffolding multi-linguaggio (`--lang typescript|rust|python`) | Media |

### 12.2 Impatto su 02-ARCHITETTURA.md

Aggiornare le seguenti sezioni:

- **Sezione 7.2 (Struttura Plugin)**: aggiungere che il backend puo essere in qualsiasi linguaggio
- **Sezione 7.4 (Manifest)**: aggiungere campo `backend.language` per dichiarare il linguaggio
- **Sezione 7.8 (SDK)**: menzionare SDK multi-linguaggio, con TypeScript come reference
- **Sezione 7.9 (DX)**: aggiornare il flusso CLI con la scelta del linguaggio
- **Sezione 11.3 (Core-Plugin Backend)**: dettagliare il protocollo header `X-Plexica-*`

### 12.3 Impatto su 03-PROGETTO.md

Aggiornare le seguenti sezioni:

- **Fase 3.4 (Plugin Backend)**: specificare che il proxy supporta backend in qualsiasi linguaggio
- **Fase 3.5 (Plugin CRM)**: il CRM di esempio resta in TypeScript (linguaggio primario)
- **Fase 3.6 (CLI)**: aggiungere flag `--lang` alla CLI
- Aggiungere attivita post-lancio: SDK Python e SDK Rust quando c'e domanda

---

*Fine del Documento di Comparazione Tecnologica*

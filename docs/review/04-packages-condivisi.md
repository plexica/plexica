# 04 — Package condivisi ed esempi

> Perimetro: `packages/{auth, cli, keycloak-theme, sdk, ui, vite-plugin}` + `examples/plugins/crm` — **7.614 LOC**
> Verifica incrociata del consumo reale in `apps/web`, `apps/admin`, `services/core-api`, `e2e/`
> 20 findings · ~800–1.030 LOC riducibili (12–15 %)

[← Torna all'indice](./README.md)

---

**Nota preliminare**: nessun file sorgente supera le 200 righe (max: `packages/sdk/__tests__/sdk.test.ts` = 199). La Rule 4 è formalmente rispettata su tutto il perimetro. I problemi sono altrove.

---

<a id="1"></a>
## 1. `@plexica/sdk` non ha nessun consumatore reale — la sua API non è mai stata validata

**Categoria**: codice morto / confini package · **Severità**: 🔴 Critica · **LOC**: 120–250 · **Effort**: L

**Posizione**: `packages/sdk/src/index.ts:11-192` · `examples/plugins/crm/package.json:18-31`

**Evidenza**. Ricerca esaustiva di `@plexica/sdk` in `apps/`, `services/`, `examples/`, `e2e/`: **zero import**.

Il plugin CRM — l'unico plugin di riferimento, quello esercitato dai test E2E in `apps/web/e2e/plugin-system/` — **non dichiara `@plexica/sdk` fra le dipendenze** e reimplementa a mano tutto ciò che l'SDK offre:

| Metodo SDK | Reimplementazione nel CRM |
| ---------- | ------------------------- |
| `getDb()` (`src/index.ts:135-153`) | `crm/src/db.ts:1-39` (pool `pg` proprio) |
| `callApi()` (`src/index.ts:76-112`) | `crm/ui/api.ts:10-26` (`request<T>` custom) |
| `getContext()` (`src/index.ts:114-122`) | `crm/src/routes/context.ts:4-7` |
| `onEvent`/`dispatchEvent` (`src/index.ts:51-74`) | `crm/src/routes/events.ts:25-104` (handler HTTP raw) |

Conseguenza: `SdkNotInitializedError`, `ApiCallError`, `EventSubscriptionError`, `DbAccessError` hanno **0 consumatori esterni**. Le ultime due non sono usate nemmeno internamente all'SDK.

**Proposta**: migrare `examples/plugins/crm` sull'SDK come *dogfooding* obbligatorio. In alternativa, se l'SDK non serve, cancellarlo. **Lo stato attuale — un SDK pubblicato ma mai eseguito — è il peggiore dei due.**

**Vantaggi**
- L'API dell'SDK verrebbe finalmente esercitata dai test E2E esistenti (`ac-04-crm-workflow.spec.ts`)
- I plugin di terze parti seguirebbero un esempio funzionante, non uno che aggira l'SDK
- Elimina la divergenza fra ciò che l'ADR-019 documenta e ciò che il codice fa

**Svantaggi / rischi**
- `getDb()` ritorna `unknown`: migrare `db.ts` richiede prima di tipizzarlo (vedi [#16](#16))
- Il CRM è il fixture di 5 spec E2E: la migrazione va fatta con i test verdi a ogni step
- L'SDK non copre il caso `queryOne()` né la gestione `pool.on('error')` presente in `crm/src/db.ts:23`

---

<a id="2"></a>
## 2. Gli auth store di web e admin sono duplicati all'85 %, mentre `createAuthBaseSlice` è morto

**Categoria**: duplicazione / codice morto · **Severità**: 🔴 Critica · **LOC**: ~180 · **Effort**: L

**Posizione**: `apps/web/src/stores/auth-store.ts` (180 LOC) vs `apps/admin/src/stores/auth-store.ts` (156 LOC) · `packages/auth/src/auth-store.ts:40-72`

**Evidenza**. `diff` fra i due store: **~30 righe di differenza reale su 336 totali**. Le divergenze sono solo il nome del realm (`'master'` vs dinamico), il contesto tenant e la chiave di persistenza. Tutto il resto — `login`, `logout`, `handleCallback`, `refresh`, `setSessionExpired`, `authEpoch.invalidate()`, `authFlow.reset()` — è identico carattere per carattere.

Nel frattempo `packages/auth` **esporta già** la factory pensata esattamente per questo:

```ts
// packages/auth/src/auth-store.ts:40
export function createAuthBaseSlice<T extends BaseUserProfile>(
  decodeProfile: (accessToken: string) => T
): StateCreator<...>
```

Consumatori di `createAuthBaseSlice` in tutto il repo: **0**. Idem per `authBaseInitialState` (`:22-28`), che oltretutto duplica letteralmente il corpo di `createInitialState<T>()` (`:30-38`).

Duplicati collaterali confermati:
- `web/types/auth.ts:17-20` ≡ `admin/types/auth.ts:16-19` (`TokenResponse` con `id_token` obbligatorio) — identico
- I due `auth-guard.tsx` differiscono per **1 riga di commento**
- `idToken: string | null` aggiunto in entrambi gli `AuthState` perché manca in `packages/auth/src/types.ts:26-32`

> Vedi anche [03#1](./03-frontend-apps.md#1) per la vista lato applicazioni.

**Vantaggi**
- Un bug di sessione si corregge una volta sola invece di due
- `packages/auth` smette di esportare API morte
- Chiude il rischio di drift **già visibile**: `web` usa `postLogoutUrl` con query param tenant, `admin` no

**Svantaggi / rischi**
- L'astrazione della realm resolution è la parte delicata: `admin` è hardcoded `'master'`, `web` può avere `realm === null` e fa `throw`. Una factory mal disegnata reintroduce complessità
- Richiede di rieseguire i test E2E di login/logout su entrambe le app
- Spostare `AuthGuard` in `packages/auth` aggiunge una dipendenza da `@tanstack/react-router` al package (già presente come devDep)

---

<a id="3"></a>
## 3. Il feature "dev-server registration" è codice morto: due client WebSocket, nessun server

**Categoria**: codice morto · **Severità**: 🟠 Alta · **LOC**: 182 · **Effort**: M

**Posizione**: `packages/vite-plugin/src/dev-server-registration.ts:1-78` · `apps/web/src/mf-host/plugin-dev-watcher.ts:1-104`

**Evidenza**. `dev-server-registration.ts:25` apre un client verso `options.shellWsUrl`, default `ws://localhost:3000/_plexica/dev-ws`. `plugin-dev-watcher.ts:35` apre un **secondo client** verso lo **stesso URL**.

Ricerca di un server WebSocket nel repo:
```
grep -rn "WebSocketServer|@fastify/websocket" services/core-api/src apps/web/vite.config.ts → 0 risultati
```

**Nessuno implementa `/_plexica/dev-ws`.** Due client che dialogano con il nulla. `startDevWatcher()` è comunque invocato incondizionatamente in `apps/web/src/main.tsx:17`, generando tentativi di riconnessione con backoff esponenziale fino a `MAX_RECONNECT_ATTEMPTS = 10` a ogni avvio in dev.

**Proposta**: o si implementa il broker WS (plugin Vite `configureServer` in `apps/web/vite.config.ts`), oppure si eliminano entrambi i lati e si registra il plugin dev via HTTP con `registerBackend()`, che è già l'approccio usato nel template CLI.

**Vantaggi**
- Rimuove 182 LOC di infrastruttura non funzionante e la relativa superficie di manutenzione
- Elimina il rumore di riconnessione in console durante lo sviluppo
- Rimuove 2 dipendenze (`ws`, `@types/ws`) da `@plexica/vite-plugin`

**Svantaggi / rischi**
- Se l'HMR dei plugin è un requisito di roadmap, cancellare significa **rifare il lavoro**
- `registerBackend()` HTTP non offre unregister automatico alla chiusura del dev server — va gestito `SIGINT` lato plugin (il template già lo fa)

---

<a id="4"></a>
## 4. La logica di registrazione dev è duplicata tre volte, di cui due dentro i template CLI

**Categoria**: duplicazione · **Severità**: 🟠 Alta · **LOC**: ~40 · **Effort**: S

**Posizione**: `packages/sdk/dev/index.ts:26-49` · `packages/cli/src/templates.ts:78` (`dev-entry.ts`) · `:79` (`dev-register.ts`)

Tre implementazioni della stessa POST verso `/api/v1/dev/plugins/{register,unregister}`:

1. **Canonica** — `packages/sdk/dev/index.ts:26-49`: `registerBackend()` / `unregisterBackend()`
2. **Template `dev-entry.ts`** — importa correttamente `registerBackend`, ma poi nel gestore `SIGINT` **reimplementa a mano** l'unregister con `fetch` invece di chiamare `unregisterBackend()`
3. **Template `dev-register.ts`** — un file intero generato in ogni nuovo plugin che riscrive `registerDevPlugin`/`unregisterDevPlugin` da zero, **duplicando** sia l'SDK sia `dev-entry.ts`. Nessun altro template lo importa: **è codice morto generato per costruzione**

`unregisterBackend` risulta infatti con **0 consumatori** in tutto il repo.

**Vantaggi**
- Ogni plugin scaffoldato nasce senza un file morto
- Un cambio di path dell'endpoint dev si propaga da un solo punto
- `unregisterBackend` smette di essere export morto

**Svantaggi / rischi**
- Modificare i template invalida i plugin già generati (nessuno in questo repo, a parte il CRM che non usa i template)
- `packages/cli` non dichiara `@plexica/sdk` come dipendenza: i template referenziano `@plexica/sdk: ^0.1.0` come **stringa hardcoded**, quindi il refactoring non è verificato dal type-checker

---

<a id="5"></a>
## 5. `SHARED_DEPS` duplicato nell'host con versioni divergenti e `singleton` mancante

**Categoria**: duplicazione / dipendenze · **Severità**: 🟠 Alta · **LOC**: 8 · **Effort**: S

**Posizione**: `packages/vite-plugin/src/shared-deps.ts:6-49` vs `apps/web/vite.config.ts:18-25`

Le stesse 6 dipendenze condivise di Module Federation sono dichiarate due volte, con configurazioni **incompatibili**:

| Dep | `shared-deps.ts` (plugin) | `apps/web/vite.config.ts` (host) |
| --- | ------------------------- | -------------------------------- |
| `react` | `singleton: true`, `^19.0.0` | *nessun singleton*, `19.2.7` |
| `react-dom` | `singleton: true`, `^19.0.0` | *nessun singleton*, `19.2.7` |
| `@tanstack/react-query` | `singleton: true`, `^5.0.0` | *nessun singleton*, `5.0.0` |
| `react-intl` | `singleton: true`, `^6.6.0` | *nessun singleton*, `6.6.0` |

L'host dichiara **versioni esatte** dove il plugin richiede un **range**, e non marca nulla come singleton. Il commento in `shared-deps.ts:4` recita *"Pinned to exact version ranges to prevent runtime mismatch"* — obiettivo mancato, perché il mismatch è **proprio fra i due file**.

**Proposta**: `apps/web/vite.config.ts` deve importare `SHARED_DEPS` da `@plexica/vite-plugin` (già esportato in `src/index.ts:63`).

**Vantaggi**
- Elimina alla radice una classe di bug MF difficilissimi da diagnosticare (doppia istanza React nei plugin federati)
- Aggiungere una shared dep diventa una modifica in un solo file

**Svantaggi / rischi**
- `apps/web` dovrebbe dipendere da `@plexica/vite-plugin` (attualmente non lo fa) — accoppiamento host→tooling plugin, accettabile ma da valutare
- Il valore `19.2.7` potrebbe essere un workaround deliberato non documentato: **verificare prima di cambiarlo**

---

<a id="6"></a>
## 6. Il SQL delle migrazioni CRM esiste in 4 copie divergenti

**Categoria**: duplicazione · **Severità**: 🟠 Alta · **LOC**: ~60 · **Effort**: M

**Posizione**: `crm/migrations/001_create_contacts.sql:5-21` · `crm/manifest.json:32` · `e2e/fixtures/crm-production-manifest.json:41`

Lo schema di `crm_contacts` è definito in tre posti che **non concordano**:

| Sorgente | `name` | `IF NOT EXISTS` | colonna `company` |
| -------- | ------ | --------------- | ----------------- |
| `migrations/001_create_contacts.sql:8` | `VARCHAR(255)` | sì | **assente** |
| `manifest.json:32` (`content`) | `TEXT` | no | **presente** |
| `e2e/fixtures/crm-production-manifest.json:41` | `TEXT` | no | presente |

Il campo `migrationFile` punta al `.sql` mentre `content` contiene SQL diverso. Il core-api **preferisce `content`** (`manifest.ts:32`: *"Inline SQL — preferred over filesystem read"*), quindi **i file `.sql` non vengono mai eseguiti** — sono documentazione fuorviante. La colonna `company` esiste in produzione ma non nelle migrazioni versionate.

Il manifest E2E diverge inoltre per `description` e aggiunge `env`, mentre il manifest del plugin ha `hosting.env: []` (array) invece dell'oggetto atteso dallo schema Zod — e in **posizione sbagliata**.

**Vantaggi**
- Impossibile che schema di test e schema di produzione divergano
- I test E2E `ac-07-database-isolation.spec.ts` verificherebbero lo schema realmente distribuito
- Chiude il bug latente della colonna `company` non tracciata

**Svantaggi / rischi**
- Il SQL inline nel JSON è illeggibile e non evidenziato dagli editor: generarlo da `.sql` è la direzione giusta ma richiede uno step di build in più
- Il fixture E2E ha bisogno di `env` diverso: serve una funzione di override, non una copia

---

<a id="7"></a>
## 7. `packages/ui` esporta 3 componenti mai usati da nessuna app

**Categoria**: codice morto · **Severità**: 🟠 Alta · **LOC**: 20–120 · **Effort**: M

**Posizione**: `packages/ui/src/components/toast.tsx` (87) · `dropdown-menu.ts` (31) · `date-range-picker.tsx` (68)

Verifica del consumo reale su `apps/web`, `apps/admin`, `crm/ui`:

| Export | Consumatori |
| ------ | ----------: |
| `Toast`, `ToastProvider`, `ToastViewport` | **0** |
| `DropdownMenu*` (11 export) | **0** |
| `DateRangePicker` | **0** |
| `PopoverAnchor` | **0** |
| `DialogTrigger`, `DialogPortal`, `DialogOverlay`, `DialogClose` | **0** |

**Peggio: entrambi i componenti hanno un sostituto reimplementato a mano nelle app.**

- **Toast** → `web/components/auth/session-expired-handler.tsx:39-57` costruisce un banner `role="alert"` con Tailwind inline, duplicando esattamente il `ToastViewport`. Usa oltretutto `bg-amber-500`, un colore grezzo **fuori dai token** del design system
- **DropdownMenu** → `web/components/layout/user-menu.tsx:5` importa `@radix-ui/react-dropdown-menu` **direttamente**, bypassando il barrel, e ridefinisce lo styling del `Content` che il design system non fornisce comunque (il barrel è un re-export puro, senza stili)
- **DateRangePicker** è usato solo indirettamente da `InlineFilter` per il tipo `'date-range'` — ma nessun `FilterDef` nelle app dichiara quel tipo

**Proposta**
1. `Toast`: **adottarlo** in `session-expired-handler.tsx`. È il componente giusto, semplicemente non è stato collegato
2. `dropdown-menu.ts`: eliminarlo, o trasformarlo in un componente vero con lo styling di `user-menu.tsx:38-54`. Un barrel di re-export puro non giustifica un file nel design system e rompe il tree-shaking senza dare nulla in cambio
3. `DateRangePicker`: mantenere solo se `InlineFilter` con `date-range` è a roadmap

**Vantaggi**
- Il design system smette di dichiarare API non validate da nessun consumatore
- `@radix-ui/react-dropdown-menu` può uscire dalle dipendenze di `@plexica/ui`
- Adottare `Toast` elimina un colore hardcoded fuori token

**Svantaggi / rischi**
- ⚠️ Un design system ha legittimamente componenti "in anticipo" sui consumatori. **Rimuovere `DateRangePicker` è la scelta più discutibile della lista**
- Adottare `Toast` richiede di montare `ToastProvider`/`ToastViewport` nell'albero di `apps/web`: cambia il comportamento di focus e la spec E2E `session-expiry.spec.ts` va rivalidata

---

<a id="8"></a>
## 8. `packages/auth/src/index.ts` è un barrel morto che duplica l'`exports` map

**Categoria**: codice morto / confini package · **Severità**: 🟡 Media · **LOC**: ~46 · **Effort**: S

**Posizione**: `packages/auth/src/index.ts:1-36` · `packages/auth/package.json:8-20`

Tutti i 12 import di `@plexica/auth` nelle app usano **sottopercorsi espliciti** (`@plexica/auth/jwt`, `/api-client`, …). Zero import dalla root. Il barrel riesporta **solo tipi** (`export type` × 6), mai valori, e il commento alle righe 17-24 elenca la struttura del package — informazione già codificata, e più affidabilmente, nella `exports` map.

Export mai consumati: `decodeBase64Url`, `decodeAccessToken`, `getTokenExpiry`, `isTokenValid`, `rehydrateStatus`, `cleanupAuthorizationRequests`, `AUTH_REQUEST_TIMEOUT_MS`, `API_REQUEST_TIMEOUT_MS`, `verifyIdToken`.

**Vantaggi**
- L'API pubblica di `@plexica/auth` diventa quella realmente usata: 12 simboli invece di ~30
- Tree-shaking migliore: nessun entrypoint che tira dentro tutto
- Elimina un punto di documentazione che può divergere dalla `exports` map

**Svantaggi / rischi**
- Un barrel `.` è la convenzione attesa per un package npm: rimuoverlo sorprende chi arriva da fuori
- Alcuni export "morti" (`decodeBase64Url`, `getTokenExpiry`) sono utility di test legittime: verificare prima con i maintainer

---

<a id="9"></a>
## 9. `Login.tsx` reimplementa `PasswordField` invece di usarlo

**Categoria**: duplicazione · **Severità**: 🟡 Media · **LOC**: ~90 · **Effort**: M

**Posizione**: `packages/keycloak-theme/src/login/pages/Login.tsx:90-135` vs `components/PasswordField.tsx:14-80`

`PasswordField.tsx` esiste, incapsula il toggle di visibilità ed è usato da `LoginUpdatePassword.tsx:46,67`. `Login.tsx` — **la pagina più importante del tema** — non lo usa e riscrive:

- il wrapper `<div className="input-wrapper">` (`:90` ≡ `PasswordField.tsx:61`)
- lo stato `passwordVisible` (`:22` ≡ `:58`)
- il bottone toggle con `aria-label` condizionale (`:101-106` ≡ `:71-78`)
- **entrambi gli SVG copiati carattere per carattere** (`:108-132` ≡ `:15-45`, stessi `path d=`)

Duplicazione secondaria: il ternario per l'etichetta username compare identico in `Login.tsx:53-57` e `LoginResetPassword.tsx:34-38`.

**Vantaggi**
- Le icone SVG smettono di esistere in due copie divergibili
- Un fix di accessibilità sul campo password si applica a tutte le pagine
- Riduce `Login.tsx` da 169 a ~120 righe

**Svantaggi / rischi**
- `PasswordField` non supporta `defaultValue` né `rememberMe`: va esteso
- ⚠️ Il tema Keycloak è testato **solo E2E**: una regressione sul login **blocca l'accesso a tutta la piattaforma**. Richiede validazione manuale su tutte le pagine `.ftl`

---

<a id="10"></a>
## 10. `reset.css` contiene il blocco `body {}` duplicato letteralmente

**Categoria**: duplicazione · **Severità**: 🟡 Media · **LOC**: ~30 su 51 · **Effort**: S

**Posizione**: `packages/keycloak-theme/src/login/styles/reset.css:10-23` e `:38-51`

Le righe 10-23 e 38-51 sono **byte-identiche**: stesso selettore `body`, stesse 8 proprietà. Chiaro artefatto di merge.

Duplicazione correlata: lo stack `'Inter', system-ui, -apple-system, sans-serif` è ripetuto **4 volte** (`reset.css:11-15`, `:39-43`, `forms.css:27-31`, `buttons.css:11-15`) mentre il token `--font-sans` con lo stesso identico valore esiste già in `packages/ui/src/tokens/typography.css:16` ed è importato via `main.tsx:8`.

Terza duplicazione: `.sr-only` (`:26-36`) riscrive la utility che Tailwind genera già.

**Vantaggi**
- Cambiare il font del prodotto diventa una modifica di un token, non di 4 file
- Rimuove ambiguità su quale delle due regole `body` prevalga

**Svantaggi / rischi**
- Il tema Keycloak viene compilato in un JAR: serve rebuild + ridistribuzione
- `var(--font-sans)` dipende dal caricamento dei token: se il CSS del tema venisse mai servito senza `@plexica/ui/tokens`, il fallback sparirebbe

---

<a id="11"></a>
## 11. `manifest-types.ts` è divergente dallo schema Zod che dichiara di rispecchiare

**Categoria**: duplicazione / type safety · **Severità**: 🟡 Media · **LOC**: 29 · **Effort**: M

**Posizione**: `packages/vite-plugin/src/manifest-types.ts:5-29` vs `services/core-api/src/modules/plugin/schema/manifest.ts:52-76`

Il commento a `:3` dichiara *"Mirrors the Zod schema"*. **Non lo rispecchia**:

| Campo | Zod (backend) | TS (`manifest-types.ts`) |
| ----- | ------------- | ------------------------ |
| `description` | **richiesto**, 1-1000 | `description?: string` |
| `author` | **richiesto** | `author?: string` |
| `icon` | **richiesto** | `icon?: string` |
| `hosting` | **richiesto** | **assente** |
| `apiMappings` | presente | **assente** |
| `env` | presente | **assente** |
| `declaredTables[].content` | presente | **assente** |
| `declaredTables[].description` | presente | **assente** |

**Un manifest che passa il type-check TypeScript può quindi essere rifiutato dal core in fase di install.**

**Vantaggi**
- Impossibile che un plugin compili e poi fallisca l'install per un campo mancante
- Aggiungere un campo al manifest diventa una modifica atomica

**Svantaggi / rischi**
- `packages/vite-plugin` dovrebbe dipendere da `zod` (attualmente non lo fa) o da un nuovo package `@plexica/manifest`
- Un package in più per ~80 righe di schema è discutibile: valutare se sia meglio che `@plexica/vite-plugin` importi il tipo dal core

---

<a id="12"></a>
## 12. I template CLI generano un progetto che non compila

**Categoria**: complessità / correttezza · **Severità**: 🟡 Media · **LOC**: ~15 · **Effort**: M

**Posizione**: `packages/cli/src/templates.ts:66-81`

Il progetto scaffoldato è internamente incoerente:

1. **`tsconfig.json` esclude metà dei file generati** — `"include": ["src"]` ma il template genera anche `ui/index.ts`, `ui/PluginComponent.tsx` e `dev-entry.ts`, tutti fuori da `src/`. `pnpm build` non li vede
2. **`package.json` non dichiara React** — `ui/PluginComponent.tsx` fa `import React from 'react'` ma le dipendenze sono solo `@plexica/sdk`, `@plexica/vite-plugin`, `fastify`
3. **`src/index.ts` e `src/health.ts` definiscono le stesse rotte** — entrambi registrano `/_plexica/health` e `/_plexica/ready`, ma `index.ts` non importa mai `healthRoutes`: rotte duplicate e modulo orfano
4. **`src/health.ts` ha un parametro inutilizzato** — viola `@typescript-eslint/no-unused-vars` configurato a `'error'`
5. **`.env.development` contiene `KAFKA_BROKERS`** mentre `PluginConfig.kafkaBrokers` è marcato `@deprecated`
6. **Versioni hardcoded** — `@plexica/sdk: ^0.1.0`, `vite ^6.0.0`, `typescript ^5.9.0` come stringhe letterali, senza collegamento ai `package.json` reali

**Vantaggi**
- Il primo comando che un autore di plugin esegue smette di produrre un progetto rotto
- Elimina la duplicazione health/index

**Svantaggi / rischi**
- ⚠️ **Nessun test copre l'output generato**: `packages/cli/__tests__/generator.test.ts` testa solo `render()` su stringhe inventate. Correggere i template senza aggiungere uno smoke test (`create` → `pnpm install` → `tsc`) non dà garanzie
- Le versioni hardcoded richiedono un meccanismo di sincronizzazione, non banale

---

<a id="13"></a>
## 13. Stringhe UI hardcoded in inglese nel design system

**Categoria**: accessibilità / violazione costituzione · **Severità**: 🟡 Media · **LOC**: **−25 (aggiunge righe)** · **Effort**: M

**Posizione**: `pagination.tsx:33,40,48,57` · `file-upload.tsx:54,59,135,145,155` · `date-range-picker.tsx:50,62` · `inline-filter.tsx:35` · `tabs.tsx:40`

Diversi componenti espongono correttamente le label come props (`Input.showPasswordLabel`, `Dialog.closeLabel`, `Toast.closeLabel`, `ConfirmDialog.confirmLabel`) — pattern corretto per un design system senza dipendenza da `react-intl`. **Altri non lo fanno**, e le stringhe sono irraggiungibili dal chiamante:

```
pagination.tsx:48   Page <strong>{page}</strong> of <strong>{totalPages}</strong>
pagination.tsx:40   aria-label="Previous page"
file-upload.tsx:155 <span>Drag &amp; drop or click to upload</span>
file-upload.tsx:54  setLocalError('File type not accepted.');
file-upload.tsx:59  setLocalError(`File exceeds maximum size of ${mb} MB.`);
date-range-picker.tsx:50/62  aria-label="From date" / "To date"
```

`Pagination` è usato in 4 pagine: **un utente italiano legge "Page 2 of 7"**. Gli errori di `FileUpload` sono messaggi visibili all'utente, non solo aria-label.

Nota: `tabs.tsx:40` `aria-label="Tabs"` su una `RadixTabs.List` è anche **ridondante** — il ruolo `tablist` è già annunciato dagli screen reader.

**Vantaggi**
- Chiude una violazione esplicita dell'`AGENTS.md` su 4 componenti
- Uniforma il design system a un solo pattern di localizzazione (Rule 3)
- Migliora l'accessibilità per utenti non anglofoni con screen reader

**Svantaggi / rischi**
- ⚠️ **Aumenta** le LOC (~+25) invece di ridurle: va contro l'obiettivo dichiarato di questa analisi, ma è tra i findings più importanti
- Richiede di toccare 6 pagine consumer per passare le label
- Le default in inglese vanno mantenute per retrocompatibilità, quindi le stringhe restano nel bundle

---

<a id="14"></a>
## 14. `input.tsx` chiama `React.useId()` dentro un `??` — hook condizionale

**Categoria**: correttezza · **Severità**: 🟡 Media · **LOC**: **+1** · **Effort**: S

**Posizione**: `packages/ui/src/components/input.tsx:25`

```ts
const inputId = id ?? React.useId();   // ← l'operatore ?? cortocircuita
```

Se `id` è definito, `React.useId()` **non viene invocato**. Un componente che riceve `id` in un render e non nel successivo cambia il numero di hook chiamati → **violazione delle Rules of Hooks**.

Gli altri tre componenti del package fanno la cosa giusta:

```ts
const generatedId = React.useId();        // textarea.tsx:17
const textareaId = id ?? generatedId;     // textarea.tsx:18
```

`Input` è il componente **più usato** del design system (38 occorrenze nelle app), e `InlineFilter` lo rende senza `id` mentre altri lo usano con `id`.

**Proposta**: allineare `input.tsx:25` al pattern di `textarea.tsx`. Aggiungere `eslint-plugin-react-hooks` alla config ESLint — attualmente **assente** da `eslint.config.js`, motivo per cui il problema non è stato intercettato.

**Vantaggi**
- Elimina un bug reale sul componente più usato
- Uniforma il pattern `useId` su tutti e 4 i componenti
- `eslint-plugin-react-hooks` intercetterebbe anche i problemi di dependency array

**Svantaggi / rischi**
- Aggiungere `react-hooks` a ESLint farà probabilmente emergere **decine di warning preesistenti** in `apps/` → con `--max-warnings 0` la CI diventa rossa finché non si sistemano tutti
- Il bug è latente: nessun consumer attuale alterna `id` fra i render, quindi la priorità reale è più bassa della gravità teorica

---

<a id="15"></a>
## 15. `TableHead` espone un sorting mai usato e non accessibile da tastiera

**Categoria**: codice morto / accessibilità · **Severità**: 🟡 Media · **LOC**: ~25 · **Effort**: S

**Posizione**: `packages/ui/src/components/table.tsx:47-84`

Consumo di `sortable` in `apps/web` e `apps/admin`: **0 occorrenze**. Le props `sortable`/`sortDirection`, la logica `aria-sort` e i tre rami di icona sono codice morto.

**Inoltre, quando venisse usato, non funzionerebbe da tastiera**: il `<th>` riceve `cursor-pointer select-none` e `aria-sort`, ma **nessun `tabIndex`, nessun `role="button"`, nessun `onKeyDown`, nessun `<button>` interno**. Il commento a `table.tsx:2` dichiara *"WCAG 2.1 AA: proper th scope, keyboard-accessible sort indicators"* — **la seconda affermazione è falsa**. Violazione WCAG 2.1.1 (Keyboard).

I tre import `ChevronUp, ChevronDown, ChevronsUpDown` servono esclusivamente a questo ramo morto.

**Vantaggi**
- Elimina una **promessa di accessibilità non mantenuta** nel codice del design system
- `TableHead` scende da 33 a ~8 righe
- Rimuove 3 icone dal bundle

**Svantaggi / rischi**
- Il sorting delle tabelle è una feature plausibile a breve: rimuoverla e riscriverla è lavoro doppio
- Se qualche pagina passasse `sortable` via spread di props non tipizzate, la rimozione sarebbe silenziosa (improbabile: `TableHeadProps` è tipizzato)

---

<a id="16"></a>
## 16. `getDb()` ritorna `unknown` — type safety azzerata sul percorso dati dei plugin

**Categoria**: type safety · **Severità**: 🟡 Media · **LOC**: ~24 · **Effort**: S

**Posizione**: `packages/sdk/src/index.ts:15,38-43,135-153`

```ts
private dbPool: unknown = null;                                  // :15
await (this.dbPool as { end: () => Promise<void> }).end();       // :40
async getDb(): Promise<unknown> { ... return pool; }             // :135,149
```

Il metodo più importante dell'SDK per l'accesso ai dati restituisce `unknown`. Ogni consumatore è costretto a un cast non verificato. Il cast a `:40` è già una toppa a questo problema.

`pg` è una **dipendenza diretta** e `@types/pg` è in devDependencies, quindi `Pool` è tipizzabile senza costo aggiuntivo: **la scelta di `unknown` non ha giustificazione tecnica**.

**Correlati**
- `kafkajs: ^2.2.4` è dichiarato in `packages/sdk/package.json:17` ma **non è importato da nessun file**. Il commento a `src/index.ts:4` recita *"No direct Kafka connection"* e il test a `__tests__/sdk.test.ts:2` conferma *"The SDK no longer imports kafkajs; the dead mock is gone"*
- `packages/sdk/dev/migration.ts:1-22` è uno stub che stampa *"Migration helper is a stub"* e ritorna sempre `{ applied: [], errors: [] }`. **Non è nella `exports` map**, quindi non è nemmeno raggiungibile. Contiene 2 `console.log`
- `packages/sdk/openapi.yaml` (119 righe) non è referenziato da nessuno script, test o build step

**Vantaggi**
- I consumatori dell'SDK ottengono autocompletamento e type-check sulle query
- Rimuove `kafkajs` (~1,5 MB con le transitive) dall'albero di dipendenze di **ogni plugin**
- Elimina l'ultimo `console.log` nei package

**Svantaggi / rischi**
- Tipizzare `getDb(): Promise<Pool>` rende `pg` un tipo pubblico dell'SDK: cambiare driver in futuro diventa breaking
- Spostare `pg` in `optionalDependencies` rompe `getDb()` per chi non l'installa esplicitamente — va documentato
- ⚠️ `openapi.yaml` dichiara il contratto per plugin scritti in altri linguaggi: il fatto che non sia referenziato dal build **non** significa che sia inutile. **Non rimuovere.**

---

<a id="17"></a>
## 17. Dipendenze `@radix-ui` dichiarate ma mai usate + versioni divergenti

**Categoria**: dipendenze · **Severità**: 🟡 Media · **LOC**: ~2 · **Effort**: M

**Posizione**: `packages/ui/package.json:19,22`

| Dipendenza | Occorrenze in `packages/ui/src` |
| ---------- | -----------------------------: |
| `@radix-ui/react-avatar` (`:19`) | **0** |
| `@radix-ui/react-navigation-menu` (`:22`) | **0** |
| `@radix-ui/react-dropdown-menu` (`:21`) | 3 — solo nel barrel morto ([#7](#7)) |

Entrambe sono invece usate **direttamente dalle app**: `web/components/layout/avatar.tsx:6` importa `@radix-ui/react-avatar`. **Il design system paga il peso di dipendenze che consuma qualcun altro.**

**Divergenze di versione fra package** (verifica automatica su tutti i `package.json`):

| Dipendenza | `@plexica/ui` | `apps/web` / `apps/admin` |
| ---------- | ------------- | ------------------------- |
| `@radix-ui/react-dialog` | `^1.1.22` | `latest` |
| `@radix-ui/react-dropdown-menu` | `^2.1.23` | `latest` |
| `@radix-ui/react-toast` | `^1.2.22` | `latest` |
| `lucide-react` | `^0.400.0` | `latest` |

Altre: `@originjs/vite-plugin-federation` `^1.3.5` in `packages/vite-plugin` vs `^1.4.1` in `apps/web` — **proprio il plugin che genera la config MF è su una minor più vecchia dell'host**. `zod` `^3.22.0` nel core-api vs `^3.25.76` ovunque. `vite` `^6.0.0` vs `^6.4.3`.

**Vantaggi**
- `latest` in un lockfile monorepo è una bomba a orologeria: un `pnpm install` su una macchina diversa può installare major diverse
- Rimuove 2 dipendenze non usate da `@plexica/ui`
- Allinea la versione MF fra generatore di config e host (**rischio concreto di incompatibilità dello shareScope**)

**Svantaggi / rischi**
- Passare da `latest` a range pinnati richiede un `pnpm update` controllato e la rivalidazione dell'intera suite E2E
- `pnpm.catalog` richiede pnpm ≥ 9.5 (il repo esige ≥ 10, quindi OK) ma tocca tutti i `package.json`

> Vedi anche [05#1](./05-build-ci-infra.md#1) e [05#3](./05-build-ci-infra.md#3).

---

<a id="18"></a>
## 18. CRUD di `contacts` e `deals` duplicato al 90 % nel plugin CRM

**Categoria**: duplicazione · **Severità**: 🟡 Media · **LOC**: ~120 su 314 · **Effort**: M

**Posizione**: `crm/src/routes/contacts.ts` (145 LOC) vs `crm/src/routes/deals.ts` (169 LOC)

Duplicazione verbatim:
- `getWorkspaceId()` — `contacts.ts:33-39` ≡ `deals.ts:33-39` (identiche, 7 righe)
- `toContact()` / `toDeal()` — stessa mappatura snake_case → camelCase
- Le 5 handler (`GET /`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id`) hanno struttura identica
- Il cast `as unknown as XRow` (`contacts.ts:103`, `deals.ts:127`) — doppio cast che aggira il type system, identico in entrambi

**Vantaggi**
- Il CRM è il **template di riferimento** che gli autori di plugin copieranno: mostrare duplicazione insegna duplicazione
- Elimina 2 doppi cast `as unknown as`
- `db.ts` con `query<T>()` generico dà type safety su tutte le query

**Svantaggi / rischi**
- ⚠️ **Un esempio didattico ha valore nell'essere esplicito**: una factory CRUD generica potrebbe rendere il codice meno leggibile per chi impara la piattaforma. Estrarre `getWorkspaceId` e tipizzare `query<T>` sì; **astrarre il CRUD è discutibile**
- I 5 spec E2E dipendono da questi endpoint

---

<a id="19"></a>
## 19. Build artifact committati in git

**Categoria**: codice morto · **Severità**: 🔵 Bassa · **LOC**: 8 file / 472 KB · **Effort**: S

**Posizione**: `examples/plugins/crm/dist-ui/assets/` (8 file tracciati)

`.gitignore` ignora `dist-ui/` (riga 8), ma 8 file sono stati committati **prima** dell'aggiunta della regola e restano tracciati. Sono bundle React/react-dom completi con hash nel nome: mai aggiornati, quindi progressivamente divergenti dal sorgente.

`packages/keycloak-theme/dist_keycloak/` (4,2 MB, un JAR) è invece correttamente non tracciato.

**Vantaggi**
- Elimina il rischio che un test E2E serva un `remoteEntry.js` stantio invece di quello appena buildato
- Riduce la dimensione del clone

**Svantaggi / rischi**
- ⚠️ Se qualche fixture E2E o Dockerfile assume la presenza di `dist-ui` pre-buildato, la CI si rompe: **verificare `crm/Dockerfile` e `e2e/fixtures/plugin-runtime-fixture.ts` prima di rimuovere**
- I file restano nella storia di git: il beneficio sulla dimensione del repo è nullo senza un rewrite

---

<a id="20"></a>
## 20. I test del CLI verificano una reimplementazione, non il codice di produzione

**Categoria**: violazione costituzione (testing) · **Severità**: 🔵 Bassa · **LOC**: ~18 · **Effort**: S

**Posizione**: `packages/cli/__tests__/generator.test.ts:36-53` vs `packages/cli/src/index.ts:13-20`

Il `describe('Slug generation')` **non importa nulla dal codice sorgente**. Ogni test riscrive la logica inline e poi verifica sé stesso:

```ts
// generator.test.ts:39 — logica reimplementata NEL TEST
const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').substring(0, 62);
```

```ts
// src/index.ts:13-20 — la funzione reale, NON esportata
function toSlug(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')   // ← quantificatore +, il test non ce l'ha
    .replace(/^-+/, '')
    .substring(0, 62)                // ← substring PRIMA del trim finale
    .replace(/-+$/, '');
}
```

**Le due implementazioni divergono**: il test usa `/[^a-z0-9-]/g` (senza `+`), quindi `"My CRM"` → `"my--crm"` nel test e `"my-crm"` nella funzione reale. L'ordine `substring`/trim è pure invertito. **I test passano verdi mentre la funzione reale ha copertura zero.**

Analogamente, `packages/vite-plugin/__tests__/shared-deps.test.ts:26-42` contiene 3 test che iterano su un oggetto `as const`: sono **tautologie** che TypeScript verifica già a compile time.

**Vantaggi**
- `toSlug` passa da 0 % a coperta
- Rimuove test che danno un falso senso di sicurezza
- Allinea `packages/cli` alla filosofia di testing dell'`AGENTS.md`

**Svantaggi / rischi**
- Testare `toSlug` reale probabilmente farà **fallire** i test attuali (le due implementazioni divergono): bisognerà decidere quale comportamento è corretto
- Riduce il conteggio dei test, metrica che qualcuno potrebbe monitorare

---

## Tabella riepilogativa

| # | Finding | Categoria | Severità | LOC | Effort |
| -: | ------- | --------- | -------- | --: | :----: |
| [1](#1) | `@plexica/sdk` senza consumatori — CRM lo bypassa | codice morto | 🔴 Critica | 120–250 | L |
| [2](#2) | Auth store `web`/`admin` duplicati; `createAuthBaseSlice` morta | duplicazione | 🔴 Critica | ~180 | L |
| [3](#3) | Dev-server registration: 2 client WS, 0 server | codice morto | 🟠 Alta | 182 | M |
| [4](#4) | Registrazione dev duplicata 3× nei template CLI | duplicazione | 🟠 Alta | ~40 | S |
| [5](#5) | `SHARED_DEPS` duplicato con versioni divergenti | duplicazione | 🟠 Alta | 8 | S |
| [6](#6) | SQL migrazioni CRM in 4 copie divergenti | duplicazione | 🟠 Alta | ~60 | M |
| [7](#7) | `Toast`/`DropdownMenu`/`DateRangePicker` mai usati | codice morto | 🟠 Alta | 20–120 | M |
| [8](#8) | `packages/auth/src/index.ts` barrel morto | codice morto | 🟡 Media | ~46 | S |
| [9](#9) | `Login.tsx` reimplementa `PasswordField` | duplicazione | 🟡 Media | ~90 | M |
| [10](#10) | `reset.css` blocco `body` duplicato + font stack ×4 | duplicazione | 🟡 Media | ~30 | S |
| [11](#11) | `manifest-types.ts` divergente dallo schema Zod | type safety | 🟡 Media | 29 | M |
| [12](#12) | Template CLI generano progetto non compilabile | correttezza | 🟡 Media | ~15 | M |
| [13](#13) | Stringhe UI hardcoded (i18n) | accessibilità | 🟡 Media | **−25** | M |
| [14](#14) | `useId()` in `??` — hook condizionale | correttezza | 🟡 Media | **+1** | S |
| [15](#15) | `TableHead sortable` morto e non accessibile | codice morto | 🟡 Media | ~25 | S |
| [16](#16) | `getDb(): unknown`, `kafkajs` inutilizzata, `migration.ts` stub | type safety | 🟡 Media | ~24 | S |
| [17](#17) | Radix inutilizzate + `latest` + versioni divergenti | dipendenze | 🟡 Media | ~2 | M |
| [18](#18) | CRUD `contacts`/`deals` duplicato al 90 % | duplicazione | 🟡 Media | ~120 | M |
| [19](#19) | `dist-ui/` committato in git | codice morto | 🔵 Bassa | 8 file | S |
| [20](#20) | Test CLI verificano una reimplementazione | costituzione | 🔵 Bassa | ~18 | S |

**Totale stimato**: **~950–1.180 LOC** su 7.614 analizzate (**12–15 %**), escludendo [#13](#13) e [#14](#14) che aggiungono righe per correttezza.

---

## Osservazioni conclusive

**Il tema dominante non è la duplicazione, è l'astrazione non adottata.** Sei dei findings più gravi seguono lo stesso schema: esiste l'astrazione corretta, ma nessuno la usa e il consumatore reimplementa a mano.

| Astrazione | Chi la ignora |
| ---------- | ------------- |
| `createAuthBaseSlice` | Le app riscrivono lo store ([#2](#2)) |
| `PluginSDK` | Il CRM riscrive db/api/eventi ([#1](#1)) |
| `PasswordField` | `Login.tsx` riscrive il toggle ([#9](#9)) |
| `Toast` | `session-expired-handler` riscrive il banner ([#7](#7)) |
| `unregisterBackend` | Il template riscrive il `fetch` ([#4](#4)) |
| `--font-sans` | 4 file riscrivono lo stack ([#10](#10)) |

**Aggiungere altre astrazioni non risolve questo problema.** La priorità è collegare quelle esistenti ai loro consumatori e poi eliminare ciò che resta scollegato. I findings [#1](#1), [#2](#2), [#4](#4), [#7](#7), [#9](#9) vanno affrontati in questo ordine.

**Sul rispetto della costituzione**: la Rule 4 è rispettata ovunque. La Rule 3 è violata in almeno tre punti — due pattern per `useId` ([#14](#14)), due per la localizzazione nel design system ([#13](#13)), tre per la registrazione dev ([#4](#4)). La filosofia di testing è violata in `packages/cli` ([#20](#20)).

**Una nota di cautela sulle stime**: i findings [#7](#7) (rimuovere `DateRangePicker`) e [#15](#15) (rimuovere `sortable`) contano LOC di funzionalità *anticipate*, non di codice sbagliato. Un design system ha legittimamente componenti che precedono i consumatori. Se sono a roadmap, quelle ~145 righe non sono un risparmio ma **un lavoro da rifare** — e vanno scorporate dal totale, portandolo a ~800–1.030 LOC.

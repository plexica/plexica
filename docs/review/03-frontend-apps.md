# 03 — Frontend: applicazioni

> Perimetro: `apps/web/src` (8.996 LOC) + `apps/admin/src` (5.378 LOC) = **14.374 LOC**, più config, helper E2E e i package consumati
> Stack: React 19 · Vite · TanStack Router/Query · Zustand · Tailwind · react-hook-form + Zod · react-intl · Radix · Lucide
> 18 findings · ~1.740 LOC riducibili (12,1 %)

[← Torna all'indice](./README.md)

---

## Contesto preliminare

Va detto prima dei findings, per non sovrastimarli: **la duplicazione più costosa è già stata estratta**. Client OIDC PKCE, `createApiClient`, JWT decode e silent refresh vivono correttamente in `@plexica/auth`. Non c'è nessun `window.confirm`, nessun `console.log` in produzione, nessun `<a href>` per navigazione (salvo 2 casi documentati), solo 4 occorrenze di `any` (tutte con `eslint-disable` motivato), e **zero file sopra le 200 righe**.

La qualità di base è alta. I findings sotto sono **ottimizzazioni incrementali**, non un salvataggio.

---

<a id="1"></a>
## 1. Layer di stato auth duplicato tra web e admin (residuo post-`@plexica/auth`)

**Categoria**: duplicazione cross-app · **Severità**: 🟠 Alta · **LOC**: ~200 · **Effort**: M

| File | web | admin | Delta |
| ---- | --: | ----: | ----- |
| `src/services/auth-query-cache.ts` | 14 | 14 | **byte-identici** |
| `src/services/query-client.ts` | 11 | 11 | **byte-identici** |
| `src/components/auth/auth-guard.tsx` | 37 | 37 | **1 riga di commento** |
| `src/stores/auth-store.ts` | 180 | 156 | realm dinamico vs `'master'` |
| `src/types/auth.ts` | 30 | 26 | — |
| `src/services/api-client.ts` | 37 | 32 | — |
| `src/pages/auth-callback-page.tsx` | 68 | 70 | validazione Zod divergente |
| `src/components/auth/session-expired-handler.tsx` | 59 | 41 | — |

**Evidenza**. `diff apps/web/src/services/auth-query-cache.ts apps/admin/src/services/auth-query-cache.ts` → **output vuoto**. Idem per `query-client.ts`. Per `auth-guard.tsx` l'unica differenza è il commento di intestazione.

Per `auth-store.ts` la struttura è la stessa (stesso `clearedAuth`, `authFlow`/`authEpoch`, `persist` + `partializeAuthState`); l'unica divergenza reale è la risoluzione del realm.

**Bug collaterale rilevato**: `auth-callback-page.tsx` ha due divergenze **non intenzionali**. Admin valida `code`+`state` con Zod a monte (`:22-28`); web valida `state` **solo nel ramo di errore** (`:23-27`). Il ramo felice di web passa `code`/`state` non validati a `handleCallback`.

**Proposta**
1. `@plexica/auth/query-cache` — sposta i 25 righe identiche
2. `@plexica/auth/auth-guard` — componente parametrizzato su `{ onUnauthenticated }`
3. `createAuthStore({ resolveRealm, postLogoutUrl })` — web passa `() => get().realm`, admin `() => 'master'`
4. `useAuthCallback({ onError })` con la validazione Zod di admin come default (chiude anche il gap di web)

**Vantaggi**
- Elimina 25 righe letteralmente copiate (drift garantito nel tempo)
- Uniforma la validazione Zod del callback OIDC (bug-fix collaterale su web)
- Un solo punto in cui evolvere l'epoch/refresh logic quando cambia il flusso Keycloak
- I 197 righe di test in `packages/auth/__tests__/admin-auth-store.test.ts` diventerebbero riusabili per entrambi

**Svantaggi / rischi**
- **L'auth è il codice più critico del sistema**: un refactor su `auth-store` tocca login, logout, refresh, revoke e persistenza. Va fatto con gli E2E verdi prima e dopo, non a cuor leggero
- La factory pattern aggiunge indirezione: leggere il flusso di login richiederà di saltare tra package e app
- I 25 righe *identiche* valgono la pena; i 110 dello store sono al limite del "rule of three" — sono **2** consumatori, non 3

---

<a id="2"></a>
## 2. `EmptyState` / `PageError` / `SkeletonLoader` esistono solo in web, admin li reimplementa inline

**Categoria**: duplicazione cross-app + candidati `@plexica/ui` · **Severità**: 🟠 Alta · **LOC**: ~150 · **Effort**: M

I tre componenti esistono in `apps/web/src/components/feedback/` (33 + 37 + 35 LOC) e sono usati in **20 file** di web. In `apps/admin` gli import sono **zero**. Al loro posto:

**Error banner + retry duplicato 4 volte**, classi Tailwind identiche:
`dashboard-page.tsx:39-54` · `health-page.tsx:38-55` · `kafka-page.tsx:54-71` · `logs-page.tsx:142-166`

```
rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800   ← ×4
```

**Empty state "dashed" duplicato 8 volte**: `kafka-page.tsx:76`, `tenants-page.tsx:86`, `plugins-page.tsx:100`, `logs-page.tsx:103,128`, `placeholder-page.tsx:13`, `tenant-detail-plugins-tab.tsx:36`, `tenant-detail-audit-tab.tsx:73`

**Skeleton "table" duplicato 4 volte**, quasi identico: `tenant-table.tsx:71-86` · `plugin-table.tsx:75-91` · `log-table.tsx:178-193` · `consumer-lag-table.tsx:77-93`. I primi tre sono strutturalmente lo **stesso componente**, differiscono solo per le larghezze delle celle.

**Skeleton card grid duplicato 2 volte identico**: `dashboard-page.tsx:62-64` e `health-page.tsx:29-34`.

**Nota di qualità**: web usa `border-neutral-200` + token `text-error`; admin usa `border-red-300`/`bg-red-50` **hardcoded** — quindi admin non rispetta i design token.

**Vantaggi**
- Admin eredita gratis `role="status"`/`role="alert"`, `motion-reduce`, e i design token invece di `red-300` hardcoded
- Rimuove 4 varianti visive di "errore" e 8 di "vuoto" → coerenza UI immediata
- I componenti entrano nel design system documentato (`packages/ui/src/stories/` esiste già)

**Svantaggi / rischi**
- I test E2E di admin che asseriscono su classi/testi inline potrebbero rompersi — verificare `apps/admin/e2e/005-*.spec.ts`
- `PageError` usa `<FormattedMessage id="error.page.heading" />` con chiavi hardcoded: spostandolo va parametrizzato sui message id, altrimenti il package acquisisce una dipendenza sui dizionari delle app
- `@plexica/ui` non dipende oggi da `react-intl`: introdurre `FormattedMessage` nel design system è una decisione architetturale che **merita un ADR**

---

<a id="3"></a>
## 3. Pattern "query state machine" ripetuto 23 volte

**Categoria**: duplicazione intra-app · **Severità**: 🟡 Media · **LOC**: ~180 · **Effort**: M

**Posizione**: 16 pagine in web, 7 in admin.

La forma canonica in web è letteralmente la stessa sequenza in 4 pagine:

```tsx
{isPending && (
  <div className="space-y-3" aria-busy="true" aria-live="polite">
    <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
    {Array.from({ length: N }).map((_, i) => <SkeletonLoader key={i} variant="card" />)}
  </div>
)}
{isError && <PageError onRetry={() => void refetch()} />}
{!isPending && !isError && items.length === 0 && (
  <div className="flex flex-col items-center justify-center py-16 text-center">   ← ×4 identico
```

La stringa `"flex flex-col items-center justify-center py-16 text-center"` ricorre 4 volte — ed è **un secondo empty state** che coesiste con `EmptyState` (che usa `px-6 py-12` + bordo tratteggiato). **Due empty state visivamente diversi nella stessa app.**

In admin la forma ternaria annidata è ripetuta identica in `tenants-page.tsx:79-91` e `plugins-page.tsx:90-105`.

**Proposta**: un `<QueryBoundary>` in `@plexica/ui`, ed eliminare l'empty state `py-16` in favore di `EmptyState`.

**Vantaggi**
- Garantisce `aria-busy`/`aria-live`/`role="alert"` coerenti su tutte le 23 pagine (oggi 6 pagine di admin non hanno `aria-live` sullo stato di errore)
- Rimuove la duplicazione degli empty state divergenti in web
- Le nuove pagine partono già conformi senza dover ricordare il pattern

**Svantaggi / rischi**
- Il render-prop `children: (data) => ...` è meno leggibile del JSX piatto per chi legge la pagina la prima volta
- Alcune pagine hanno stati misti non riducibili: `marketplace-page.tsx:148-168` distingue "empty" da "empty filtrato", `logs-page.tsx:127-131` ha uno stato "non ancora cercato". L'API deve reggerli senza diventare un mostro di prop
- **Rischio concreto di over-abstraction**: se l'API cresce oltre 5 prop, il rimedio è peggiore del male

---

<a id="4"></a>
## 4. Codice morto: 18 file/export mai importati

**Categoria**: codice morto · **Severità**: 🟡 Media · **LOC**: ~180 · **Effort**: S

**File interamente morti**

| File | LOC | Nota |
| ---- | --: | ---- |
| `apps/web/src/app.tsx` | 16 | `export function App()` **non importato da nessun file**. Ritorna `<></>`. `main.tsx` monta direttamente `RouterProvider`. |
| `apps/web/src/pages/login-page.tsx` | 67 | Non importato. Placeholder Fase 0 — vedi [#5](#5) |
| `apps/admin/src/pages/placeholder-page.tsx` | 22 | Non più referenziato dopo il completamento delle route |

Verifica: `grep -rn "from './app'\|<App" apps/web/src apps/web/index.html` → **nessun risultato**.

**Export morti dentro file vivi**

- `mf-host/use-plugin-context.tsx:9,25,27` → `PluginContextValue`, `PluginContext`, `usePluginContext` mai usati. Il Context è un provider che **nessuno consuma**: ~20 righe di `useMemo` che calcolano un valore mai letto
- `mf-host/plugin-dev-watcher.ts` → `stopDevWatcher`, `getActiveDevPlugins`
- `mf-host/plugin-loader.tsx` → `clearRemoteCache`
- **7 hook TanStack Query mai usati** (~55 righe): `useResendInvite`, `useWorkspaceHierarchy`, `useReparentWorkspace`, `useAddWorkspaceMember`, `useCreateTemplate`, `useUserWorkspaces`, `useRegisterPlugin`, con i relativi metodi API
- `apps/admin/src/services/keycloak-auth.ts:21` → `getMasterRealm()`
- `use-tenant-lifecycle.ts` → 5 interfacce `UseXxxResult` esportate e mai importate (vedi [#8](#8))
- 20 export di route in entrambi i `router-shell-routes.tsx`: usati solo tramite l'array `shellChildRoutes` **nello stesso file**

**Vantaggi**
- Elimina 105 righe di file interamente morti, immediato e senza rischi
- I 7 hook morti sono un **falso segnale** di "feature esistente" per chi legge il codice
- Riduce la superficie di typecheck e lint

**Svantaggi / rischi**
- ⚠️ **Rischio reale**: `useWorkspaceHierarchy`, `useReparentWorkspace`, `useCreateTemplate` corrispondono a endpoint backend **implementati** (`/hierarchy`, `/reparent`, `POST /templates`). Cancellarli potrebbe significare cancellare lavoro fatto in anticipo su una spec futura. **Verificare in `.forge/specs/` prima di rimuovere**
- `clearRemoteCache` potrebbe servire ai test E2E dei plugin — verificare `apps/web/e2e/plugin-system/`
- `ts-prune` produce falsi positivi su barrel export e va tarato

---

<a id="5"></a>
## 5. `login-page.tsx` di web: form con `useState` (violazione pattern) e per giunta morto

**Categoria**: violazione pattern + codice morto · **Severità**: 🟡 Media · **LOC**: 67 · **Effort**: S

**Posizione**: `apps/web/src/pages/login-page.tsx:5,10,14-19,32`

```tsx
const [isLoading, setIsLoading] = useState(false);   // :10
function handleSubmit(event) {
  event.preventDefault();
  setIsLoading(true);
  setTimeout(() => { setIsLoading(false); }, 1500);  // :17 — non fa nulla
}
```

`AGENTS.md`: *Form handling → react-hook-form + Zod. Vietato: `useState` inline.* Questo è l'**unico** `<form>` in entrambe le app che non usa `useForm` + `zodResolver` — gli altri 9 sono conformi.

Il form inoltre **non fa nulla**: un `setTimeout` di 1500 ms. L'auth reale è PKCE redirect (`auth-store.ts:68`).

**Proposta**: cancellare il file. Non vale la pena convertirlo a RHF.

**Vantaggi**
- Rimuove l'unica violazione del pattern form dal codebase
- Elimina un form di login fittizio che potrebbe confondere durante l'onboarding o, peggio, essere reintrodotto in una route per errore

**Svantaggi / rischi**
- Nessuno sostanziale. Verificare solo che nessun E2E navighi a `/login` su web (la route non esiste in `router-shell.tsx`)

---

<a id="6"></a>
## 6. Bug: `profile-api.ts` costruisce un URL con `/api` doppio

**Categoria**: correttezza · **Severità**: 🟠 Alta · **LOC**: ~30 · **Effort**: S

**Posizione**: `profile-api.ts:11,29` · `settings-api.ts:19,47` · `tenant-resolver.ts:7,48` · `api-client.ts:12` (web) e `:14` (admin)

Quattro file dichiarano `API_BASE` con **due default diversi**:

```ts
// api-client.ts:12    → import.meta.env.VITE_API_URL ?? ''
// settings-api.ts:19  → import.meta.env.VITE_API_URL ?? ''      + commento esplicito sul rischio
// profile-api.ts:11   → import.meta.env.VITE_API_URL ?? '/api'  ← DIVERSO
// tenant-resolver.ts:7→ import.meta.env.VITE_API_URL ?? '/api'
```

`settings-api.ts:17-19` documenta esattamente il problema:
> *API paths already include the /api/v1 prefix. API_BASE must be empty to avoid doubling the prefix (/api/api/v1/…).*

Ma `profile-api.ts:29` fa proprio questo:

```ts
const res = await fetch(`${API_BASE}/api/v1/profile/avatar`, {...});
//                        ^ '/api'    ^ /api/v1  →  /api/api/v1/profile/avatar
```

`VITE_API_URL` **non è definito in nessun punto del repo** (verificato su `.env`, `.env.example`, `scripts/`, `.github/`). Quindi il default si applica sempre: **l'upload dell'avatar punta a `/api/api/v1/profile/avatar` e riceve 404.**

`tenant-resolver.ts:48` è invece corretto perché il path non contiene `/api`.

**Proposta**
1. Fix immediato: `profile-api.ts:11` → `?? ''`
2. Estrarre `API_BASE` in un unico `services/api-base.ts` importato dai 4 file
3. Deduplicare `uploadAvatar` (`profile-api.ts:22-39`) e `uploadLogo` (`settings-api.ts:40-57`), **quasi identiche** (18 righe l'una): un `uploadMultipart(path, file, method)` in `@plexica/auth/api-client` copre entrambe

**Vantaggi**
- Ripara un endpoint rotto in produzione
- Le upload multipart ereditano refresh-su-401, timeout e `ApiError` tipizzato da `createApiClient` — oggi ne sono prive e lanciano `Error` generici
- Un solo default di `API_BASE` = impossibile che divergano di nuovo

**Svantaggi / rischi**
- ⚠️ Se l'upload avatar è oggi coperto da un E2E che passa, allora `VITE_API_URL` è settato da qualche parte non trovata (es. iniettato dal webServer di Playwright): **verificare `apps/web/playwright.config.ts` prima di fixare**, altrimenti si rompe ciò che funziona
- Aggiungere il supporto multipart a `createApiClient` richiede di **non** impostare `Content-Type` (il browser deve generare il boundary): serve un branch esplicito

---

<a id="7"></a>
## 7. Layout shell duplicato in forma divergente — admin ha perso l'accessibilità di web

**Categoria**: duplicazione cross-app + violazione UX · **Severità**: 🟠 Alta · **LOC**: ~70 netti · **Effort**: L

| Componente | web | admin | Delta funzionale |
| ---------- | --: | ----: | ---------------- |
| `app-shell.tsx` | 78 | 25 | admin: **no** `SkipLink`, **no** error boundary, **no** `useMediaQuery` |
| `header.tsx` | 87 | 43 | admin: **no** `aria-expanded`/`aria-controls`, no breadcrumb |
| `sidebar.tsx` | 195 | 83 | admin: **no** focus trap, **no** Escape, **no** focus restore, **no** `role="dialog"` |

**Evidenza**. Web `sidebar.tsx:64-129` implementa focus trap WCAG 2.1 §2.1.2, gestione `Escape`, guard di contenimento, restore del focus sul trigger, `role="dialog"` + `aria-modal`. Admin `sidebar.tsx:40-81` ha un drawer mobile **senza nessuno di questi**.

Admin `header.tsx:19-26` ha il toggle **senza `aria-expanded` né `aria-controls`**, e con `aria-label="Toggle sidebar"` **hardcoded** invece che via `react-intl`.

Web `app-shell.tsx` monta `SkipLink` + `RouteErrorBoundary` keyed su pathname + `<main id="main-content" tabIndex={-1}>`. Admin monta solo `<main className="flex-1 overflow-y-auto p-6"><Outlet /></main>` — **nessun error boundary**: un throw in `TenantsPage` produce schermo bianco totale.

**Bug collaterale**: admin usa `location.pathname.startsWith(item.to)` per l'active state. `/tenants` matcha anche `/tenants/$id`, e `/plugins` matcherebbe una futura `/plugins-archive`.

**Vantaggi**
- Admin ottiene focus trap, Escape, focus restore, skip link ed error boundary **senza scriverli** — chiude un gap WCAG 2.1 AA reale
- Un solo posto in cui correggere bug di navigazione (es. il `startsWith` sbagliato)
- Il `SidebarSlot` per i plugin diventa opzionale via prop

**Svantaggi / rischi**
- Le due shell hanno **requisiti visivi diversi**: web ha sidebar collassabile a 64 px + breadcrumb + workspace selector, admin ha sidebar fissa 256 px + logout inline. Il componente condiviso rischia di accumulare prop fino a diventare illeggibile
- `apps/web/e2e/shell-a11y.spec.ts` e `sidebar-drawer.spec.ts` testano la shell di web: il refactor li tocca entrambi
- Il `SidebarSlot` accoppia la shell di web al Module Federation host: estrarla richiede iniezione di dipendenza pulita
- 💡 **Alternativa più economica e forse migliore**: invece di estrarre la shell (grande), portare solo `useMediaQuery`, `RouteErrorBoundary` + `ErrorFallback` e `SidebarNavItem` in condiviso, lasciando le due `AppShell` separate. Risparmia meno righe ma chiude il gap a11y con **1/3 del rischio**

---

<a id="8"></a>
## 8. `use-tenant-lifecycle.ts`: 90 righe di wrapper che riavvolgono TanStack Query

**Categoria**: complessità + codice morto · **Severità**: 🟡 Media · **LOC**: ~90 · **Effort**: S

**Posizione**: `apps/admin/src/hooks/use-tenant-lifecycle.ts:53-72, 76-95, 99-122, 174-199` — **200 righe totali, il file più lungo del repo, al limite esatto della Rule 4**

Tre hook con lo stesso identico corpo, differenti solo per la `mutationFn`. Il tipo di ritorno `UseXxxResult` è una **ri-dichiarazione manuale di `UseMutationResult`**, che perde `isSuccess`, `data`, `variables`, `status`, `mutateAsync`. E le 5 interfacce esportate **non sono importate da nessun file**.

Lo stesso pattern è in `use-tenants.ts:19-24,73-81` e `use-logs.ts:18-21`.

**Confronto**: gli hook di `apps/web` non fanno questo. `web/src/hooks/use-workspaces.ts:64-72` è semplicemente `return useMutation({ mutationFn, onSuccess })`. **Due stili diversi per la stessa operazione → violazione della Rule 3.**

**Vantaggi**
- Un solo stile di hook TanStack Query in tutto il monorepo
- I consumatori riacquistano accesso a `isSuccess`/`data`/`mutateAsync` senza modificare l'hook
- Il file più lungo del repo scende sotto la soglia di guardia (200 → ~145)

**Svantaggi / rischi**
- I tipi espliciti sono **difendibili**: rendono l'API dell'hook stabile rispetto a upgrade di TanStack Query e documentano il contratto. Rimuoverli è una scelta di stile, non un fix oggettivo — vanno rimossi **solo** se si adotta consapevolmente lo stile di `apps/web` come standard
- I consumatori fanno destructuring: con `useMutation` grezzo continua a funzionare, ma `error` diventa `ApiError | null` implicito — verificare i controlli `error instanceof ApiError` (`suspend-dialog.tsx:50`)

---

<a id="9"></a>
## 9. `SuspendDialog` e `ReactivateDialog`: 107 e 106 righe, differiscono per 6 token

**Categoria**: duplicazione intra-app · **Severità**: 🟡 Media · **LOC**: ~85 · **Effort**: S

**Posizione**: `apps/admin/src/components/tenants/suspend-dialog.tsx` (107) vs `reactivate-dialog.tsx` (106)

Il commento stesso lo ammette (`reactivate-dialog.tsx:2`): *"Mirrors the suspend dialog with reactivate messaging"*. Le uniche differenze in 106 righe:

| | suspend | reactivate |
| - | ------- | ---------- |
| icona | `AlertTriangle` `text-warning` | `PlayCircle` `text-success` |
| hook | `useSuspendTenant()` | `useReactivateTenant()` |
| prop callback | `onSuspended` | `onReactivated` |
| 4 chiavi i18n | `tenants.suspend.*` | `tenants.reactivate.*` |

Tutto il resto — `handleOpenChange`, `handleConfirm`, il calcolo `isConflict`/`errorMessage`, l'intero JSX, i due `Button` — è **carattere per carattere identico**.

**Vantaggi**
- Un fix al comportamento in caso di 409 si applica automaticamente a entrambe (oggi vanno modificati due file)
- Riduce il rischio che le due dialog divergano su accessibilità o gestione errori
- Il pattern si estende naturalmente a future azioni di lifecycle

**Svantaggi / rischi**
- Sono solo **due** istanze: il "rule of three" non è soddisfatto. Se non è prevista una terza azione di lifecycle, l'astrazione è **prematura**
- I test E2E `005-05-suspend.spec.ts` e `005-06-reactivate.spec.ts` puntano ai dialog: cambiare la struttura DOM va verificato
- Il prefisso i18n come stringa (`"tenants.suspend"`) fa **perdere il type-checking sulle chiavi** di `MessageKey`, oggi garantito dai `<FormattedMessage id="..." />` letterali

---

<a id="10"></a>
## 10. Nessun code-splitting per route: tutte le pagine nel bundle iniziale

**Categoria**: performance · **Severità**: 🟡 Media · **LOC**: 0 · **Effort**: M

**Posizione**: `apps/web/src/router-shell-routes.tsx:8-25` (18 import statici) · `apps/admin/src/router-shell-routes.tsx:9-16` (8) · entrambi i `vite.config.ts` senza `rollupOptions.output.manualChunks`

L'unico `React.lazy` in tutto il codebase è per la route di test (`router.tsx:18-22`). TanStack Router supporta nativamente `lazyRouteComponent()`, **non usato in nessuna delle 26 route reali**.

Conseguenza: chi apre `/dashboard` su web scarica anche `marketplace-page` (192 righe + `PluginCard` + `PluginDetailSheet`), `admin-dlq-page`, `workspace-tree` (156), tutto l'`mf-host` (`plugin-loader` 149 + `error-boundary` 105 + `plugin-dev-watcher` 104), `react-colorful` (usato solo in `/settings/branding`), e i 308 messaggi i18n.

> ⚠️ Non ho misurato il bundle reale (nessuna `dist/` presente), quindi non quantifico i KB.

**Vantaggi**
- Time-to-interactive migliore sulla prima schermata, quella che conta per la percezione di velocità
- I chunk vendor separati sfruttano la cache HTTP tra deploy (React non cambia a ogni release)

**Svantaggi / rischi**
- ⚠️ **Attenzione su web**: `vite.config.ts:11-24` configura Module Federation con `shared: { react, react-dom, @tanstack/react-query, @plexica/ui, react-intl }`. `manualChunks` custom può **interferire con lo share scope della federation e rompere il caricamento dei plugin remoti**. Va testato con `apps/web/e2e/plugin-system/`
- `modulePreload: false` è già impostato: introdurre lazy route senza preload aumenta la latenza al *primo* click su ogni sezione. Serve un preload strategico su hover dei link sidebar
- Ogni chunk lazy va avvolto in `<Suspense>` con un fallback sensato, altrimenti si vede uno sfarfallio bianco

---

<a id="11"></a>
## 11. Extension slot per plugin: 3 wrapper identici, tutti invocati con array vuoto

**Categoria**: duplicazione + codice inerte · **Severità**: 🟡 Media · **LOC**: ~65 · **Effort**: S

**Posizione**: `mf-host/extension-slots/sidebar-slot.tsx` (28) · `dashboard-widget-slot.tsx` (27) · `workspace-panel-slot.tsx` (28)

I tre file sono lo **stesso componente** con 2 stringhe diverse. Riducibili a `<ExtensionSlot point="..." wrapper="..." />` (~15 righe totali invece di 83).

**Ma il problema più grave**: 2 dei 3 slot sono chiamati con literal vuoto:

```tsx
dashboard-page.tsx:113  → <DashboardWidgetSlot pluginEntries={[]} />
sidebar.tsx:51          → <SidebarSlot pluginEntries={[]} />
```

`filter()` restituisce sempre `[]`, quindi il componente ritorna sempre `null`. **I due slot non renderizzano mai nulla.** Solo `workspace-detail-page.tsx:175` passa dati reali.

**Effetto collaterale performance**: l'array literal `[]` è una nuova reference a ogni render. `PluginSlotInner` ha `useMemo(..., [entries])` — quel memo verrebbe invalidato a ogni render. Oggi è innocuo perché il componente ritorna `null` prima, ma diventerà un problema quando i dati saranno cablati.

Inoltre `PluginContextProvider` fa un `useMemo` di 20 righe per popolare un Context che **nessun componente consuma** (`usePluginContext` è un export morto — [#4](#4)).

**Vantaggi**
- Un solo componente slot invece di 3+N (ogni nuovo extension point oggi richiede un file da 28 righe)
- Chiarisce lo stato reale della feature plugin (oggi il codice suggerisce che gli slot funzionino)
- Previene la memo-invalidation quando i dati arriveranno

**Svantaggi / rischi**
- Il sistema MF plugin è una feature architetturale centrale. Rimuovere invocazioni "in attesa di cablaggio" potrebbe cancellare uno **scaffold intenzionale** — verificare in `.forge/specs/004*` prima
- Gli E2E `plugin-system/ac-03-visibility.spec.ts` potrebbero dipendere dalla presenza dei componenti slot nel DOM

---

<a id="12"></a>
## 12. Tipi API duplicati a mano dal backend Zod, senza generazione

**Categoria**: type safety · **Severità**: 🟡 Media · **LOC**: ~250 · **Effort**: L · **Richiede ADR**

**Posizione**: `apps/admin/src/types/admin-types.ts` (199 righe, commento riga 2: *"Mirrors backend Zod schemas"*) · `apps/web/src/types/` (7 file) vs `services/core-api/src/modules/admin/schemas/`

Nessun tool di generazione: `grep -rn "openapi\|zod-to-json"` → nessun risultato.

**Divergenza già presente** tra le due app sullo stesso concetto:

```ts
// apps/web/src/types/audit.ts:4-14
interface AuditLogEntry { actionType, targetType, targetId, beforeValue, afterValue, ipAddress }
// apps/admin/src/types/admin-types.ts:92-102
interface AuditEntry { action, resourceType, resourceId, tenantId, metadata, ipAddress }
```

Due nomi, due shape, stesso dominio.

**⚠️ Discrepanza fattuale su Kafka**: `web/src/services/plugin-api.ts:111-112` chiama `/api/v1/admin/system/kafka` tipizzandolo `{ lag: number; status: string }[]`, mentre `admin/src/services/admin-api.ts:119-121` chiama **lo stesso endpoint** tipizzandolo `{ brokers, consumerLags, dlqDepth }`. **Almeno uno dei due è sbagliato.**

**Vantaggi**
- Un cambio di shape nel backend rompe il typecheck del frontend in CI, invece di produrre un `undefined` a runtime
- Elimina la classe di bug rappresentata dalla discrepanza Kafka
- I client possono validare le risposte con lo stesso schema Zod (oggi `createApiClient.parseResponse` fa solo un `typeof === 'object'`)

**Svantaggi / rischi**
- Accoppia frontend e backend a livello di build: `apps/*` dovrebbero dipendere da `services/core-api`, cosa che oggi **non** avviene ed è una scelta architetturale deliberata da preservare. La soluzione corretta è un package `@plexica/api-types` *terzo*, che costa lavoro di riorganizzazione
- Gli schemi Zod del backend contengono anche schemi di *richiesta* e validazioni interne che non devono finire nel bundle client
- **Richiede un ADR**

> 💡 **Priorità immediata a prescindere**: allineare i due tipi Kafka. È una discrepanza fattuale, non stilistica.

---

<a id="13"></a>
## 13. Stringhe UI hardcoded: 7 occorrenze (violazione react-intl)

**Categoria**: violazione pattern / accessibilità · **Severità**: 🔵 Bassa · **LOC**: 0 · **Effort**: S

```
apps/admin/.../header.tsx:23                      aria-label="Toggle sidebar"
apps/admin/.../step-progress-indicator.tsx:46     aria-label="Provisioning progress"
apps/admin/.../tenant-detail-info-tab.tsx:38      aria-label="Tenant information"
apps/web/.../dashboard-page.tsx:51                aria-label="Retry"
apps/web/.../dashboard-page.tsx:116               aria-label="Recent activity"
apps/web/.../breadcrumb.tsx:29                    aria-label="Breadcrumb"
apps/web/.../action-matrix-table.tsx:17           aria-label="Yes"
```

Le chiavi esistono già in parte: `common.retry` è definita in `messages.en.settings-common.ts` e usata da `page-error.tsx:32`, ma `dashboard-page.tsx:51` la ignora e hardcoda `"Retry"`.

**Vantaggi**
- Gli `aria-label` sono **esattamente** ciò che deve essere tradotto: sono il testo che gli screen reader annunciano. Lasciarli in inglese rende l'app inaccessibile agli utenti non anglofoni con assistive technology
- 7 fix da una riga ciascuno, rischio nullo

**Svantaggi / rischi**
- La ESLint rule `jsx-no-literals` proposta per prevenire recidive è rumorosa se non configurata con precisione (`allowedStrings`, `ignoreProps`) e può generare centinaia di falsi positivi

---

<a id="14"></a>
## 14. `<a href="/dashboard">` in `ErrorFallback` per navigazione interna

**Categoria**: violazione pattern · **Severità**: 🔵 Bassa · **LOC**: 0 · **Effort**: S

**Posizione**: `apps/web/src/components/error/error-fallback.tsx:41-46`

```tsx
{/* Full-page navigation to /dashboard forces a React tree remount, which
    definitively resets the error boundary state. A client-side Link cannot
    reset a class component error boundary ... */}
<a href="/dashboard" className="...">
```

La giustificazione è **parzialmente valida ma superata dal codice esistente**: `app-shell.tsx:27-34` già implementa `KeyedErrorBoundary` con `key={location.pathname}`, che rimonta il boundary a ogni cambio di route. Un `<Link to="/dashboard">` **funzionerebbe**, perché il cambio di pathname cambia la key.

Il secondo caso, `skip-link.tsx:5-6` (`<a href="#main-content">`), è **corretto** — anchor intra-pagina, va lasciato.

**Vantaggi**
- Elimina un full page reload (perde tutto lo stato di TanStack Query, ri-scarica il bundle, ri-autentica)
- Riconcilia il codice con la regola dichiarata, o documenta con precisione l'eccezione

**Svantaggi / rischi**
- ⚠️ Se il test E2E rivela che il boundary *effettivamente* non si resetta, il fix va abbandonato e il commento aggiornato. **Non cambiare senza eseguire `error-boundary.spec.ts`**

---

<a id="15"></a>
## 15. Configurazione build/tooling duplicata

**Categoria**: duplicazione cross-app · **Severità**: 🔵 Bassa · **LOC**: ~40 · **Effort**: S

| File | Diff web ↔ admin |
| ---- | ---------------- |
| `postcss.config.js` | **0 righe di diff** (8 righe identiche) |
| `src/styles/globals.css` | 1 riga di commento (16 righe) |
| `tailwind.config.ts` | 1 riga di commento (16 righe) |
| `tsconfig.json` | web **manca** `"strict": true` |
| `vite.config.ts` | web 50, admin 27 |

**⚠️ Problema sostanziale**: `apps/admin/tsconfig.json` ha `"strict": true`, `apps/web/tsconfig.json` no. Va verificato se `tsconfig.base.json` lo abilita già. Se sì, la riga in admin è ridondante; **se no, `apps/web` non è in strict mode** — non accettabile per 9.000 righe di codice.

Inoltre `apps/web/tsconfig.json:11` include `["src/**/*", "e2e/**/*"]` mentre admin include anche `"playwright.config.ts"` — quindi `apps/web/playwright.config.ts` (173 righe) **non è type-checked**.

Divergenze in `vite.config.ts`: `target: 'esnext'` (web) vs `'ES2022'` (admin); `changeOrigin: false` (web) vs `true` (admin).

**Vantaggi**
- Impossibile che `strict` o il build target divergano di nuovo
- `playwright.config.ts` di web entra nel typecheck (173 righe oggi non verificate)
- Un solo posto per aggiornare Tailwind o PostCSS

**Svantaggi / rischi**
- Tailwind risolve i path di `content` **relativi al file di config**: spostarlo alla root richiede di riscrivere tutti i glob, con rischio di **CSS purgato per errore** (bug silenzioso che si manifesta solo in produzione)
- `changeOrigin: false` su web è probabilmente **intenzionale** (routing multi-tenant per sottodominio): non uniformare senza capire
- Il fix su `strict` potrebbe far emergere decine di errori in `apps/web`: è un lavoro a sé, non un cleanup di config

---

<a id="16"></a>
## 16. Duplicazione minore: `useDebouncedValue`, `Set` di operazioni pending, badge di stato

**Categoria**: duplicazione intra/cross-app · **Severità**: 🔵 Bassa · **LOC**: ~90 · **Effort**: S

**a) Debounce implementato due volte**: `admin/hooks/use-tenants.ts:26-33` (hook riusabile ma **privato al file**) e `web/pages/marketplace-page.tsx:39-46` (stesso effetto scritto inline).

**b) Pattern "Set di id in-flight" ripetuto 4 volte** con corpo identico: `marketplace-page.tsx:35,74-83` · `admin-dlq-page.tsx:18,34-45` e `:19,47-58` · `installed-plugins-page.tsx:28,37-46`.

**c) Badge di stato: 4 implementazioni della stessa idea**: `web/plugins/status-badge.tsx` · `admin/plugins/plugin-status-badge.tsx` · `admin/tenants/tenant-status-badge.tsx` · `admin/dashboard/health-indicator.tsx`. I tre di admin condividono la stringa esatta `'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium'`.

Esiste già un `Badge` in `@plexica/ui` (46 righe) usato **solo** da `admin-plugin-registry-page.tsx:95` — il design system ha un Badge che 4 componenti su 5 ignorano.

**Vantaggi**
- `web/status-badge.tsx` guadagna l'icona → conformità **WCAG 1.4.1** ("non veicolare informazione col solo colore"), che gli altri 3 hanno e lui no
- Coerenza visiva dei badge tra le due app (oggi web usa `bg-success-base/10`, admin `bg-success-light` — due scale di token diverse)
- `usePendingSet` rimuove 4 copie di logica identica soggetta a bug di closure

**Svantaggi / rischi**
- Il `Badge` di `@plexica/ui` ha un'API `{ variant, label }` da estendere senza rompere l'unico consumatore
- I 4 badge hanno **palette diverse**: unificarli è un cambio visivo che va approvato dal design, non un refactor puro
- `usePendingSet` è un'astrazione da 15 righe per sostituirne 10×4: guadagno netto modesto, costo cognitivo non nullo

---

<a id="17"></a>
## 17. `apps/web` ospita 2 pagine super-admin che duplicano lo scope di `apps/admin`

**Categoria**: duplicazione cross-app (architetturale) · **Severità**: 🟡 Media · **LOC**: ~200 · **Effort**: L

**Posizione**
- `apps/web/src/pages/admin-plugin-registry-page.tsx` (140 righe) — route `/admin/plugins`
- `apps/web/src/pages/admin-dlq-page.tsx` (134 righe) — route `/admin/system/dlq`
- Controparti: `apps/admin/src/pages/plugins-page.tsx` (120), `kafka-page.tsx` (138)

`web/admin-plugin-registry-page.tsx` e `admin/plugins-page.tsx` fanno **la stessa cosa** (catalogo plugin globale con publish/unpublish/review) su **lo stesso endpoint** `/api/v1/admin/plugins`, con due implementazioni, due set di tipi, due set di chiavi i18n.

**Nota di sicurezza (non vulnerabilità)**: le due route `/admin/*` in web sono figlie di `shellRoute` **senza alcun guard di ruolo** (`router-shell-routes.tsx:125-135` non ha `beforeLoad`). La protezione è interamente lato server. Non è una falla — il backend applica ABAC — ma un utente non-admin che indovina l'URL vede la pagina renderizzata con errori API invece di un 403 pulito. **UX degradata.**

**Proposta**
1. Decisione architetturale: stabilire che le funzionalità super-admin vivono **solo** in `apps/admin`; portare il DLQ (assente in admin) dentro `apps/admin`
2. In alternativa, se le pagine in web servono per l'accesso tenant-side, rimuoverle da `apps/admin`
3. In ogni caso: allineare il tipo Kafka
4. Finché le route restano in web, aggiungere `beforeLoad` con check di ruolo → redirect

**Vantaggi**
- Un solo posto in cui implementare/evolvere le funzionalità super-admin
- Elimina la discrepanza di tipo su `/api/v1/admin/system/kafka`
- Riduce il bundle di `apps/web`, l'app con più utenti e più sensibile alla performance

**Svantaggi / rischi**
- ⚠️ **È una decisione di prodotto/architettura, non di codice.** Le due pagine in web potrebbero essere una scelta deliberata (super-admin che opera dentro il contesto tenant senza cambiare app). Va chiarito con chi ha scritto la spec 004 prima di toccare nulla
- Gli E2E `plugin-system/ac-05-marketplace.spec.ts` e `ac-06-dlq.spec.ts` coprono queste pagine: rimuoverle significa riscrivere o spostare i test
- Il DLQ oggi esiste solo in web: spostarlo in admin è lavoro di **porting**, non di cancellazione

---

<a id="18"></a>
## 18. Duplicazione negli helper E2E

**Categoria**: duplicazione cross-app · **Severità**: 🔵 Bassa · **LOC**: ~40 · **Effort**: S

**Posizione**: `apps/web/e2e/helpers/base-fixture.ts` (118) vs `apps/admin/e2e/helpers/base-fixture.ts` (43); i due `playwright.config.ts`; i due `global-teardown.ts`

Il core della fixture è identico (~15 righe): abort di `fonts.googleapis.com`/`fonts.gstatic.com`, `context.clearCookies()`, override di `page.goto` con `waitUntil: 'domcontentloaded'`. Il `global-teardown` differisce solo per quale fixture eliminare, entrambi da `../../../e2e/fixtures/core-fixtures.js` — esiste già un layer condiviso a root `/e2e/`.

**⚠️ Nota di correttezza**: `apps/admin/e2e/helpers/base-fixture.ts:2-5` dice *"the admin app uses a React login form (no Keycloak browser redirect flow)"*. Questo è **falso**: `admin-login.ts:2-9` documenta la migrazione a PKCE redirect (ADR-023), e `admin/src/pages/login-page.tsx:14-18` fa `useEffect(() => void login())` che redirige a Keycloak. Il commento va corretto — e potrebbe indicare che l'override di `waitForURL` **serve anche ad admin**.

**Vantaggi**
- Un fix di flakiness applicato a entrambe le suite
- Corregge il commento fuorviante e forza la domanda "serve anche ad admin l'override di `waitForURL`?" — che potrebbe eliminare flakiness già presente

**Svantaggi / rischi**
- Le fixture E2E sono l'ultimo posto in cui si vuole introdurre indirezione: quando un test è flaky, il debug deve essere immediato
- `playwright.config.ts` di web ha requisiti d'ambiente stringenti che admin non ha: unificare rischia di imporre requisiti inutili ad admin

---

## Tabella riepilogativa

| # | Finding | Categoria | Severità | LOC | Effort |
| -: | ------- | --------- | -------- | --: | :----: |
| [1](#1) | Layer auth duplicato web↔admin (25 righe byte-identiche + store) | dup. cross-app | 🟠 Alta | ~200 | M |
| [2](#2) | `EmptyState`/`PageError`/`Skeleton` assenti in admin → 16 reimplementazioni | dup. cross-app | 🟠 Alta | ~150 | M |
| [3](#3) | Pattern query-state ripetuto 23 volte | dup. intra-app | 🟡 Media | ~180 | M |
| [4](#4) | Codice morto: 3 file + 15 export mai importati | codice morto | 🟡 Media | ~180 | S |
| [5](#5) | `login-page.tsx`: form `useState`, morto | violazione pattern | 🟡 Media | 67 | S |
| [6](#6) | `profile-api.ts` → URL `/api/api/v1/...` (**bug**) + upload duplicate | correttezza | 🟠 Alta | ~30 | S |
| [7](#7) | Shell divergente: admin senza focus trap, skip link, error boundary | dup. + UX | 🟠 Alta | ~70 | L |
| [8](#8) | `use-tenant-lifecycle.ts`: 90 righe di wrapper, 5 tipi morti | complessità | 🟡 Media | ~90 | S |
| [9](#9) | `SuspendDialog` vs `ReactivateDialog`: 6 token di differenza | dup. intra-app | 🟡 Media | ~85 | S |
| [10](#10) | Nessun code-splitting: 26 route con import statici | performance | 🟡 Media | 0 | M |
| [11](#11) | 3 extension-slot identici, 2 invocati con `pluginEntries={[]}` | dup. + inerte | 🟡 Media | ~65 | S |
| [12](#12) | Tipi API ricopiati a mano; tipo Kafka **incompatibile** tra le app | type safety | 🟡 Media | ~250 | L |
| [13](#13) | 7 `aria-label` hardcoded | violazione pattern | 🔵 Bassa | 0 | S |
| [14](#14) | `<a href="/dashboard">` in `ErrorFallback` | violazione pattern | 🔵 Bassa | 0 | S |
| [15](#15) | Config duplicata; `strict` forse assente in web | dup. cross-app | 🔵 Bassa | ~40 | S |
| [16](#16) | `useDebouncedValue` ×2, `Set` pending ×4, badge ×4 | dup. intra/cross | 🔵 Bassa | ~90 | S |
| [17](#17) | 2 pagine super-admin in `apps/web` duplicano `apps/admin` | dup. architetturale | 🟡 Media | ~200 | L |
| [18](#18) | Helper E2E con core comune | dup. cross-app | 🔵 Bassa | ~40 | S |
| | **Totale** | | | **~1.740 (12 %)** | |

---

## Ordine di esecuzione consigliato

**Priorità 1 — fix di correttezza, rischio ~nullo** (effort S, ~1 giorno)
[#6](#6) (bug URL avatar + tipo Kafka di [#12](#12)) → [#13](#13) (aria-label i18n) → [#4](#4)+[#5](#5) (codice morto) → [#15](#15) (verificare `strict` in web)

**Priorità 2 — riduzione reale con rischio contenuto** (effort S/M, ~3-4 giorni)
[#2](#2) (feedback components in `@plexica/ui`) → [#8](#8) → [#9](#9) → [#16](#16) → [#11](#11)

**Priorità 3 — richiedono decisione prima del codice**
[#17](#17) (dove vivono le funzionalità super-admin?) → [#12](#12) (ADR per `@plexica/api-types`) → [#7](#7) (shell intera o solo error boundary + `useMediaQuery`?) → [#1](#1) (auth: solo con E2E verdi)

**Priorità 4 — misurare prima di agire**
[#10](#10): fare un build e misurare il bundle prima di introdurre `manualChunks`, che su web può interferire con lo share scope di Module Federation

---

## Nota metodologica

Dei ~1.740 LOC, circa **400 sono cancellazioni pure** (findings [4](#4), [5](#5), [11](#11), [17](#17)) — guadagno netto immediato. I restanti ~1.340 sono **spostamenti in astrazioni condivise**, che riducono la duplicazione ma aggiungono indirezione.

I findings [3](#3), [7](#7) e [9](#9) in particolare hanno solo **due** consumatori: il "rule of three" non è soddisfatto, e astrarre ora potrebbe produrre l'astrazione sbagliata. La raccomandazione è di eseguire integralmente le priorità 1 e 2, e di trattare la 3 come proposte da validare con chi conosce la roadmap.

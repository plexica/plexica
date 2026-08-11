# 05 — Build, CI, infrastruttura, test E2E e documentazione

> Perimetro: 12 `package.json`, 14 `tsconfig.json`, 4 file compose, 3 workflow + 1 composite action, 8.192 righe di E2E, 4 script shell root, 5 documenti in `docs/`
> 31 findings · ~450 righe di config riducibili + 87 file morti + ~2–4 min di CI per run

[← Torna all'indice](./README.md)

---

<a id="1"></a>
## 1. Specificatori di versione `"latest"` in 15 dipendenze di produzione

**Categoria**: dipendenze · **Severità**: 🔴 Critica · **Effort**: S

**Posizione**: `apps/web/package.json:20,21,22,27,29,36` · `apps/admin/package.json:18,19,20,25,26,28,34` · `packages/ui/package.json:19` · `examples/plugins/crm/package.json:22`

```json
"@radix-ui/react-avatar": "latest",
"@tanstack/react-query": "latest",
"lucide-react": "latest",
"zustand": "latest"
```

**Conseguenza misurata nel lockfile**: `lucide-react` ha **5 copie installate** in `node_modules/.pnpm`: `0.400.0_react@19.2.7`, `0.400.0_react@19.2.8`, `1.25.0_react@19.2.7`, `1.27.0_react@19.2.7`, `1.27.0_react@19.2.8`. `packages/ui/package.json:31` dichiara `^0.400.0` mentre le app dichiarano `latest` → **salto di due major** tra design system e app consumer.

**Proposta**: sostituire tutti i `latest` con range semver espliciti allineati alla versione già risolta nel lockfile; centralizzare con `catalog:` ([#3](#3)).

**Vantaggi**
- Build riproducibili — oggi un `pnpm install` senza lockfile produce un albero diverso ogni settimana
- Dependabot torna utile: con `latest` non può proporre bump (`.github/dependabot.yml:35-38` ignora i major, ma `latest` li introduce silenziosamente)
- Elimina il rischio che design system e app consumer usino major diverse dello stesso componente Radix

**Svantaggi / rischi**
- Nessuno tecnico; richiede una PR di allineamento e una re-run completa della CI per validare le versioni fissate

---

<a id="2"></a>
## 2. 17 dipendenze dichiarate ma mai importate

**Categoria**: dipendenze · **Severità**: 🟠 Alta · **Effort**: S

Verificato con grep sugli import reali (`node_modules` e `dist` esclusi):

| Workspace | Dipendenza | Riga | Import |
| --------- | ---------- | ---- | -----: |
| `apps/web` | `@radix-ui/react-navigation-menu` | `:22` | 0 |
| `apps/web` | `@radix-ui/react-popover` | `:23` | 0 |
| `apps/web` | `@radix-ui/react-select` | `:24` | 0 |
| `apps/web` | `@radix-ui/react-switch` | `:25` | 0 |
| `apps/web` | `@radix-ui/react-tabs` | `:26` | 0 |
| `apps/web` | `react-colorful` | `:31` | 0 |
| `apps/admin` | 8 pacchetti `@radix-ui/*` | `:18-25` | **0 tutti** |
| `packages/ui` | `@radix-ui/react-avatar`, `react-navigation-menu` | `:19,22` | 0 |
| `packages/sdk` | `kafkajs` | `:17` | 0 |
| `packages/auth` | `@tanstack/react-router` (devDep) | `:34` | 0 |
| `services/core-api` | `@fastify/http-proxy` | `:23` | 0 |

Il caso `packages/sdk` è auto-documentato: `__tests__/sdk.test.ts:2` recita *«The SDK no longer imports kafkajs (core manages Kafka); the dead mock is gone.»* ma `kafkajs` è ancora in `dependencies`.

`apps/admin` è il caso più netto: **tutti e 8** i `@radix-ui/*` diretti hanno 0 import; i componenti arrivano da `@plexica/ui`.

**Righe/tempo risparmiabili**: −17 righe di manifest; **~40–60 MB** di `node_modules`; 15–25 s di `pnpm install` in CI; superficie SCA ridotta di 17 alberi transitivi.

**Vantaggi**
- Meno CVE da triage nello scan Trivy con `exit-code: 1` (`sca.yml:48`), che oggi fallisce su vulnerabilità di pacchetti **che non vengono nemmeno caricati**
- Chiarisce il confine architetturale: le app consumano Radix **solo** via `@plexica/ui`

**Svantaggi / rischi**
- ⚠️ `apps/web` importa **direttamente** `@radix-ui/react-avatar` (`components/layout/avatar.tsx:6`) e `react-dropdown-menu` (`user-menu.tsx:5`): quelle due **vanno mantenute** (o meglio, i componenti vanno spostati in `@plexica/ui`)
- Rimuovere dipendenze dirette usate transitivamente rompe se `node-linker=hoisted`; con pnpm isolato (default qui) è sicuro solo per pacchetti a 0 import — verificato

---

<a id="3"></a>
## 3. Nessun uso di `catalog:` pnpm: 23 dipendenze duplicate identiche + 14 divergenti

**Categoria**: dipendenze · **Severità**: 🟠 Alta · **Effort**: M

**Posizione**: `pnpm-workspace.yaml:1-5` (5 righe, nessun blocco `catalog`)

**23 dipendenze con versione identica** ripetuta in ≥2 workspace:

```
typescript ^5.9.0        ×11    vitest ^4.1.10          ×4
vite (5 varianti)        ×7     @types/node ^24.0.0     ×5
@tanstack/react-router   ×3     react-hook-form ^7.82.0 ×3
react-intl ^6.6.0        ×3     tailwindcss ^3.4.0      ×3
@hookform/resolvers      ×3     @radix-ui/react-* (4)   ×3 ciascuna
@playwright/test ^1.62.0 ×2     postcss, autoprefixer   ×2
```

**14 con versione divergente**, tra cui:

| Dipendenza | Divergenza |
| ---------- | ---------- |
| `zod` | `^3.25.76` (web/admin/crm) vs `^3.22.0` (`core-api:37`) |
| `@originjs/vite-plugin-federation` | `^1.4.1` (`apps/web:17`) vs `^1.3.5` (`packages/vite-plugin:20`) — **due implementazioni diverse dello stesso protocollo MF nello stesso runtime** |
| `jose` | `6.2.3` pinnato (`packages/auth:31`) vs `^6.2.3` (`core-api:30`) |
| `fastify` | `^5.8.5` vs `^5.0.0` |

**Vantaggi**
- Un solo punto di bump per dipendenza; Dependabot apre 1 PR invece di 5–11
- Elimina il drift silenzioso (es. `zod` 3.22 vs 3.25 tra API e frontend che condividono schemi)
- Riduce le permutazioni nel lockfile (oggi 369.602 righe)
- Le ~80 righe di versione sparse diventano ~35 centralizzate (**−45 nette**)

**Svantaggi / rischi**
- `catalog:` richiede pnpm ≥ 9.5 — OK (`package.json:9` esige `>=10`)
- Alcuni tool esterni (Renovate, Trivy, Snyk) hanno supporto `catalog:` parziale; verificare che `sca.yml` continui a risolvere le versioni
- Perde granularità: un workspace che deve restare su una versione vecchia va escluso esplicitamente

---

<a id="4"></a>
## 4. `packages/keycloak-theme` forza un secondo albero React completo (19.2.7 vs 19.2.8)

**Categoria**: dipendenze · **Severità**: 🟠 Alta · **Effort**: S

**Posizione**: `packages/keycloak-theme/package.json:15-16` → `"react": "^19"`, `"react-dom": "^19"` contro `^19.2.8` in tutti gli altri 7 workspace.

Il lockfile risolve `packages/keycloak-theme` → `react@19.2.7`, **unico importer a farlo**. Ricaduta a cascata in `node_modules/.pnpm`:

```
react@19.2.7 + react@19.2.8
@tanstack+react-query@5.101.4_react@19.2.7  +  …_react@19.2.8
zustand@5.0.14_…react@19.2.7                +  …react@19.2.8
react-intl@6.8.9_react@19.2.7               +  …react@19.2.8
lucide-react  ×4 permutazioni
```

Aggravato dal fatto che `packages/keycloak-theme` dipende da `@plexica/ui` (`:19`), che a sua volta ha peer React.

**Vantaggi**
- Elimina il classico rischio "Invalid hook call / two copies of React" nella build Keycloakify che importa componenti `@plexica/ui`
- Deduplica automaticamente 4+ alberi di dipendenze React-peered
- ~30–50 MB di `node_modules`, 10–20 s di `pnpm install`

**Svantaggi / rischi**
- Keycloakify (`^11`) potrebbe avere un peer range stretto — da verificare con `pnpm why react`

---

<a id="5"></a>
## 5. La CI avvia due stack Docker completi in parallelo

**Categoria**: docker-infra / CI-CD · **Severità**: 🔴 Critica · **Effort**: M

**Posizione**: `.github/workflows/ci.yml:72-80` + `:126-127` → `apps/web/package.json:11` → `scripts/run-web-e2e-production.sh:21,90,105`

**Evidenza**
- Lo step *Start Docker infrastructure* avvia il progetto `plexica-ci` su porte standard: `postgres keycloak redis minio redpanda mailpit loki`
- **Lo stack non viene mai fermato** prima degli E2E (teardown solo a `ci.yml:183-185`, `if: always()`)
- `pnpm --filter web test:e2e` invoca `run-web-e2e-production.sh` che crea un **secondo** progetto compose:
  ```bash
  export COMPOSE_PROJECT_NAME="plexica-e2e-$RUN_ID"        # :21
  export POSTGRES_PORT=15432 KEYCLOAK_PORT=18080 …         # :56-66
  "${COMPOSE[@]}" up -d --wait … postgres keycloak redis minio redpanda mailpit loki  # :105
  ```
- Conferma indiretta: `ci.yml:123` pulisce esplicitamente le porte del secondo stack

**Somma dei limiti memoria** da `docker-compose.ci.yml` per i 7 servizi: **~2,26 GB per stack → ~4,5 GB** su un runner documentato a **7 GB**.

**Proposta** (in ordine di rischio crescente)
1. Fermare lo stack `plexica-ci` subito dopo *Run unit and integration tests* (`ci.yml:107`) → dimezza la memoria di picco senza cambiare la logica
2. Meglio: splittare in due job (`backend-tests` e `e2e`) che girano in parallelo su runner separati

**Vantaggi**
- Rimuove la causa più probabile di flakiness/OOM su runner condiviso
- Isolamento reale: oggi due Redpanda con topic omonimi convivono
- Il boot di Keycloak con `--import-realm` è il collo di bottiglia (`start_period: 60s`, `retries: 20`): si risparmiano **60–120 s**
- Con il job split si guadagna il fail-fast (i test unitari falliscono in 5 min invece che dopo 40) e ~40 % di tempo wall

**Svantaggi / rischi**
- Lo split job richiede di ripetere `pnpm install` + `prisma generate` nel secondo job (mitigabile con la cache di [#9](#9))
- Su runner self-hosted, due job paralleli richiedono ≥2 executor; se ce n'è uno solo il beneficio si riduce alla sola opzione (1)

---

<a id="6"></a>
## 6. Step `Typecheck` interamente ridondante con `Build` + step `Admin app build` duplicato

**Categoria**: build performance · **Severità**: 🟠 Alta · **Effort**: S

**Posizione**: `.github/workflows/ci.yml:83-88`

| Workspace | `typecheck` | `build` | Sovrapposizione |
| --------- | ----------- | ------- | --------------- |
| `apps/web:8,9` | `tsc --noEmit` | `tsc --noEmit && vite build` | 100 % |
| `apps/admin:8,9` | `tsc --noEmit` | `tsc --noEmit && vite build` | 100 % |
| `packages/ui:12,13` | `tsc --noEmit` | `tsc --noEmit` | **identici** |
| `packages/vite-plugin:15,16` | `tsc --noEmit` | `tsc` | 100 % |
| `services/core-api:7,8` | `tsc --noEmit` | `tsc` | 100 % |

Il terzo step (*Admin app build (S5-C10)*) è puro sprint a vuoto: `@plexica/admin` **non** è escluso dai filtri negativi di `ci.yml:86`, quindi è già stato buildato.

**Misurazioni reali** (cold, `tsbuildinfo` cancellato): core-api typecheck 9,8 s · web 10,5 s · admin 8,6 s · ui 4,5 s · admin build 11,8 s.

**Righe/tempo risparmiabili**: −4 righe di YAML; **~35–45 s** di CI a run.

**Vantaggi**
- Feedback CI più rapido su ogni PR
- Rimuove un artefatto di sprint (`S5-C10`) mai ripulito

**Svantaggi / rischi**
- ⚠️ Se si elimina *Typecheck*, i workspace **senza** script `build` (`packages/auth`, `packages/sdk`, `packages/cli`) non verrebbero più type-checkati. Vanno aggiunti esplicitamente
- Perde la granularità del report (un errore di tipo appare sotto "Build" invece che "Typecheck")

---

<a id="7"></a>
## 7. 31 righe di `env:` per-step che ri-dichiarano variabili già presenti a livello workflow

**Categoria**: CI-CD · **Severità**: 🟡 Media · **Effort**: S

**Posizione**: `ci.yml:108-118`, `:134-143`, `:164-174` contro il blocco `env:` di `:10-26`

```yaml
env:                                     # ci.yml:10
  DATABASE_URL: postgresql://…
…
- name: Run unit and integration tests
  env:
    DATABASE_URL: ${{ env.DATABASE_URL }}     # ci.yml:109 — no-op
    KEYCLOAK_URL: ${{ env.KEYCLOAK_URL }}     # ci.yml:110 — no-op
```

Conteggio esatto: **31 righe** della forma `^\s+[A-Z_]+: \$\{\{ env\.`. Sono tutte no-op: le variabili di workflow sono già ereditate da ogni step.

**Vantaggi**
- Il workflow torna sotto controllo (oggi 190 righe, al limite dei 200 della Rule 4) — **−16 %**
- Elimina l'illusione che quelle variabili siano configurabili per-step

**Svantaggi / rischi**
- Nessuno funzionale. ⚠️ Attenzione a `PLAYWRIGHT_LOKI_URL: ${{ env.LOKI_URL }}` (`:174`) che **è un rename reale** e va conservato

---

<a id="8"></a>
## 8. Nessuna `concurrency` in nessuno dei 3 workflow

**Categoria**: CI-CD · **Severità**: 🟠 Alta · **Effort**: S

**Posizione**: `ci.yml`, `codeql.yml`, `sca.yml` — `grep -c concurrency` → `0, 0, 0`

Tutti e tre girano su `pull_request` **e** `push: [main]`. Un push su un branch di PR con 3 commit ravvicinati fa partire 3 run CI da 90 min di timeout ciascuna, tutte tranne l'ultima inutili.

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

**Vantaggi**
- Su runner self-hosted (capacità fissa) è il **singolo intervento con il miglior rapporto effort/beneficio** dell'intera analisi: elimina la coda
- **20–60 minuti di runner recuperati al giorno**
- Riduce il rischio di conflitti sulle porte Docker fisse tra run concorrenti — problema che `cleanup-conflicts.sh:7-18` sta già tamponando a posteriori

**Svantaggi / rischi**
- `cancel-in-progress` su `main` va **evitato** (perderesti i risultati dei merge) — da qui il predicato condizionale
- Una run cancellata a metà può lasciare container orfani: `cleanup-conflicts.sh` esiste già ed è idempotente

---

<a id="9"></a>
## 9. Nessuna cache pnpm/Docker/build in CI

**Categoria**: CI-CD / build performance · **Severità**: 🟡 Media · **Effort**: S

**Posizione**: `ci.yml:47-55`, `codeql.yml:40-41`, `sca.yml:28-29` — `grep -n cache .github/workflows/*.yml` → nessun risultato

```yaml
- uses: actions/setup-node@v7
  with:
    node-version: '24'        # ci.yml:50 — nessun `cache: 'pnpm'`
```

La cache Docker esiste ma è **disattivata su self-hosted per scelta esplicita** (`docker-infra/action.yml:56-64`), motivazione documentata e corretta.

**Vantaggi**
- 20–60 s per `pnpm install` su runner GitHub-hosted
- **Prerequisito per lo split in job paralleli** ([#5](#5)): senza cache, ogni job ripaga l'install da zero
- Protegge dalla degradazione quando/se si migra a runner ephemeral

**Svantaggi / rischi**
- Su self-hosted persistenti, `actions/cache` aggiunge I/O di tar che può essere **più lento** dello store locale già caldo. **Da misurare prima di adottare**
- Cachare `dist/` è sconsigliato: alto rischio di build stantie che mascherano regressioni

---

<a id="10"></a>
## 10. `infra/keycloak/themes/` — 77 file, 1,4 MB di build output morto committato

**Categoria**: file morti · **Severità**: 🟠 Alta · **Effort**: S

**Posizione**: `infra/keycloak/themes/` (77 file tracciati, verificato con `git ls-files`)

L'esclusione ESLint lo dichiara esplicitamente:

```js
// eslint.config.js:27-28
// Stale Vite build output from old keycloak theme pipeline (superseded by JAR approach)
'infra/keycloak/themes/**',
```

Contenuto: `assets/Login-Be8Dj_DA.js`, 25 file di traduzione, 2 CSS con hash — output Vite puro. La pipeline attuale produce un JAR (`packages/keycloak-theme/package.json:8` → `infra/keycloak/providers/plexica-theme.jar`, montato in `database-auth.yml:70`). **Nessun compose, script o workflow monta `infra/keycloak/themes`.**

**Vantaggi**
- Elimina codice vendor JS non auditato dal repo (riduce il perimetro di CodeQL e Trivy, che scansiona `.`)
- Rimuove ambiguità su quale sia la pipeline del tema attiva
- −77 file, −1,4 MB, −2 righe di config ESLint

**Svantaggi / rischi**
- Se qualche ambiente non versionato monta ancora quella directory, si romperebbe: verificare con una grep sull'infrastruttura di deploy
- Nota: il JAR `infra/keycloak/providers/plexica-theme.jar` **è anch'esso un binario committato** — stesso anti-pattern, ma è quello attivo; andrebbe pubblicato come artefatto (finding separato, non contato qui)

---

<a id="11"></a>
## 11. `.opencode/mcp-server/` è un duplicato byte-per-byte di `.forge/mcp-server/` mai referenziato

**Categoria**: file morti · **Severità**: 🟡 Media · **Effort**: S

```
$ diff -rq .opencode/mcp-server .forge/mcp-server \
    --exclude=node_modules --exclude=package-lock.json --exclude=package.json
exit=0            # zero differenze
```

`index.ts` identico (9.085 byte in entrambi), stessa `src/`, stesso `tsconfig.json`. La configurazione punta **solo** a `.forge`:

```json
// opencode.json:18-22
"command": ["node", ".forge/mcp-server/node_modules/tsx/dist/cli.mjs",
            ".forge/mcp-server/index.ts"]
```

**Vantaggi**
- Elimina il rischio di modificare la copia sbagliata — già alto: sono identiche, quindi indistinguibili
- ~10 file, ~400 righe di TypeScript duplicate

**Svantaggi / rischi**
- Verificare che nessuna configurazione OpenCode utente (`~/.config/opencode/`) punti a `.opencode/mcp-server`

---

<a id="12"></a>
## 12. Due script `*-topics.sh` con logica sovrapposta, uno morto

**Categoria**: file morti / docker-infra · **Severità**: 🟡 Media · **Effort**: S

| Script | Righe | Referenziato da |
| ------ | ----: | --------------- |
| `infra/redpanda/ensure-topics.sh` | 23 | `platform-services.yml:74` (`redpanda-init`) |
| `.github/actions/docker-infra/scripts/ensure-topics.sh` | 19 | `action.yml:120` — **copia** con `docker exec plexica-ci-redpanda-1` hardcoded |
| `infra/redpanda/create-topics.sh` | 42 | **solo** spec archiviate — nessun compose, script o workflow |

`create-topics.sh` è inoltre funzionalmente **incompleto**: crea 3 topic e **omette** `plexica.plugin.dlq`, presente in entrambi gli `ensure-topics.sh`.

**Vantaggi**
- Un solo punto di verità per topic e retention: oggi una nuova retention va aggiornata in 2 posti — **rischio di divergenza dev/CI già materializzato**
- Rimuove il nome container hardcoded `plexica-ci-redpanda-1`, fragile rispetto a `COMPOSE_PROJECT_NAME`
- −61 righe

**Svantaggi / rischi**
- La versione CI verifica la retention con `topic describe | grep`: comportamento da preservare nella versione unificata

---

<a id="13"></a>
## 13. `.pnpm-store/v11/index.db` committato in git

**Categoria**: file morti · **Severità**: 🟡 Media · **Effort**: S

```
$ git ls-files .pnpm-store
.pnpm-store/v11/index.db
```

È il database interno della content-addressable store di pnpm. `.gitignore` (44 righe) non lo copre.

**Vantaggi**
- Evita che un binario opaco e mutabile generi conflitti di merge irrisolvibili
- Impedisce che il repo gonfi nel tempo (questo file arriva facilmente a decine di MB)

**Svantaggi / rischi**
- Il file resta nella storia git: la pulizia completa richiede `git filter-repo` (invasivo). L'intervento minimo (untrack + `.gitignore`) è comunque un miglioramento netto

---

<a id="14"></a>
## 14. `infra/scripts/verify-env.sh` orfano

**Categoria**: file morti · **Severità**: 🔵 Bassa · **Effort**: S

42 righe, referenziato solo in `.forge/specs/001-infrastructure-setup/tasks.md` e nello sprint completato. Zero riferimenti in compose, workflow, `package.json` scripts.

**Vantaggi**: rimuove uno script che sembra parte del setup ma non viene mai eseguito — **falso senso di sicurezza sulla validazione env**.
**Svantaggi / rischi**: potrebbe essere pensato per l'onboarding manuale; verificare con l'autore prima di cancellare. Alternativa: agganciarlo a uno step CI.

---

<a id="15"></a>
## 15. `tsconfig.json`: 22 opzioni ripetute già presenti in `tsconfig.base.json`

**Categoria**: config duplicata · **Severità**: 🟡 Media · **Effort**: S

`tsconfig.base.json:4-8` definisce già `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `strict: true`. Ripetizioni:

| File | Opzioni ridondanti |
| ---- | ------------------ |
| `apps/admin/tsconfig.json:5,6,8,10` | `moduleResolution`, `module`, `target`, `strict` |
| `apps/web/tsconfig.json:5,6,8` | `moduleResolution`, `module`, `target` |
| `packages/auth`, `packages/ui` | `moduleResolution`, `module` |
| `packages/keycloak-theme:4,6,7,10` | `target`, `module`, `moduleResolution`, `strict` |
| `services/core-api:8` | `target` |
| `examples/plugins/crm` (×2) | `module`, `moduleResolution`, `target` |

**⚠️ Bug latente**: `"exclude": ["node_modules", "dist"]` è ripetuto in 5 file mentre `tsconfig.base.json:22-28` ha un `exclude` più completo — e siccome `exclude` **non si eredita cumulativamente** ma viene **sovrascritto**, quelle 5 ripetizioni **restringono silenziosamente** l'exclude della base, perdendo `build`, `.next`, `coverage`.

Il pattern `"lib": ["ES2022","DOM","DOM.Iterable"]` è ripetuto **6 volte** identico.

**Vantaggi**
- Un cambio di `target` o `strict` si propaga davvero a tutti
- **Corregge l'override involontario di `exclude`** che oggi lascia `build/` e `coverage/` dentro il programma TS di 5 workspace
- −20 righe nette

**Svantaggi / rischi**
- ⚠️ `services/core-api` usa `moduleResolution: node16` (`:4`) — **intenzionale, da non toccare**
- Un livello di ereditarietà in più (base → dom → workspace) rende il debug di `tsc --showConfig` leggermente più laborioso

---

<a id="16"></a>
## 16. Nessun `composite` / project references: nessun build incrementale reale

**Categoria**: build performance · **Severità**: 🟡 Media · **Effort**: L

```
$ grep -rn '"composite"\|"references"' --include='tsconfig*.json' .
(nessun risultato)
```

`incremental: true` produce i `.tsbuildinfo` (10 file trovati) ma senza `references` ogni workspace ricompila da zero i sorgenti dei workspace da cui dipende (`@plexica/ui` esporta `./src/index.ts` direttamente). Quindi `apps/web` type-checka anche le 1.648 righe di `ui` + 1.028 di `auth`, e `apps/admin` fa lo stesso: **~2.700 righe type-checkate due volte**.

Misurato: web 10,5 s + admin 8,6 s + ui 4,5 s = 23,6 s, di cui ~4,5 s è `ui` compilato tre volte.

**Vantaggi**
- Feedback locale sensibilmente più rapido su modifiche a `packages/ui`
- `tsc --build` gestisce l'ordine topologico automaticamente
- ~5–9 s per esecuzione di typecheck a freddo, molto di più in locale a caldo

**Svantaggi / rischi**
- ⚠️ `composite: true` **obbliga** a `declaration: true` e a un `rootDir` esplicito, e **vieta** l'export di `./src/index.ts` come oggi (`packages/ui/package.json:7`): servirebbe un `dist/` per `@plexica/ui`, cambio non banale che impatta la config Vite/Storybook
- Guadagno modesto in CI (checkout pulito ⇒ nessun `.tsbuildinfo` da riusare, a meno di cacharlo — sconsigliato, vedi [#9](#9))
- **Raccomandazione**: valore medio, effort alto. Da considerare **solo dopo** aver chiuso [#5](#5)/[#6](#6)/[#8](#8)

---

<a id="17"></a>
## 17. Le due `playwright.config.ts` duplicano ~60 righe

**Categoria**: config duplicata / test E2E · **Severità**: 🟡 Media · **Effort**: M

**Posizione**: `apps/web/playwright.config.ts` (173) e `apps/admin/playwright.config.ts` (121)

| Blocco | web | admin |
| ------ | --- | ----- |
| import path/url + `dotenv.config({path: '../../.env'})` | `:13-22` | `:11-21` |
| `function setDefault(key,value)` | `:45-49` | `:27-31` |
| `defineConfig` head | `:91-96` | `:53-58` |
| blocco `use:` | `:101-108` | `:63-70` |
| blocco `projects:` chromium + channel | `:109-117` | `:71-79` |
| `env:` del webServer core-api | `:130-138` | `:93-102` |

`setDefault` è copia-incolla carattere per carattere. Il blocco `use:` + `projects:` è 16 righe identiche.

**Vantaggi**
- Un cambio di `actionTimeout` o del canale browser non richiede più di ricordarsi di toccare due file
- Il blocco env del core-api è **security-sensitive** (credenziali di default): un solo posto da rivedere
- −55/−60 righe nette

**Svantaggi / rischi**
- ⚠️ Le due config **divergono intenzionalmente** in punti chiave: web usa build di produzione (`:85-87`), admin usa il dev server (`:49,112`). Un base config mal disegnato **incoraggia ad allineare per sbaglio comportamenti che devono restare diversi**
- Playwright carica la config con esbuild: un import cross-package aggiunge un vincolo di risoluzione da testare

---

<a id="18"></a>
## 18. `apps/admin` E2E gira contro il dev server, non contro la build di produzione

**Categoria**: test E2E / violazione costituzione · **Severità**: 🟠 Alta · **Effort**: M

**Posizione**: `apps/admin/playwright.config.ts:49,112`

```ts
const coreApiCommand = isCi ? 'pnpm --filter core-api start' : 'pnpm --filter core-api dev';  // :49
command: 'pnpm --filter @plexica/admin dev',    // :112 — anche in CI
```

Confronto con `apps/web/playwright.config.ts:83-87`:

```ts
// Always build and start compiled output so local and CI exercise production branches.
const webCommand = 'VITE_E2E=true NODE_ENV=production pnpm --filter web build && pnpm --filter web preview';
```

Il commento di web dichiara esplicitamente l'intento; **admin lo viola**. I 24 test E2E admin girano su bundle non minificato, con HMR attivo, `import.meta.env.DEV === true` e senza tree-shaking di produzione.

**Nota collaterale**: `apps/admin/e2e/helpers/base-fixture.ts:3-5` afferma *«the admin app uses a React login form (no Keycloak browser redirect flow)»* mentre `admin-login.ts:4-9` documenta l'esatto contrario. **Commento obsoleto.**

**Vantaggi**
- Copre le divergenze dev/prod di Vite (define, code splitting, base path degli asset), esattamente ciò che l'app web già verifica
- Aderisce alla regola *«l'app di test è l'app di produzione»* (`AGENTS.md`, Testing punto 3)

**Svantaggi / rischi**
- **Costo aggiuntivo** di ~15–20 s per run E2E admin. Non è un'ottimizzazione, è correttezza
- Probabile che emergano test rossi — è il punto dell'esercizio; serve budget per il fix

---

<a id="19"></a>
## 19. 11 spec admin su 12 ripetono lo stesso boilerplate di login

**Categoria**: test E2E · **Severità**: 🟡 Media · **Effort**: M

**Posizione**: `apps/admin/e2e/005-01…005-11*.spec.ts`

```ts
import { loginAsAdmin, hasKeycloak, requireKeycloakInCI } from './helpers/admin-login.js';
test.beforeAll(() => requireKeycloakInCI());
test.beforeEach(async ({ page }) => { await loginAsAdmin(page); });
```

`loginAsAdmin` (`helpers/admin-login.ts:39-51`) esegue ogni volta un giro PKCE completo. Con 24 test admin e `workers: 1`, sono **24 login sequenziali** verso Keycloak.

Duplicazione fra le due suite: `uniqueName()` è identica in `apps/web/e2e/helpers/admin-login.ts:93-95` e `apps/admin/e2e/helpers/admin-login.ts:57-59`; `requireKeycloakInCI`/`hasKeycloak`/`SUPER_ADMIN_*` sono duplicate.

**Vantaggi**
- Riduce il carico su Keycloak, oggi la causa più frequente di flakiness (`waitForURL` con timeout 10 s)
- Aggiungere un nuovo spec diventa 2 righe invece di 6
- Se il login costa ~1,5–3 s, riusare lo `storageState` su 24 test risparmia **~30–60 s** (e proporzionalmente di più sui 150 test web)

**Svantaggi / rischi**
- ⚠️ **Riuso di sessione = accoppiamento fra test.** `base-fixture.ts:27` fa `context.clearCookies()` proprio per garantire isolamento; il riuso di `storageState` va introdotto **per-file, non globalmente**, ed escluso dai test che verificano logout/scadenza sessione
- Alcuni test admin (suspend/reactivate/deletion) mutano stato globale del tenant e potrebbero dipendere da un contesto pulito

---

<a id="20"></a>
## 20. `workers: 1` + `fullyParallel: false` su 174 test E2E

**Categoria**: test E2E / build performance · **Severità**: 🟠 Alta · **Effort**: L

**Posizione**: `apps/web/playwright.config.ts:91,94` e `apps/admin/playwright.config.ts:53,56`

150 test web + 24 admin = **174 test completamente sequenziali**. La causa radice è la condivisione dello stato: un solo tenant `e2e` provisionato in `global-setup.ts:63-64` e un solo DB.

Va notato che **l'infrastruttura per la parallelizzazione esiste già**: `apps/web/e2e/helpers/base-fixture.ts:42-57` assegna a ogni test un IP isolato via `X-Forwarded-For` proprio per evitare che i budget di rate-limit collidano fra contesti paralleli — una difesa costruita per un parallelismo che poi non è stato attivato.

**Proposta** (incrementale, non big-bang)
1. `test.describe.configure({ mode: 'parallel' })` sui soli file **read-only** (`shell-a11y`, `workspace-tree-a11y`, `keycloak-accessibility`, `smoke`, `error-boundary`, `org-error`, `005-01-dashboard`, `005-09-health-check`, `005-11-kafka-status`)
2. Alzare `workers` a 2-3 e misurare
3. Per il resto, provisionare un tenant per worker (`process.env.TEST_PARALLEL_INDEX`)

**Vantaggi**
- È di gran lunga la voce più pesante del tempo CI totale (timeout impostato a 90 min)
- Con ~40 test read-only su 174 e 3 worker, il taglio realistico sulla porzione parallelizzabile è **30–50 %**
- Espone bug di concorrenza reali che oggi la serializzazione nasconde

**Svantaggi / rischi**
- ⚠️ **Rischio alto di flakiness**, che la costituzione **vieta esplicitamente**. Va fatto in modo incrementale e con misure, non in un colpo solo
- Lo stato condiviso (tenant `e2e`, realm Keycloak, schema Postgres) è reale: senza tenant-per-worker, la parallelizzazione dei test mutanti fallirà
- Il beneficio si annulla se il runner self-hosted è già saturo di CPU (vedi [#5](#5))

---

<a id="21"></a>
## 21. 9 `waitForTimeout` arbitrari come sincronizzazione

**Categoria**: test E2E · **Severità**: 🟡 Media · **Effort**: M

| File:riga | Attesa |
| --------- | ------ |
| `web/e2e/helpers/workspace-members.ts:131` | 1.000 ms |
| `web/e2e/audit-log.spec.ts:56` | 1.000 ms |
| `web/e2e/audit-log.spec.ts:75` | 500 ms |
| `web/e2e/plugin-system/ac-05-marketplace.spec.ts:145` | 500 ms |
| `web/e2e/sidebar-drawer.spec.ts:66` | 350 ms |
| `web/e2e/helpers/workspace-settings.ts:98` | 300 ms |
| `admin/e2e/005-07-deletion.spec.ts:51` | **5.000 ms** (`new Promise(r => setTimeout(r, 5_000))`) |

Somma dei ritardi deterministici: **~8,65 s per run**, moltiplicati per i retry.

Sono da distinguere dai legittimi: `base-fixture.ts:105` (intervallo di un loop di polling con deadline) e `logout.spec.ts:119` (`Promise.race` come timeout) sono **corretti**.

**Vantaggi**
- Un `waitForTimeout` fisso è per definizione o troppo corto (flaky) o troppo lungo (lento). `expect.poll` è entrambe le cose meglio
- Elimina il rischio che i test passino in locale e falliscano su runner carico
- ~8–9 s per run + rimozione di 7 sorgenti di flakiness intermittente

**Svantaggi / rischi**
- Alcune attese coprono animazioni CSS (`sidebar-drawer.spec.ts:66`, 350 ms ≈ durata transizione). Sostituirle richiede o `waitForFunction` sulla transizione conclusa, o **disabilitare le animazioni nei test** (`prefers-reduced-motion`) — quest'ultima è la soluzione corretta ma **modifica il comportamento testato**

---

<a id="22"></a>
## 22. Copertura E2E: `/admin/plugins` senza test

**Categoria**: test E2E · **Severità**: 🟡 Media · **Effort**: M

**Posizione**: `apps/web/src/router-shell-routes.tsx:127`

Incrocio fra le 27 rotte dichiarate e i file spec:

| Rotta | Spec E2E |
| ----- | -------- |
| `/dashboard`, `/workspaces*`, `/users`, `/roles*`, `/profile`, `/audit-log`, `/settings*`, `/marketplace`, `/admin/system/dlq`, `/test-error` | ✅ coperte |
| **`/admin/plugins`** | ❌ `grep -rn "admin/plugins" apps/web/e2e` → **0 risultati** |
| admin app: 8 rotte | ✅ tutte coperte (005-01…005-11) |

**La copertura complessiva è buona: 26/27 rotte.** L'unico buco è la pagina di amministrazione plugin lato tenant.

**Vantaggi**: chiude l'ultimo gap rispetto alla Rule 1 (*«Ogni feature ha un test E2E»*).
**Svantaggi / rischi**: **+40/60 righe** — è un costo, non un risparmio. Allunga la suite già sequenziale: da fare **dopo** aver affrontato [#20](#20).

---

<a id="23"></a>
## 23. Digest immagine duplicati e blocco `redpanda command` copiato fra compose

**Categoria**: docker-infra · **Severità**: 🔵 Bassa · **Effort**: S

- digest postgres in `database-auth.yml:6`, `:28` e `e2e-production.yml:6`, `:37` — **4 occorrenze identiche**
- digest keycloak in `database-auth.yml:49`, `:90` — 2×
- digest redpanda in `platform-services.yml:43`, `:69` — 2×
- blocco `command` redpanda in `platform-services.yml:44-53` vs `e2e-production.yml:53-62` — **10 righe, 1 sola diversa**:

```yaml
# platform-services.yml:51
- --advertise-kafka-addr PLAINTEXT://redpanda:9092,OUTSIDE://localhost:19092
# e2e-production.yml:60 — unica differenza
- --advertise-kafka-addr PLAINTEXT://redpanda:9092,OUTSIDE://localhost:${REDPANDA_KAFKA_PORT:-29092}
```

`platform-services.yml:51` potrebbe già usare `${REDPANDA_KAFKA_PORT:-19092}` (peraltro già usato a `:55` per il port binding), rendendo l'override **completamente superfluo**.

> **Nota positiva**: tutte le immagini sono pinnate per digest SHA256 e tutti i servizi long-running hanno healthcheck. Questa parte è fatta bene.

**Vantaggi**: un bump di sicurezza del digest Postgres oggi richiede 4 edit in 2 file — alta probabilità di dimenticarne uno e **far girare due versioni di Postgres nello stesso stack E2E**. −15 righe.

**Svantaggi / rischi**
- ⚠️ Gli anchor YAML **non attraversano i file**: con `include:` gli anchor definiti in `platform-services.yml` non sono visibili in `e2e-production.yml`. La deduplicazione cross-file richiede un `.env` con `POSTGRES_IMAGE=…`, meno leggibile
- Dependabot non aggiorna i digest referenziati via variabile d'ambiente

---

<a id="24"></a>
## 24. `docker compose -f docker-compose.yml -f docker-compose.ci.yml` ripetuto 7 volte

**Categoria**: docker-infra · **Severità**: 🔵 Bassa · **Effort**: S

**Posizione**: `cleanup-conflicts.sh:4` · `start-services.sh:5` · `wait-services.sh:4,9` · `verify-health.sh:4` · `docker-infra/action.yml:79` · `ci.yml:185`

Un terzo file di override richiederebbe 7 edit.

**Proposta**: `COMPOSE_FILE=docker-compose.yml:docker-compose.ci.yml` come variabile d'ambiente a livello di composite action.

**Vantaggi**: un solo punto per aggiungere/rimuovere un override file.
**Svantaggi / rischi**: `COMPOSE_FILE` con separatore `:` è specifico di Linux (su Windows è `;`). Il progetto è Linux-only in CI, ma i dev su macOS/Windows vanno considerati.

---

<a id="25"></a>
## 25. `verify-health.sh` ridondante rispetto a `docker compose up --wait`

**Categoria**: docker-infra / CI-CD · **Severità**: 🔵 Bassa · **Effort**: S

**Posizione**: `wait-services.sh:4-6` vs `verify-health.sh` (22 righe) invocato a `action.yml:122-125`

```bash
# wait-services.sh:4-6
docker compose … up -d --wait --wait-timeout 300 postgres keycloak redis minio redpanda mailpit loki
```

`--wait` **blocca già** fino a che ogni servizio con healthcheck non è `healthy`. `verify-health.sh` ri-ispeziona esattamente la stessa lista di 7 servizi con `docker inspect`, subito dopo.

**Vantaggi**: meno superficie da mantenere; la logica di health è già dichiarativa nei compose. −26 righe, 2–5 s.

**Svantaggi / rischi**
- ⚠️ **Perde valore diagnostico**: `verify-health.sh:18` fa `docker logs` sul servizio non sano, cosa che `--wait` non fa. **Meglio spostarlo in `if: failure()` che cancellarlo**
- `--wait` non copre i servizi one-shot (`redpanda-init`, `keycloak-init`), gestiti separatamente: quella parte va conservata

---

<a id="26"></a>
## 26. `import/order` configurato ma incapace di riconoscere il gruppo `@plexica/*`

**Categoria**: config · **Severità**: 🔵 Bassa · **Effort**: M

**Posizione**: `eslint.config.js:79-85`

```js
'import/order': ['warn', {
  groups: ['builtin','external','internal','parent','sibling','index','type'],
  'newlines-between': 'always',
}],
```

Manca completamente `settings['import/resolver']` e `pathGroups`. Senza `pathGroups`, `eslint-plugin-import` classifica `@plexica/ui` come `external` (è uno scoped package risolto in `node_modules`), **non** come `internal`.

`AGENTS.md` prescrive invece un ordine a 5 gruppi con `@plexica/*` come **gruppo 3 distinto**. **La regola come scritta non può far rispettare la convenzione documentata.**

Nota collaterale: `eslint.config.js:88` applica `storybook.configs['flat/recommended']` **globalmente**, ma esiste una sola `.storybook/` in tutto il repo e 5 file `*.stories.tsx`.

**Vantaggi**
- La convenzione di `AGENTS.md` diventa applicata invece che aspirazionale
- Restringere Storybook riduce marginalmente il tempo di lint su ~46.000 righe

**Svantaggi / rischi**
- Richiede `eslint-import-resolver-typescript` — **nuova dipendenza → ADR** secondo `AGENTS.md`
- Attivarla produrrà probabilmente decine di violazioni da correggere in una PR di formattazione rumorosa

---

<a id="27"></a>
## 27. Storybook: 5 devDependency pesanti (~26 MB) mai esercitate in CI

**Categoria**: dipendenze · **Severità**: 🔵 Bassa · **Effort**: S

**Posizione**: `packages/ui/package.json:39-48`

Peso su disco: `storybook` 21 MB + `@storybook/*` 5,1 MB = **~26 MB**. Nessun workflow invoca `build-storybook` (`grep -rn storybook .github/workflows/` → 0 risultati). Esistono 5 file `*.stories.tsx`.

**Version drift interno**: `addon-themes` è a `^10.5.5`, gli altri tre a `^10.4.6`, il core a `^10.3.5`. `eslint-plugin-storybook` è pinnato a `10.4.6` **sia** in root (`package.json:27`) **sia** in `packages/ui:45`.

**Vantaggi**
- Un `build-storybook` in CI impedirebbe di scoprire le storie rotte solo al prossimo `pnpm storybook` locale
- Allineare le versioni previene incompatibilità fra core e addon Storybook 10, notoriamente sensibili

**Svantaggi / rischi**
- Aggiungere `build-storybook` in CI **allunga** la pipeline di 30–60 s per un valore limitato (5 storie)
- Rimuovere Storybook del tutto contraddirebbe `README.md:81` che lo documenta come strumento del design system

---

<a id="28"></a>
## 28. `docs/04` e `docs/05` (1.706 righe) superati dalle decisioni prese

**Categoria**: documentazione · **Severità**: 🔵 Bassa · **Effort**: S

**Posizione**: `docs/04-COMPARAZIONE-TECNOLOGICA.md` (842 righe) · `docs/05-VALUTAZIONE-BETTER-AUTH.md` (864 righe)

`AGENTS.md` elenca come *«Documenti di riferimento principali»* solo `01`, `02`, `03`. I due restanti sono documenti **pre-decisionali**:

- `docs/05` è superato da `.forge/knowledge/adr/adr-009-better-auth-rejected.md`, che formalizza l'esito
- `docs/04` è una comparazione il cui esito è congelato nella tabella *«Decisioni Confermate»* di `AGENTS.md`, dichiarate *«non negoziabili»*

Nessuno dei due è referenziato da `README.md`, `AGENTS.md`, o da spec attive.

**Vantaggi**
- Riduce il contesto che un nuovo contributor (o agente) deve processare per capire lo stato attuale — **40 % di `docs/`**
- Elimina il rischio che qualcuno riapra una decisione già chiusa citando il documento comparativo

**Svantaggi / rischi**
- ⚠️ Il razionale delle scelte ha valore storico reale: **archiviare in `docs/archive/`, non cancellare**

---

<a id="29"></a>
## 29. `AGENTS.md` descrive una struttura di progetto che non esiste

**Categoria**: documentazione · **Severità**: 🟡 Media · **Effort**: S

**Posizione**: `AGENTS.md:94-103`, `:57`, sezione *Governance*

| `AGENTS.md` dichiara | Realtà |
| -------------------- | ------ |
| `packages/i18n/ — @plexica/i18n` (`:96`) | **non esiste**; le traduzioni sono in-app via `react-intl` |
| `packages/` = `ui, i18n, vite-plugin, sdk` | reale: `auth, cli, keycloak-theme, sdk, ui, vite-plugin` — **`auth`, `cli`, `keycloak-theme` non documentati** |
| `modules/ (auth, tenant, workspace, plugin, admin, notification, user-profile)` | reale: `abac, admin, audit-log, invitation, plugin, tenant, tenant-settings, user, user-management, user-profile, workspace, workspace-member` — **`auth` e `notification` non esistono; 6 moduli non documentati** |
| *«Le **5** Regole»* | `.forge/constitution.md:12` → `## The 6 Rules`; e `AGENTS.md` stesso in apertura cita *«le 6 regole non negoziabili»* — **contraddizione interna** |
| `docs/*.md` cita `packages/config` | directory inesistente |

`packages/auth` è particolarmente rilevante: implementa PKCE/JWT/auth-store, ha una regola dedicata in `.coderabbit.yml:21-24`, ed è **invisibile nel documento che gli agenti caricano automaticamente**.

**Vantaggi**
- `AGENTS.md` è il contesto primario degli agenti: un elenco moduli errato induce a cercare/creare file nel posto sbagliato
- La discrepanza 5 vs 6 regole rende ambiguo quale sia la regola mancante

**Svantaggi / rischi**
- Nessuno. La struttura tende a divergere di nuovo: valutare uno script che rigeneri la sezione da `pnpm-workspace.yaml` + `ls services/core-api/src/modules`

---

<a id="30"></a>
## 30. `sca.yml` usa un'action non pinnata (`@master`)

**Categoria**: CI-CD · **Severità**: 🟡 Media · **Effort**: S

**Posizione**: `.github/workflows/sca.yml:41`

```yaml
- name: Run Trivy SCA scan
  uses: aquasecurity/trivy-action@master
```

Contro `actions/checkout@v7`, `actions/setup-node@v7`, `github/codeql-action/init@v4` — tutte pinnate. È incoerente e, in un workflow **di sicurezza**, particolarmente sfortunato: un'action non pinnata su `master` esegue codice arbitrario aggiornato senza review. `dependabot.yml:41-47` monitora `github-actions` ma **non può fare nulla con `@master`**.

Nota collaterale: `sca.yml:48` imposta `exit-code: 1`, cioè **qualsiasi** vulnerabilità (anche LOW/UNKNOWN) blocca il merge — senza `severity` né `ignore-unfixed`. Combinato con le 17 dipendenze inutilizzate di [#2](#2), produce blocchi su **codice mai eseguito**.

**Vantaggi**
- Coerenza con il resto delle action pinnate; Dependabot torna operativo su Trivy
- Il gate diventa azionabile invece che rumoroso

**Svantaggi / rischi**
- ⚠️ Alzare la soglia a CRITICAL/HIGH **allenta** il gate rispetto alla Rule 2 (*«0 vulnerabilità di produzione»*, citata a `sca.yml:3`). È una **decisione di policy** che va discussa, non un'ottimizzazione tecnica — potrebbe richiedere un ADR
- `ignore-unfixed: true` nasconde vulnerabilità reali senza patch disponibile

---

<a id="31"></a>
## 31. Doppia invocazione di Vitest per i test core-api

**Categoria**: build performance · **Severità**: 🔵 Bassa · **Effort**: S

**Posizione**: `services/core-api/package.json:20`

```json
"test": "vitest run --project unit && bash scripts/check-test-env.sh && vitest run --project integration"
```

Ma `vitest.config.ts:41-70` definisce **già** l'ordinamento fra i due progetti con `sequence: { groupOrder: 1 }` e `{ groupOrder: 2 }`. Le due invocazioni separate pagano due volte il bootstrap di Vitest.

**Proposta**: `"test": "bash scripts/check-test-env.sh && vitest run"`. Questo sposta il check dell'ambiente **prima** dei test unitari (oggi gira in mezzo), il che è probabilmente anche più corretto — fallisce prima.

**Vantaggi**
- ~8–15 s per run CI (un bootstrap Vitest in meno)
- Un solo report di copertura consolidato invece di due parziali (rilevante per il target ≥ 80 %)
- Fail-fast sull'ambiente mancante

**Svantaggi / rischi**
- ⚠️ **Cambia semantica**: oggi i test unitari girano *anche senza* infrastruttura Docker (il check è dopo). Accorpare rende `pnpm test` inutilizzabile in locale senza `docker compose up`. Mantenere `test:unit` (`:18`) come escape hatch — esiste già
- Con un solo processo, un crash del pool `forks` nella fase integration perde anche i risultati unit

---

## Tabella riepilogativa

| # | Finding | Categoria | Severità | Risparmio | Effort |
| -: | ------- | --------- | -------- | --------- | :----: |
| [1](#1) | 15 dipendenze con `"latest"` | dipendenze | 🔴 Critica | build riproducibili; −3 copie `lucide-react` | S |
| [5](#5) | CI avvia 2 stack Docker completi | docker-infra | 🔴 Critica | 60–120 s + ~2,2 GB RAM | M |
| [2](#2) | 17 dipendenze mai importate | dipendenze | 🟠 Alta | −17 righe, −40/60 MB, 15–25 s | S |
| [3](#3) | Nessun `catalog:` pnpm | dipendenze | 🟠 Alta | −45 righe; 1 PR bump invece di 11 | M |
| [4](#4) | keycloak-theme forza React 19.2.7 | dipendenze | 🟠 Alta | −30/50 MB, 10–20 s | S |
| [6](#6) | Step Typecheck + Admin build ridondanti | build perf | 🟠 Alta | −4 righe, **~35–45 s** | S |
| [8](#8) | Nessuna `concurrency` nei workflow | CI-CD | 🟠 Alta | **20–60 min runner/giorno** | S |
| [10](#10) | `infra/keycloak/themes/` morto (77 file) | file morti | 🟠 Alta | −77 file, −1,4 MB | S |
| [18](#18) | E2E admin gira su dev server | test E2E | 🟠 Alta | correttezza (costa +15 s) | M |
| [20](#20) | `workers: 1` su 174 test E2E | test E2E | 🟠 Alta | 30–50 % sulla quota parallelizzabile | L |
| [7](#7) | 31 righe `env:` no-op in `ci.yml` | CI-CD | 🟡 Media | −31 righe (−16 %) | S |
| [9](#9) | Nessuna cache pnpm in CI | CI-CD | 🟡 Media | 20–60 s (hosted) | S |
| [11](#11) | `.opencode/mcp-server` duplicato esatto | file morti | 🟡 Media | −10 file, ~400 righe | S |
| [12](#12) | `create-topics.sh` morto + copia CI | file morti | 🟡 Media | −61 righe | S |
| [13](#13) | `.pnpm-store/v11/index.db` committato | file morti | 🟡 Media | +1 riga `.gitignore` | S |
| [15](#15) | 22 opzioni tsconfig ripetute | config dup. | 🟡 Media | −20 righe + fix `exclude` | S |
| [16](#16) | Nessun `composite`/references | build perf | 🟡 Media | +15 righe, 5–9 s | L |
| [17](#17) | 2 `playwright.config` duplicate | config dup. | 🟡 Media | −55/60 righe | M |
| [19](#19) | 11 spec admin ripetono il login | test E2E | 🟡 Media | −40 righe, 30–60 s | M |
| [21](#21) | 9 `waitForTimeout` arbitrari | test E2E | 🟡 Media | ~8–9 s + meno flakiness | M |
| [22](#22) | `/admin/plugins` senza E2E | test E2E | 🟡 Media | **+50 righe** (copertura) | M |
| [29](#29) | `AGENTS.md` struttura errata | documentazione | 🟡 Media | ~12 righe corrette | S |
| [30](#30) | `trivy-action@master` non pinnata | CI-CD | 🟡 Media | +2 righe; meno blocchi spuri | S |
| [14](#14) | `verify-env.sh` orfano | file morti | 🔵 Bassa | −42 righe | S |
| [23](#23) | Digest e `command` redpanda duplicati | docker-infra | 🔵 Bassa | −15 righe | S |
| [24](#24) | `-f a.yml -f b.yml` × 7 | docker-infra | 🔵 Bassa | manutenibilità | S |
| [25](#25) | `verify-health.sh` ridondante con `--wait` | docker-infra | 🔵 Bassa | −26 righe, 2–5 s | S |
| [26](#26) | `import/order` senza `pathGroups` | config | 🔵 Bassa | +6 righe (regola resa efficace) | M |
| [27](#27) | Storybook mai esercitato in CI | dipendenze | 🔵 Bassa | −1 riga; decisione di policy | S |
| [28](#28) | `docs/04` + `docs/05` superati | documentazione | 🔵 Bassa | 1.706 righe archiviate | S |
| [31](#31) | Doppia invocazione Vitest | build perf | 🔵 Bassa | 8–15 s | S |

**Totali stimati** — righe di config/codice eliminabili: **~450**, oltre a 77 file di build output e ~10 file duplicati. Tempo CI recuperabile per run: **~2–4 minuti** dagli interventi a basso rischio ([#5](#5) opzione 1, [#6](#6), [#7](#7), [#25](#25), [#31](#31)), più il recupero di capacità runner da [#8](#8) e il potenziale di [#20](#20).

---

## Sequenza suggerita

Per rapporto valore/rischio:

```
#8 → #7 → #6 → #10/#11/#12/#13/#14 → #1/#2/#4 → #5 → #30 → #29
   → #3 → #15/#17/#19 → #21/#18 → #20/#16
```

---

## Nota di merito

Il pinning delle immagini per digest SHA256, gli healthcheck su tutti i servizi long-running, lo split dei compose sotto le 200 righe, e la fixture con IP isolato per test (`base-fixture.ts:42-57`) sono **lavoro di buona qualità**.

Il debito è concentrato nella **gestione delle versioni delle dipendenze** e nell'**orchestrazione CI**, non nel design dell'infrastruttura.

# Plexica v2 — Guida allo Sviluppo di Plugin

> Guida operativa per sviluppatori che creano plugin Plexica nel proprio
> repository. Documenta il flusso end-to-end: prerequisiti, scaffolding,
> installazione, sviluppo, build e containerizzazione.
>
> **Stato**: Aggiornata con ADR-033 — i package plugin sono pubblicati su
> GitHub Packages (`npm.pkg.github.com`) sotto l'organizzazione `plexica`,
> accesso public.

**Data**: 28 Agosto 2026

---

## Indice

1. [Panoramica](#1-panoramica)
2. [Prerequisiti](#2-prerequisiti)
3. [Creare un Plugin](#3-creare-un-plugin)
4. [Struttura del Progetto](#4-struttura-del-progetto)
5. [Sviluppo Locale](#5-sviluppo-locale)
6. [Build di Produzione](#6-build-di-produzione)
7. [Containerizzazione](#7-containerizzazione)
8. [SDK](#8-sdk)
9. [Risoluzione Problemi](#9-risoluzione-problemi)

---

## 1. Panoramica

Un plugin Plexica è un progetto **indipendente** (repository git proprio)
che estende la piattaforma con: **backend sidecar** (Fastify proxyato dal
core), **UI** (React via Module Federation), **dati** (tabelle nello schema
del tenant) ed **eventi** (Kafka via SDK). La DX v2 è **incapsulata nel
tooling**: si scrive React normale e Fastify, senza configurare MF, Kafka o
schema-per-tenant.

## 2. Prerequisiti

| Strumento | Versione | Note |
| --------- | -------- | ---- |
| Node.js | >= 24 | Runtime |
| pnpm | >= 10.34.2 | Package manager (Corepack consigliato) |
| Conto GitHub | — | Necessario per l'autenticazione a GitHub Packages |
| Docker | — | Solo per containerizzazione / stack locale |

### 2.1 Autenticazione a GitHub Packages

I package `@plexica/*` sono public ma richiedono un token GitHub per
l'installazione (GitHub Packages non serve pacchetti anonimi).

Configura il token a **livello utente** (mai nel `.npmrc` del progetto —
pnpm >= 10.34.2 ignora i placeholder `${VAR}` nei `.npmrc` di progetto,
GHSA-3qhv-2rgh-x77r). `pnpm config set` senza `--location` scrive nella
config utente:

```bash
# $GITHUB_TOKEN deve contenere un PAT con scope read:packages.
pnpm config set //npm.pkg.github.com/:_authToken "$GITHUB_TOKEN"
pnpm config set @plexica:registry https://npm.pkg.github.com/
```

Il token si genera su GitHub (Settings → Developer settings → Personal
access tokens, scope `read:packages`); in alternativa aggiungi le stesse
righe al `~/.npmrc` utente.

## 3. Creare un Plugin

La CLI `@plexica/create-plexica-plugin` genera un progetto completo:

```bash
npx @plexica/create-plexica-plugin my-plugin
cd my-plugin
git init
git add -A && git commit -m "feat: scaffold my-plugin from create-plexica-plugin"
```

Il nome viene usato per lo slug (kebab-case) e il display name. Il progetto
generato include `.gitignore`, `.dockerignore` e `.npmrc` già configurati.

## 4. Struttura del Progetto

```text
my-plugin/
├── manifest.json          # Dichiarazione del plugin (fonte di verità)
├── package.json           # Script dev/build/start
├── vite.config.ts         # Vite preset (@plexica/vite-plugin) — MF configurato
├── tsconfig.json          # TypeScript backend
├── tsconfig.ui.json       # TypeScript UI
├── tsconfig.dev.json      # TypeScript dev-entry
├── dev-entry.ts           # Registrazione dev-mode nel core
├── .env.development       # CORE_API_URL, TENANT_SLUG
├── .npmrc                 # Registry @plexica → GH Packages (solo scope)
├── Dockerfile             # Sidecar container
├── migrations/            # Migrazioni SQL per le tabelle plugin
├── src/
│   ├── index.ts           # Entry backend Fastify (health/ready/event)
│   └── app.ts             # Route del plugin
└── ui/
    ├── index.ts           # Entry MF
    └── sidebar-admin.tsx  # Componente per extension point sidebar:admin
```

### 4.1 Manifest

`manifest.json` è la fonte di verità (slug, versione, hosting, extension
points, eventi, tabelle). Deve superare la validazione Zod del core
(`author`/`icon`/`description` non vuoti; `version` semver).

## 5. Sviluppo Locale

### 5.1 Installazione

```bash
pnpm install
```

### 5.2 Avvio dello stack

Il plugin si registra nel core in **dev-mode** (solo in sviluppo, solo da
localhost). Avvia prima la piattaforma (`docker compose up` nel monorepo
Plexica), poi imposta il tenant di sviluppo:

```bash
# .env.development
CORE_API_URL=http://localhost:3001
TENANT_SLUG=my-tenant          # slug di un tenant attivo
```

### 5.3 Avvio del plugin

```bash
pnpm dev
```

Avvia tre processi insieme:

| Processo | Porta | Ruolo |
| -------- | ----- | ----- |
| backend (tsx watch) | 3000 | Fastify del plugin |
| ui (vite dev) | 4001 | Micro-frontend + remoteEntry |
| reg (dev-entry) | — | Registra backend+UI nel core (`/api/v1/dev/plugins/register`) |

La registrazione dev richiede l'header `X-Tenant-Slug` (aggiunto
dall'SDK) e funziona **senza JWT**: il core la accetta solo se
`NODE_ENV=development` da localhost (middleware `devRouteAuth`).

Per il solo backend o la sola UI: `pnpm dev:backend` (Fastify :3000) o
`pnpm dev:ui` (Vite :4001).

## 6. Build di Produzione

`pnpm build` produce `dist/` (backend, entry `dist/index.js`) e `dist-ui/`
(UI bundle con `remoteEntry.js`). Verifica con `pnpm typecheck` e
`node dist/index.js` (backend su :3000).

## 7. Containerizzazione

Il `Dockerfile` incluso produce il sidecar:

```bash
docker build -t my-plugin:latest .
docker run -p 3000:3000 --env PORT=3000 my-plugin:latest
```

L'immagine espone `/_plexica/health` e `/_plexica/ready`; `node_modules`/
`dist`/`.env` sono esclusi via `.dockerignore`.

## 8. SDK

Riferimento completo dell'SDK in [04a-SDK.md](04a-SDK.md).

## 9. Risoluzione Problemi

| Problema | Causa | Fix |
| -------- | ----- | --- |
| `ERR_PNPM_FETCH_404` su `@plexica/*` | Token GH Packages mancante | Configura token a livello utente (§2.1) |
| `401` registrazione dev | `NODE_ENV` non dev o non-loopback | Core in dev; registra da localhost |
| `TENANT_SLUG is not set` | Variabile mancante | Imposta `TENANT_SLUG` in `.env.development` |
| Plugin non appare nella shell | Registrazione fallita / UI non raggiungibile | Log `[reg]`; verifica Vite :4001 |
| Build UI fallisce | `ui/index.ts` rimosso | Rigenera con la CLI o ripristina l'entry |

---

## Riferimenti

- [Specifiche](01-SPECIFICHE.md) — requisiti (sezione 7: Sistema Plugin)
- [Architettura](02-ARCHITETTURA.md) — sezione 7: Sistema Plugin Semplificato
- ADR-033 — pubblicazione package su GitHub Packages
- `docs/03-PROGETTO.md` — fasi (sezione 3.6: Marketplace e CLI)







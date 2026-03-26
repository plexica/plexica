# Plexica v2 — Valutazione Better Auth vs Keycloak

> Analisi comparativa tra Better Auth e Keycloak per il sistema di
> autenticazione e autorizzazione della piattaforma. Valutazione di tre
> scenari: Better Auth come sostituto completo, Better Auth in affiancamento
> a Keycloak, e mantenimento di Keycloak come unica soluzione.
>
> Questo documento integra 01-SPECIFICHE.md (§3, §5.2) e
> 02-ARCHITETTURA.md (§8) e non li sostituisce. La raccomandazione
> finale determina se tali sezioni necessitano di aggiornamento.

**Data**: 26 Marzo 2026
**Stato**: Draft — Base per riscrittura
**Versione**: 1.0-draft

---

## Indice

1. [Contesto e Motivazione](#1-contesto-e-motivazione)
2. [Profilo delle Due Soluzioni](#2-profilo-delle-due-soluzioni)
3. [Confronto su 12 Dimensioni](#3-confronto-su-12-dimensioni)
4. [Scenario A — Better Auth Standalone](#4-scenario-a--better-auth-standalone)
5. [Scenario B — Better Auth + Keycloak Ibrido](#5-scenario-b--better-auth--keycloak-ibrido)
6. [Scenario C — Solo Keycloak (Status Quo)](#6-scenario-c--solo-keycloak-status-quo)
7. [Interazione con Schema-per-Tenant](#7-interazione-con-schema-per-tenant)
8. [Interazione con ABAC](#8-interazione-con-abac)
9. [Impatto sul Testing](#9-impatto-sul-testing)
10. [Tabella Riassuntiva dei Tre Scenari](#10-tabella-riassuntiva-dei-tre-scenari)
11. [Raccomandazione](#11-raccomandazione)
12. [Impatto sugli Altri Documenti](#12-impatto-sugli-altri-documenti)

---

## 1. Contesto e Motivazione

### 1.1 Situazione Attuale

I documenti 01-SPECIFICHE (§3) e 02-ARCHITETTURA (§8) confermano
**Keycloak multi-realm** come sistema di autenticazione. La motivazione
originale e solida: ogni tenant puo avere meccanismi di autenticazione
diversi (SAML aziendale, OIDC, social login Google/Microsoft, policy
MFA diverse). Un singolo realm non consente questa flessibilita, quindi
serve un realm per tenant.

Keycloak e in produzione in migliaia di organizzazioni enterprise e
fornisce tutte queste funzionalita out-of-the-box. Tuttavia, porta con
se complessita operativa significativa: e un server Java separato da
deployare, mantenere, aggiornare e monitorare.

### 1.2 Perche Valutare Better Auth

Better Auth e una libreria di autenticazione TypeScript-native che ha
guadagnato trazione significativa (473+ contributori, adottata da
OpenAI, Databricks, Strapi). Offre un approccio radicalmente diverso:

- **In-process**: gira dentro l'applicazione Node.js, nessun servizio esterno
- **Database condiviso**: usa lo stesso PostgreSQL dell'applicazione
- **Plugin ecosystem**: organizzazioni, SSO (OIDC + SAML), 2FA, passkey, magic link, 40+ social provider
- **TypeScript-native**: API tipata, integrazione naturale con lo stack Plexica

La domanda e: questa libreria puo sostituire (totalmente o parzialmente)
un server Keycloak enterprise nella v2?

### 1.3 Vincoli Non Negoziabili

Qualunque soluzione venga scelta deve soddisfare:

| Vincolo | Origine | Dettaglio |
|---------|---------|----------|
| Auth diversa per tenant | 01-SPECIFICHE §3 | Ogni tenant deve poter configurare SAML, OIDC, social login, MFA indipendentemente |
| Isolamento dati tenant | 01-SPECIFICHE §3 | I dati utente di un tenant non devono essere accessibili da un altro tenant |
| Schema-per-tenant | 02-ARCHITETTURA §4 | I dati risiedono in schema PostgreSQL separati per GDPR |
| ABAC workspace isolation | 02-ARCHITETTURA §8.2 | Le policy ABAC controllano l'accesso alle risorse workspace-level |
| Test con auth reale | 01-SPECIFICHE §10, 02-ARCHITETTURA §13 | Nessun `isTestToken`, nessun token simulato nei test |
| Zero divergenza test-produzione | Principio guida v2 | Il codice di autenticazione nei test e identico a quello in produzione |

---

## 2. Profilo delle Due Soluzioni

### 2.1 Keycloak

| Caratteristica | Dettaglio |
|---------------|----------|
| **Tipo** | Server di identity management standalone (Java, Quarkus) |
| **Deployment** | Container Docker separato, ~500 MB RAM, porta 8080 |
| **Database** | PostgreSQL dedicato (o condiviso con configurazione specifica) |
| **Protocolli** | OIDC, SAML 2.0, OAuth 2.0 completi |
| **Multi-tenancy** | Un realm per tenant — isolamento completo di utenti, ruoli, IdP, flussi di login |
| **Admin UI** | Console web completa per gestione realm, utenti, IdP, flussi |
| **Admin API** | REST API completa per tutte le operazioni (`@keycloak/keycloak-admin-client` per TS) |
| **Social login** | 20+ provider pre-configurati (Google, Microsoft, GitHub, Facebook...) |
| **Enterprise SSO** | SAML 2.0 e OIDC federation nativi, configurabili per realm |
| **MFA** | OTP, WebAuthn/Passkey, recovery codes — configurabile per realm |
| **Token format** | JWT RS256 firmato dal realm, verificabile via JWKS endpoint |
| **Session management** | Lato server nel realm, con session timeout e idle timeout configurabili |
| **Theming** | Login pages personalizzabili per realm (FreeMarker templates) |
| **Maturita** | Progetto Red Hat, 10+ anni, standard de facto enterprise |
| **Aggiornamenti** | Ogni 3 mesi circa, richiede upgrade del server + database |

### 2.2 Better Auth

| Caratteristica | Dettaglio |
|---------------|----------|
| **Tipo** | Libreria TypeScript in-process (nessun server separato) |
| **Deployment** | `npm install better-auth` — gira nel processo Node.js dell'applicazione |
| **Database** | Stesso PostgreSQL dell'applicazione (adapter Prisma, Drizzle, o Kysely) |
| **Protocolli** | OAuth 2.0 per social login; OIDC + SAML 2.0 tramite plugin SSO |
| **Multi-tenancy** | Plugin Organization: organizzazioni, membri, ruoli, team, inviti |
| **Admin UI** | Nessuna built-in — lo sviluppatore costruisce la propria UI admin |
| **API** | API TypeScript diretta — `auth.api.signIn()`, `auth.api.createOrganization()` |
| **Social login** | 40+ provider (Google, Microsoft, GitHub, Discord, Apple, X, LinkedIn...) |
| **Enterprise SSO** | Plugin `@better-auth/sso`: OIDC + SAML 2.0 dinamico per organizzazione |
| **MFA** | Plugin Two Factor: OTP (TOTP), backup codes. Passkey plugin separato |
| **Token format** | Session-based di default (session ID in cookie). JWT opzionale via plugin |
| **Session management** | Tabella `session` nel database, gestione programmatica |
| **Theming** | Non applicabile — le pagine di login sono parte dell'applicazione |
| **Maturita** | Progetto recente (2024-2025), crescita rapida, 473+ contributori |
| **Aggiornamenti** | `npm update` — nessun server da aggiornare separatamente |

---

## 3. Confronto su 12 Dimensioni

### 3.1 Multi-Tenancy

| Aspetto | Keycloak | Better Auth |
|---------|----------|-------------|
| Isolamento tra tenant | Completo: realm separati con DB, utenti, configurazione indipendenti | Plugin Organization: organizzazioni in tabelle condivise, con FK su `organizationId` |
| Auth diversa per tenant | Ogni realm ha la propria configurazione IdP (SAML, OIDC, social) | Plugin SSO: provider SSO registrabili dinamicamente per organizzazione |
| Provisioning tenant | Admin API per creare realm + client + utenti programmaticamente | API per creare organization + membri. SSO provider registrati separatamente |
| Scaling | Ogni realm e indipendente — centinaia di realm supportati nativamente | Ogni organizzazione e un record — scaling dipende dal database sottostante |

**Verdetto**: Keycloak offre un isolamento piu forte (realm = sandbox
completo). Better Auth offre un modello piu leggero ma l'isolamento
dipende dalla logica applicativa. Per GDPR compliance dove serve
eliminazione fisica dei dati (`DROP SCHEMA`), Better Auth con tabelle
nello schema tenant sarebbe equivalente — ma richiede adattamento del
modello dati (vedi sezione 7).

### 3.2 Enterprise SSO (SAML + OIDC Federation)

| Aspetto | Keycloak | Better Auth |
|---------|----------|-------------|
| SAML 2.0 | Nativo, maturo, configurabile da UI admin | Plugin `@better-auth/sso`: supporto SAML 2.0 con replay protection, timestamp validation, algorithm validation |
| OIDC Federation | Nativo, maturo | Plugin SSO: registrazione dinamica provider OIDC per organizzazione |
| IdP-Initiated SSO | Supportato | Supportato |
| Domain verification | Non nativo (implementabile) | Nativo: verifica dominio per auto-assegnazione organizzazione |
| Org provisioning da IdP | Configurabile con mapper | Nativo: auto-add member + role mapping da attributi IdP |
| Shared redirect URI | Possibile con configurazione | Supportato nativamente |
| Maturita SSO | 10+ anni, standard de facto | Plugin recente (2024-2025), documentazione buona ma track record breve |

**Verdetto**: Keycloak ha un vantaggio significativo in maturita. Il
plugin SSO di Better Auth copre i casi d'uso principali (OIDC + SAML
per organizzazione) e include security features solide (replay protection,
algorithm validation). Tuttavia, per clienti enterprise che richiedono
certificazioni e compliance, la maturita di Keycloak e un fattore
determinante. Plexica e un prodotto enterprise: la fiducia nel sistema
di autenticazione e non negoziabile.

### 3.3 Complessita Operativa

| Aspetto | Keycloak | Better Auth |
|---------|----------|-------------|
| Deployment | Container Docker separato (~500 MB RAM) | Zero — incluso nel processo Node.js |
| Monitoring | Health check dedicato, metriche JVM, log separati | Stesse metriche dell'applicazione |
| Upgrade | Procedura di upgrade server + database (downtime o blue-green) | `npm update` — stesso deploy dell'applicazione |
| Backup | Database dedicato da backuppare separatamente | Stesso database dell'applicazione |
| Configurazione | Console web + Admin API + realm export/import JSON | Codice TypeScript |
| Debug | Log Java separati, console Keycloak, network tracing | Stesso debugger, stessi log dell'applicazione |
| Certificati TLS | Configurazione per il server Keycloak | Stessa configurazione dell'applicazione |

**Verdetto**: Better Auth ha un vantaggio operativo schiacciante. Zero
infrastruttura aggiuntiva, zero server da mantenere, zero procedure
di upgrade separate. Questo e particolarmente rilevante per una
riscrittura dove ridurre la complessita operativa e un obiettivo
esplicito (01-SPECIFICHE §1.2).

### 3.4 Developer Experience

| Aspetto | Keycloak | Better Auth |
|---------|----------|-------------|
| Integrazione TypeScript | SDK `@keycloak/keycloak-admin-client` — wrapper su REST API | API TypeScript nativa con tipi completi |
| Configurazione auth flow | Console Keycloak o JSON realm export — esterno all'applicazione | Codice TypeScript nel progetto — versionato, revisionabile, testabile |
| Aggiunta social provider | Console Keycloak: crea IdP, configura client ID/secret, abilita per realm | Codice: `socialProviders: { google: { clientId, clientSecret } }` |
| Aggiunta SAML per tenant | Admin API: crea IdP nel realm, configura metadata, mapper | API: `registerSSOProvider({ organizationId, type: 'saml', ...config })` |
| Custom auth flow | FreeMarker templates + Java SPI (curva di apprendimento alta) | TypeScript hooks: `onBeforeCreateUser`, `onAfterSignIn`, etc. |
| Pagine di login | Pagine Keycloak personalizzabili (ma esterne all'app) | Parte dell'applicazione React — pieno controllo |

**Verdetto**: Better Auth offre una DX significativamente migliore per
un team TypeScript. La configurazione e codice versionato (non JSON
importato in un server esterno). I flussi custom sono hook TypeScript
(non Java SPI). Le pagine di login sono componenti React nativi del
progetto.

Il vantaggio Keycloak sulla DX e la console admin: una UI pronta per
gestire utenti, sessioni, realm senza scrivere codice. Con Better Auth,
la UI admin va costruita interamente.

### 3.5 Pagine di Login e Branding

| Aspetto | Keycloak | Better Auth |
|---------|----------|-------------|
| Pagine login | Pagine Keycloak separate dall'app (redirect) | Parte dell'applicazione React |
| Branding per tenant | Theming per realm (FreeMarker templates, CSS override) | Pieno controllo React: il design system Plexica si applica nativamente |
| Esperienza utente | Redirect fuori dall'app → login → redirect dentro l'app | Login inline nell'app — zero redirect (o redirect minimo per SSO esterno) |
| Consistenza UX | Due "app" visive diverse (Keycloak theme vs Plexica UI) | Una sola app, un solo design system |

**Verdetto**: Better Auth ha un vantaggio UX significativo. Con
Keycloak, le pagine di login sono un'applicazione separata con un
design system separato. Per quanto si personalizzi il theme Keycloak,
il risultato e sempre "due app diverse". Con Better Auth, la pagina di
login e un componente React del progetto — stessa tipografia, stessi
colori, stesse animazioni, stessa UX. Per una piattaforma che mette
la UX al centro (01-SPECIFICHE §1.3, §9), questa differenza e rilevante.

### 3.6 Session Management

| Aspetto | Keycloak | Better Auth |
|---------|----------|-------------|
| Modello | JWT RS256 stateless + refresh token | Session-based di default (session row nel database). JWT opzionale |
| Revocazione | Revoca token tramite Keycloak logout endpoint (non istantanea senza intro- spezione) | Revoca immediata: DELETE session row |
| Introspection | Endpoint `/token/introspect` per validare token | Query sulla tabella session |
| Scalabilita | JWT non richiede storage condiviso per validazione | Richiede query DB per ogni richiesta (mitigabile con Redis cache) |

**Verdetto**: il modello JWT di Keycloak e piu scalabile per
microservizi (stateless, nessuna lookup per richiesta). Il modello
session-based di Better Auth offre revocazione immediata e piu
controllo, ma richiede una lookup per richiesta (mitigabile con Redis).

Per il contesto Plexica (monolite Fastify con Redis gia in stack),
il session-based non e un problema — Redis e gia presente per caching
e rate limiting. Tuttavia, se in futuro Plexica evolvesse verso
microservizi (plugin backend che devono validare auth), il JWT
stateless sarebbe piu pratico.

### 3.7 OIDC Provider (Plexica come IdP)

| Aspetto | Keycloak | Better Auth |
|---------|----------|-------------|
| Plexica come IdP | Nativo: Keycloak e un IdP completo OIDC + SAML | Plugin `oidc-provider`: client registration, authorization code flow, JWKS, UserInfo |
| Maturita | Standard certificato OpenID Connect | Plugin in active development — la documentazione menziona che e in fase di deprecazione in favore di un nuovo "OAuth Provider Plugin" |
| Casi d'uso | Plugin di terze parti che autenticano via Plexica | Stessi casi d'uso, ma con maturita inferiore |

**Verdetto**: se in futuro Plexica dovesse fungere da Identity Provider
(ad esempio, per permettere a plugin o servizi esterni di autenticare
via Plexica), Keycloak offre questa funzionalita nativamente e con
certificazione OpenID Connect. Il plugin OIDC Provider di Better Auth
e in fase di transizione e non e considerato production-ready.

### 3.8 Sicurezza e Compliance

| Aspetto | Keycloak | Better Auth |
|---------|----------|-------------|
| Track record di sicurezza | 10+ anni, CVE documentate e patchate, audit di sicurezza frequenti | Giovane, track record breve, CVE disclosure process non maturo |
| Compliance | Usato in contesti SOC2, HIPAA, ISO 27001 per clienti enterprise | Nessuna certificazione nota |
| SAML security | Replay protection, signature validation, algorithm enforcement — maturo | Replay protection (DB verification), timestamp validation, algorithm validation — implementato ma recente |
| Token security | RS256 con key rotation, JWKS standard | Session-based con secure cookies, CSRF protection. JWT opzionale |
| Brute force protection | Configurabile per realm (lockout policy, captcha) | Rate limiting di default, ma configurazione limitata |

**Verdetto**: per un prodotto enterprise, il track record di sicurezza
di Keycloak e un asset significativo. Better Auth implementa le best
practice corrette, ma non ha la stessa profondita di battle-testing.
Un cliente enterprise che chiede "quale sistema di autenticazione usate?"
riceve una risposta molto diversa con "Keycloak (Red Hat)" rispetto
a "Better Auth (libreria npm)".

### 3.9 Performance

| Aspetto | Keycloak | Better Auth |
|---------|----------|-------------|
| Latenza login | 50-200ms (network hop al server Keycloak) | < 10ms (in-process, query DB locale) |
| Latenza validazione token | < 1ms (JWT verifica locale dopo JWKS cache) | < 5ms (session lookup in DB, < 1ms con Redis) |
| RAM | ~500 MB per il server Keycloak + RAM dell'app | Solo RAM dell'app (auth in-process) |
| Startup | Keycloak: 10-30 secondi (JVM) | Nessun overhead (parte con l'app) |
| Cold start impatto | L'app deve attendere Keycloak prima di accettare login | Nessuna dipendenza esterna per login |

**Verdetto**: Better Auth e piu performante per il login (nessun
network hop) e consuma meno risorse (nessun server Java). Per la
validazione dei token/sessioni la differenza e trascurabile in
entrambi i casi. Il risparmio di ~500 MB RAM e di 10-30 secondi di
startup e un vantaggio reale in sviluppo locale e CI.

### 3.10 Costi Infrastrutturali

| Aspetto | Keycloak | Better Auth |
|---------|----------|-------------|
| Server dedicato | Si — container con ~500 MB RAM | No — incluso nel processo applicativo |
| Database dedicato | Consigliato (o schema dedicato) | Stesso database dell'applicazione |
| Backup separato | Si — database Keycloak + realm export | No — incluso nel backup applicazione |
| Monitoring separato | Si — health check, metriche JVM, log | No — stesse metriche dell'app |
| Costo per ambiente | 1 server aggiuntivo × N ambienti (dev, staging, prod) | Zero costo aggiuntivo |

**Verdetto**: Better Auth ha un vantaggio di costo evidente. Per una
startup o un team piccolo, eliminare un server Java separato da ogni
ambiente e un risparmio significativo sia in costi che in tempo
operativo. Per un'azienda enterprise con team infrastruttura dedicato,
il costo di Keycloak e marginale.

### 3.11 Evoluzione e Manutenzione

| Aspetto | Keycloak | Better Auth |
|---------|----------|-------------|
| Governance | Red Hat / CNCF, sviluppo continuativo | Community-driven, crescita rapida |
| Breaking changes | Major version ogni 1-2 anni, migration guide fornita | Semver, breaking changes documentati |
| Longevita | 10+ anni, progetto flagship Red Hat | 1-2 anni, dipende dalla comunita |
| Vendor lock-in | Standard aperti (OIDC, SAML) — migrabile | Standard aperti dove possibile, ma API proprietaria Better Auth |
| Rischio abbandono | Molto basso (progetto Red Hat) | Medio — progetto giovane, dipende dall'adozione |

**Verdetto**: Keycloak ha una longevita garantita dal backing Red Hat.
Better Auth ha una comunita in crescita ma e un progetto giovane.
Per una piattaforma enterprise che deve funzionare per anni, la
stabilita di Keycloak e un fattore.

### 3.12 Impatto sul Team e Competenze

| Aspetto | Keycloak | Better Auth |
|---------|----------|-------------|
| Competenze richieste | TypeScript + Keycloak admin (realm, IdP, theming, SPI) | Solo TypeScript |
| Curva di apprendimento | Alta per la configurazione avanzata (SAML IdP, custom flow, theming) | Bassa — e una libreria TypeScript con API chiara |
| Debug auth issues | Server separato, log Java, network tracing tra app e Keycloak | Stesso debugger, stessi log, stessi breakpoint dell'applicazione |
| Theming pagine login | FreeMarker templates (linguaggio diverso da React) | Componenti React (stesso linguaggio del resto dell'app) |

**Verdetto**: Better Auth riduce significativamente il carico
cognitivo del team. Non servono competenze Keycloak-specifiche
(realm configuration, FreeMarker theming, Java SPI). Tutto e
TypeScript. Per un team che ha gia TypeScript come competenza
primaria, questo e un vantaggio reale.

---

## 4. Scenario A — Better Auth Standalone

### 4.1 Come Funzionerebbe

In questo scenario, **Keycloak viene rimosso interamente**. Better Auth
gestisce tutta l'autenticazione:

- Login locale (email/password) con Better Auth
- Social login (Google, Microsoft, GitHub) con Better Auth social providers
- SSO enterprise (SAML, OIDC) con Better Auth SSO plugin
- Organizzazioni (tenant) con Better Auth Organization plugin
- MFA con Better Auth Two Factor plugin
- Sessioni in PostgreSQL (o Redis per performance)

Ogni tenant e una "organization" in Better Auth. La configurazione
SSO per tenant avviene registrando provider SSO dinamicamente per
organization.

### 4.2 Cosa Funziona Bene

| Aspetto | Dettaglio |
|---------|----------|
| **Zero infrastruttura aggiuntiva** | Nessun server Keycloak, nessun container, nessun database separato |
| **UX login nativa** | Pagine login parte dell'app React, stesso design system |
| **DX eccellente** | Configurazione auth in TypeScript, hook per custom logic, debug in-process |
| **Testing semplificato** | Auth testabile senza container Docker aggiuntivo. `auth.api.signIn()` nei test |
| **Costi ridotti** | ~500 MB RAM risparmiati per ambiente |
| **Startup veloce** | Nessuna attesa per Keycloak in dev e CI |

### 4.3 Problemi e Rischi

| Problema | Severita | Dettaglio |
|----------|---------|----------|
| **Maturita SAML** | ALTA | Il plugin SSO e recente. I clienti enterprise con SAML complesso (Azure AD con claim custom, ADFS con policy restrittive) potrebbero incontrare edge case non coperti |
| **Nessuna admin console** | MEDIA | Keycloak fornisce una UI admin completa per gestire utenti, sessioni, realm, IdP. Con Better Auth, tutta questa UI va costruita da zero nel Super Admin |
| **OIDC Provider in transizione** | MEDIA | Se Plexica deve fungere da IdP, il plugin OIDC Provider non e production-ready (in deprecazione). Questa funzionalita andrebbe costruita o rimandata |
| **Track record sicurezza** | ALTA | Un cliente enterprise che chiede "quale IdP usate?" riceve "una libreria npm" invece di "Keycloak (Red Hat)". Questo ha impatto sulla vendita |
| **Realm isolation** | MEDIA | In Keycloak, un realm e un sandbox completo (DB separato, config separata). In Better Auth, l'isolamento tra organizzazioni dipende dalla logica applicativa |
| **Rischio longevita** | MEDIA | Better Auth ha 1-2 anni. Se il progetto perde momentum, Plexica dipende da un componente critico non mantenuto |
| **Key rotation** | BASSA | Keycloak gestisce key rotation RS256 nativamente. Con Better Auth session-based non serve, ma se si aggiunge JWT serve implementarla |
| **Brute force protection** | BASSA | Keycloak ha lockout policy per realm. Better Auth ha rate limiting di base ma meno configurabile |

### 4.4 Stime di Lavoro Aggiuntivo

Se si sceglie Better Auth standalone, il lavoro aggiuntivo rispetto a
Keycloak include:

| Lavoro | Stima | Motivazione |
|--------|-------|-------------|
| UI admin per gestione utenti/sessioni | 1-2 settimane | Keycloak fornisce questa UI gratis |
| UI admin per gestione SSO per tenant | 1 settimana | Configurazione SAML/OIDC per tenant |
| UI pagine login con design system | 0.5 settimane | Necessario comunque (il design system v2 e diverso dal tema Keycloak) |
| Adattamento schema-per-tenant | 1-2 settimane | Le tabelle Better Auth vanno messe nello schema tenant (vedi §7) |
| Testing SSO SAML con provider reali | 1 settimana | Validare che il plugin SSO funzioni con Azure AD, Okta, ADFS |
| **Totale aggiuntivo** | **4.5-6.5 settimane** | |

Il risparmio rispetto a Keycloak:

| Risparmio | Stima | Motivazione |
|-----------|-------|-------------|
| Nessun setup Keycloak in Docker Compose | 0.5 settimane | Eliminata la configurazione realm import/export |
| Nessun provisioning realm (solo org API call) | 0.5 settimane | API Better Auth piu semplice di Admin API Keycloak |
| Nessun theming Keycloak | 0.5 settimane | Le pagine login sono React, non FreeMarker |
| Testing auth senza container Keycloak | 0.5 settimane | Test piu veloci, setup piu semplice |
| **Totale risparmio** | **2 settimane** | |

**Bilancio netto**: +2.5-4.5 settimane di lavoro aggiuntivo con
Better Auth standalone rispetto a Keycloak. Il vantaggio operativo
a lungo termine (zero server Keycloak da mantenere) compensa in parte,
ma il costo iniziale e reale.

---

## 5. Scenario B — Better Auth + Keycloak Ibrido

### 5.1 Come Funzionerebbe

In questo scenario, **Better Auth gestisce l'autenticazione applicativa**
e **Keycloak rimane solo per la federazione enterprise**:

- **Better Auth**: login locale, social login, sessioni, organizzazioni,
  MFA, pagine di login React native
- **Keycloak**: solo come broker per SAML e OIDC enterprise (Azure AD,
  Okta, ADFS) — non gestisce utenti direttamente

Il flusso: l'utente si autentica in Better Auth. Se il tenant ha SSO
enterprise configurato, Better Auth reindirizza a Keycloak (come
identity broker), che a sua volta reindirizza al provider SSO (Azure AD).
Keycloak valida il SAML/OIDC e ritorna a Better Auth con i claim.

### 5.2 Cosa Funziona Bene

| Aspetto | Dettaglio |
|---------|----------|
| **UX login nativa** | Le pagine di login sono React — stesso design system per login locale e social |
| **SSO enterprise robusto** | Keycloak gestisce solo SAML/OIDC enterprise, dove e piu maturo |
| **DX buona** | Configurazione auth quotidiana in TypeScript. Keycloak solo per SSO complesso |
| **Sessioni applicative** | Better Auth gestisce sessioni — revocazione immediata, nessun JWT da gestire |

### 5.3 Problemi e Rischi

| Problema | Severita | Dettaglio |
|----------|---------|----------|
| **Complessita architetturale** | ALTA | Due sistemi di autenticazione da mantenere, sincronizzare e debuggare. Piu componenti = piu punti di failure |
| **Flusso SSO a 3 hop** | MEDIA | Utente → Better Auth → Keycloak → IdP enterprise → Keycloak → Better Auth → App. Tre redirect invece di uno |
| **Sincronizzazione utenti** | ALTA | Gli utenti esistono in Better Auth (tabella `user`) e in Keycloak (realm). Chi e la fonte di verita? Come si sincronizzano? |
| **Duplicazione concetti** | MEDIA | "Organizzazione" in Better Auth e "Realm" in Keycloak rappresentano lo stesso tenant ma con modelli diversi |
| **Costo operativo invariato** | BASSA | Keycloak resta nel Docker Compose. Il risparmio operativo dello scenario A non si realizza |
| **Debug SSO** | MEDIA | Quando un login SSO fallisce, bisogna debuggare sia Better Auth che Keycloak, su due set di log diversi |

### 5.4 Valutazione

Questo scenario **combina i costi di entrambe le soluzioni senza i
benefici completi di nessuna**:

- Non elimina Keycloak (quindi non risparmia infrastruttura)
- Aggiunge Better Auth (quindi aggiunge complessita)
- Introduce un flusso SSO a 3 hop (latenza e debugging)
- Crea il problema di sincronizzazione utenti tra due sistemi

L'unico vantaggio reale e l'UX delle pagine di login (React native).
Ma questo vantaggio non giustifica la complessita introdotta.

---

## 6. Scenario C — Solo Keycloak (Status Quo)

### 6.1 Come Funzionerebbe

E l'architettura gia confermata in 02-ARCHITETTURA §8: Keycloak
multi-realm con un realm per tenant.

- Un realm per tenant con configurazione auth indipendente
- JWT RS256 firmato dal realm, validato via JWKS
- Login tramite redirect alle pagine Keycloak (personalizzate con theme)
- Social login configurato per realm
- SAML/OIDC federation configurata per realm
- MFA configurata per realm
- Admin API per provisioning programmatico

### 6.2 Cosa Funziona Bene

| Aspetto | Dettaglio |
|---------|----------|
| **Maturita e affidabilita** | 10+ anni, Red Hat backing, standard enterprise |
| **Funzionalita completa** | Tutto incluso: SAML, OIDC, social, MFA, admin console, session management |
| **Isolamento forte** | Un realm e un sandbox completo — impossibile leak cross-tenant a livello IdP |
| **OIDC Provider nativo** | Plexica come IdP per plugin/servizi esterni e gratuito |
| **Compliance** | Track record in contesti SOC2, HIPAA, ISO 27001 |
| **Documentazione** | Eccellente — Keycloak ha documentazione estensiva e community ampia |

### 6.3 Problemi e Costi

| Problema | Severita | Dettaglio |
|----------|---------|----------|
| **Complessita operativa** | MEDIA | Server Java separato da deployare, monitorare e aggiornare per ogni ambiente |
| **UX login non nativa** | MEDIA | Redirect alle pagine Keycloak — design system diverso dall'app. Mitigabile con theming ma mai uguale |
| **DX per custom auth flow** | MEDIA | FreeMarker templates e Java SPI per personalizzazioni avanzate — linguaggio diverso da TypeScript |
| **Testing piu complesso** | MEDIA | Serve container Keycloak nel CI. Import realm, creazione utenti test. Ma funziona ed e gia stato fatto nella v1 |
| **Startup lento** | BASSA | 10-30 secondi per Keycloak in dev/CI. Mitigabile con container pre-riscaldato |
| **Costo infrastrutturale** | BASSA | ~500 MB RAM per ambiente. Marginale per infrastruttura enterprise |

### 6.4 Miglioramenti Rispetto alla v1

La v2 con Keycloak corregge i problemi della v1:

| Problema v1 | Soluzione v2 |
|-------------|-------------|
| `isTestToken` con HS256 auto-firmato | Test usano Keycloak reale con token RS256 |
| Nessun test E2E con Keycloak | Test E2E con login Keycloak reale (container di test) |
| Theming generico | Theming per realm allineato (quanto possibile) al design system v2 |
| Provisioning fragile (7 step) | Provisioning transazionale con rollback |

---

## 7. Interazione con Schema-per-Tenant

### 7.1 Il Problema

Schema-per-tenant e confermato (02-ARCHITETTURA §4). I dati di ogni
tenant risiedono in uno schema PostgreSQL separato (`tenant_{slug}`).
Questa decisione ha un impatto diretto sulla scelta di autenticazione.

### 7.2 Con Keycloak (Scenario C)

Keycloak ha il proprio database separato. I dati utente vivono in due
posti:

| Dato | Dove Risiede |
|------|-------------|
| Credenziali, sessioni, IdP config, MFA secrets | Database Keycloak (nel realm del tenant) |
| Profilo utente applicativo (nome, avatar, ruoli app) | Tabella `users` nello schema `tenant_{slug}` |
| Mapping | Colonna `keycloak_user_id` nella tabella `users` del tenant |

Questo modello e gia definito in 02-ARCHITETTURA §9.2 e funziona:
il JWT contiene il `keycloak_user_id`, il middleware lo risolve nella
tabella `users` dello schema tenant.

**Per GDPR right to erasure**: `DROP SCHEMA tenant_{slug} CASCADE`
elimina i dati applicativi. La cancellazione del realm Keycloak elimina
credenziali e sessioni. Due operazioni, ma entrambe atomiche.

### 7.3 Con Better Auth (Scenari A e B)

Better Auth salva i propri dati in tabelle standard: `user`, `session`,
`account`, `organization`, `member`, `invitation`, `sso_provider`,
`verification`, `twoFactor`, `passkey`, etc.

Queste tabelle devono vivere da qualche parte. Due opzioni:

**Opzione 1 — Tabelle Better Auth nello schema `core` (condivise)**:

| Pro | Contro |
|-----|--------|
| Setup semplice, un'unica istanza Better Auth | Violazione GDPR: dati utente condivisi tra tenant nello stesso schema |
| Nessun adattamento del modello dati | `DROP SCHEMA tenant_{slug}` non elimina i dati auth — serve DELETE separato |
| Provisioning tenant semplice | Contraddice la motivazione di schema-per-tenant |

**Opzione 2 — Tabelle Better Auth nello schema `tenant_{slug}`**:

| Pro | Contro |
|-----|--------|
| GDPR compliant: `DROP SCHEMA` elimina tutto | Serve una istanza/configurazione Better Auth per schema |
| Coerente con la filosofia schema-per-tenant | Better Auth non supporta nativamente schema-per-tenant — richiede adattamento del database adapter |
| Isolamento completo dei dati auth | Complessita: middleware deve selezionare lo schema prima di autenticare, ma l'autenticazione avviene prima della risoluzione del tenant |

**Il problema dell'Opzione 2 e circolare**: per autenticare l'utente
bisogna sapere in quale schema cercare la sessione. Ma per sapere lo
schema, bisogna sapere il tenant. E per sapere il tenant, bisogna
autenticare l'utente (o dedurlo dall'URL).

**Soluzione possibile**: dedurre il tenant dall'URL (subdomain o path)
prima dell'autenticazione, poi usare quello per selezionare lo schema.
Questo e gia il flusso previsto in 02-ARCHITETTURA §8.1 (realm discovery
da tenant slug nell'URL). Ma con Better Auth, il `SET search_path`
deve avvenire prima della sessione lookup, il che richiede un middleware
custom che intercetta il routing del database adapter.

### 7.4 Verdetto su Schema-per-Tenant

Con Keycloak, il problema non esiste: Keycloak ha il suo database e
i suoi realm. I dati applicativi sono nello schema tenant. Separazione
pulita.

Con Better Auth, l'adattamento a schema-per-tenant e possibile ma
richiede lavoro non banale sul database adapter. L'alternativa
(tabelle auth nello schema core) viola il principio GDPR che motiva
schema-per-tenant.

---

## 8. Interazione con ABAC

### 8.1 ABAC nella v2

L'ABAC tree-walk e confermato per l'isolamento dati workspace-level
(02-ARCHITETTURA §8.2). Il sistema ABAC valuta regole come "l'utente X
con ruolo Z puo accedere alle risorse del workspace Y".

### 8.2 Con Keycloak

L'ABAC e completamente applicativo. Keycloak fornisce:
- L'identita dell'utente (JWT con `sub`, `email`, `name`)
- I ruoli RBAC (realm roles e client roles nel JWT)

L'applicazione usa questi dati come input per l'ABAC tree-walk:
- `userId` dal JWT
- `roles` dal JWT
- `workspaceId` dalla richiesta
- Policy ABAC dalla tabella `abac_policies` nello schema tenant

Nessuna interazione diretta tra Keycloak e ABAC. Il confine e chiaro.

### 8.3 Con Better Auth

Better Auth Organization plugin ha il proprio sistema RBAC:
- `createAccessControl()` per definire permessi
- `hasPermission()` per verificare
- Ruoli per organizzazione e team
- Dynamic access control plugin per ruoli dinamici

Questo crea una potenziale **sovrapposizione con l'ABAC applicativo**:

| Aspetto | Better Auth RBAC | ABAC Plexica |
|---------|-----------------|-------------|
| Scope | Organizzazione + Team | Workspace + risorse specifiche |
| Modello | Lista permessi per ruolo | Condition tree con attributi |
| Valutazione | `hasPermission(userId, permission)` | Tree-walk con contesto (utente, ruolo, workspace, risorsa) |
| Storage | Tabella `member` con `role` | Tabella `abac_policies` con condition tree JSON |

### 8.4 Verdetto su ABAC

Con Keycloak, il confine e netto: Keycloak fa AuthN + RBAC base,
l'applicazione fa ABAC. Nessuna sovrapposizione.

Con Better Auth, c'e il rischio di avere **due sistemi di
autorizzazione**: il RBAC di Better Auth Organization e l'ABAC
applicativo. Bisognerebbe scegliere esplicitamente:
- Usare Better Auth RBAC solo per ruoli tenant-level (admin, member, viewer)
- Usare ABAC solo per workspace isolation
- Definire chiaramente il confine

Questo e gestibile ma aggiunge un livello di complessita architetturale
nella definizione dei confini tra i due sistemi.

---

## 9. Impatto sul Testing

### 9.1 Il Problema della v1

Il problema di testing piu grave della v1 e documentato in
01-SPECIFICHE §2.2.1: l'autenticazione non viene mai testata
realmente. Il code path `isTestToken` accetta token HS256 auto-firmati,
quindi la validazione JWT RS256 di Keycloak non viene mai esercitata
nei test.

### 9.2 Con Keycloak (Scenario C)

La v2 risolve questo con Keycloak reale nei test:

| Aspetto | Dettaglio |
|---------|----------|
| **Container di test** | Keycloak Docker container con realm pre-importati |
| **Token reali** | I test ottengono token RS256 chiamando `/token` del realm di test |
| **Validazione reale** | Il middleware JWT valida il token con JWKS del realm — stesso codice di produzione |
| **Setup time** | 10-30 secondi per startup Keycloak in CI |
| **Complessita** | Realm di test da mantenere (export JSON versionato nel repo) |

Questo approccio e gia definito in 02-ARCHITETTURA §8.3 e §13.3.
Funziona, ma aggiunge overhead in CI (startup Keycloak) e complessita
(realm export/import).

### 9.3 Con Better Auth (Scenario A)

Better Auth risolve il problema alla radice — non c'e bisogno di un
server esterno:

| Aspetto | Dettaglio |
|---------|----------|
| **Nessun container** | Auth in-process — nessun Docker aggiuntivo per i test |
| **Utenti di test** | `auth.api.signUpEmail()` crea utente direttamente nel database di test |
| **Login di test** | `auth.api.signIn()` restituisce sessione reale — stesso codice di produzione |
| **Validazione reale** | Il middleware verifica la sessione con la stessa logica di produzione |
| **Setup time** | 0 secondi — parte con l'applicazione |
| **Complessita** | Seed utenti di test con API Better Auth (poche righe TypeScript) |
| **Zero divergenza** | Non esiste la possibilita di un `isTestToken` — il codice e lo stesso |

**Questo e il vantaggio piu significativo di Better Auth per il
contesto Plexica v2.** Il principio "zero divergenza test-produzione"
(01-SPECIFICHE §1.3, punto 4) e soddisfatto intrinsecamente, non
per disciplina.

Con Keycloak, bisogna fare attenzione a non reintrodurre scorciatoie
(come `isTestToken`). Con Better Auth, la scorciatoia non esiste
strutturalmente.

### 9.4 Impatto su CI

| Aspetto | Keycloak | Better Auth |
|---------|----------|-------------|
| Container aggiuntivo in CI | Si — Keycloak Docker | No |
| Tempo startup auth | 10-30 secondi | 0 secondi |
| Manutenzione realm di test | Realm JSON export da versionare e mantenere | Seed TypeScript versionato (piu semplice) |
| Flakiness risk | Keycloak startup puo fallire (JVM, memoria) | Nessun rischio aggiuntivo |

Il risparmio in CI e reale: 10-30 secondi per run × centinaia di run
al mese = ore di CI risparmiate. Piu importante: un componente in meno
che puo fallire e rendere i test flaky.

---

## 10. Tabella Riassuntiva dei Tre Scenari

| Dimensione | A: Better Auth Solo | B: Ibrido | C: Solo Keycloak |
|-----------|-------------------|-----------|-----------------|
| **Infrastruttura auth** | Zero server aggiuntivi | Keycloak + Better Auth | Keycloak server |
| **Multi-tenant auth** | Organization plugin | Organization + Realm | Realm per tenant |
| **Enterprise SSO** | Plugin SSO (recente) | Keycloak per SSO | Keycloak (maturo) |
| **UX login** | React nativa | React nativa | Redirect Keycloak |
| **DX** | Eccellente (tutto TS) | Buona ma duplicata | Buona (Admin Console) |
| **Testing** | Intrinsecamente semplice | Complesso (2 sistemi) | Gestibile (container KC) |
| **Compliance** | Da dimostrare | Keycloak per SSO | Dimostrata (Red Hat) |
| **Schema-per-tenant** | Adattamento non banale | Adattamento Better Auth | Separazione netta |
| **ABAC interazione** | Sovrapposizione RBAC | Sovrapposizione RBAC | Confine netto |
| **Costo operativo** | Basso | Alto (2 sistemi) | Medio (1 server Java) |
| **Rischio longevita** | Medio (progetto giovane) | Alto (2 dipendenze) | Basso (Red Hat) |
| **Costo iniziale** | +2.5-4.5 settimane netto | +4-6 settimane | Baseline (gia pianificato) |
| **Costo a lungo termine** | Basso (zero server) | Alto (2 sistemi) | Medio (manutenzione KC) |
| **Idoneita enterprise** | Da costruire | Confusa | Consolidata |

---

## 11. Raccomandazione

### 11.1 Scenario B Scartato

Lo scenario ibrido e **scartato senza riserve**. Introduce la
complessita di due sistemi di autenticazione senza i benefici
completi di nessuno. La sincronizzazione utenti tra Better Auth e
Keycloak, il flusso SSO a 3 hop e il debugging distribuito su due
set di log sono costi ingiustificabili.

### 11.2 Scenario A vs Scenario C — Analisi

La scelta reale e tra Better Auth standalone e Keycloak solo.

**Argomenti a favore di Better Auth (Scenario A)**:

| N. | Argomento | Peso |
|----|-----------|------|
| 1 | Zero infrastruttura aggiuntiva — coerente con il principio "semplicita misurabile" | Alto |
| 2 | Testing intrinsecamente semplice — "zero divergenza" soddisfatta strutturalmente | Alto |
| 3 | UX login nativa — pagine di login nel design system v2 | Medio |
| 4 | DX superiore — tutto TypeScript, nessun FreeMarker, nessun Java SPI | Medio |
| 5 | Risparmio CI — nessun container Keycloak, test piu veloci, meno flakiness | Medio |

**Argomenti a favore di Keycloak (Scenario C)**:

| N. | Argomento | Peso |
|----|-----------|------|
| 1 | Maturita enterprise — 10+ anni, Red Hat backing, track record sicurezza | Alto |
| 2 | Compliance dimostrata — clienti enterprise si fidano di Keycloak | Alto |
| 3 | Separazione netta schema-per-tenant — Keycloak ha il suo database, nessun adattamento | Alto |
| 4 | Confine ABAC pulito — Keycloak fa AuthN, applicazione fa ABAC, nessuna sovrapposizione | Medio |
| 5 | OIDC Provider nativo — Plexica come IdP senza lavoro aggiuntivo | Basso |
| 6 | Longevita garantita — progetto Red Hat, rischio abbandono molto basso | Medio |

### 11.3 Il Fattore Decisivo: il Target

La scelta dipende dal target della piattaforma:

- Se Plexica e un **prodotto enterprise** venduto a grandi organizzazioni
  che richiedono compliance (SOC2, ISO 27001) e integrazione con IdP
  corporate (Azure AD, Okta, ADFS) → **Keycloak e la scelta corretta**.
  La maturita, il track record e la reputazione sono asset commerciali.

- Se Plexica e una **piattaforma developer-first** venduta a team tecnici
  e startup che privilegiano semplicita, velocita e DX →
  **Better Auth sarebbe competitivo**. La semplicita operativa e la DX
  sono vantaggi reali.

Plexica e dichiarato come **piattaforma enterprise multi-tenant SaaS**
(01-SPECIFICHE §1.1). Il target e enterprise. I requisiti includono
SAML aziendale, GDPR compliance, audit trail, isolamento forte.

### 11.4 Raccomandazione Finale

**Si conferma Keycloak multi-realm (Scenario C).**

Le motivazioni, in ordine di peso:

| N. | Motivazione |
|----|-------------|
| 1 | **Maturita enterprise**: per un prodotto B2B enterprise, il sistema di autenticazione deve ispirare fiducia. "Keycloak (Red Hat, CNCF)" e una risposta commercialmente forte. "Better Auth (libreria npm, 2024)" non lo e ancora |
| 2 | **Separazione schema-per-tenant**: con Keycloak, le credenziali vivono nel realm, i dati applicativi nello schema tenant. Nessun adattamento necessario al database adapter. Con Better Auth, l'integrazione con schema-per-tenant richiede lavoro non banale e introduce un problema circolare (tenant resolution prima dell'autenticazione) |
| 3 | **Confine ABAC netto**: Keycloak fa AuthN + RBAC base (JWT con ruoli), l'applicazione fa ABAC. Due sistemi con responsabilita chiare. Better Auth introdurrebbe un RBAC applicativo che si sovrappone all'ABAC |
| 4 | **SSO enterprise maturo**: il plugin SSO di Better Auth e recente. Per clienti che richiedono SAML con Azure AD/ADFS/Okta in configurazioni complesse, la maturita di Keycloak e un vantaggio critico |
| 5 | **Longevita**: il sistema di autenticazione e il componente piu critico della piattaforma. Dipendere da un progetto di 1-2 anni per questo componente e un rischio che non si giustifica |
| 6 | **Nessun lavoro aggiuntivo**: Keycloak e gia pianificato in 03-PROGETTO (Fase 0, Fase 1.1). Cambiare a Better Auth aggiungerebbe 2.5-4.5 settimane nette — budget che la timeline 5-7 mesi non puo assorbire facilmente |

### 11.5 Mitigazione degli Svantaggi Keycloak

La v2 mitiga i problemi noti di Keycloak:

| Svantaggio | Mitigazione v2 |
|-----------|---------------|
| **UX login non nativa** | Theming Keycloak allineato al design system v2 (colori, font, spacing). Non sara identico, ma sara coerente |
| **Startup lento in dev/CI** | Container Keycloak pre-riscaldato con realm importati. Volume persistente in dev per evitare re-import |
| **DX per custom auth flow** | Limitare le personalizzazioni al theming + configurazione da Admin API. Se serve custom flow complesso, costruire fuori da Keycloak (API custom nel Core API) |
| **Testing con container** | Realm export JSON versionato nel repo. Script di test che ottiene token reale RS256 da Keycloak con helper utility (`getTestToken(realm, username, password)`) |
| **Costo operativo** | Lo stack Docker Compose include gia PostgreSQL, Redis, MinIO, Kafka — un container in piu (Keycloak) e marginale |

### 11.6 Quando Riconsiderare

La decisione va rivalutata se:

| Condizione | Azione |
|-----------|--------|
| Better Auth raggiunge maturita enterprise (3+ anni, adozione enterprise documentata, security audit pubblici) | Rivalutare per Plexica v3 o major release successiva |
| Un cliente enterprise rifiuta Keycloak e richiede una soluzione diversa | Valutare Better Auth come alternativa per quel deployment specifico |
| Keycloak diventa non mantenuto o il costo operativo cresce significativamente | Valutare migrazione a Better Auth o alternativa |
| Il plugin SSO di Better Auth viene certificato per compliance (SOC2, ISO 27001) | Rivalutare con i nuovi dati |

---

## 12. Impatto sugli Altri Documenti

### 12.1 Impatto su 01-SPECIFICHE.md

**Nessun aggiornamento necessario.** La raccomandazione conferma le
decisioni gia presenti:

- §3 (Decisioni Architetturali Confermate): Keycloak multi-realm confermato
- §5.2 (Autenticazione e Autorizzazione): requisiti invariati
- §10 (Testing): Keycloak reale nei test confermato

### 12.2 Impatto su 02-ARCHITETTURA.md

**Nessun aggiornamento necessario.** La raccomandazione conferma
l'architettura gia definita:

- §8.1 (Autenticazione — Keycloak Multi-Realm): confermato
- §8.2 (Autorizzazione — RBAC + ABAC): confermato
- §8.3 (Autenticazione nei Test): confermato
- §13 (Architettura di Testing): confermato

### 12.3 Impatto su 03-PROGETTO.md

**Nessun aggiornamento necessario.** Le fasi di progetto restano
invariate:

- Fase 0.4 (Keycloak setup automatico): confermato
- Fase 1.1 (Autenticazione Multi-Realm): confermato
- Timeline: nessuna modifica

### 12.4 Impatto su 04-COMPARAZIONE-TECNOLOGICA.md

**Nessun aggiornamento necessario.** Il documento 04 tratta il
linguaggio del core backend (TypeScript vs Rust) e l'architettura
plugin poliglotta. L'autenticazione non e nel suo scope.

### 12.5 Nota sulla Valutazione

Questo documento rimane nel corpo documentale come analisi di
riferimento. Se in futuro il contesto cambia (maturita Better Auth,
nuovi requisiti, cambio target), la valutazione puo essere riaperta
consultando le condizioni elencate in §11.6.

---

*Fine del Documento di Valutazione Better Auth vs Keycloak*

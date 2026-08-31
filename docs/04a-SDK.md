# Plexica Plugin SDK

> Riferimento dell'SDK plugin — collegato da [04-SVILUPPO-PLUGIN.md](04-SVILUPPO-PLUGIN.md)
> (spostato qui per rispettare il limite di 200 righe per file).

`@plexica/sdk` espone:

| Export | Uso |
| ------ | --- |
| `PluginSDK` | Classe runtime: `initialize()`, `callApi()`, `emitEvent()`, `dispatchEvent()`, `query()`/`queryOne()` su tabelle plugin |
| `PluginDb` | Pool pg tipizzato per le tabelle del plugin |
| `@plexica/sdk/dev` | `registerBackend()` / `unregisterBackend()` per la registrazione dev |

Config minima (`PluginConfig`): `pluginId`, `slug`, `tenantId`, `apiUrl`.
`PLEXICA_SERVICE_TOKEN` viene iniettato dalla piattaforma per l'emissione
eventi senza JWT utente.

L'SDK rifiuta `apiUrl` in chiaro (`http:`) verso host non-loopback
(CWE-319): nelle deployment non locali usare HTTPS.
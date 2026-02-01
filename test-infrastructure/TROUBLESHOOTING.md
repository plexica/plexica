# 🔧 Risoluzione Problemi Test Setup

## Problemi Risolti

### 1. ❌ DATABASE_URL non riconosciuto da Prisma

**Problema:**

```
Error: The datasource.url property is required in your Prisma config file when using prisma migrate deploy.
```

**Causa:** La variabile `DATABASE_URL` non veniva esportata correttamente prima di chiamare Prisma.

**Soluzione:** ✅ Aggiunto `export DATABASE_URL=...` negli script prima di chiamare Prisma.

---

### 2. ❌ tsx command not found

**Problema:**

```
./test-infrastructure/scripts/test-setup.sh: line 82: tsx: command not found
```

**Causa:** `tsx` non era nel PATH o le dipendenze non erano installate.

**Soluzione:** ✅ Gli script ora usano `pnpm exec tsx` o `npx tsx` invece di chiamare `tsx` direttamente.

---

## Come Verificare che Tutto Funzioni

### Step 1: Controlla i prerequisiti

```bash
./test-infrastructure/scripts/test-check.sh
```

Questo script verifica:

- ✅ Docker e Docker Compose installati
- ✅ Node.js e pnpm/npm installati
- ✅ Dipendenze del progetto installate
- ✅ Docker daemon in esecuzione
- ✅ Porte disponibili (5433, 8081, 6380, 9010, 9011)

### Step 2: Installa le dipendenze (se necessario)

Se il check indica che le dipendenze non sono installate:

```bash
# Con pnpm (raccomandato per questo monorepo)
pnpm install

# Oppure con npm
npm install
```

### Step 3: Avvia l'infrastruttura di test

```bash
./test-infrastructure/scripts/test-setup.sh
```

**Cosa fa lo script:**

1. 🐳 Avvia i container Docker (PostgreSQL, Keycloak, Redis, MinIO)
2. ⏳ Attende che tutti i servizi siano pronti (con health checks)
3. 🔧 Esegue le migration del database con Prisma
4. 🔧 Genera il Prisma Client
5. 🌱 Popola il database con dati minimi di test
6. 🪣 Crea i bucket MinIO per i tenant

**Output atteso:**

```
✅ Test infrastructure is ready!

📊 Service endpoints:
   PostgreSQL: localhost:5433
   Keycloak:   http://localhost:8081
   Redis:      localhost:6380
   MinIO:      http://localhost:9010

🔑 Test credentials:
   Super Admin:  super-admin@test.plexica.local / test123
   Tenant Admin: admin@acme.test / test123
   Tenant Member: member@acme.test / test123
```

---

## Troubleshooting Comune

### Problema: Porte già in uso

**Sintomo:**

```
Error: bind: address already in use
```

**Soluzione:**

```bash
# 1. Ferma l'infrastruttura di test esistente
./test-infrastructure/scripts/test-teardown.sh

# 2. Verifica che le porte siano libere
lsof -i :5433  # PostgreSQL
lsof -i :8081  # Keycloak
lsof -i :6380  # Redis
lsof -i :9010  # MinIO

# 3. Se necessario, termina i processi che usano quelle porte
kill -9 <PID>

# 4. Riprova
./test-infrastructure/scripts/test-setup.sh
```

### Problema: Keycloak non si avvia

**Sintomo:**

```
❌ Keycloak failed to start
```

**Causa:** Keycloak richiede 60-90 secondi per avviarsi completamente.

**Soluzione:**

- Lo script attende già fino a 120 secondi
- Se continua a fallire, controlla i log:
  ```bash
  docker logs plexica-keycloak-test
  ```

### Problema: Prisma non trova il database

**Sintomo:**

```
Error: Can't reach database server
```

**Soluzione:**

```bash
# 1. Verifica che PostgreSQL sia in esecuzione
docker ps | grep plexica-postgres-test

# 2. Verifica la connessione manualmente
docker exec plexica-postgres-test psql -U plexica_test -d plexica_test -c "SELECT 1"

# 3. Se il container non c'è, riavvia tutto
./test-infrastructure/scripts/test-teardown.sh
./test-infrastructure/scripts/test-setup.sh
```

### Problema: MinIO non crea i bucket

**Sintomo:**

```
Error creating bucket: Access Denied
```

**Soluzione:**

```bash
# Verifica che MinIO sia in esecuzione
docker ps | grep plexica-minio-test

# Controlla i log
docker logs plexica-minio-test

# Accedi alla console MinIO per verificare
# URL: http://localhost:9011
# Credentials: minioadmin_test / minioadmin_test
```

### Problema: Dependencies non installate

**Sintomo:**

```
Cannot find module '@prisma/client'
```

**Soluzione:**

```bash
# Nel root del progetto
pnpm install

# Genera Prisma Client
cd packages/database
pnpm exec prisma generate
```

---

## Comandi Utili

### Verifica stato container

```bash
docker ps --filter "name=plexica-*-test"
```

### Logs dei container

```bash
docker logs plexica-postgres-test
docker logs plexica-keycloak-test
docker logs plexica-redis-test
docker logs plexica-minio-test
```

### Connessione manuale ai servizi

**PostgreSQL:**

```bash
docker exec -it plexica-postgres-test psql -U plexica_test -d plexica_test
```

**Redis:**

```bash
docker exec -it plexica-redis-test redis-cli
```

**MinIO (via browser):**

```
http://localhost:9011
Login: minioadmin_test / minioadmin_test
```

**Keycloak (via browser):**

```
http://localhost:8081
Login admin: admin / admin
Realm: plexica-test
```

### Reset completo

Se qualcosa va storto e vuoi ricominciare da capo:

```bash
# 1. Ferma tutto
./test-infrastructure/scripts/test-teardown.sh

# 2. Rimuovi tutti i container di test
docker rm -f $(docker ps -aq --filter "name=plexica-*-test")

# 3. Rimuovi volumi (se esistono)
docker volume rm $(docker volume ls -q --filter "name=plexica-test")

# 4. Riavvia
./test-infrastructure/scripts/test-setup.sh
```

---

## Prossimi Passi

Una volta che l'infrastruttura è avviata con successo:

1. **Esegui i test:**

   ```bash
   cd apps/core-api
   npm run test:unit           # Test unitari
   npm run test:integration    # Test di integrazione
   npm run test:e2e            # Test E2E
   ```

2. **Reset dati tra test:**

   ```bash
   ./test-infrastructure/scripts/test-reset.sh
   ```

3. **Stop infrastruttura quando hai finito:**
   ```bash
   ./test-infrastructure/scripts/test-teardown.sh
   ```

---

## Contatti e Supporto

Se continui ad avere problemi, controlla:

1. `test-infrastructure/README.md` - Documentazione completa
2. `TEST_IMPLEMENTATION_PLAN.md` - Piano di implementazione
3. Logs dei container Docker

Per debug più dettagliati, imposta:

```bash
export LOG_LEVEL=debug
```

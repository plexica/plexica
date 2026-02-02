# Analisi degli Errori dei Integration Test - Core API

## Riepilogo

- **Test Total**: ~181 test tra tutti i file di integrazione
- **Test Falliti**: ~67 test (37% di failure rate)
- **Test Passati**: ~114 test (63% success rate)

---

## 🔴 Errori Critici per Categoria

### 1. **Permission Integration Test** (18/20 FALLITI) 🔥 CRITICO

**File**: `src/__tests__/auth/integration/permission.integration.test.ts`

#### Errore Principale

```
Invalid `prisma.$executeRawUnsafe()` invocation:
Raw query failed. Code: `42804`. Message: `column "permissions" is of type text[] but expression is of type jsonb`
```

#### Causa

Mismatch tra il tipo di dato dichiarato nel database (array di text) e quello usato nelle query (JSONB).

#### Test Falliti

- ✗ should create roles with permissions
- ✗ should get all roles in a tenant
- ✗ should get a specific role by ID
- ✗ should update role permissions
- ✗ should assign role to user
- ✗ should prevent duplicate role assignments
- ✗ should remove role from user
- ✗ should aggregate permissions from multiple roles
- ✗ should check if user has specific permission
- ✗ should check if user has any of multiple permissions
- ✗ should check if user has all of multiple permissions
- ✗ should reflect permission changes immediately
- ✗ should handle permission removal
- ✗ should isolate permissions between tenants
- ✗ should not allow cross-tenant permission queries
- ✗ should isolate roles between tenants
- ✗ should delete a role
- ✗ should initialize default roles for a new tenant

#### Test Passati

- ✓ should validate schema name to prevent SQL injection
- ✓ should handle deletion of non-existent role gracefully

---

### 2. **Workspace API Integration Test** (21/24 FALLITI) 🔥 CRITICO

**File**: `src/__tests__/workspace/integration/workspace-api.integration.test.ts`

#### Errore Principale

Il test file sembra avere problemi con l'inizializzazione o non sta ricevendo i dati richiesti dagli endpoint.

#### Test Falliti (21)

- ✗ should create a workspace with the creator as admin
- ✗ should reject duplicate workspace slug within tenant
- ✗ should create workspace with custom settings
- ✗ should get all workspaces for a user
- ✗ should return empty array when user has no workspaces
- ✗ should get workspace by ID with members and teams
- ✗ should throw error when workspace not found
- ✗ should update workspace details
- ✗ should throw error when updating non-existent workspace
- ✗ should update workspace settings
- ✗ should add a member to workspace
- ✗ should reject adding duplicate member
- ✗ should add member with specific role
- ✗ should get membership information
- ✗ should return null for non-member
- ✗ should update member role
- ✗ should prevent removing last admin
- ✗ should allow removing non-admin member
- ✗ should allow removing admin when multiple admins exist
- ✗ should delete workspace with no teams
- ✗ should prevent deleting workspace with teams

#### Test Passati (3)

- ✓ should get teams in workspace
- ✓ should create team in workspace
- ✓ should throw error creating team in non-existent workspace

---

### 3. **Workspace Members Integration Test** (12/32 FALLITI) ⚠️

**File**: `src/__tests__/workspace/integration/workspace-members.integration.test.ts`

#### Errore Principale

```
prisma:error
Invalid `prisma.$executeRaw()` invocation:

Raw query failed. Code: `42P01`. Message: `relation "tenant_acme.TeamMember" does not exist`
```

#### Causa

La tabella `TeamMember` non esiste nello schema del database di test per il tenant "acme".

#### Test Falliti (12)

- ✗ should reject invalid user ID (404)
- ✗ should reject invalid workspace ID (404)
- ✗ should filter members by role
- ✗ should paginate results
- ✗ should return 404 for non-existent workspace
- ✗ should return 403 for non-member
- ✗ should get specific member details
- ✗ should include full user profile
- ✗ should allow any member to view other members
- ✗ should return 403 for non-admin
- ✗ should cascade delete team memberships
- ✗ should return 404 for non-member

#### Test Passati (20)

- ✓ should add member with default role (MEMBER)
- ✓ should add member with VIEWER role
- ✓ should add member with ADMIN role
- ✓ should reject duplicate member (409)
- ✓ should reject non-admin user (403)
- [... altri 15 test ...]

---

### 4. **Workspace CRUD Integration Test** (5/32 FALLITI) ⚠️

**File**: `src/__tests__/workspace/integration/workspace-crud.integration.test.ts`

#### Test Falliti (5)

- ✗ should paginate results
- ✗ should sort by name
- ✗ should sort by creation date
- ✗ should return 404 for non-existent workspace (GET /api/workspaces/:id)
- ✗ should return 404 for non-existent workspace (DELETE /api/workspaces/:id)

#### Test Passati (27)

- ✓ should create workspace for authenticated user
- ✓ should make creator ADMIN automatically
- ✓ should validate slug uniqueness per tenant
- [... altri 24 test ...]

---

## ✅ Test Completamente Passati

### File che passano correttamente

1. **plugin-marketplace.integration.test.ts** - 23/23 ✓
2. **plugin-permissions.integration.test.ts** - 17/17 ✓
3. **plugin-install.integration.test.ts** - 18/18 ✓
4. **auth-flow.integration.test.ts** - 13/13 ✓
5. **marketplace-api.integration.test.ts** - 39/39 ✓
6. **workspace-tenant.integration.test.ts** - 19/19 ✓
7. **plugin-communication.integration.test.ts** - 9/9 ✓

---

## 🔧 Problemi Identificati e Soluzioni

### Problema #1: Type Mismatch nel Field "permissions"

**Severità**: CRITICO
**Impatto**: 18 test falliti
**Causa**: Schema Prisma vs Realtà Database

```
// ERRORE:
Code: `42804`. Message: `column "permissions" is of type text[] but expression is of type jsonb`
```

**Soluzioni Possibili**:

1. Verificare lo schema Prisma in `prisma/schema.prisma`
2. Verificare se il campo `permissions` è definito come array di text
3. Se il codice tenta di inserire JSONB, aggiornare lo schema
4. Eseguire una migration per sincronizzare il database

---

### Problema #2: Tabella TeamMember Mancante

**Severità**: CRITICO
**Impatto**: Almeno 1 test fallito direttamente, potenzialmente altri per cascata

```
Raw query failed. Code: `42P01`. Message: `relation "tenant_acme.TeamMember" does not exist`
```

**Cause Possibili**:

1. Schema Prisma non è stato generato per il tenant di test
2. Migration non è stata eseguita sul database di test
3. Il tenant di test non è stato creato correttamente
4. Nome schema incorretto nel database

---

### Problema #3: Query Failures nei Workspace API Test

**Severità**: CRITICO
**Impatto**: 21 test falliti

**Cause Possibili**:

1. Service layer non inizializzato correttamente
2. Database connection non stabilita
3. Seed data non inserito nel database
4. Errori di setup nei beforeAll/beforeEach hook

---

### Problema #4: Pagination e Sorting Tests Falliti

**Severità**: MEDIA
**Impatto**: 5 test falliti

**Possibili Cause**:

1. Endpoint non implementa pagination
2. Sorting non è implementato nei service layer
3. Query non rispettano i parametri di query

---

## 📊 Statistiche per File

| File Test                                | Total | Pass | Fail | Rate     |
| ---------------------------------------- | ----- | ---- | ---- | -------- |
| permission.integration.test.ts           | 20    | 2    | 18   | 10% ✗    |
| workspace-api.integration.test.ts        | 24    | 3    | 21   | 12.5% ✗  |
| workspace-members.integration.test.ts    | 32    | 20   | 12   | 62.5% ⚠️ |
| workspace-crud.integration.test.ts       | 32    | 27   | 5    | 84% ✓    |
| plugin-marketplace.integration.test.ts   | 23    | 23   | 0    | 100% ✓   |
| plugin-permissions.integration.test.ts   | 17    | 17   | 0    | 100% ✓   |
| plugin-install.integration.test.ts       | 18    | 18   | 0    | 100% ✓   |
| auth-flow.integration.test.ts            | 13    | 13   | 0    | 100% ✓   |
| marketplace-api.integration.test.ts      | 39    | 39   | 0    | 100% ✓   |
| workspace-tenant.integration.test.ts     | 19    | 19   | 0    | 100% ✓   |
| plugin-communication.integration.test.ts | 9     | 9    | 0    | 100% ✓   |

---

## 🎯 Azioni Raccomandate

### Priority 1 (CRITICO - Fix Subito)

1. [ ] **Risolvere il type mismatch di "permissions"**
   - Controllare `prisma/schema.prisma` per il campo `permissions`
   - Verificare se database effettivamente ha `text[]` o dovrebbe avere `jsonb`
   - Aggiornare schema o query di conseguenza
   - Eseguire migration se necessario

2. [ ] **Risolvere il problema della tabella TeamMember mancante**
   - Verificare migration cronología
   - Controllare setup tenant nel database di test
   - Assicurarsi che schema sia creato correttamente per il tenant di test
   - Rigenerare schema se necessario

3. [ ] **Debuggare workspace-api.integration.test.ts**
   - Controllare setup e teardown hooks
   - Verificare seed data nel database
   - Testare connessione database manualmente
   - Controllare se i service sono inizializzati correttamente

### Priority 2 (ALTO - Fix Entro Sprint)

4. [ ] **Implementare/Fixare pagination nei workspace list endpoint**
5. [ ] **Implementare/Fixare sorting nei workspace list endpoint**
6. [ ] **Verificare 404 handling negli endpoint**

### Priority 3 (MEDIO - Monitoring)

7. [ ] Aggiungere logging più verboso nei test falliti
8. [ ] Considerare di aggiungere database state verification dopo ogni test
9. [ ] Setup test data factory per consistenza

---

## 🔍 Debug Commands

```bash
# Controllare schema Prisma
cat prisma/schema.prisma | grep -A 5 "permissions"

# Verificare struttura database di test
psql -h localhost -p 5433 -U postgres -d plexica_test -c "\dt tenant_acme.*"

# Eseguire singolo test con output dettagliato
npm run test:integration -- workspace-api.integration.test.ts --reporter=verbose

# Visualizzare warning di timeout
node --trace-warnings ...

# Controllare stato database
npm run test:integration -- --reporter=verbose 2>&1 | grep -i error
```

---

## 📝 Note Aggiuntive

- C'è un warning costante di timeout negativo: `TimeoutNegativeWarning: -1770073013291 is a negative number`
  - Questo potrebbe indicare un problema di timing nei test
  - Investigare vitest configuration

- La maggior parte dei test "passati" nel workspace-api.integration.test.ts in realtà non eseguono assertion
  - Verificare che i test siano scritti correttamente

- I plugin test passano tutti correttamente, suggerendo che l'infrastruttura base è OK
  - Il problema sembra essere specifico ai workspace e permission service

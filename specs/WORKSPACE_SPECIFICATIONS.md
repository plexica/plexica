# Plexica - Workspace Specifications

**Last Updated**: 2025-02-03  
**Status**: Complete  
**Owner**: Engineering Team  
**Document Type**: Technical Specifications

## Related Documents

For context on how workspaces fit into the broader Plexica architecture, refer to:

- **[FUNCTIONAL_SPECIFICATIONS.md](./FUNCTIONAL_SPECIFICATIONS.md)** - Functional requirements for workspaces (Section 6: Workspaces and Organization)
- **[TECHNICAL_SPECIFICATIONS.md](./TECHNICAL_SPECIFICATIONS.md)** - Technical implementation details for workspace isolation and access control (Section 7)
- **[PLUGIN_ECOSYSTEM_ARCHITECTURE.md](./PLUGIN_ECOSYSTEM_ARCHITECTURE.md)** - How plugins interact with workspaces and workspace-specific plugin instances

---

## 1. Overview

### 1.1 Introduction

**Workspaces** introduce a lightweight organizational layer within Plexica tenants. While **tenants** provide strong data isolation through separate database schemas and domains, **workspaces** offer logical grouping within a single tenant schema for scenarios where full isolation is unnecessary.

### 1.2 Tenant vs Workspace

| Aspect                | Tenant                         | Workspace                                 |
| --------------------- | ------------------------------ | ----------------------------------------- |
| **Data Isolation**    | Separate PostgreSQL schema     | Shared schema, filtered by `workspace_id` |
| **Domain**            | Unique subdomain/domain        | Same domain as tenant                     |
| **Keycloak**          | Separate realm                 | Same realm, workspace as user attribute   |
| **Storage**           | Separate S3 bucket             | Shared bucket, prefixed path              |
| **Use Case**          | Complete customer separation   | Internal team organization                |
| **Provisioning Cost** | High (schema, realm, bucket)   | Low (DB records only)                     |
| **Performance**       | No overhead (schema isolation) | Minimal overhead (WHERE clause)           |

**Analogy**:

- **Tenant** = GitHub Account (e.g., `acme-corp`)
- **Workspace** = GitHub Organization (e.g., `acme-corp/sales`, `acme-corp/engineering`)
- **Team** = GitHub Repository/Project (e.g., `sales/lead-tracking`, `sales/crm-contacts`)

### 1.3 When to Use Workspaces

**Use Workspaces when:**

- Internal departmental separation needed (Sales, Marketing, Engineering)
- Shared data access is acceptable (e.g., company-wide contacts)
- Cost optimization is important (avoid schema overhead)
- Fast provisioning required (no infrastructure setup)
- Cross-workspace collaboration is common

**Use Tenants when:**

- Complete data isolation required (regulatory, security)
- Different customers/organizations
- Separate billing and resource quotas
- Custom domain or branding per customer
- Legal separation of data required

---

## 2. Data Model

### 2.1 Core Schema (tenant\_\*)

#### 2.1.1 Workspace Table

```prisma
model Workspace {
  id          String   @id @default(uuid())
  tenantId    String   @map("tenant_id")
  slug        String
  name        String
  description String?
  status      WorkspaceStatus @default(ACTIVE)
  settings    Json     @default("{}")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  // Relations
  members     WorkspaceMember[]
  teams       Team[]
  resources   WorkspaceResource[]

  // Indexes
  @@unique([tenantId, slug])
  @@index([tenantId])
  @@index([status])
  @@map("workspaces")
}

enum WorkspaceStatus {
  ACTIVE
  ARCHIVED
  DELETED
}
```

**IMPORTANT**: The `tenantId` field is **required** for proper multi-tenant isolation. Every workspace must belong to exactly one tenant. The unique constraint `@@unique([tenantId, slug])` ensures that workspace slugs are unique within a tenant, but the same slug can exist in different tenants.

#### 2.1.2 Workspace Membership

```prisma
model WorkspaceMember {
  workspaceId String   @map("workspace_id")
  userId      String   @map("user_id")
  role        WorkspaceRole @default(MEMBER)
  joinedAt    DateTime @default(now()) @map("joined_at")

  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([workspaceId, userId])
  @@index([userId])
  @@map("workspace_members")
}

enum WorkspaceRole {
  ADMIN      // Can manage workspace settings, members
  MEMBER     // Can access workspace resources
  VIEWER     // Read-only access
}
```

#### 2.1.3 Updated Team Model

Teams now belong to a workspace:

```prisma
model Team {
  id          String    @id @default(uuid())
  workspaceId String    @map("workspace_id")
  name        String
  description String?
  createdAt   DateTime  @default(now()) @map("created_at")

  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  members     TeamMember[]

  // Unique team name within workspace
  @@unique([workspaceId, name])
  @@index([workspaceId])
  @@map("teams")
}
```

#### 2.1.4 Workspace Resource Tracking

Generic table to track which resources belong to which workspace:

```prisma
model WorkspaceResource {
  id           String    @id @default(uuid())
  workspaceId  String    @map("workspace_id")
  resourceType String    @map("resource_type")  // e.g., "crm:contact", "billing:invoice"
  resourceId   String    @map("resource_id")
  createdAt    DateTime  @default(now()) @map("created_at")

  workspace    Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([resourceType, resourceId])
  @@index([workspaceId])
  @@index([resourceType, resourceId])
  @@map("workspace_resources")
}
```

### 2.2 Plugin Data Models

Plugins that support workspaces should include `workspace_id` in their tables:

```prisma
// Example: CRM Plugin - Contacts Table
model Contact {
  id          String   @id @default(uuid())
  workspaceId String   @map("workspace_id")
  name        String
  email       String?
  phone       String?
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  // Plugin-specific fields...

  @@index([workspaceId])
  @@map("contacts")
}

// Example: Billing Plugin - Invoices Table
model Invoice {
  id          String   @id @default(uuid())
  workspaceId String   @map("workspace_id")
  customerId  String   @map("customer_id")
  amount      Decimal  @db.Decimal(10, 2)
  status      String
  createdAt   DateTime @default(now()) @map("created_at")

  // Plugin-specific fields...

  @@index([workspaceId])
  @@map("invoices")
}
```

### 2.3 Migration Strategy

#### 2.3.1 Existing Tenants

For existing tenants without workspaces:

1. Create a default workspace named "Default" or using tenant name
2. Assign all existing users to the default workspace
3. Migrate all existing teams to the default workspace
4. Update plugin data to reference the default workspace

```sql
-- Migration script (pseudocode)
INSERT INTO workspaces (id, slug, name, status)
SELECT gen_random_uuid(), 'default', 'Default Workspace', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM workspaces);

INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT
  (SELECT id FROM workspaces WHERE slug = 'default'),
  id,
  'MEMBER'
FROM users;

UPDATE teams
SET workspace_id = (SELECT id FROM workspaces WHERE slug = 'default')
WHERE workspace_id IS NULL;
```

---

## 3. Architecture

### 3.1 Workspace Context

#### 3.1.1 Enhanced Tenant Context

```typescript
// src/shared/database/tenant-context.ts

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  schema: string;
  userId?: string;
  workspaceId?: string; // NEW: Current workspace
  traceId: string;
}

export class TenantContextService {
  private static storage = new AsyncLocalStorage<TenantContext>();

  static run<T>(context: TenantContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  static get(): TenantContext | undefined {
    return this.storage.getStore();
  }

  static getOrThrow(): TenantContext {
    const context = this.get();
    if (!context) {
      throw new Error('Tenant context not found');
    }
    return context;
  }

  static getWorkspaceIdOrThrow(): string {
    const context = this.getOrThrow();
    if (!context.workspaceId) {
      throw new Error('Workspace context not found');
    }
    return context.workspaceId;
  }
}
```

#### 3.1.2 Workspace Guard

```typescript
// src/shared/guards/workspace.guard.ts

@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly userService: UserService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenantContext = request.tenantContext;

    if (!user || !tenantContext) {
      throw new UnauthorizedException();
    }

    // Extract workspace from:
    // 1. Header: X-Workspace-ID
    // 2. Query: ?workspaceId=xxx
    // 3. Body: { workspaceId: "xxx" }
    // 4. Path param: /workspaces/:workspaceId/...
    const workspaceId =
      request.headers['x-workspace-id'] ||
      request.query.workspaceId ||
      request.body?.workspaceId ||
      request.params?.workspaceId;

    if (!workspaceId) {
      throw new BadRequestException('Workspace ID required');
    }

    // Verify workspace exists and user has access
    const membership = await this.workspaceService.getMembership(workspaceId, user.id);

    if (!membership) {
      throw new ForbiddenException('Access to workspace denied');
    }

    // Enhance context
    tenantContext.workspaceId = workspaceId;
    request.workspaceMembership = membership;

    return true;
  }
}
```

### 3.2 Services

#### 3.2.1 Workspace Service

```typescript
// src/modules/workspace/workspace.service.ts

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaTenantService,
    private readonly cache: RedisService,
    private readonly eventBus: EventBusService
  ) {}

  async create(dto: CreateWorkspaceDto): Promise<Workspace> {
    const tenantContext = getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    const client = this.prisma.getClient();

    // Check slug uniqueness within tenant
    const existing = await client.workspace.findFirst({
      where: {
        tenantId: tenantContext.tenantId,
        slug: dto.slug,
      },
    });

    if (existing) {
      throw new Error(`Workspace with slug '${dto.slug}' already exists in this tenant`);
    }

    const workspace = await client.workspace.create({
      data: {
        tenantId: tenantContext.tenantId, // Auto-filled from context
        slug: dto.slug,
        name: dto.name,
        description: dto.description,
        settings: dto.settings || {},
      },
    });

    // Publish event
    await this.eventBus.publish({
      type: 'core.workspace.created',
      aggregateId: workspace.id,
      data: workspace,
    });

    return workspace;
  }

  async addMember(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole = 'MEMBER'
  ): Promise<WorkspaceMember> {
    const client = this.prisma.getClient();

    const member = await client.workspaceMember.create({
      data: {
        workspaceId,
        userId,
        role,
      },
    });

    // Invalidate cache
    await this.cache.del(`workspace:${workspaceId}:members`);

    await this.eventBus.publish({
      type: 'core.workspace.member-added',
      aggregateId: workspaceId,
      data: { workspaceId, userId, role },
    });

    return member;
  }

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    const client = this.prisma.getClient();

    await client.workspaceMember.delete({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });

    await this.cache.del(`workspace:${workspaceId}:members`);

    await this.eventBus.publish({
      type: 'core.workspace.member-removed',
      aggregateId: workspaceId,
      data: { workspaceId, userId },
    });
  }

  async getMembership(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
    const cacheKey = `workspace:${workspaceId}:member:${userId}`;

    return this.cache.remember(
      cacheKey,
      300, // 5 min
      async () => {
        const client = this.prisma.getClient();

        return client.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId,
              userId,
            },
          },
        });
      }
    );
  }

  async listUserWorkspaces(userId: string): Promise<Workspace[]> {
    const client = this.prisma.getClient();

    const memberships = await client.workspaceMember.findMany({
      where: { userId },
      include: { workspace: true },
    });

    return memberships.map((m) => m.workspace);
  }

  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole
  ): Promise<WorkspaceMember> {
    const client = this.prisma.getClient();

    const member = await client.workspaceMember.update({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      data: { role },
    });

    await this.cache.del(`workspace:${workspaceId}:member:${userId}`);

    return member;
  }

  async archive(workspaceId: string): Promise<Workspace> {
    const client = this.prisma.getClient();

    const workspace = await client.workspace.update({
      where: { id: workspaceId },
      data: { status: 'ARCHIVED' },
    });

    await this.eventBus.publish({
      type: 'core.workspace.archived',
      aggregateId: workspaceId,
      data: workspace,
    });

    return workspace;
  }
}
```

#### 3.2.2 Workspace-Aware Repository Pattern

```typescript
// src/shared/database/workspace-repository.base.ts

export abstract class WorkspaceRepository<T> {
  constructor(
    protected readonly prisma: PrismaTenantService,
    protected readonly modelName: string
  ) {}

  async findById(id: string): Promise<T | null> {
    const workspaceId = TenantContextService.getWorkspaceIdOrThrow();
    const client = this.prisma.getClient();

    return client[this.modelName].findFirst({
      where: {
        id,
        workspaceId,
      },
    });
  }

  async findMany(filters?: any): Promise<T[]> {
    const workspaceId = TenantContextService.getWorkspaceIdOrThrow();
    const client = this.prisma.getClient();

    return client[this.modelName].findMany({
      where: {
        workspaceId,
        ...filters,
      },
    });
  }

  async create(data: Partial<T>): Promise<T> {
    const workspaceId = TenantContextService.getWorkspaceIdOrThrow();
    const client = this.prisma.getClient();

    return client[this.modelName].create({
      data: {
        ...data,
        workspaceId,
      },
    });
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    const workspaceId = TenantContextService.getWorkspaceIdOrThrow();
    const client = this.prisma.getClient();

    return client[this.modelName].update({
      where: {
        id,
        workspaceId,
      },
      data,
    });
  }

  async delete(id: string): Promise<T> {
    const workspaceId = TenantContextService.getWorkspaceIdOrThrow();
    const client = this.prisma.getClient();

    return client[this.modelName].delete({
      where: {
        id,
        workspaceId,
      },
    });
  }
}

// Usage example
@Injectable()
export class ContactRepository extends WorkspaceRepository<Contact> {
  constructor(prisma: PrismaTenantService) {
    super(prisma, 'contact');
  }

  async findByEmail(email: string): Promise<Contact | null> {
    const workspaceId = TenantContextService.getWorkspaceIdOrThrow();
    const client = this.prisma.getClient();

    return client.contact.findFirst({
      where: {
        workspaceId,
        email,
      },
    });
  }
}
```

### 3.3 API Endpoints

#### 3.3.1 Workspace Management

```typescript
// src/modules/workspace/workspace.controller.ts

@Controller('workspaces')
@UseGuards(AuthGuard, TenantGuard)
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post()
  @RequirePermissions('core:workspaces:create')
  async create(@Body() dto: CreateWorkspaceDto, @CurrentUser() user: User): Promise<Workspace> {
    const workspace = await this.workspaceService.create(dto);

    // Add creator as admin
    await this.workspaceService.addMember(workspace.id, user.id, 'ADMIN');

    return workspace;
  }

  @Get()
  async listMine(@CurrentUser() user: User): Promise<Workspace[]> {
    return this.workspaceService.listUserWorkspaces(user.id);
  }

  @Get(':workspaceId')
  @UseGuards(WorkspaceGuard)
  async get(@Param('workspaceId') workspaceId: string): Promise<Workspace> {
    return this.workspaceService.findById(workspaceId);
  }

  @Patch(':workspaceId')
  @UseGuards(WorkspaceGuard)
  @RequireWorkspaceRole('ADMIN')
  async update(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateWorkspaceDto
  ): Promise<Workspace> {
    return this.workspaceService.update(workspaceId, dto);
  }

  @Delete(':workspaceId')
  @UseGuards(WorkspaceGuard)
  @RequireWorkspaceRole('ADMIN')
  async archive(@Param('workspaceId') workspaceId: string): Promise<Workspace> {
    return this.workspaceService.archive(workspaceId);
  }

  // Members management
  @Post(':workspaceId/members')
  @UseGuards(WorkspaceGuard)
  @RequireWorkspaceRole('ADMIN')
  async addMember(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: AddMemberDto
  ): Promise<WorkspaceMember> {
    return this.workspaceService.addMember(workspaceId, dto.userId, dto.role);
  }

  @Get(':workspaceId/members')
  @UseGuards(WorkspaceGuard)
  async listMembers(@Param('workspaceId') workspaceId: string): Promise<WorkspaceMember[]> {
    return this.workspaceService.listMembers(workspaceId);
  }

  @Patch(':workspaceId/members/:userId')
  @UseGuards(WorkspaceGuard)
  @RequireWorkspaceRole('ADMIN')
  async updateMemberRole(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto
  ): Promise<WorkspaceMember> {
    return this.workspaceService.updateMemberRole(workspaceId, userId, dto.role);
  }

  @Delete(':workspaceId/members/:userId')
  @UseGuards(WorkspaceGuard)
  @RequireWorkspaceRole('ADMIN')
  async removeMember(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string
  ): Promise<void> {
    return this.workspaceService.removeMember(workspaceId, userId);
  }
}
```

#### 3.3.2 Workspace-Scoped Plugin APIs

```typescript
// Example: CRM Plugin with workspace support

@Controller('contacts')
@UseGuards(AuthGuard, TenantGuard, WorkspaceGuard)
export class ContactsController {
  constructor(private readonly contactService: ContactService) {}

  // X-Workspace-ID header required
  @Get()
  @RequirePermissions('crm:contacts:read')
  async list(): Promise<Contact[]> {
    // Automatically filtered by workspace in repository
    return this.contactService.findAll();
  }

  @Post()
  @RequirePermissions('crm:contacts:write')
  async create(@Body() dto: CreateContactDto): Promise<Contact> {
    // Automatically scoped to current workspace
    return this.contactService.create(dto);
  }
}
```

---

## 4. Frontend Integration

### 4.1 Workspace Context Provider

```typescript
// apps/web/src/context/WorkspaceContext.tsx

interface WorkspaceContextValue {
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  switchWorkspace: (workspaceId: string) => Promise<void>;
  loading: boolean;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadWorkspaces();
    }
  }, [user]);

  const loadWorkspaces = async () => {
    try {
      const data = await apiClient.get('/workspaces');
      setWorkspaces(data);

      // Load last used workspace from localStorage
      const lastWorkspaceId = localStorage.getItem('lastWorkspaceId');
      const workspace = data.find(w => w.id === lastWorkspaceId) || data[0];

      if (workspace) {
        setCurrentWorkspace(workspace);
      }
    } finally {
      setLoading(false);
    }
  };

  const switchWorkspace = async (workspaceId: string) => {
    const workspace = workspaces.find(w => w.id === workspaceId);
    if (workspace) {
      setCurrentWorkspace(workspace);
      localStorage.setItem('lastWorkspaceId', workspaceId);

      // Trigger reload of workspace-specific data
      window.dispatchEvent(new CustomEvent('workspace-changed', {
        detail: { workspaceId }
      }));
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{
        currentWorkspace,
        workspaces,
        switchWorkspace,
        loading,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return context;
};
```

### 4.2 Workspace Switcher Component

```typescript
// apps/web/src/components/workspace/WorkspaceSwitcher.tsx

export const WorkspaceSwitcher: React.FC = () => {
  const { currentWorkspace, workspaces, switchWorkspace } = useWorkspace();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSelect = async (workspaceId: string) => {
    await switchWorkspace(workspaceId);
    handleClose();
  };

  return (
    <>
      <Button
        onClick={handleClick}
        startIcon={<WorkspaceIcon />}
        endIcon={<ArrowDropDownIcon />}
      >
        {currentWorkspace?.name || 'Select Workspace'}
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
      >
        {workspaces.map(workspace => (
          <MenuItem
            key={workspace.id}
            onClick={() => handleSelect(workspace.id)}
            selected={workspace.id === currentWorkspace?.id}
          >
            <ListItemIcon>
              {workspace.id === currentWorkspace?.id && <CheckIcon />}
            </ListItemIcon>
            <ListItemText
              primary={workspace.name}
              secondary={workspace.description}
            />
          </MenuItem>
        ))}

        <Divider />

        <MenuItem component={Link} to="/workspaces/new">
          <ListItemIcon>
            <AddIcon />
          </ListItemIcon>
          <ListItemText primary="Create Workspace" />
        </MenuItem>
      </Menu>
    </>
  );
};
```

### 4.3 API Client with Workspace Header

```typescript
// packages/api-client/src/api-client.ts

export class ApiClient {
  private workspaceId: string | null = null;

  setWorkspace(workspaceId: string) {
    this.workspaceId = workspaceId;
  }

  async request<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
    const headers = {
      ...options?.headers,
      'X-Workspace-ID': this.workspaceId || '',
    };

    // ... rest of request logic
  }
}

// Usage in app
const { currentWorkspace } = useWorkspace();

useEffect(() => {
  if (currentWorkspace) {
    apiClient.setWorkspace(currentWorkspace.id);
  }
}, [currentWorkspace]);
```

### 4.4 Workspace Management UI

```typescript
// apps/web/src/pages/WorkspaceSettings.tsx

export const WorkspaceSettings: React.FC = () => {
  const { currentWorkspace } = useWorkspace();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);

  useEffect(() => {
    loadMembers();
  }, [currentWorkspace]);

  const loadMembers = async () => {
    if (currentWorkspace) {
      const data = await apiClient.get(
        `/workspaces/${currentWorkspace.id}/members`
      );
      setMembers(data);
    }
  };

  const handleAddMember = async (userId: string, role: WorkspaceRole) => {
    await apiClient.post(
      `/workspaces/${currentWorkspace.id}/members`,
      { userId, role }
    );
    loadMembers();
  };

  const handleRemoveMember = async (userId: string) => {
    await apiClient.delete(
      `/workspaces/${currentWorkspace.id}/members/${userId}`
    );
    loadMembers();
  };

  return (
    <Container>
      <Typography variant="h4">Workspace Settings</Typography>

      <Card>
        <CardContent>
          <Typography variant="h6">General</Typography>
          {/* Workspace name, description, settings */}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">Members</Typography>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Joined</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {members.map(member => (
                  <TableRow key={member.userId}>
                    <TableCell>{member.user.name}</TableCell>
                    <TableCell>{member.role}</TableCell>
                    <TableCell>
                      {new Date(member.joinedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <IconButton onClick={() => handleRemoveMember(member.userId)}>
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Button
            startIcon={<AddIcon />}
            onClick={() => {/* Open add member dialog */}}
          >
            Add Member
          </Button>
        </CardContent>
      </Card>
    </Container>
  );
};
```

---

## 5. Plugin Integration

### 5.1 Plugin SDK Support

```typescript
// packages/sdk/src/workspace-plugin.ts

export abstract class WorkspaceAwarePlugin extends PlexicaPlugin {
  /**
   * Automatically filter queries by workspace
   */
  protected async query<T>(model: string, options: QueryOptions): Promise<T[]> {
    const workspaceId = this.getWorkspaceId();

    return this.db.query(model, {
      ...options,
      where: {
        ...options.where,
        workspaceId,
      },
    });
  }

  /**
   * Automatically set workspaceId on create
   */
  protected async create<T>(model: string, data: Partial<T>): Promise<T> {
    const workspaceId = this.getWorkspaceId();

    return this.db.create(model, {
      ...data,
      workspaceId,
    });
  }

  private getWorkspaceId(): string {
    const context = this.context.getWorkspace();
    if (!context) {
      throw new Error('Workspace context required');
    }
    return context.id;
  }
}
```

### 5.2 Plugin Manifest Extensions

```json
{
  "id": "crm",
  "name": "CRM",
  "version": "2.0.0",

  "features": {
    "workspaceSupport": true,
    "workspaceRequired": true
  },

  "migrations": {
    "workspace": ["001_add_workspace_to_contacts.sql", "002_add_workspace_to_deals.sql"]
  },

  "permissions": [
    {
      "key": "crm:contacts:read",
      "name": "View Contacts",
      "scope": "workspace"
    },
    {
      "key": "crm:contacts:write",
      "name": "Edit Contacts",
      "scope": "workspace"
    }
  ]
}
```

### 5.3 Cross-Workspace Resource Sharing

For cases where resources need to be shared across workspaces:

```typescript
// Example: Shared contact across workspaces

@Injectable()
export class ContactSharingService {
  constructor(private readonly prisma: PrismaTenantService) {}

  async shareWithWorkspace(
    contactId: string,
    targetWorkspaceId: string,
    permission: 'read' | 'write' = 'read'
  ): Promise<void> {
    const client = this.prisma.getClient();

    await client.contactShare.create({
      data: {
        contactId,
        workspaceId: targetWorkspaceId,
        permission,
      },
    });
  }

  async findSharedContacts(workspaceId: string): Promise<Contact[]> {
    const client = this.prisma.getClient();

    const shares = await client.contactShare.findMany({
      where: { workspaceId },
      include: { contact: true },
    });

    return shares.map((s) => s.contact);
  }
}
```

---

## 6. Authorization & Permissions

### 6.1 Workspace-Level Permissions

Extend RBAC to support workspace-scoped permissions:

```typescript
// src/modules/permission/workspace-permission.service.ts

@Injectable()
export class WorkspacePermissionService {
  constructor(
    private readonly permissionService: PermissionService,
    private readonly workspaceService: WorkspaceService
  ) {}

  async checkWorkspacePermission(
    userId: string,
    workspaceId: string,
    permission: string,
    resource?: any
  ): Promise<boolean> {
    // 1. Check if user is member of workspace
    const membership = await this.workspaceService.getMembership(workspaceId, userId);

    if (!membership) {
      return false;
    }

    // 2. Check workspace role permissions
    if (membership.role === 'ADMIN') {
      // Admins have all workspace permissions
      return true;
    }

    if (membership.role === 'VIEWER') {
      // Viewers only have read permissions
      return permission.endsWith(':read');
    }

    // 3. Fallback to standard RBAC check
    return this.permissionService.checkPermission(userId, permission, resource);
  }
}
```

### 6.2 Workspace Role Decorator

```typescript
// src/shared/decorators/workspace-role.decorator.ts

export const RequireWorkspaceRole = (...roles: WorkspaceRole[]) =>
  SetMetadata('workspace-roles', roles);

@Injectable()
export class WorkspaceRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<WorkspaceRole[]>(
      'workspace-roles',
      context.getHandler()
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const membership: WorkspaceMember = request.workspaceMembership;

    if (!membership) {
      return false;
    }

    return requiredRoles.includes(membership.role);
  }
}

// Usage
@Delete(':id')
@UseGuards(AuthGuard, TenantGuard, WorkspaceGuard, WorkspaceRoleGuard)
@RequireWorkspaceRole('ADMIN')
async delete(@Param('id') id: string) {
  // Only workspace admins can delete
}
```

---

## 7. Migration Path

### 7.1 Phase 1: Database Schema (Week 1-2)

1. Add workspace tables to core schema
2. Add `workspace_id` to teams table
3. Create migration scripts for existing data
4. Test migration on staging environment

### 7.2 Phase 2: Backend Services (Week 3-4)

1. Implement `WorkspaceService`
2. Add `WorkspaceGuard` and context enhancement
3. Update `TeamService` to be workspace-aware
4. Create workspace API endpoints

### 7.3 Phase 3: Plugin SDK (Week 5)

1. Update SDK with workspace support
2. Create `WorkspaceAwarePlugin` base class
3. Document workspace integration for plugin developers

### 7.4 Phase 4: Frontend (Week 6-7)

1. Implement `WorkspaceContext` and provider
2. Create workspace switcher component
3. Add workspace settings pages
4. Update API client with workspace header

### 7.5 Phase 5: Plugin Migration (Week 8+)

1. Update existing plugins (CRM, Billing, etc.)
2. Add `workspace_id` to plugin tables
3. Migrate existing plugin data to default workspace
4. Test cross-workspace scenarios

---

## 8. Use Cases & Examples

### 8.1 Use Case: Multi-Department Company

**Scenario**: ACME Corp has Sales, Marketing, and Engineering departments.

**Structure**:

```
Tenant: acme-corp
├── Workspace: Sales
│   ├── Team: Enterprise Sales
│   ├── Team: SMB Sales
│   └── Resources: CRM contacts (sales leads)
├── Workspace: Marketing
│   ├── Team: Content Marketing
│   ├── Team: Demand Gen
│   └── Resources: Campaign data, shared contacts
└── Workspace: Engineering
    ├── Team: Backend
    ├── Team: Frontend
    └── Resources: Project management, docs
```

**Benefits**:

- Sales team can't see Engineering resources
- Marketing can share contacts with Sales
- All under one tenant (shared billing, shared auth)

### 8.2 Use Case: Agency with Multiple Clients

**Scenario**: Marketing agency serves multiple clients but needs internal separation.

**Structure**:

```
Tenant: marketing-agency
├── Workspace: Client-A
│   ├── Team: Client-A Campaign Team
│   └── Resources: Client A campaigns, analytics
├── Workspace: Client-B
│   ├── Team: Client-B Campaign Team
│   └── Resources: Client B campaigns, analytics
└── Workspace: Internal
    ├── Team: Operations
    └── Resources: Internal docs, processes
```

**Benefits**:

- Client data separated by workspace
- No need for separate tenants (cost efficient)
- Easy cross-client reporting (same schema)

### 8.3 Use Case: Educational Institution

**Scenario**: University with multiple colleges/departments.

**Structure**:

```
Tenant: state-university
├── Workspace: College of Engineering
│   ├── Team: Computer Science
│   ├── Team: Electrical Engineering
│   └── Resources: Student records, courses
├── Workspace: College of Arts
│   ├── Team: Music
│   ├── Team: Visual Arts
│   └── Resources: Student records, courses
└── Workspace: Administration
    ├── Team: Admissions
    ├── Team: Registrar
    └── Resources: University-wide data
```

---

## 9. Performance Considerations

### 9.1 Indexing Strategy

```sql
-- All workspace-scoped tables should have composite indexes
CREATE INDEX idx_contacts_workspace_id ON contacts(workspace_id);
CREATE INDEX idx_contacts_workspace_email ON contacts(workspace_id, email);
CREATE INDEX idx_teams_workspace_id ON teams(workspace_id);

-- Workspace membership lookups
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX idx_workspace_members_workspace ON workspace_members(workspace_id);
```

### 9.2 Caching Strategy

```typescript
// Cache workspace membership for 5 minutes
const membership = await cache.remember(`workspace:${workspaceId}:member:${userId}`, 300, () =>
  workspaceService.getMembership(workspaceId, userId)
);

// Cache user's workspace list for 15 minutes
const workspaces = await cache.remember(`user:${userId}:workspaces`, 900, () =>
  workspaceService.listUserWorkspaces(userId)
);
```

### 9.3 Query Optimization

```typescript
// GOOD: Single query with workspace filter
const contacts = await prisma.contact.findMany({
  where: {
    workspaceId: currentWorkspace.id,
    status: 'active',
  },
});

// BAD: Load all, then filter in application
const allContacts = await prisma.contact.findMany();
const filtered = allContacts.filter((c) => c.workspaceId === currentWorkspace.id);
```

---

## 10. Security Considerations

### 10.1 Workspace Isolation Enforcement

**Critical**: Always enforce workspace filtering at the repository/service layer, never rely on frontend filtering.

```typescript
// CORRECT: Enforce at DB level
async findContact(id: string): Promise<Contact> {
  const workspaceId = TenantContextService.getWorkspaceIdOrThrow();

  return prisma.contact.findFirstOrThrow({
    where: {
      id,
      workspaceId, // CRITICAL: Always include workspace filter
    },
  });
}

// WRONG: Trust client-provided workspace ID
async findContact(id: string, workspaceId: string): Promise<Contact> {
  // Attacker could pass any workspaceId!
  return prisma.contact.findFirstOrThrow({ where: { id, workspaceId } });
}
```

### 10.2 Cross-Workspace Access Validation

```typescript
// When sharing resources across workspaces
async shareResource(
  resourceId: string,
  targetWorkspaceId: string
): Promise<void> {
  const currentWorkspaceId = TenantContextService.getWorkspaceIdOrThrow();

  // 1. Verify resource belongs to current workspace
  const resource = await this.findById(resourceId);
  if (resource.workspaceId !== currentWorkspaceId) {
    throw new ForbiddenException('Resource not found in current workspace');
  }

  // 2. Verify target workspace exists in same tenant
  const targetWorkspace = await workspaceService.findById(targetWorkspaceId);
  if (!targetWorkspace) {
    throw new NotFoundException('Target workspace not found');
  }

  // 3. Create share record
  await prisma.resourceShare.create({
    data: {
      resourceId,
      resourceType: 'contact',
      sourceWorkspaceId: currentWorkspaceId,
      targetWorkspaceId,
    },
  });
}
```

### 10.3 Audit Logging

```typescript
// Log workspace changes
await auditLog.create({
  userId: user.id,
  action: 'workspace.member-added',
  resourceType: 'workspace',
  resourceId: workspaceId,
  details: {
    targetUserId: newMemberId,
    role: newMemberRole,
  },
});
```

---

## 11. Testing Strategy

### 11.1 Unit Tests

```typescript
describe('WorkspaceService', () => {
  it('should create workspace', async () => {
    const workspace = await workspaceService.create({
      slug: 'sales',
      name: 'Sales Department',
    });

    expect(workspace).toBeDefined();
    expect(workspace.slug).toBe('sales');
  });

  it('should add member to workspace', async () => {
    const member = await workspaceService.addMember(workspaceId, userId, 'MEMBER');

    expect(member.workspaceId).toBe(workspaceId);
    expect(member.userId).toBe(userId);
  });

  it('should prevent cross-workspace data access', async () => {
    // Set workspace context to workspace A
    TenantContextService.run({ ...context, workspaceId: workspaceA.id }, async () => {
      // Try to access resource from workspace B
      await expect(contactRepository.findById(workspaceBContactId)).rejects.toThrow();
    });
  });
});
```

### 11.2 Integration Tests

```typescript
describe('Workspace API', () => {
  it('should require workspace header for protected routes', async () => {
    const response = await request(app)
      .get('/api/contacts')
      .set('Authorization', `Bearer ${token}`)
      // Missing X-Workspace-ID header
      .expect(400);

    expect(response.body.message).toContain('Workspace ID required');
  });

  it('should filter contacts by workspace', async () => {
    const response = await request(app)
      .get('/api/contacts')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-ID', workspaceA.id)
      .expect(200);

    const contacts = response.body;

    // All contacts should belong to workspace A
    expect(contacts.every((c) => c.workspaceId === workspaceA.id)).toBe(true);
  });
});
```

---

## 12. Documentation Requirements

### 12.1 For End Users

- **Workspace Management Guide**: Creating, managing, archiving workspaces
- **Member Management**: Adding/removing users, roles
- **Best Practices**: When to use workspaces vs teams

### 12.2 For Plugin Developers

- **Workspace Integration Guide**: Adding workspace support to plugins
- **SDK Documentation**: Using `WorkspaceAwarePlugin`
- **Migration Guide**: Updating existing plugins

### 12.3 For System Administrators

- **Deployment Guide**: Database migrations, configuration
- **Performance Tuning**: Indexes, caching strategies
- **Security Considerations**: Isolation, auditing

---

## 13. Roadmap Integration

### Recommended Phase: Phase 2 (Plugin Ecosystem) or Phase 3 (Advanced Features)

**Rationale**:

- Workspaces are an **organizational feature**, not core multi-tenancy
- Phase 1 MVP should focus on tenant isolation
- Workspaces make most sense after plugin ecosystem is stable

### Milestone Breakdown

**If added in Phase 2**:

- Milestone 2.7: Workspaces (Weeks 53-58)
  - [ ] Database schema and migrations
  - [ ] Workspace service and API
  - [ ] Frontend workspace context
  - [ ] Plugin SDK workspace support
  - [ ] Documentation

**If added in Phase 3**:

- Milestone 3.6: Workspaces (As part of enterprise features)
  - Combined with ABAC policies for workspace-level access control

---

## 14. Alternatives Considered

### 14.1 Alternative: Workspace as Separate Tenant

**Pros**:

- Complete isolation
- Simpler permission model

**Cons**:

- High provisioning cost (schema, realm, bucket per workspace)
- Difficult cross-workspace collaboration
- Billing complexity

**Decision**: Rejected. Workspaces are meant to be lightweight.

### 14.2 Alternative: Workspace Using Views

**Approach**: Use PostgreSQL views with RLS (Row Level Security)

**Pros**:

- Automatic filtering
- Database-enforced isolation

**Cons**:

- Complex setup
- Performance overhead
- Difficult to debug

**Decision**: Rejected. Application-level filtering is more flexible.

### 14.3 Alternative: No Workspaces, Only Teams

**Approach**: Use hierarchical teams instead of workspaces

**Pros**:

- Simpler data model
- One less concept to learn

**Cons**:

- Teams are meant for fine-grained collaboration, not departments
- Missing organizational hierarchy
- Difficult to model complex structures

**Decision**: Rejected. Teams and workspaces serve different purposes.

---

## Appendix A - Complete Schema Reference

### Core Workspace Schema

```sql
-- Workspaces
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspaces_status ON workspaces(status);

-- Workspace Members
CREATE TABLE workspace_members (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'MEMBER',
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(),

    PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX idx_workspace_members_workspace ON workspace_members(workspace_id);

-- Updated Teams Table
ALTER TABLE teams ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
CREATE INDEX idx_teams_workspace ON teams(workspace_id);
ALTER TABLE teams ADD CONSTRAINT unique_team_name_per_workspace UNIQUE (workspace_id, name);

-- Workspace Resources (for tracking)
CREATE TABLE workspace_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    UNIQUE(resource_type, resource_id)
);

CREATE INDEX idx_workspace_resources_workspace ON workspace_resources(workspace_id);
CREATE INDEX idx_workspace_resources_type_id ON workspace_resources(resource_type, resource_id);

-- Resource Sharing (for cross-workspace access)
CREATE TABLE workspace_resource_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID NOT NULL,
    permission VARCHAR(50) NOT NULL DEFAULT 'read',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),

    UNIQUE(source_workspace_id, target_workspace_id, resource_type, resource_id)
);

CREATE INDEX idx_resource_shares_target ON workspace_resource_shares(target_workspace_id);
```

---

## Appendix B - API Reference

### Workspace Endpoints

```
GET    /api/workspaces                       # List user's workspaces
POST   /api/workspaces                       # Create workspace
GET    /api/workspaces/:id                   # Get workspace details
PATCH  /api/workspaces/:id                   # Update workspace
DELETE /api/workspaces/:id                   # Archive workspace

GET    /api/workspaces/:id/members           # List members
POST   /api/workspaces/:id/members           # Add member
PATCH  /api/workspaces/:id/members/:userId   # Update member role
DELETE /api/workspaces/:id/members/:userId   # Remove member

GET    /api/workspaces/:id/teams             # List workspace teams
POST   /api/workspaces/:id/teams             # Create team in workspace
```

### Workspace-Scoped Resource Endpoints

```
# All require X-Workspace-ID header

GET    /api/contacts                         # List contacts in workspace
POST   /api/contacts                         # Create contact in workspace
GET    /api/contacts/:id                     # Get contact (workspace-scoped)
PATCH  /api/contacts/:id                     # Update contact
DELETE /api/contacts/:id                     # Delete contact

# Similar pattern for other resources...
```

---

## Appendix C - Configuration Examples

### Environment Variables

```bash
# Enable workspace feature
FEATURE_WORKSPACES_ENABLED=true

# Default workspace settings
DEFAULT_WORKSPACE_NAME="Default"
DEFAULT_WORKSPACE_SLUG="default"

# Workspace limits
MAX_WORKSPACES_PER_TENANT=50
MAX_MEMBERS_PER_WORKSPACE=1000
```

### Feature Flags

```typescript
// config/features.ts
export const features = {
  workspaces: {
    enabled: process.env.FEATURE_WORKSPACES_ENABLED === 'true',
    defaultWorkspace: {
      name: process.env.DEFAULT_WORKSPACE_NAME || 'Default',
      slug: process.env.DEFAULT_WORKSPACE_SLUG || 'default',
    },
    limits: {
      maxPerTenant: parseInt(process.env.MAX_WORKSPACES_PER_TENANT || '50'),
      maxMembersPerWorkspace: parseInt(process.env.MAX_MEMBERS_PER_WORKSPACE || '1000'),
    },
  },
};
```

---

_Plexica Technical Document - Workspaces v1.0_  
_Last Updated: January 2025_  
_Author: Plexica Engineering Team_

# Plexica - UX Specifications & Wireframe Guidelines

## Document Overview

This document defines the user experience architecture and interface specifications for the Plexica platform. It outlines the layout structure, navigation patterns, extension points for plugins, and interaction principles to ensure a consistent, intuitive, and extensible user interface.

---

## Table of Contents

1. [UX Principles](#1-ux-principles)
2. [Application Layout Architecture](#2-application-layout-architecture)
3. [Navigation Structure](#3-navigation-structure)
4. [Extension Points for Plugins](#4-extension-points-for-plugins)
5. [Core UI Components](#5-core-ui-components)
6. [Responsive Behavior](#6-responsive-behavior)
7. [Theme & Branding](#7-theme--branding)
8. [Interaction Patterns](#8-interaction-patterns)
9. [Accessibility Guidelines](#9-accessibility-guidelines)
10. [Wireframe Specifications by User Role](#10-wireframe-specifications-by-user-role)

---

## 1. UX Principles

### 1.1 Core Design Philosophy

1. **Plugin-First Architecture**: The UI is a shell that orchestrates plugins, not a monolithic interface
2. **Progressive Disclosure**: Show only what's relevant to current user permissions and context
3. **Tenant Isolation**: Clear visual indicators of current tenant context
4. **Consistency with Flexibility**: Core patterns are consistent, but plugins can customize their areas
5. **Performance**: Fast load times through lazy loading and module federation

### 1.2 Design Tenets

| Tenet | Description | Example |
|-------|-------------|---------|
| **Discoverability** | Users should easily find available features | Clear navigation labels, search, tooltips |
| **Contextual Help** | Guidance when/where needed | Inline hints, empty states with CTAs |
| **Feedback** | Clear system response to user actions | Toast notifications, loading states |
| **Forgiving** | Easy to undo mistakes | Confirmation dialogs, trash/archive before delete |
| **Efficient** | Minimize clicks for common tasks | Quick actions, keyboard shortcuts |

### 1.3 Terminology

- **Tenant**: Complete isolated instance (separate DB schema, domain: `acme-corp.plexica.io`)
- **Workspace**: Logical grouping within a tenant (e.g., Sales, Marketing, Engineering)
- **Shell**: The core platform UI that hosts plugins (navigation, header, layout)
- **Widget**: Small, embeddable UI component provided by a plugin (e.g., dashboard card)
- **Page**: Full-page view provided by a plugin (e.g., CRM contacts list)
- **Application**: Complete standalone app provided by a plugin (e.g., billing portal)
- **Extension Point**: Designated UI location where plugins can inject content
- **Super Admin App**: Separate application for platform/tenant management (different domain)

---

## 2. Application Layout Architecture

### 2.1 Primary Layout Structure

```
┌──────────────────────────────────────────────────────────────────┐
│  HEADER                                                           │
│  [Logo] [Global Search] [Notifications] [Quick Actions] [User]   │
├──────────────┬───────────────────────────────────────────────────┤
│              │                                                    │
│              │                                                    │
│  SIDEBAR     │           MAIN CONTENT AREA                       │
│  NAVIGATION  │           (Plugin-rendered content)               │
│              │                                                    │
│  • Dashboard │                                                    │
│  • Plugin A  │                                                    │
│  • Plugin B  │                                                    │
│  ────────    │                                                    │
│  Settings    │                                                    │
│              │                                                    │
├──────────────┴───────────────────────────────────────────────────┤
│  FOOTER (optional)                                                │
│  [Status] [Privacy] [Support Link]                               │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Layout Zones - Detailed Specifications

#### Zone 1: Header (Height: 64px, fixed)

**Purpose**: Global navigation, context awareness, user account  
**Components**:

```
┌──────────────────────────────────────────────────────────────────┐
│ [Logo]  [Search 🔍]    [🔔 3] [⚡Actions] [Workspace: Sales ▾] [👤]│
└──────────────────────────────────────────────────────────────────┘
  ↓       ↓              ↓      ↓           ↓                    ↓
  A       B              C      D           E                    F
```

**A. Brand Logo** (Extension Point: `header.logo`)
- Default: Plexica logo
- Tenant override: Custom tenant logo
- Click → Navigate to dashboard
- Dimensions: 40x40px

**B. Global Search** (Extension Point: `header.search`)
- Placeholder: "Search everywhere..."
- Shortcut: `Cmd+K` / `Ctrl+K`
- Dropdown with results categorized by plugin:
  ```
  Recent
  ─────────
  Contact: John Doe (CRM)
  Invoice #1234 (Billing)
  
  Contacts (CRM)
  ─────────
  John Doe
  Jane Smith
  
  Invoices (Billing)
  ─────────
  #1234 - $500
  ```
- Plugins register searchable entities via `registerSearchProvider()`

**C. Notifications Bell** (Extension Point: `header.notifications`)
- Badge with unread count
- Click → Dropdown panel:
  ```
  Notifications
  ─────────────────────────────────────
  🔵 New comment on Ticket #123 (Help Desk)
     2 minutes ago
  
  🟢 Invoice #456 paid (Billing)
     1 hour ago
  
  [Mark all as read] [View all →]
  ```
- Plugins publish notifications via event system

**D. Quick Actions** (Extension Point: `header.quickActions`)
- Contextual actions from plugins (e.g., "+ New Contact", "+ New Invoice")
- Max 3-4 most common actions
- Dropdown for overflow:
  ```
  Quick Actions
  ───────────────
  + New Contact (CRM)
  + New Invoice (Billing)
  + New Ticket (Help Desk)
  ───────────────
  More actions →
  ```

**E. Workspace Selector** (Multi-workspace users)
- Shows current workspace name
- Dropdown to switch between workspaces user has access to
- Hidden if user has access to only one workspace
- Format: `[Workspace Name ▾]`
- Dropdown shows:
  ```
  Current Workspace
  ─────────────────
  ● Sales (current)
  ○ Marketing
  ○ Engineering
  ```
- Switching workspace refreshes context (dashboard, navigation)

**F. User Menu**
- Avatar + Initials (or photo)
- Dropdown:
  ```
  John Doe
  john@acme.com
  ───────────────
  👤 Profile
  ⚙️  Settings
  🎨 Preferences
  ❓ Help & Support
  ───────────────
  🚪 Logout
  ```

---

#### Zone 2: Sidebar Navigation (Width: 240px collapsible to 64px)

**Purpose**: Primary navigation between plugins and core features  
**Structure**:

```
┌─────────────────────┐
│ SIDEBAR             │
├─────────────────────┤
│ 📊 Dashboard        │  ← Core
│                     │
│ APPLICATIONS        │  ← Section Header
│ 👥 CRM              │  ← Plugin
│ 💰 Billing          │  ← Plugin
│ 🎫 Help Desk        │  ← Plugin
│                     │
│ ─────────────────── │  ← Divider
│                     │
│ ⚙️  Settings        │  ← Core (User)
│ 🏢 Workspace        │  ← Core (Workspace Admin)
│ 👥 Users & Teams    │  ← Core (Workspace Admin)
│                     │
│ [Collapse ←]        │  ← Toggle
└─────────────────────┘
```

**Navigation Item States**:
- **Default**: Gray text, icon
- **Hover**: Light background highlight
- **Active**: Colored background + accent border-left (3px)
- **Disabled** (no permission): Grayed out, no click

**Extension Point: `sidebar.navigation`**
- Plugins register menu items via manifest:
  ```json
  {
    "navigation": {
      "items": [
        {
          "id": "crm-main",
          "label": "CRM",
          "icon": "users",
          "route": "/crm",
          "permission": "crm:access",
          "order": 10
        }
      ]
    }
  }
  ```

**Collapsible Behavior**:
- Collapsed: Shows only icons (64px width)
- Tooltip on hover shows full label
- Toggle via button at bottom or double-click divider

**Section Headers** (Extension Point: `sidebar.sections`)
- Plugins can register custom sections
- Default sections: "APPLICATIONS", "TOOLS", "ADMIN"

---

#### Zone 3: Main Content Area (Dynamic)

**Purpose**: Plugin-rendered content, dashboards, pages  
**Typical Inner Structure**:

```
┌──────────────────────────────────────────────────────────┐
│ PAGE HEADER                                               │
│ [Breadcrumbs] > [Page Title]          [Primary Actions]  │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ CONTENT AREA                                              │
│ (Plugin-controlled: tables, forms, dashboards, etc.)     │
│                                                           │
│                                                           │
│                                                           │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

**Page Header** (Extension Point: `page.header`)
- **Breadcrumbs**: `Dashboard > CRM > Contact Details`
- **Page Title**: `<h1>` with optional icon
- **Primary Actions**: Buttons aligned right (max 3 visible, overflow to "More" dropdown)
- **Tabs** (optional): Sub-navigation within plugin page

**Content Area Guidelines**:
- Padding: 24px
- Max-width for forms: 1200px (centered)
- Card-based layout for dashboard views
- Tables should have pagination (default 25 items)

---

#### Zone 4: Footer (Height: 48px, optional)

**Purpose**: Status info, legal links, support  
**Content** (Extension Point: `footer.content`):

```
┌──────────────────────────────────────────────────────────┐
│ Status: All systems operational  |  Privacy  |  Support   │
└──────────────────────────────────────────────────────────┘
```

- Plugins can inject status indicators (e.g., "Syncing with external API...")
- Links: Privacy Policy, Terms, Support (opens in modal or new tab)

---

## 3. Navigation Structure

### 3.1 Navigation Hierarchy

```
Plexica Platform (Shell)
│
├── Dashboard (Core)
│   ├── Overview Widgets (from plugins)
│   ├── Recent Activity Feed
│   └── Quick Access Cards
│
├── Plugin Applications
│   ├── CRM
│   │   ├── Contacts (List)
│   │   ├── Contact Details (Detail)
│   │   ├── Companies
│   │   └── Reports
│   │
│   ├── Billing
│   │   ├── Invoices
│   │   ├── Customers
│   │   └── Reports
│   │
│   └── Help Desk
│       ├── Tickets
│       ├── Knowledge Base
│       └── Settings
│
├── Settings (Core)
│   ├── Profile
│   ├── Preferences
│   ├── Security
│   └── Notifications
│
├── Workspace Administration (Workspace Admin)
│   ├── Workspace Settings
│   ├── Users & Teams
│   ├── Roles & Permissions
│   └── Workspace Audit Logs
│
└── Settings (User)
    ├── Profile
    ├── Preferences
    ├── Security
    └── Notifications

**Note**: Tenant Administration (tenant creation, global plugin management, billing) is handled by a separate Super Admin application at a different subdomain (e.g., `admin.plexica.io`), not within the tenant workspace UI.
```

### 3.2 URL Routing Strategy

**Format**: `https://{tenant}.plexica.io/{plugin-route}/{page-route}/{item-id}`

**Workspace Context**:
- Workspace is stored in session/local storage, not in URL (for cleaner URLs)
- Current workspace affects data filtering automatically
- Workspace can be explicitly set via query param: `?workspace={workspace-id}` (for sharing)

**Examples**:
- Dashboard: `https://acme-corp.plexica.io/dashboard`
- CRM Contacts: `https://acme-corp.plexica.io/crm/contacts`
- Contact Detail: `https://acme-corp.plexica.io/crm/contacts/123`
- Settings: `https://acme-corp.plexica.io/settings/profile`
- Workspace Admin: `https://acme-corp.plexica.io/workspace/settings`
- Explicit workspace: `https://acme-corp.plexica.io/crm/contacts?workspace=sales`

**Rules**:
- Plugin routes defined in manifest: `"routePrefix": "/crm"`
- Deep linking supported (shareable URLs)
- Back button respects navigation history
- Workspace context is implicit (stored in user session)
- Sharing URL with `?workspace=` param allows cross-workspace sharing

### 3.3 Breadcrumbs

**Format**: `Home > Section > Subsection > Current Page`

**Behavior**:
- Auto-generated from route hierarchy
- Each segment clickable (except current page)
- Plugins can customize labels via route metadata

**Example**:
```
Dashboard > CRM > Contacts > John Doe
```

---

## 4. Extension Points for Plugins

### 4.1 Extension Point Taxonomy

Extension points are designated UI locations where plugins can inject content. They follow a namespaced identifier pattern.

#### 4.1.1 Global Extension Points

| Extension Point ID | Location | Type | Description |
|-------------------|----------|------|-------------|
| `header.logo` | Header left | Replace | Custom tenant logo |
| `header.search` | Header center | Extend | Add searchable entities |
| `header.notifications` | Header right | Extend | Publish notifications |
| `header.quickActions` | Header right | Extend | Add quick action buttons |
| `header.workspaceMenu` | Workspace dropdown | Extend | Add workspace-specific actions |
| `header.userMenu` | User dropdown | Extend | Add menu items |
| `sidebar.navigation` | Sidebar | Extend | Add navigation items |
| `sidebar.sections` | Sidebar | Extend | Add navigation sections |
| `footer.content` | Footer | Extend | Add footer elements |

#### 4.1.2 Dashboard Extension Points

| Extension Point ID | Location | Type | Description |
|-------------------|----------|------|-------------|
| `dashboard.widgets` | Dashboard grid | Extend | Add widget cards |
| `dashboard.topBar` | Above dashboard | Extend | Add summary metrics |
| `dashboard.quickAccess` | Quick links area | Extend | Add shortcut buttons |

**Dashboard Layout**:
```
┌──────────────────────────────────────────────────────────────┐
│ Dashboard                                [Customize ⚙️]       │
├──────────────────────────────────────────────────────────────┤
│ TOP BAR (extension: dashboard.topBar)                        │
│ [Metric Card] [Metric Card] [Metric Card] [Metric Card]      │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ WIDGETS GRID (extension: dashboard.widgets)                  │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│ │ CRM Widget   │  │ Billing      │  │ Tickets      │        │
│ │              │  │ Widget       │  │ Widget       │        │
│ └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                               │
│ ┌──────────────────────────────┐  ┌──────────────┐          │
│ │ Recent Activity Feed         │  │ Quick Access │          │
│ │                              │  │ (extension)  │          │
│ └──────────────────────────────┘  └──────────────┘          │
└──────────────────────────────────────────────────────────────┘
```

**Widget Specifications**:
- Grid: 12-column system
- Widget sizes: Small (4 cols), Medium (6 cols), Large (12 cols)
- Height: Auto-fit content, min 200px
- User can reorder widgets (drag-and-drop)
- User can show/hide widgets (via dashboard settings)

**Widget Registration**:
```typescript
// Plugin registers dashboard widget
pluginSDK.registerDashboardWidget({
  id: 'crm-recent-contacts',
  title: 'Recent Contacts',
  component: RecentContactsWidget,
  defaultSize: 'medium',
  refreshInterval: 30000, // 30s
  permissions: ['crm:contacts:read']
});
```

#### 4.1.3 Page-Level Extension Points

| Extension Point ID | Location | Type | Description |
|-------------------|----------|------|-------------|
| `page.header.actions` | Page header right | Extend | Add action buttons |
| `page.tabs` | Below page header | Extend | Add tab items |
| `page.aside` | Right sidebar | Extend | Add side panels |
| `page.contextMenu` | Right-click menu | Extend | Add context menu items |

**Example: Contact Detail Page with Extensions**
```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard > CRM > Contacts > John Doe                       │
│                                                              │
│ Contact Details        [Edit] [Delete] [More ▾] ← actions   │
├──────────────┬──────────────────────────────────────────────┤
│ Overview     │ Activity  │ Files  │ Notes  ← tabs           │
├──────────────┴──────────────────────────────────────────────┤
│                                             ┌───────────────┐│
│ MAIN CONTENT                                │ ASIDE PANEL   ││
│ (Plugin-owned)                              │ (extension)   ││
│                                             │               ││
│ Name: John Doe                              │ Related Items ││
│ Email: john@example.com                     │ - Invoice #123││
│ Phone: +1 234 5678                          │ - Ticket #456 ││
│                                             │               ││
│                                             └───────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**Cross-Plugin Extensions**:
- Billing plugin adds "Related Invoices" widget to CRM contact detail page
- Help Desk plugin adds "Support Tickets" tab to CRM contact detail page

#### 4.1.4 Form Extension Points

| Extension Point ID | Location | Type | Description |
|-------------------|----------|------|-------------|
| `form.fields` | Within form | Extend | Add custom fields |
| `form.actions` | Form footer | Extend | Add custom buttons |
| `form.validation` | On submit | Hook | Add custom validation |

**Use Case**: CRM plugin has a "Create Contact" form. Billing plugin extends it to add "Credit Limit" field.

#### 4.1.5 Table/List Extension Points

| Extension Point ID | Location | Type | Description |
|-------------------|----------|------|-------------|
| `table.columns` | Table header | Extend | Add custom columns |
| `table.rowActions` | Row actions | Extend | Add action buttons |
| `table.filters` | Filter bar | Extend | Add filter criteria |
| `table.bulkActions` | Bulk actions | Extend | Add batch operations |

**Example: CRM Contacts List with Extensions**
```
┌─────────────────────────────────────────────────────────────┐
│ Contacts                             [+ New Contact]        │
├─────────────────────────────────────────────────────────────┤
│ Filters: [All] [Active] [Inactive] [Credit Status ▾] ← ext  │
├──┬──────────┬────────────┬──────────┬────────────┬─────────┤
│☑│Name      │Email       │Phone     │Credit Limit│Actions  │
│─│──────────│────────────│──────────│────────────│─────────│
│☐│John Doe  │john@ex.com │+1234567  │$5,000 ← ext│Edit Del │
│☐│Jane Smith│jane@ex.com │+1987654  │$10,000     │Edit Del │
├──┴──────────┴────────────┴──────────┴────────────┴─────────┤
│ [☑ 2 selected] [Delete] [Export] [Send Invoice ←ext]       │
└─────────────────────────────────────────────────────────────┘
```

---

### 4.2 Extension Point Types

1. **Replace**: Plugin replaces default content (e.g., custom logo)
2. **Extend**: Plugin adds content alongside others (e.g., sidebar menu items)
3. **Hook**: Plugin modifies behavior (e.g., form validation)
4. **Slot**: Plugin provides full custom UI (e.g., entire page)

### 4.3 Plugin UI Contribution Types

#### 4.3.1 Widget

**Definition**: Small, self-contained UI component (typically for dashboards or embedded views)

**Characteristics**:
- Isolated state
- Lightweight (< 100KB bundle)
- Refreshable
- Configurable

**Examples**:
- CRM: "Top Contacts" widget
- Billing: "Revenue This Month" widget
- Help Desk: "Open Tickets Count" widget

**Technical Implementation**:
```typescript
// Plugin manifest
{
  "widgets": [
    {
      "id": "crm-top-contacts",
      "name": "Top Contacts",
      "description": "Shows most active contacts",
      "defaultSize": "medium",
      "configurable": true,
      "permissions": ["crm:contacts:read"]
    }
  ]
}

// React component (Module Federation)
export const TopContactsWidget: React.FC<WidgetProps> = ({ config }) => {
  const { data, loading } = useQuery(GET_TOP_CONTACTS);
  
  return (
    <WidgetContainer title="Top Contacts" icon="users">
      {loading ? <Spinner /> : <ContactList contacts={data} />}
    </WidgetContainer>
  );
};
```

---

#### 4.3.2 Page

**Definition**: Full-page view within the platform shell

**Characteristics**:
- Full control over content area
- Can use shell navigation (breadcrumbs, tabs)
- Route-based
- Permission-gated

**Examples**:
- CRM: "Contact List" page
- Billing: "Invoice Details" page
- Help Desk: "Ticket View" page

**Technical Implementation**:
```typescript
// Plugin manifest
{
  "routes": [
    {
      "path": "/crm/contacts",
      "component": "ContactsListPage",
      "permission": "crm:contacts:read",
      "navigation": {
        "label": "Contacts",
        "icon": "users"
      }
    },
    {
      "path": "/crm/contacts/:id",
      "component": "ContactDetailPage",
      "permission": "crm:contacts:read"
    }
  ]
}
```

---

#### 4.3.3 Application (Full-Screen)

**Definition**: Complete standalone app that can run with minimal shell (or fullscreen)

**Characteristics**:
- Own navigation system
- Can hide sidebar/footer
- Immersive experience
- Complex workflows

**Examples**:
- Analytics Dashboard (full BI interface)
- Project Management (Kanban boards, Gantt charts)
- Email Client (inbox, compose, folders)

**Technical Implementation**:
```typescript
// Plugin manifest
{
  "applications": [
    {
      "id": "analytics-app",
      "name": "Analytics",
      "route": "/analytics",
      "mode": "fullscreen", // Hides sidebar, keeps header
      "component": "AnalyticsApp",
      "permissions": ["analytics:access"]
    }
  ]
}
```

**UI Modes**:
- `standard`: Full shell (header + sidebar)
- `minimal`: Header only
- `fullscreen`: Header with minimal controls

---

## 5. Core UI Components

### 5.1 Component Library

Plexica provides a standardized component library (based on a system like Ant Design, Material-UI, or custom) that plugins should use for consistency.

**Core Components**:

| Component | Usage | Extension Point |
|-----------|-------|-----------------|
| `Button` | Primary, secondary, danger actions | Style via theme |
| `Card` | Content containers | Header actions |
| `Table` | Data lists with sorting, filtering | Columns, actions |
| `Form` | Input forms with validation | Fields, validation rules |
| `Modal` | Dialogs, overlays | Footer actions |
| `Tabs` | Sub-navigation | Tab items |
| `Dropdown` | Contextual menus | Menu items |
| `Toast` | Notifications | - |
| `Breadcrumbs` | Navigation trail | Route labels |
| `Avatar` | User/entity images | - |
| `Badge` | Counts, status indicators | - |
| `Spinner` | Loading states | - |
| `EmptyState` | No data placeholder | CTA buttons |

### 5.2 Standard Patterns

#### 5.2.1 List View Pattern

**Structure**:
```
┌─────────────────────────────────────────────────────────────┐
│ [Page Title]                           [+ Primary Action]   │
├─────────────────────────────────────────────────────────────┤
│ [Search] [Filter ▾] [Filter ▾] [Sort ▾]       [View: ≡ ⊞]  │
├─────────────────────────────────────────────────────────────┤
│ [Data Table or Card Grid]                                   │
│                                                              │
│ [Pagination: ← 1 2 3 4 5 →]                                 │
└─────────────────────────────────────────────────────────────┘
```

**Features**:
- Search (debounced, min 3 chars)
- Multi-select filters (dropdown)
- Sort by column (asc/desc)
- View toggle: Table ↔ Grid
- Pagination: 25/50/100 items per page
- Bulk actions (when items selected)

#### 5.2.2 Detail View Pattern

**Structure**:
```
┌─────────────────────────────────────────────────────────────┐
│ [Breadcrumbs] > [Entity Name]                               │
│                                      [Edit] [Delete] [More] │
├──────────────┬──────────────────────────────────────────────┤
│ Overview     │ Related  │ Activity  │ Files  (tabs)         │
├──────────────┴──────────────────────────────────────────────┤
│                                             ┌───────────────┐│
│ MAIN CONTENT                                │ SIDEBAR       ││
│ [Field: Value]                              │ [Metadata]    ││
│ [Field: Value]                              │ [Actions]     ││
│                                             │ [Extensions]  ││
│                                             └───────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**Features**:
- Tabs for different data aspects
- Read-only view with "Edit" mode toggle
- Sidebar for metadata and quick actions
- Related entities (cross-plugin extensions)
- Activity timeline (audit log)

#### 5.2.3 Form Pattern

**Structure**:
```
┌─────────────────────────────────────────────────────────────┐
│ [Form Title]                                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Section 1: Basic Info                                       │
│ ─────────────────────                                       │
│ Field Label *                                               │
│ [Input Field]                                               │
│ Helper text or validation error                             │
│                                                              │
│ Section 2: Additional Details                               │
│ ──────────────────────────                                  │
│ [More fields...]                                            │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                               [Cancel] [Save] [Save & Next] │
└─────────────────────────────────────────────────────────────┘
```

**Features**:
- Grouped sections (collapsible)
- Required field indicator (*)
- Inline validation (on blur)
- Error summary at top (on submit error)
- Autosave draft (optional)
- Keyboard shortcuts (Cmd+S to save)

#### 5.2.4 Empty State Pattern

**Structure**:
```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│                         [Icon]                               │
│                    No contacts yet                           │
│          Add your first contact to get started               │
│                                                              │
│                    [+ Add Contact]                           │
│                                                              │
│                    or import from CSV                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Features**:
- Friendly illustration/icon
- Clear explanation
- Primary CTA (action button)
- Secondary options (links)

---

## 6. Responsive Behavior

### 6.1 Breakpoints

| Breakpoint | Screen Width | Layout Adjustments |
|------------|--------------|-------------------|
| Mobile | < 768px | Sidebar collapses to hamburger menu |
| Tablet | 768px - 1024px | Sidebar auto-collapsed, expandable |
| Desktop | 1024px - 1440px | Full layout, sidebar visible |
| Wide | > 1440px | Full layout, optional split views |

### 6.2 Mobile-First Considerations

**Header on Mobile**:
```
┌──────────────────────────────────┐
│ [☰] Plexica    [🔍] [🔔] [👤]   │
└──────────────────────────────────┘
```

- Hamburger menu (☰) opens sidebar as overlay
- Search icon opens search modal
- Notifications/user menus are dropdowns

**Sidebar on Mobile**:
- Overlay (slide-in from left)
- Tap outside to close
- Full-height, 280px wide

**Tables on Mobile**:
- Convert to card layout (stacked)
- Show most important columns only
- "View Details" button for full record

---

## 7. Theme & Branding

### 7.1 Theming System

**Tenant-Level Customization**:
- Primary color (brand color for buttons, links, active states)
- Secondary color (accents, highlights)
- Logo (header, login page)
- Favicon
- Custom CSS (advanced)

**Theme Variables**:
```css
:root {
  --primary-color: #1890ff;
  --secondary-color: #52c41a;
  --text-primary: #262626;
  --text-secondary: #8c8c8c;
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --border-color: #d9d9d9;
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.1);
}
```

**Dark Mode** (future):
- Toggle in user preferences
- Automatic theme switching (system preference)

### 7.2 Typography

| Element | Font Family | Size | Weight |
|---------|-------------|------|--------|
| H1 | Inter | 28px | 600 |
| H2 | Inter | 24px | 600 |
| H3 | Inter | 20px | 600 |
| Body | Inter | 14px | 400 |
| Small | Inter | 12px | 400 |
| Code | Fira Code | 14px | 400 |

### 7.3 Spacing System

**8px Grid**:
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px
- xxl: 48px

---

## 8. Interaction Patterns

### 8.1 Navigation

**Breadcrumbs**:
- Click any segment to navigate
- Current page not clickable
- Max 5 levels (truncate middle with "...")

**Tabs**:
- Horizontal tabs below page header
- Active tab underline indicator
- Scrollable on overflow (mobile)

**Links**:
- Blue underline on hover
- External links: icon suffix "↗"

### 8.2 Actions

**Buttons**:
- Primary: Filled, primary color (max 1 per view)
- Secondary: Outlined
- Danger: Red (delete, destructive actions)
- Text: No border (low priority actions)

**Button Groups**:
- Related actions grouped (e.g., [Save] [Save & Continue])
- Max 3 buttons before overflow to dropdown

**Quick Actions** (Floating Action Button - FAB):
- Bottom-right corner (mobile)
- Primary action (e.g., "+ New")
- Expands to show 3-4 related actions

### 8.3 Feedback

**Toast Notifications**:
- Position: Top-right
- Types: Success (green), Error (red), Warning (orange), Info (blue)
- Auto-dismiss: 5s (success/info), 10s (warning), Manual (error)
- Max 3 visible, queue overflow

**Loading States**:
- Page load: Full-page spinner with logo
- Component load: Skeleton screens
- Action load: Button spinner (disabled)

**Confirmation Dialogs**:
```
┌────────────────────────────────┐
│ ⚠️  Delete Contact?            │
│                                │
│ This will permanently delete   │
│ John Doe. This cannot be       │
│ undone.                        │
│                                │
│         [Cancel] [Delete]      │
└────────────────────────────────┘
```

**Validation**:
- Inline (on blur): Red border, error message below field
- Form-level (on submit): Error summary at top, scroll to first error

---

## 9. Accessibility Guidelines

### 9.1 WCAG 2.1 AA Compliance

**Color Contrast**:
- Text: 4.5:1 minimum contrast ratio
- Large text (18px+): 3:1 minimum
- UI components: 3:1 minimum

**Keyboard Navigation**:
- All interactive elements focusable (Tab order logical)
- Shortcuts documented (? key opens shortcuts modal)
- Focus indicators visible (outline, not removed)

**Screen Reader Support**:
- ARIA labels on icons
- ARIA live regions for dynamic content
- Semantic HTML (headings hierarchy)

**Forms**:
- Labels associated with inputs (`<label for="...">`)
- Error messages announced (aria-describedby)
- Required fields indicated (aria-required)

---

## 10. Wireframe Specifications by User Role

### 10.1 End User Dashboard

**User**: Standard user with limited permissions  
**Enabled Plugins**: CRM (read), Billing (read)

```
┌──────────────────────────────────────────────────────────────┐
│ [Logo] [Search]                      [🔔 2] [Sales ▾] [JD ▾]│
├─────────────┬────────────────────────────────────────────────┤
│             │ Dashboard                     [Customize ⚙️]   │
│ 📊 Dashboard├────────────────────────────────────────────────┤
│             │ [Metric] [Metric] [Metric] [Metric]            │
│             ├────────────────────────────────────────────────┤
│ APPS        │ ┌──────────────┐  ┌──────────────┐            │
│ 👥 CRM      │ │ My Contacts  │  │ Recent       │            │
│ 💰 Billing  │ │              │  │ Invoices     │            │
│             │ │ [5 contacts] │  │              │            │
│             │ └──────────────┘  └──────────────┘            │
│             │                                                 │
│ ───────     │ ┌──────────────────────────────┐              │
│ ⚙️ Settings │ │ Recent Activity (Sales)      │              │
│             │ │ • Invoice #123 paid          │              │
│             │ │ • Contact updated            │              │
│             │ └──────────────────────────────┘              │
│             │                                                 │
│ [← Collapse]│                                                 │
└─────────────┴─────────────────────────────────────────────────┘
```

**Key Features**:
- Limited sidebar (only apps with read permission)
- Dashboard widgets from accessible plugins scoped to current workspace
- Workspace selector shows "Sales" (current workspace)
- No tenant administration sections visible
- Data automatically filtered by workspace context

---

### 10.2 Workspace Admin - User & Team Management

**User**: Workspace Admin  
**Task**: Manage workspace users and teams

```
┌──────────────────────────────────────────────────────────────┐
│ [Logo] [Search]                  [🔔 5] [Sales ▾] [WA ▾]    │
├─────────────┬────────────────────────────────────────────────┤
│             │ Workspace > Users & Teams                      │
│ 📊 Dashboard├────────────────────────────────────────────────┤
│             │ [Users (15)] [Teams (3)] [Roles (5)]           │
│ APPS        ├────────────────────────────────────────────────┤
│ 👥 CRM      │ ┌────────────────────────────────────────┐    │
│ 💰 Billing  │ │ Users in Sales Workspace               │    │
│ 🎫 Help Desk│ │                         [+ Invite User]│    │
│             │ ├──┬───────────┬──────────┬───────┬─────┤    │
│ ───────     │ │☑│Name       │Email     │Teams  │Role │    │
│ 🏢 Workspace│ │─┼───────────┼──────────┼───────┼─────┤    │
│ ⚙️ Settings │ │☐│Alice Smith│alice@..  │2 teams│Admin│    │
│ 👥 Users    │ │☐│Bob Johnson│bob@..    │1 team │Memb.│    │
│             │ └──┴───────────┴──────────┴───────┴─────┘    │
│             │                                                 │
│             │ ┌────────────────────────────────────────┐    │
│             │ │ Teams in Sales Workspace               │    │
│             │ │                         [+ New Team]   │    │
│             │ ├────────────────┬──────────┬──────────┤      │
│             │ │ Team Name      │ Members  │ Actions  │      │
│             │ ├────────────────┼──────────┼──────────┤      │
│             │ │ Enterprise     │ 8 members│ Edit     │      │
│             │ │ SMB Sales      │ 5 members│ Edit     │      │
│             │ │ Sales Ops      │ 2 members│ Edit     │      │
│             │ └────────────────┴──────────┴──────────┘      │
└─────────────┴─────────────────────────────────────────────────┘
```

**Note**: 
- Users manage teams and members within their workspace
- Plugin configuration is NOT done here (plugins are enabled tenant-wide)
- Plugin settings per-workspace are in Workspace Settings
- Tenant-level plugin management is in Super Admin app (separate domain)

---

### 10.3 Workspace Admin - Workspace Settings

**User**: Workspace Admin  
**Task**: Configure workspace settings and plugin preferences

```
┌──────────────────────────────────────────────────────────────┐
│ [Logo] [Search]                  [🔔 3] [Sales ▾] [WA ▾]    │
├─────────────┬────────────────────────────────────────────────┤
│             │ Workspace > Settings                           │
│ 📊 Dashboard├────────────────────────────────────────────────┤
│             │ [General] [Plugins] [Permissions] [Integr.]    │
│ APPS        ├────────────────────────────────────────────────┤
│ 👥 CRM      │ General Settings                               │
│ 💰 Billing  │ ─────────────────                              │
│ 🎫 Help Desk│                                                 │
│             │ Workspace Name                                 │
│ ───────     │ [Sales                        ]                │
│ 🏢 Workspace│                                                 │
│ ⚙️ Settings │ Description                                    │
│ 👥 Users    │ [Sales department workspace   ]                │
│ 📊 Audit Log│                                                 │
│             │ Default Language                               │
│             │ [English ▾]                                    │
│             │                                                 │
│             │ Workspace Color                                │
│             │ [🔵] [🟢] [🔴] [🟡] [🟣]                        │
│             │                                                 │
│             │ Plugin Configuration                           │
│             │ ─────────────────────                          │
│             │ 👥 CRM Settings                                │
│             │ • Default pipeline: [Sales Pipeline ▾]         │
│             │ • Auto-assign leads: [✓]                       │
│             │                                                 │
│             │ 💰 Billing Settings                            │
│             │ • Invoice prefix: [SALES-]                     │
│             │ • Default payment terms: [Net 30 ▾]            │
│             │                                                 │
│             │                        [Cancel] [Save Changes] │
└─────────────┴─────────────────────────────────────────────────┘
```

**Note About Tenant Administration**:

Tenant administration (creating tenants, global plugin installation, billing management, etc.) is handled by a **separate Super Admin application** accessed at a different subdomain (e.g., `admin.plexica.io`). This separation ensures:

- Clear separation of concerns (platform vs workspace management)
- Different authentication realm (super admin is not tenant-specific)
- Independent deployment and scaling
- Security isolation between platform and tenant operations

The tenant workspace UI focuses on workspace and team management only.

---

### 10.4 Plugin Developer - Custom Page with Workspace Context

**User**: End user viewing a plugin-contributed page  
**Plugin**: CRM - Contact Details  
**Extensions**: Billing plugin adds "Invoices" tab, Help Desk plugin adds "Support Tickets" widget  
**Context**: Sales workspace

```
┌──────────────────────────────────────────────────────────────┐
│ [Logo] [Search]                    [🔔 3] [Sales ▾] [JD ▾]  │
├─────────────┬────────────────────────────────────────────────┤
│             │ Dashboard > CRM > Contacts > John Doe          │
│ 📊 Dashboard│                      [Edit] [Delete] [Email]   │
│             ├────────────────────────────────────────────────┤
│ APPS        │ Overview │ Invoices │ Tickets │ Activity       │
│ 👥 CRM      ├─────────────────────────────────────┬──────────┤
│ 💰 Billing  │                                     │ Details  │
│ 🎫 Help Desk│ Contact Information                 │──────────│
│             │ ─────────────────────                │ ID: 1234 │
│             │ Name: John Doe                      │ Workspace│
│ ───────     │ Email: john@example.com             │ Sales    │
│ 🏢 Workspace│ Phone: +1 234 567 8900              │ Created: │
│ ⚙️ Settings │ Company: ACME Corporation           │ Jan 2025 │
│             │                                     │          │
│             │ Address                             │ Tags:    │
│             │ ─────────                           │ [VIP]    │
│             │ 123 Main St                         │ [Active] │
│             │ San Francisco, CA 94105             │          │
│             │ USA                                 │ Assigned │
│             │                                     │ Sales Rep│
│             │                                     │ Jane S.  │
│             │                                     │          │
│             │                                     │ Actions  │
│             │                                     │──────────│
│             │                                     │[Send Inv]│
│             │                                     │[New Tick]│
└─────────────┴─────────────────────────────────────┴──────────┘
```

**Extension Points in Action**:
1. **Billing plugin** added "Invoices" tab (extension: `page.tabs`)
2. **Help Desk plugin** added "Tickets" tab (extension: `page.tabs`)
3. **Billing plugin** added "Send Invoice" quick action (extension: `page.aside.actions`)
4. **Help Desk plugin** added "New Ticket" quick action (extension: `page.aside.actions`)
5. **Workspace context** automatically filters data to "Sales" workspace

**"Invoices" Tab Content** (when clicked):
```
┌──────────────────────────────────────────────────────────────┐
│ Dashboard > CRM > Contacts > John Doe                        │
│                                      [Edit] [Delete] [Email] │
├──────────────────────────────────────────────────────────────┤
│ Overview │ Invoices │ Tickets │ Activity                     │
├──────────────────────────────────────────────────────────────┤
│ Related Invoices (from Billing plugin)                       │
│                                                               │
│ ┌─────┬─────────────┬────────┬──────────┬────────┐          │
│ │ #   │ Date        │ Amount │ Status   │ Action │          │
│ ├─────┼─────────────┼────────┼──────────┼────────┤          │
│ │ 1234│ 10 Jan 2025 │ $500   │ ✓ Paid   │ View   │          │
│ │ 1189│ 5 Dec 2024  │ $1,200 │ ⚠️ Overdue│ View   │          │
│ └─────┴─────────────┴────────┴──────────┴────────┘          │
│                                                               │
│                                        [+ New Invoice]        │
└──────────────────────────────────────────────────────────────┘
```

---

## 11. Workspace Management UX

### 11.1 Workspace Concepts in UI

**Workspace Visibility**:
- Tenant is implicit (identified by subdomain: `acme-corp.plexica.io`)
- Workspace is explicit (shown in header selector for multi-workspace users)
- Single-workspace users don't see workspace selector (cleaner UI)

**Workspace Context Awareness**:
- All data queries automatically filtered by current workspace
- Dashboard widgets show workspace-specific data
- Search results scoped to current workspace (with option to search all workspaces)
- Plugin settings can be workspace-specific

### 11.2 Workspace Switching UX

**Switching Between Workspaces**:

```
[Workspace: Sales ▾]  ← Click to open dropdown
────────────────────
● Sales (current)
  15 members
  
○ Marketing
  8 members
  
○ Engineering
  12 members
────────────────────
⚙️ Manage Workspaces
```

**After Switch**:
1. Page reloads/refreshes with new workspace context
2. Dashboard shows new workspace data
3. Navigation may change (different plugins enabled per workspace)
4. Recent activity reflects new workspace
5. URL can optionally include `?workspace=marketing` for shareable links

### 11.3 Workspace Permission Model

**Workspace Roles** (displayed in user interfaces):

| Role | Icon | Capabilities |
|------|------|--------------|
| **Workspace Admin** | 👑 | Full control: settings, users, teams, permissions |
| **Member** | 👤 | Access workspace resources, join teams |
| **Viewer** | 👁️ | Read-only access to workspace |

**Permission Indicators** (shown in UI):
- User list shows workspace role badge
- Settings pages show lock icon 🔒 for non-admin sections
- Action buttons disabled with tooltip: "Requires Workspace Admin role"

### 11.4 Creating a New Workspace

**Trigger**: Workspace Admin clicks "+ New Workspace" in workspace dropdown

**Flow**:
```
┌─────────────────────────────────┐
│ Create New Workspace            │
├─────────────────────────────────┤
│                                 │
│ Workspace Name *                │
│ [Marketing             ]        │
│                                 │
│ Description                     │
│ [Marketing team workspace]      │
│                                 │
│ Workspace Color                 │
│ [🔵] [🟢] [🔴] [🟡] [🟣]        │
│                                 │
│ Copy settings from:             │
│ [None ▾]                        │
│ - None (start fresh)            │
│ - Sales workspace               │
│ - Engineering workspace         │
│                                 │
│ Initial Members                 │
│ [+ Add members]                 │
│                                 │
│          [Cancel] [Create]      │
└─────────────────────────────────┘
```

**After Creation**:
1. New workspace created
2. Creator becomes Workspace Admin
3. Workspace appears in selector
4. Redirected to new workspace dashboard (empty state)

### 11.5 Cross-Workspace Features

**Sharing Resources Across Workspaces**:

When viewing a contact in Sales workspace, user can share with Marketing:

```
Contact: John Doe (Sales Workspace)
────────────────────────────────────
[Share] button → Opens dialog:

┌─────────────────────────────────┐
│ Share Contact                   │
├─────────────────────────────────┤
│ Share with workspace:           │
│ [☐] Marketing                   │
│ [☐] Engineering                 │
│                                 │
│ Permission:                     │
│ (•) Read-only                   │
│ ( ) Can edit                    │
│                                 │
│ Notify members:                 │
│ [✓] Send notification           │
│                                 │
│        [Cancel] [Share]         │
└─────────────────────────────────┘
```

**Shared Resource Indicator**:
```
Contact: John Doe
────────────────
🔗 Shared from Sales
[View in Sales workspace →]
```

### 11.6 Workspace Admin Dashboard

Special dashboard for workspace admins showing management metrics:

```
┌──────────────────────────────────────────────────────┐
│ Workspace: Sales - Overview                          │
├──────────────────────────────────────────────────────┤
│ [Users: 15] [Teams: 3] [Active plugins: 5]           │
├──────────────────────────────────────────────────────┤
│ ┌───────────────┐  ┌───────────────┐                │
│ │ Recent joins  │  │ Activity trend│                │
│ │               │  │               │                │
│ │ Alice (2d ago)│  │ [Chart]       │                │
│ │ Bob (5d ago)  │  │               │                │
│ └───────────────┘  └───────────────┘                │
│                                                       │
│ Quick Actions                                         │
│ ───────────────                                      │
│ [+ Invite Users] [Manage Teams] [Configure Plugins]  │
└──────────────────────────────────────────────────────┘
```

---

## 12. Summary of Extension Points

### Quick Reference Table

| Zone | Extension Point | Plugin Contribution | Example |
|------|----------------|---------------------|---------|
| Header | `header.logo` | Custom logo | Tenant branding |
| Header | `header.search` | Searchable entities | CRM contacts, invoices |
| Header | `header.notifications` | Notification events | "Ticket assigned to you" |
| Header | `header.quickActions` | Action buttons | "+ New Contact" |
| Header | `header.workspaceMenu` | Workspace actions | "Workspace settings", "Share resource" |
| Sidebar | `sidebar.navigation` | Menu items | "CRM" app link |
| Dashboard | `dashboard.widgets` | Widget cards | "Top Contacts" widget |
| Dashboard | `dashboard.topBar` | Metric cards | "Revenue This Month" |
| Page | `page.header.actions` | Action buttons | "Export", "Share" |
| Page | `page.tabs` | Tab items | "Invoices" tab on contact |
| Page | `page.aside` | Side panel content | "Related Items" |
| Table | `table.columns` | Custom columns | "Credit Limit" in contacts |
| Table | `table.rowActions` | Row action buttons | "Send Invoice" |
| Table | `table.filters` | Filter criteria | "Credit Status" filter |
| Form | `form.fields` | Custom fields | "SLA Tier" field |
| Footer | `footer.content` | Status/links | "API Status" indicator |
| Workspace | `workspace.dashboard` | Admin widgets | "Workspace activity", "Team stats" |

**Key Workspace-Related Patterns**:
- Workspace selector hidden for single-workspace users
- Workspace context auto-applied to all data queries
- Cross-workspace sharing requires explicit action
- Workspace admin sees additional management UI

---

## 13. Next Steps

### 13.1 Wireframe Deliverables

**Phase 1: Static Wireframes**
- [ ] Dashboard layout (all user roles)
- [ ] Workspace selector and switching flow
- [ ] Sidebar navigation variants (with workspace context)
- [ ] Workspace admin interface
- [ ] Plugin list view template
- [ ] Plugin detail view template
- [ ] Form template
- [ ] Settings pages
- [ ] Cross-workspace sharing dialog

**Phase 2: Interactive Prototypes**
- [ ] Figma/Sketch prototype with clickable flows
- [ ] Workspace switching interactions
- [ ] User testing scenarios
- [ ] Accessibility audit

**Phase 3: Implementation Guidelines**
- [ ] Component library documentation
- [ ] Extension point API reference
- [ ] Plugin UI development guide
- [ ] Workspace context handling guide

### 13.2 Design System Repository

Create a separate design system repository:
```
plexica-design-system/
├── tokens/
│   ├── colors.json
│   ├── spacing.json
│   └── typography.json
├── components/
│   ├── Button/
│   ├── Card/
│   └── Table/
├── patterns/
│   ├── ListViewPattern/
│   ├── DetailViewPattern/
│   └── WorkspaceContextPattern/
└── docs/
    ├── extension-points.md
    └── workspace-ux-guide.md
```

---

## Important Notes

### Tenant vs Workspace in UI

**Tenant** (NOT visible in UI):
- Identified by subdomain: `acme-corp.plexica.io`
- Managed via separate Super Admin application (`admin.plexica.io`)
- Users never see "tenant" in the workspace UI
- Complete data isolation at infrastructure level

**Workspace** (visible in UI):
- Explicit workspace selector for multi-workspace users
- Workspace-scoped data filtering
- Workspace admin manages teams, users, and settings
- Logical grouping within a tenant

### Super Admin Application Separation

The Super Admin application for tenant management is:
- Hosted on a different subdomain (e.g., `admin.plexica.io`)
- Uses a different authentication realm (master realm in Keycloak)
- Has its own UI/UX (not part of this specification)
- Manages: tenant creation, global plugin catalog, billing, platform monitoring

This separation ensures clear boundaries between:
- **Platform operations** (Super Admin app)
- **Workspace operations** (Tenant workspace UI - this spec)

---

*Plexica UX Specification v1.1*  
*Last updated: 17 Jan 2025*  
*Author: Plexica Design Team*  
*Last updated: 16 Jan 2025*  
*Author: Plexica Design Team*

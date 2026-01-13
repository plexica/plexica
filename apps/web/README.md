# @plexica/web

Frontend web application for the Plexica platform.

## Tech Stack

- **Framework**: React 18.3
- **Build Tool**: Vite 5.4
- **Language**: TypeScript 5.3
- **Routing**: TanStack Router 1.95
- **Data Fetching**: TanStack Query 5.62
- **State Management**: Zustand 5.0
- **Styling**: Tailwind CSS 3.4
- **HTTP Client**: Axios 1.7
- **Authentication**: Keycloak JS 26.0

## Getting Started

### Prerequisites

- Node.js >= 20.11.0
- pnpm >= 8.0.0

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
VITE_API_URL=http://localhost:3000
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=master
VITE_KEYCLOAK_CLIENT_ID=plexica-web
```

### Development

```bash
# Install dependencies
pnpm install

# Start dev server (http://localhost:3001)
pnpm run dev

# Build for production
pnpm run build

# Preview production build
pnpm run preview

# Lint code
pnpm run lint

# Clean build artifacts
pnpm run clean
```

## Project Structure

```
src/
├── components/      # Reusable React components
├── hooks/          # Custom React hooks
├── lib/            # Utility libraries
│   └── api-client.ts    # Axios API client
├── pages/          # Page components
├── routes/         # TanStack Router routes
│   ├── __root.tsx      # Root layout
│   └── index.tsx       # Homepage
├── stores/         # Zustand state stores
│   └── auth-store.ts   # Authentication state
├── types/          # TypeScript type definitions
├── App.tsx         # Main app component
├── main.tsx        # Application entry point
└── index.css       # Global styles
```

## Features

### ✅ Implemented

- React 18 with Vite build system
- TypeScript with strict mode
- TanStack Router for routing
- TanStack Query for data fetching
- Tailwind CSS for styling
- Axios API client with interceptors
- Zustand auth store with persistence
- Environment-based configuration
- Path aliases (`@/*` for `src/*`)

### 🚧 In Progress

- Module Federation for plugin loading
- Keycloak authentication integration
- Base layout (sidebar, header)
- Tenant context management

### 📋 Planned

- Dashboard page
- Settings page
- Plugin marketplace UI
- Tenant switcher component
- User profile page

## API Integration

The app communicates with the backend API at `http://localhost:3000` by default.

API client (`src/lib/api-client.ts`) provides methods for:

- **Authentication**: login, logout, getCurrentUser, refreshToken
- **Tenants**: getTenants, getTenant, createTenant, updateTenant, deleteTenant
- **Plugins**: getPlugins, getPlugin, getTenantPlugins, installPlugin, activatePlugin, deactivatePlugin, uninstallPlugin

The client automatically adds:

- Authorization header with JWT token
- X-Tenant-Slug header for multi-tenancy

## Routing

Routes are managed by TanStack Router with file-based routing in `src/routes/`.

Route tree is automatically generated in `src/routeTree.gen.ts` using `@tanstack/router-plugin`.

## State Management

### Auth Store

Located in `src/stores/auth-store.ts`, manages:

- User authentication state
- Current tenant information
- JWT token
- Persisted to localStorage

## Styling

Tailwind CSS is configured with custom theme variables supporting light/dark modes.

Custom colors, spacing, and components can be added in `tailwind.config.js`.

## Build Output

Production build creates optimized bundles in `dist/`:

- `dist/index.html` - Entry HTML
- `dist/assets/*.css` - Styles (~6KB gzipped)
- `dist/assets/*.js` - JavaScript bundles (~80KB gzipped)

## Development Notes

- Hot Module Replacement (HMR) enabled for fast development
- API requests proxied to backend (see `vite.config.ts`)
- TypeScript strict mode enabled
- ESLint configured for React best practices

## License

Private - Part of Plexica platform

---

**Plexica Web App v0.1.0**  
_Last updated: January 13, 2026_

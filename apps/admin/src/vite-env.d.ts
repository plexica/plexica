/// <reference types="vite/client" />

// All VITE_* entries are optional: none of them is guaranteed to be injected at
// build time (no .env, no `define`, no CI export sets them for every build), and
// every consumer already applies a `??` fallback. Declaring them as required made
// those fallbacks unreachable for the type system, hiding real divergences.
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_KEYCLOAK_URL?: string;
  readonly VITE_KEYCLOAK_ADMIN_CLIENT_ID?: string;
  readonly VITE_KEYCLOAK_MASTER_REALM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

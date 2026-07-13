/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_KEYCLOAK_URL: string;
  readonly VITE_KEYCLOAK_ADMIN_CLIENT_ID: string;
  readonly VITE_KEYCLOAK_MASTER_REALM: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

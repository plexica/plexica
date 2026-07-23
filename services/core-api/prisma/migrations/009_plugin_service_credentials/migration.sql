CREATE TABLE core.plugin_service_credentials (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES core.tenants(id),
  install_id UUID NOT NULL,
  plugin_id UUID NOT NULL REFERENCES core.plugins(id),
  plugin_slug VARCHAR(63) NOT NULL,
  scope VARCHAR(32) NOT NULL,
  secret_digest BYTEA NOT NULL,
  version INTEGER NOT NULL,
  status VARCHAR(16) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT plugin_service_credentials_scope_check CHECK (scope = 'events:emit'),
  CONSTRAINT plugin_service_credentials_status_check
    CHECK (status IN ('pending', 'active', 'revoked', 'expired')),
  CONSTRAINT plugin_service_credentials_version_check CHECK (version > 0),
  CONSTRAINT plugin_service_credentials_install_version_key UNIQUE (install_id, version)
);

CREATE INDEX plugin_service_credentials_tenant_idx
  ON core.plugin_service_credentials(tenant_id);
CREATE INDEX plugin_service_credentials_install_status_idx
  ON core.plugin_service_credentials(install_id, status);

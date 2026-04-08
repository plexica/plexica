-- 003_core_features/migration.sql
-- Adds the 10 core application tables to the tenant schema.
-- All statements run inside tenant_<slug> schema (search_path is pre-set by multi-schema-migrate.ts).
-- Tables are created in dependency order: leaf tables first, then tables with FKs.

-- ---------------------------------------------------------------------------
-- 1. user_profile
-- Plexica internal user record for this tenant.
-- user_id is assigned by the application (NOT auto-generated here).
-- keycloak_user_id links to the Keycloak user in the tenant realm.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profile (
  user_id            UUID          NOT NULL,
  keycloak_user_id   VARCHAR(255)  NOT NULL,
  email              VARCHAR(255)  NOT NULL,
  display_name       VARCHAR(255),
  avatar_path        TEXT,
  timezone           VARCHAR(63)   NOT NULL DEFAULT 'UTC',
  language           VARCHAR(8)    NOT NULL DEFAULT 'en',
  notification_prefs JSONB         NOT NULL DEFAULT '{}',
  status             VARCHAR(16)   NOT NULL DEFAULT 'active',
  deleted_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT user_profile_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_profile_keycloak_id_key UNIQUE (keycloak_user_id),
  CONSTRAINT user_profile_status_check CHECK (status IN ('active', 'invited', 'disabled'))
);

CREATE INDEX IF NOT EXISTS user_profile_email_idx  ON user_profile (email);
CREATE INDEX IF NOT EXISTS user_profile_status_idx ON user_profile (status);

-- ---------------------------------------------------------------------------
-- 2. workspace_template
-- Reusable workspace structural blueprints.
-- created_by is NULL for built-in templates.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_template (
  id          UUID          NOT NULL DEFAULT gen_random_uuid(),
  name        VARCHAR(255)  NOT NULL,
  description TEXT,
  structure   JSONB         NOT NULL DEFAULT '[]',
  is_builtin  BOOLEAN       NOT NULL DEFAULT false,
  created_by  UUID,
  version     INTEGER       NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT workspace_template_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS workspace_template_builtin_idx ON workspace_template (is_builtin);

-- ---------------------------------------------------------------------------
-- 3. tenant_branding
-- Visual branding settings for the tenant. Exactly one row per tenant.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_branding (
  id            UUID        NOT NULL DEFAULT gen_random_uuid(),
  logo_path     TEXT,
  primary_color VARCHAR(9)  NOT NULL DEFAULT '#6366F1',
  dark_mode     BOOLEAN     NOT NULL DEFAULT false,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tenant_branding_pkey PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- 4. workspace
-- Core organizational unit. Supports hierarchy via self-referential parent_id
-- and materialized_path for efficient subtree queries.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace (
  id                UUID          NOT NULL DEFAULT gen_random_uuid(),
  name              VARCHAR(255)  NOT NULL,
  slug              VARCHAR(63)   NOT NULL,
  description       TEXT,
  parent_id         UUID,
  materialized_path TEXT          NOT NULL DEFAULT '/',
  status            VARCHAR(16)   NOT NULL DEFAULT 'active',
  archived_at       TIMESTAMPTZ,
  template_id       UUID,
  created_by        UUID          NOT NULL,
  version           INTEGER       NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT workspace_pkey            PRIMARY KEY (id),
  CONSTRAINT workspace_slug_key        UNIQUE (slug),
  CONSTRAINT workspace_status_check    CHECK (status IN ('active', 'archived')),
  CONSTRAINT workspace_parent_fk       FOREIGN KEY (parent_id)
    REFERENCES workspace(id) ON DELETE SET NULL,
  CONSTRAINT workspace_template_fk     FOREIGN KEY (template_id)
    REFERENCES workspace_template(id) ON DELETE SET NULL,
  CONSTRAINT workspace_created_by_fk   FOREIGN KEY (created_by)
    REFERENCES user_profile(user_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS workspace_parent_id_idx        ON workspace (parent_id);
CREATE INDEX IF NOT EXISTS workspace_materialized_path_idx ON workspace (materialized_path);
CREATE INDEX IF NOT EXISTS workspace_status_idx           ON workspace (status);
CREATE INDEX IF NOT EXISTS workspace_created_by_idx       ON workspace (created_by);

-- ---------------------------------------------------------------------------
-- 5. workspace_member
-- Membership table linking users to workspaces with a role.
-- Roles: 'admin' | 'member' | 'viewer' (Decision Log ID-009).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_member (
  id           UUID          NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID          NOT NULL,
  user_id      UUID          NOT NULL,
  role         VARCHAR(32)   NOT NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT workspace_member_pkey       PRIMARY KEY (id),
  CONSTRAINT workspace_member_ws_user_key UNIQUE (workspace_id, user_id),
  CONSTRAINT workspace_member_role_check  CHECK (role IN ('admin', 'member', 'viewer')),
  CONSTRAINT workspace_member_workspace_fk FOREIGN KEY (workspace_id)
    REFERENCES workspace(id) ON DELETE CASCADE,
  CONSTRAINT workspace_member_user_fk     FOREIGN KEY (user_id)
    REFERENCES user_profile(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS workspace_member_user_id_idx      ON workspace_member (user_id);
CREATE INDEX IF NOT EXISTS workspace_member_workspace_id_idx ON workspace_member (workspace_id);

-- ---------------------------------------------------------------------------
-- 6. invitation
-- Tracks workspace invitations. Token is a URL-safe random value (generateInviteToken).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invitation (
  id           UUID          NOT NULL DEFAULT gen_random_uuid(),
  email        VARCHAR(255)  NOT NULL,
  workspace_id UUID          NOT NULL,
  role         VARCHAR(32)   NOT NULL,
  status       VARCHAR(16)   NOT NULL DEFAULT 'pending',
  invited_by   UUID          NOT NULL,
  token        VARCHAR(255)  NOT NULL,
  expires_at   TIMESTAMPTZ   NOT NULL,
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT invitation_pkey          PRIMARY KEY (id),
  CONSTRAINT invitation_token_key     UNIQUE (token),
  CONSTRAINT invitation_role_check    CHECK (role IN ('admin', 'member', 'viewer')),
  CONSTRAINT invitation_status_check  CHECK (status IN ('pending', 'accepted', 'expired')),
  CONSTRAINT invitation_workspace_fk  FOREIGN KEY (workspace_id)
    REFERENCES workspace(id) ON DELETE CASCADE,
  CONSTRAINT invitation_invited_by_fk FOREIGN KEY (invited_by)
    REFERENCES user_profile(user_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS invitation_workspace_idx  ON invitation (workspace_id);
CREATE INDEX IF NOT EXISTS invitation_email_ws_idx   ON invitation (email, workspace_id);
CREATE INDEX IF NOT EXISTS invitation_status_idx     ON invitation (status);
CREATE INDEX IF NOT EXISTS invitation_expires_at_idx ON invitation (expires_at);

-- ---------------------------------------------------------------------------
-- 7. audit_log
-- Immutable, append-only record of actor actions. No UPDATE/DELETE should occur.
-- ip_address uses INET type for efficient network-address storage and querying.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID        NOT NULL DEFAULT gen_random_uuid(),
  actor_id     UUID        NOT NULL,
  action_type  VARCHAR(63) NOT NULL,
  target_type  VARCHAR(63) NOT NULL,
  target_id    UUID,
  before_value JSONB,
  after_value  JSONB,
  ip_address   INET,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT audit_log_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx  ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS audit_log_action_type_idx ON audit_log (action_type);
CREATE INDEX IF NOT EXISTS audit_log_actor_id_idx    ON audit_log (actor_id);
CREATE INDEX IF NOT EXISTS audit_log_target_idx      ON audit_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS audit_log_composite_idx   ON audit_log (created_at, action_type);

-- ---------------------------------------------------------------------------
-- 8. abac_decision_log
-- Records ABAC policy tree-walk evaluation results (ADR-003).
-- Used for debugging authorization decisions and audit purposes.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS abac_decision_log (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL,
  resource_type   VARCHAR(63) NOT NULL,
  resource_id     UUID,
  action          VARCHAR(63) NOT NULL,
  decision        VARCHAR(8)  NOT NULL,
  rules_evaluated JSONB       NOT NULL DEFAULT '[]',
  log_level       VARCHAR(8)  NOT NULL DEFAULT 'info',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT abac_decision_log_pkey            PRIMARY KEY (id),
  CONSTRAINT abac_decision_log_decision_check  CHECK (decision IN ('allow', 'deny')),
  CONSTRAINT abac_decision_log_log_level_check CHECK (log_level IN ('info', 'debug'))
);

CREATE INDEX IF NOT EXISTS abac_decision_log_query_idx      ON abac_decision_log (created_at, user_id, action, decision);
CREATE INDEX IF NOT EXISTS abac_decision_log_created_at_idx ON abac_decision_log (created_at);

-- ---------------------------------------------------------------------------
-- 9. action_registry
-- Catalog of plugin-defined actions with their default minimum role.
-- plugin_id references core.plugins.id — FK intentionally omitted (cross-schema).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS action_registry (
  id             UUID          NOT NULL DEFAULT gen_random_uuid(),
  plugin_id      UUID          NOT NULL,
  action_key     VARCHAR(255)  NOT NULL,
  label_i18n_key VARCHAR(255)  NOT NULL,
  description    TEXT,
  default_role   VARCHAR(32)   NOT NULL DEFAULT 'admin',
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT action_registry_pkey              PRIMARY KEY (id),
  CONSTRAINT action_registry_plugin_key_unique UNIQUE (plugin_id, action_key),
  CONSTRAINT action_registry_default_role_check CHECK (default_role IN ('admin', 'member', 'viewer'))
);

-- ---------------------------------------------------------------------------
-- 10. workspace_role_action
-- Per-workspace overrides for the default role required to perform a plugin action.
-- When is_overridden = true, this row takes precedence over action_registry.default_role.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_role_action (
  id            UUID          NOT NULL DEFAULT gen_random_uuid(),
  workspace_id  UUID          NOT NULL,
  plugin_id     UUID          NOT NULL,
  action_key    VARCHAR(255)  NOT NULL,
  required_role VARCHAR(32)   NOT NULL,
  is_overridden BOOLEAN       NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT workspace_role_action_pkey        PRIMARY KEY (id),
  CONSTRAINT workspace_role_action_lookup_unique UNIQUE (workspace_id, plugin_id, action_key),
  CONSTRAINT workspace_role_action_role_check  CHECK (required_role IN ('admin', 'member', 'viewer')),
  CONSTRAINT workspace_role_action_workspace_fk FOREIGN KEY (workspace_id)
    REFERENCES workspace(id) ON DELETE CASCADE
);

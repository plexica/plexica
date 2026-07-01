-- 004_plugin_system/migration.sql
-- Adds the Plugin system tables to the core schema:
--   - plugins: global plugin registry (one row per unique plugin)
--   - plugin_versions: versioned snapshot of each plugin's manifest
--   - dead_letter_queue: failed plugin event storage for super admin management
--
-- These tables were added to schema.prisma as models Plugin, PluginVersion,
-- and DeadLetterQueue but were never captured in a migration file.
-- They exist in the core schema (not per-tenant).

-- ---------------------------------------------------------------------------
-- 1. plugins
-- Global plugin registry. One row per unique plugin.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "core"."plugins" (
    "id"                          UUID           NOT NULL DEFAULT gen_random_uuid(),
    "slug"                        VARCHAR(63)    NOT NULL,
    "name"                        VARCHAR(255)   NOT NULL,
    "description"                 TEXT,
    "version"                     VARCHAR(32)    NOT NULL,
    "author"                      VARCHAR(255)   NOT NULL,
    "icon_url"                    TEXT,
    "categories"                  JSONB          NOT NULL DEFAULT '[]',
    "manifest"                    JSONB          NOT NULL DEFAULT '{}',
    "status"                      VARCHAR(16)    NOT NULL DEFAULT 'draft',
    "registry_url"                VARCHAR(512)   NOT NULL,
    "image_name"                  VARCHAR(255)   NOT NULL,
    "image_tag"                   VARCHAR(64)    NOT NULL,
    "image_digest"                VARCHAR(128),
    "pull_policy"                 VARCHAR(16)    NOT NULL DEFAULT 'IfNotPresent',
    "registry_credentials_secret" TEXT,
    "created_by_keycloak_id"     VARCHAR(255)   NOT NULL,
    "created_at"                  TIMESTAMPTZ    NOT NULL DEFAULT now(),
    "updated_at"                  TIMESTAMPTZ    NOT NULL DEFAULT now(),

    CONSTRAINT "plugins_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plugins_slug_key" UNIQUE ("slug")
);

CREATE INDEX IF NOT EXISTS "idx_plugins_status" ON "core"."plugins" ("status");

-- ---------------------------------------------------------------------------
-- 2. plugin_versions
-- Version history for update tracking (ADR-020 — Reinstall = Update).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "core"."plugin_versions" (
    "id"           UUID           NOT NULL DEFAULT gen_random_uuid(),
    "plugin_id"    UUID           NOT NULL,
    "version"      VARCHAR(32)    NOT NULL,
    "manifest"     JSONB          NOT NULL DEFAULT '{}',
    "image_digest" VARCHAR(128),
    "created_at"   TIMESTAMPTZ    NOT NULL DEFAULT now(),

    CONSTRAINT "plugin_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plugin_versions_plugin_id_version_key" UNIQUE ("plugin_id", "version"),
    CONSTRAINT "plugin_versions_plugin_fkey" FOREIGN KEY ("plugin_id")
        REFERENCES "core"."plugins" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_plugin_versions_plugin_id" ON "core"."plugin_versions" ("plugin_id");

-- ---------------------------------------------------------------------------
-- 3. dead_letter_queue
-- Stores failed plugin events for super admin management.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "core"."dead_letter_queue" (
    "id"            UUID           NOT NULL DEFAULT gen_random_uuid(),
    "event_type"    VARCHAR(255)   NOT NULL,
    "payload"       JSONB          NOT NULL DEFAULT '{}',
    "plugin_id"     TEXT,
    "error_message" TEXT,
    "retry_count"   INTEGER        NOT NULL DEFAULT 0,
    "status"        VARCHAR(16)    NOT NULL DEFAULT 'pending',
    "failed_at"     TIMESTAMPTZ    NOT NULL DEFAULT now(),
    "resolved_at"   TIMESTAMPTZ,

    CONSTRAINT "dead_letter_queue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_dead_letter_queue_status_failed" ON "core"."dead_letter_queue" ("status", "failed_at");

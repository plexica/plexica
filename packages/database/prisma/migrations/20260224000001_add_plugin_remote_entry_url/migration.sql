-- Migration: add_plugin_remote_entry_url
-- T004-13: Add remoteEntryUrl and frontendRoutePrefix to core.plugins for
--           Module Federation dynamic remote loading (ADR-011).
-- Both columns are nullable — existing plugins without a frontend remote entry
-- are unaffected.

ALTER TABLE "core"."plugins"
  ADD COLUMN IF NOT EXISTS "remote_entry_url"     TEXT,
  ADD COLUMN IF NOT EXISTS "frontend_route_prefix" TEXT;

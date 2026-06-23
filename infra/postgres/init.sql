-- infra/postgres/init.sql
-- Runs once on first container startup (PostgreSQL docker-entrypoint-initdb.d).
-- Creates the core schema so that Prisma can write _prisma_migrations there
-- before the first migration SQL runs.
-- This resolves the chicken-and-egg: Prisma needs core._prisma_migrations to
-- exist before it applies 001_init_core_schema, but 001 is what creates the
-- core schema.

CREATE SCHEMA IF NOT EXISTS core;

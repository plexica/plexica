-- Initialize PostgreSQL for Plexica test environment
-- This script creates the necessary schemas and extensions

-- Create keycloak schema for Keycloak to use
CREATE SCHEMA IF NOT EXISTS keycloak;

-- Create core schema for Plexica core data
CREATE SCHEMA IF NOT EXISTS core;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Grant privileges
GRANT ALL PRIVILEGES ON SCHEMA keycloak TO plexica_test;
GRANT ALL PRIVILEGES ON SCHEMA core TO plexica_test;
GRANT ALL PRIVILEGES ON DATABASE plexica_test TO plexica_test;

-- Set search path for the database
ALTER DATABASE plexica_test SET search_path TO core, public;

-- Note: Tenant-specific schemas will be created dynamically during provisioning
-- Example tenant schema names: tenant_acme_corp, tenant_demo_company, etc.

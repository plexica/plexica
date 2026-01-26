-- Create Keycloak database
CREATE DATABASE keycloak WITH OWNER = plexica;

-- Connect to keycloak database and create schema
\c keycloak
CREATE SCHEMA IF NOT EXISTS keycloak;
GRANT ALL PRIVILEGES ON SCHEMA keycloak TO plexica;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA keycloak TO plexica;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA keycloak TO plexica;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA keycloak TO plexica;

-- Switch back to plexica database
\c plexica

-- Create core schema for Plexica core data
CREATE SCHEMA IF NOT EXISTS core;

GRANT ALL PRIVILEGES ON SCHEMA core TO plexica;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA core TO plexica;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA core TO plexica;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Plexica database initialized successfully';
  RAISE NOTICE '  - Keycloak database: keycloak (with schema: keycloak)';
  RAISE NOTICE '  - Plexica database: plexica (with schema: core)';
END $$;

-- Migration: 20260302000002_create_search_documents
-- Spec 007 T007-04: search_documents table for SearchService
-- FR-011: Index documents for full-text search
-- FR-012: Search must be scoped to tenant (row-level isolation)
-- FR-013: Return ranked results
-- FR-014: Support type-filtered search
-- Note: Elasticsearch deferred to Phase 3 per spec.md §10; MVP uses PostgreSQL FTS.

-- Create search_documents table
CREATE TABLE "core"."search_documents" (
  "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"     UUID        NOT NULL,
  -- Plugin-assigned document identifier (unique within tenant + type scope)
  "document_id"   VARCHAR(255) NOT NULL,
  -- Document type (e.g. "crm:contact", "workspace:page")
  "type"          VARCHAR(100) NOT NULL,
  "title"         VARCHAR(500) NOT NULL,
  "body"          TEXT         NOT NULL,
  -- Optional metadata (stored but not included in FTS vector)
  "metadata"      JSONB,
  -- Generated tsvector column combining title (weight A) and body (weight B)
  -- Updated automatically by a trigger on INSERT/UPDATE
  "search_vector" TSVECTOR,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "search_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "search_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "core"."tenants" ("id") ON DELETE CASCADE,
  -- Unique constraint: each plugin document is unique within (tenant, type, document_id)
  -- Enables upsert semantics without collision (Edge Case #7)
  CONSTRAINT "search_documents_tenant_type_doc_unique"
    UNIQUE ("tenant_id", "type", "document_id")
);

-- GIN index on tsvector for efficient full-text search
CREATE INDEX "idx_search_documents_vector" ON "core"."search_documents" USING GIN ("search_vector");

-- Index for type-filtered queries (FR-014)
CREATE INDEX "idx_search_documents_tenant_type" ON "core"."search_documents" ("tenant_id", "type");

-- Trigger function: keep search_vector up to date on insert/update
-- Uses setweight for title (A > B) so title matches rank higher than body matches
CREATE OR REPLACE FUNCTION "core"."search_documents_vector_update"()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.body,  '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "search_documents_vector_trigger"
  BEFORE INSERT OR UPDATE OF title, body ON "core"."search_documents"
  FOR EACH ROW EXECUTE FUNCTION "core"."search_documents_vector_update"();

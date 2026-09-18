-- 014_email_queue_purge_step/migration.sql
-- Extend the tenant deletion step CHECK to include the GDPR email-queue purge
-- step (ADR-035 / plan §4.2, task 2.12). Without this, the deletion saga
-- fails to insert the step row with check constraint violation.
ALTER TABLE core.tenant_deletion_steps
  DROP CONSTRAINT IF EXISTS tenant_deletion_steps_step_check;
ALTER TABLE core.tenant_deletion_steps
  ADD CONSTRAINT tenant_deletion_steps_step_check
  CHECK (step IN ('event_data_purge', 'email_queue_purge', 'schema_drop', 'realm_delete', 'bucket_delete'));
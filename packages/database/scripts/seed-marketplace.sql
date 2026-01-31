-- Seed Plugin Versions
INSERT INTO core.plugin_versions (id, plugin_id, version, changelog, manifest, asset_url, download_count, is_latest, published_at, created_at)
VALUES
  ('crm-1.0.0', 'crm', '1.0.0', 'Initial release', '{}', 'https://cdn.plexica.io/plugins/crm/1.0.0/bundle.js', 45, false, '2024-01-15 10:00:00', NOW()),
  ('crm-1.1.0', 'crm', '1.1.0', 'Added deal tracking', '{}', 'https://cdn.plexica.io/plugins/crm/1.1.0/bundle.js', 32, false, '2024-02-01 10:00:00', NOW()),
  ('crm-1.2.0', 'crm', '1.2.0', 'Performance improvements and bug fixes', '{}', 'https://cdn.plexica.io/plugins/crm/1.2.0/bundle.js', 89, true, '2024-03-01 10:00:00', NOW()),
  ('analytics-1.0.0', 'analytics', '1.0.0', 'Initial release with basic charts', '{}', 'https://cdn.plexica.io/plugins/analytics/1.0.0/bundle.js', 28, false, '2024-02-01 14:30:00', NOW()),
  ('analytics-2.0.0', 'analytics', '2.0.0', 'Major redesign with new chart types', '{}', 'https://cdn.plexica.io/plugins/analytics/2.0.0/bundle.js', 41, false, '2024-03-15 14:30:00', NOW()),
  ('analytics-2.0.1', 'analytics', '2.0.1', 'Bug fixes', '{}', 'https://cdn.plexica.io/plugins/analytics/2.0.1/bundle.js', 156, true, '2024-03-20 14:30:00', NOW()),
  ('sample-analytics-1.0.0', 'sample-analytics', '1.0.0', 'Initial release', '{}', 'https://cdn.plexica.io/plugins/sample-analytics/1.0.0/bundle.js', 23, true, '2024-01-22 09:00:00', NOW()),
  ('billing-1.0.0', 'billing', '1.0.0', 'First stable release', '{}', 'https://cdn.plexica.io/plugins/billing/1.0.0/bundle.js', 67, true, '2024-01-28 11:00:00', NOW())
ON CONFLICT (plugin_id, version) DO NOTHING;

-- Seed Plugin Ratings (using tenant IDs from acme-corp, globex-inc, demo-company)
-- Note: tenant_id and user_id need to match seeded data
INSERT INTO core.plugin_ratings (id, plugin_id, tenant_id, user_id, rating, review, helpful_count, not_helpful_count, created_at, updated_at)
SELECT
  'rating-' || p.id || '-' || t.slug,
  p.id,
  t.id,
  'user-admin-' || t.id,
  CASE 
    WHEN p.id = 'crm' THEN 5
    WHEN p.id = 'analytics' THEN 5
    WHEN p.id = 'billing' THEN 4
    ELSE 4
  END,
  CASE 
    WHEN p.id = 'crm' THEN 'Excellent CRM! Easy to use and powerful.'
    WHEN p.id = 'analytics' THEN 'Outstanding analytics tool!'
    WHEN p.id = 'billing' THEN 'Good billing solution.'
    ELSE 'Great plugin!'
  END,
  FLOOR(RANDOM() * 10)::int,
  FLOOR(RANDOM() * 3)::int,
  NOW(),
  NOW()
FROM core.plugins p
CROSS JOIN core.tenants t
WHERE p.status = 'PUBLISHED'
AND t.slug IN ('acme-corp', 'globex-inc')
LIMIT 8
ON CONFLICT (plugin_id, tenant_id, user_id) DO NOTHING;

-- Seed Plugin Installations
INSERT INTO core.plugin_installations (id, plugin_id, plugin_version, tenant_id, installed_by, installed_at, uninstalled_at)
SELECT
  'install-' || p.id || '-' || t.slug,
  p.id,
  p.version,
  t.id,
  'user-admin-' || t.id,
  NOW() - (FLOOR(RANDOM() * 30) || ' days')::interval,
  NULL
FROM core.plugins p
CROSS JOIN core.tenants t
WHERE p.status = 'PUBLISHED'
AND t.slug IN ('acme-corp', 'globex-inc', 'demo-company')
LIMIT 6
ON CONFLICT (id) DO NOTHING;

SELECT 'Marketplace data seeded successfully!' AS result;

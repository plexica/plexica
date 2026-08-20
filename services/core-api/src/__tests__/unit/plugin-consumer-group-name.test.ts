// plugin-consumer-group-name.test.ts — unit tests for the consumer group
// name format (`plugin-{installId}-{tenantSlug}`): the shared parser and the
// poller-facing id extraction.
//
// Regression guard: extractInstallIds previously truncated installIds at the
// first dash (`.split('-')[0]`), feeding 8-char fragments to the health
// poller — every event-subscribing installation was then marked `degraded`
// within ~90s of bootstrap without self-correction.

import { describe, expect, it } from 'vitest';

import {
  extractInstallIds,
  parseConsumerGroupName,
} from '../../modules/plugin/events/consumer-manager.service.js';

const INSTALL_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_INSTALL_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('parseConsumerGroupName', () => {
  it('parses a realistic group name into full UUID and tenant slug', () => {
    expect(parseConsumerGroupName(`plugin-${INSTALL_ID}-acme`)).toEqual({
      installId: INSTALL_ID,
      tenantSlug: 'acme',
    });
  });

  it('keeps tenant slugs that contain dashes intact', () => {
    expect(parseConsumerGroupName(`plugin-${INSTALL_ID}-acme-corp-prod`)).toEqual({
      installId: INSTALL_ID,
      tenantSlug: 'acme-corp-prod',
    });
  });

  it('accepts uppercase UUIDs (format tolerance, gen_random_uuid is lowercase)', () => {
    const upper = INSTALL_ID.toUpperCase();
    expect(parseConsumerGroupName(`plugin-${upper}-acme`)?.installId).toBe(upper);
  });

  it('rejects names without the plugin- prefix', () => {
    expect(parseConsumerGroupName(`other-${INSTALL_ID}-acme`)).toBeNull();
    expect(parseConsumerGroupName('')).toBeNull();
    expect(parseConsumerGroupName('plugin-')).toBeNull();
  });

  it('rejects truncated or non-UUID install ids', () => {
    expect(parseConsumerGroupName('plugin-550e8400-acme')).toBeNull();
    expect(parseConsumerGroupName(`plugin-${INSTALL_ID.slice(0, 35)}-acme`)).toBeNull();
    expect(parseConsumerGroupName('plugin-not-a-uuid-at-all-xxxxxxxxxxxxxxxx-acme')).toBeNull();
  });

  it('rejects names with an empty tenant slug', () => {
    expect(parseConsumerGroupName(`plugin-${INSTALL_ID}-`)).toBeNull();
    expect(parseConsumerGroupName(`plugin-${INSTALL_ID}`)).toBeNull();
  });
});

describe('extractInstallIds (poller feed)', () => {
  it('returns full UUIDs — regression test for the 8-char truncation bug', () => {
    expect(extractInstallIds([`plugin-${INSTALL_ID}-acme`])).toEqual([INSTALL_ID]);
  });

  it('extracts ids from multiple groups and skips non-plugin or malformed names', () => {
    const groups = [
      `plugin-${INSTALL_ID}-acme`,
      `plugin-${OTHER_INSTALL_ID}-acme-corp-prod`,
      'core-api-workers',
      'plugin-550e8400-acme',
    ];
    expect(extractInstallIds(groups)).toEqual([INSTALL_ID, OTHER_INSTALL_ID]);
  });

  it('returns an empty list when no plugin group is active', () => {
    expect(extractInstallIds([])).toEqual([]);
  });
});

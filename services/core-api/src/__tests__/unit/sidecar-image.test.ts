import { vi, describe, expect, it, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }));

vi.mock('../../lib/config.js', () => ({
  config: new Proxy(
    {},
    {
      get: (_target, key: string) => state.env[key],
    }
  ),
}));

import { isDigestPinnedImage, resolveSidecarImage } from '../../modules/plugin/services/sidecar-image.js';

const pinned = 'node:24-bookworm@sha256:934240a162082fd8b8a2f90cd5114446443f1eba1c5378f6687167ca405e6584';
const manifest = 'plexica/payload-proof:1';
const harnessPinned = 'plexica-ci-sidecar-harness@sha256:' + 'b'.repeat(64);
const harnessManifest = 'plexica-ci-sidecar-harness:project';
const emittedHarness = `127.0.0.1:32791/sidecar-harness@sha256:${'a'.repeat(64)}`;

describe('resolveSidecarImage', () => {
  beforeEach(() => {
    state.env = {};
  });

  it('returns the manifest image unchanged outside the CI runtime contract', () => {
    expect(resolveSidecarImage(manifest)).toBe(manifest);
  });

  it('uses the digest-pinned environment image in CI and ignores the manifest image', () => {
    state.env = {
      CI_RUNTIME_CONTRACT: '1',
      PLUGIN_SIDECAR_IMAGE: pinned,
      CI_SIDECAR_HARNESS_IMAGE: harnessPinned,
    };
    expect(resolveSidecarImage(manifest)).toBe(pinned);
  });

  it('resolves harness-marked installs to a digest-pinned CI_SIDECAR_HARNESS_IMAGE', () => {
    state.env = {
      CI_RUNTIME_CONTRACT: '1',
      PLUGIN_SIDECAR_IMAGE: pinned,
      CI_SIDECAR_HARNESS_IMAGE: harnessPinned,
    };
    expect(resolveSidecarImage(harnessPinned)).toBe(harnessPinned);
  });

  it('resolves non-harness installs to PLUGIN_SIDECAR_IMAGE even when both are set', () => {
    state.env = {
      CI_RUNTIME_CONTRACT: '1',
      PLUGIN_SIDECAR_IMAGE: pinned,
      CI_SIDECAR_HARNESS_IMAGE: harnessPinned,
    };
    expect(resolveSidecarImage(manifest)).toBe(pinned);
  });

  it('resolves harness-marked installs to the exact loopback-registry reference published in CI', () => {
    state.env = {
      CI_RUNTIME_CONTRACT: '1',
      PLUGIN_SIDECAR_IMAGE: pinned,
      CI_SIDECAR_HARNESS_IMAGE: emittedHarness,
    };
    expect(resolveSidecarImage(emittedHarness)).toBe(emittedHarness);
  });

  it.each([
    ['missing', undefined],
    ['unpinned tag', 'plexica-ci-sidecar-harness:latest'],
    ['digest-less reference', 'plexica-ci-sidecar-harness@sha256:abc'],
  ])('fails closed in CI with a %s CI_SIDECAR_HARNESS_IMAGE for harness installs', (_label, image) => {
    state.env = { CI_RUNTIME_CONTRACT: '1', PLUGIN_SIDECAR_IMAGE: pinned, CI_SIDECAR_HARNESS_IMAGE: image };
    expect(() => resolveSidecarImage(image ?? harnessManifest)).toThrow(
      /digest-pinned CI_SIDECAR_HARNESS_IMAGE/
    );
  });

  it.each([
    ['missing', undefined],
    ['unpinned tag', 'node:24-bookworm'],
    ['digest-less reference', 'node:24-bookworm@sha256:abc'],
  ])('fails closed in CI with a %s PLUGIN_SIDECAR_IMAGE', (_label, image) => {
    state.env = { CI_RUNTIME_CONTRACT: '1', PLUGIN_SIDECAR_IMAGE: image };
    expect(() => resolveSidecarImage(manifest)).toThrow(/digest-pinned PLUGIN_SIDECAR_IMAGE/);
  });
});

describe('isDigestPinnedImage', () => {
  it('accepts registry references with a sha256 digest', () => {
    expect(isDigestPinnedImage(pinned)).toBe(true);
    expect(isDigestPinnedImage('myorg/team/app@sha256:' + 'a'.repeat(64))).toBe(true);
  });
  it('accepts the exact loopback-registry reference emitted by publish-sidecar-images.sh', () => {
    expect(isDigestPinnedImage(emittedHarness)).toBe(true);
    expect(isDigestPinnedImage('127.0.0.1:65535/plugin-sidecar@sha256:' + 'f'.repeat(64))).toBe(true);
    expect(isDigestPinnedImage('localhost:5000/sidecar-harness@sha256:' + 'a'.repeat(64))).toBe(true);
  });
  it('rejects tags, bare digests, and malformed references', () => {
    expect(isDigestPinnedImage('node:24-bookworm')).toBe(false);
    expect(isDigestPinnedImage(`${pinned}extra`)).toBe(false);
  });
  it('rejects near-miss loopback references without a full host:port/name@digest shape', () => {
    expect(isDigestPinnedImage('127.0.0.1:32791/sidecar-harness')).toBe(false);
    expect(isDigestPinnedImage(`127.0.0.1:/sidecar-harness@sha256:${'a'.repeat(64)}`)).toBe(false);
    expect(isDigestPinnedImage(`127.0.0.1:32791/@sha256:${'a'.repeat(64)}`)).toBe(false);
    expect(isDigestPinnedImage(`127.0.0.1:32791/sidecar-harness@sha256:${'a'.repeat(63)}`)).toBe(false);
    expect(isDigestPinnedImage(`127.0.0.1:32791/sidecar-harness@sha256:${'a'.repeat(64)}0`)).toBe(false);
  });
});

// services/workspace-plugin-entries.ts
// Builds the Module Federation entries served by
// `GET /api/v1/plugins/workspace/:workspaceId`. Kept out of the route module
// (200-line cap) so the per-locale i18n bundle presigning stays isolated and
// testable.

import { getPresignedReadUrl } from '../../../lib/storage-client.js';
import { manifestSchema } from '../schema/manifest.js';

import { getDevBackendForInstallation } from './dev-backends.js';

export interface WorkspacePluginEntry {
  installId: string;
  slug: string;
  extensionPoint: string;
  /** Locales this plugin ships i18n bundles for (006-09). */
  i18nBundles: string[];
  /** Explicit per-locale presigned bundle URL (006-09, Blocker-2 fix). */
  i18nBundleUrls?: Record<string, string>;
  remoteEntryUrl: string;
}

type InstallationShape = { id: string; pluginId: string };
type PluginShape = { id: string; slug: string; version: string; manifest: unknown };

/**
 * One entry per (installation × extension point), mirroring the old inline
 * builder. `i18nBundleUrls` is the contract fix for 006-09 in production: the
 * shell previously DERIVED `i18n/{locale}.json` from the remoteEntry URL,
 * which in storage origin is PRESIGNED — the sibling path then carried the
 * remoteEntry object's SigV4 signature into a different object path and
 * answered `SignatureDoesNotMatch`. Each locale URL below is presigned for
 * ITS OWN object, so the shell can fetch it directly. Dev backends (uiUrl)
 * keep the un-signed relative fallback (no object storage involved).
 */
export async function buildWorkspacePluginEntries(
  installations: readonly InstallationShape[],
  plugins: readonly PluginShape[]
): Promise<WorkspacePluginEntry[]> {
  const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  const entries: WorkspacePluginEntry[] = [];

  for (const installation of installations) {
    const plugin = byId.get(installation.pluginId);
    const parsed = manifestSchema.safeParse(plugin?.manifest);
    if (!plugin || !parsed.success || !parsed.data.ui) continue;
    const ui = parsed.data.ui;
    const dev = getDevBackendForInstallation(plugin.slug, installation.id);
    const base = `plugins/${plugin.slug}/${plugin.version}`;
    const bundleLocales = parsed.data.i18n?.bundles ?? [];

    const bundleUrls =
      bundleLocales.length > 0 && dev?.uiUrl === undefined
        ? Object.fromEntries(
            await Promise.all(
              bundleLocales.map(async (locale) => [
                locale,
                await getPresignedReadUrl('plugin-assets', `${base}/i18n/${locale}.json`),
              ])
            )
          )
        : undefined;
    const remoteEntryUrl =
      dev?.uiUrl ?? (await getPresignedReadUrl('plugin-assets', `${base}/${ui.remoteEntry}`));

    for (const extensionPoint of dev?.extensionPoints ?? ui.extensionPoints) {
      entries.push({
        installId: installation.id,
        slug: plugin.slug,
        extensionPoint,
        i18nBundles: bundleLocales,
        i18nBundleUrls: bundleUrls,
        remoteEntryUrl,
      });
    }
  }
  return entries;
}

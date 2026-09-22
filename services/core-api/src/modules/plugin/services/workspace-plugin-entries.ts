// services/workspace-plugin-entries.ts
// Builds the Module Federation entries served by
// `GET /api/v1/plugins/workspace/:workspaceId`. Kept out of the route module
// (200-line cap) so the per-locale i18n bundle presigning stays isolated and
// testable.
//
// ALL presigns across every installation are batched into ONE Promise.all:
// object-storage round trips overlap instead of serializing one await per
// installation (N installs → ~1 latency rather than N×).

import { logger } from '../../../lib/logger.js';
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

interface EntryPlan {
  installId: string;
  slug: string;
  extensionPoints: string[];
  /** Declared bundle locales, deduped (006-09 follow-up MINOR). */
  bundleLocales: string[];
  /** Object key prefix `plugins/{slug}/{version}` (production only). */
  base: string;
  remoteEntryName: string;
  /** Dev backend UI origin — production plugins presign instead. */
  devUiUrl?: string;
}

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
  const plans: EntryPlan[] = [];

  for (const installation of installations) {
    const plugin = byId.get(installation.pluginId);
    const parsed = manifestSchema.safeParse(plugin?.manifest);
    if (!plugin || !parsed.success || !parsed.data.ui) continue;
    const ui = parsed.data.ui;
    const dev = getDevBackendForInstallation(plugin.slug, installation.id);
    plans.push({
      installId: installation.id,
      slug: plugin.slug,
      extensionPoints: dev?.extensionPoints ?? ui.extensionPoints,
      bundleLocales: [...new Set(parsed.data.i18n?.bundles ?? [])],
      base: `plugins/${plugin.slug}/${plugin.version}`,
      remoteEntryName: ui.remoteEntry,
      ...(dev?.uiUrl !== undefined ? { devUiUrl: dev.uiUrl } : {}),
    });
  }

  // Batch every storage round trip into one parallel batch. In production each
  // plan presigns its remoteEntry AND one URL per locale; dev backends presign
  // nothing. Locale failures are SURFACE-CONTAINED (006-09 follow-up MINOR): a
  // broken i18n object drops that locale's URL instead of rejecting the entire
  // workspace listing and emptying every plugin slot.
  const urlByKey = new Map<string, string>(); // `${installId}:remoteEntry` | `${installId}:bundle:${locale}`
  const presigns: Array<Promise<void>> = [];
  for (const plan of plans) {
    if (plan.devUiUrl !== undefined) continue;
    presigns.push(
      getPresignedReadUrl('plugin-assets', `${plan.base}/${plan.remoteEntryName}`).then((url) => {
        urlByKey.set(`${plan.installId}:remoteEntry`, url);
      })
    );
    for (const locale of plan.bundleLocales) {
      presigns.push(
        getPresignedReadUrl('plugin-assets', `${plan.base}/i18n/${locale}.json`)
          .then((url) => {
            urlByKey.set(`${plan.installId}:bundle:${locale}`, url);
          })
          .catch((err: unknown) => {
            logger.warn(
              {
                slug: plan.slug,
                installId: plan.installId,
                locale,
                err: err instanceof Error ? err.message : String(err),
              },
              'Presign failed for plugin i18n bundle locale — omitting bundle URL'
            );
          })
      );
    }
  }
  await Promise.all(presigns);

  const entries: WorkspacePluginEntry[] = [];
  for (const plan of plans) {
    const remoteEntryUrl = plan.devUiUrl ?? urlByKey.get(`${plan.installId}:remoteEntry`) ?? '';
    const bundleUrls: Record<string, string> = {};
    for (const locale of plan.bundleLocales) {
      const url = urlByKey.get(`${plan.installId}:bundle:${locale}`);
      if (url !== undefined) bundleUrls[locale] = url;
    }
    for (const extensionPoint of plan.extensionPoints) {
      entries.push({
        installId: plan.installId,
        slug: plan.slug,
        extensionPoint,
        i18nBundles: plan.bundleLocales,
        ...(Object.keys(bundleUrls).length > 0 ? { i18nBundleUrls: bundleUrls } : {}),
        // Dev backend URL wins; production uses the presigned storage object.
        remoteEntryUrl,
      });
    }
  }
  return entries;
}

import { z } from 'zod';

import { SLUG_REGEX } from './tenant-schema-helpers.js';

const dnsLabelSchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);

const hostHeaderSchema = z
  .string()
  .min(1)
  .max(259)
  .regex(/^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/)
  .transform((host) => host.toLowerCase())
  .refine((host) => {
    const port = host.split(':')[1];
    return port === undefined || Number(port) <= 65535;
  });

const tenantSlugSchema = z.string().regex(SLUG_REGEX);

export function tenantSlugFromHost(host: unknown): string | null {
  const parsedHost = hostHeaderSchema.safeParse(host);
  if (!parsedHost.success) return null;

  const hostname = parsedHost.data.split(':')[0];
  if (hostname === undefined) return null;
  const labels = hostname.split('.');
  const minimumLabels = hostname.endsWith('.localhost') ? 2 : 3;
  if (
    labels.length < minimumLabels ||
    labels.some((label) => !dnsLabelSchema.safeParse(label).success)
  ) {
    return null;
  }

  const parsedSlug = tenantSlugSchema.safeParse(labels[0]);
  return parsedSlug.success ? parsedSlug.data : null;
}

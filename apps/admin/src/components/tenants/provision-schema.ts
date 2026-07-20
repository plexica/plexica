// provision-schema.ts — Zod validation schema for the tenant provisioning
// wizard (S5-403). Mirrors the backend ProvisionTenantBodySchema rules.

import { z } from 'zod';

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const provisionSchema = z.object({
  slug: z
    .string()
    .min(1, 'admin.provision.slug.error.required')
    .min(3, 'admin.provision.slug.error.length')
    .max(63, 'admin.provision.slug.error.length')
    .regex(SLUG_REGEX, 'admin.provision.slug.error.format'),
  name: z
    .string()
    .min(1, 'admin.provision.name.error.required')
    .max(255, 'admin.provision.name.error.length'),
  adminEmail: z
    .string()
    .min(1, 'admin.provision.adminEmail.error.required')
    .email('admin.provision.adminEmail.error.format'),
});

export type ProvisionFormValues = z.infer<typeof provisionSchema>;

export const PROVISION_FORM_DEFAULTS: ProvisionFormValues = {
  slug: '',
  name: '',
  adminEmail: '',
};

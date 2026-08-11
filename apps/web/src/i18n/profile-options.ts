// profile-options.ts
// Curated IANA timezone and language lists offered by the profile form.
// Lives under i18n/ because these are locale data, not page logic, and it keeps
// profile-page.tsx under the 200-line limit (Constitution Rule 4).

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const TIMEZONE_VALUES = [
  'UTC', 'Europe/London', 'Europe/Rome', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Madrid', 'Europe/Amsterdam', 'Europe/Zurich', 'Europe/Stockholm',
  'Europe/Warsaw', 'Europe/Athens', 'Europe/Helsinki', 'Europe/Lisbon',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
  'America/Mexico_City', 'America/Bogota', 'America/Lima',
  'Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Jakarta',
  'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland',
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos',
];

// Language names are intentionally shown in their own language (endonyms), so
// they are data rather than translatable UI copy.
const LANGUAGE_VALUES: SelectOption[] = [
  { value: 'en', label: 'English' },
  { value: 'it', label: 'Italiano' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
  { value: 'ko', label: '한국어' },
  { value: 'ar', label: 'العربية' },
];

/** Build timezone Select options, ensuring the stored value is always present. */
export function timezoneOptions(stored: string | undefined): SelectOption[] {
  const list: SelectOption[] = TIMEZONE_VALUES.map((tz) => ({
    value: tz,
    label: tz.replace(/_/g, ' '),
  }));
  if (stored !== undefined && stored !== '' && !TIMEZONE_VALUES.includes(stored)) {
    list.push({ value: stored, label: stored.replace(/_/g, ' '), disabled: true });
  }
  return list;
}

/** Build language Select options, ensuring the stored value is always present. */
export function languageOptions(stored: string | undefined): SelectOption[] {
  if (stored === undefined || stored === '' || LANGUAGE_VALUES.some((l) => l.value === stored)) {
    return LANGUAGE_VALUES;
  }
  return [...LANGUAGE_VALUES, { value: stored, label: stored, disabled: true }];
}

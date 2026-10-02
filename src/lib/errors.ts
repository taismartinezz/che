import i18n from '../i18n';

const KNOWN = [
  'only_friends',
  'only_author',
  'blocked',
  'not_found',
  'invalid_target',
  'not_mutual_friend',
  'needs_verification',
  'request_not_open',
  'forbidden',
  'not_authenticated',
  'invalid',
];

/** Turns Supabase/Postgres errors into plain-language messages. */
export function friendlyError(err: unknown): string {
  const raw =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : '';
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  const known = KNOWN.find((k) => raw.includes(k));
  if (known) return i18n.t(`errors.${known}`);
  if (code === '23505') return i18n.t('errors.duplicate');
  if (code === '23514') return i18n.t('errors.invalid');
  if (code === '42501' || raw.includes('row-level security')) return i18n.t('errors.forbidden');
  if (/fetch|network|Failed to/i.test(raw)) return i18n.t('errors.network');
  if (/rate limit/i.test(raw)) return i18n.t('errors.rate_limit');
  return i18n.t('errors.generic');
}

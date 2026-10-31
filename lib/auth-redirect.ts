/**
 * อนุญาตให้ redirect หลังล็อกอินเฉพาะ path ภายในเว็บไซต์เท่านั้น (ป้องกัน open redirect)
 */
export function getSafeRedirectPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return fallback;
  }
  if (next === '/login' || next.startsWith('/login?')) return fallback;
  return next;
}

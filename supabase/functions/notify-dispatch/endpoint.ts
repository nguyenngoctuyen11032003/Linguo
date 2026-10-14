// Spec 10 §3: which push endpoints notify-dispatch may POST to. The endpoint is a URL chosen by the browser and
// stored by save_push_subscription, so without an allowlist a learner could aim the server's fetch at any
// https host (SSRF). The same rule lives in SQL (public.is_allowed_push_endpoint,
// 20261016000400_notify_hardening.sql) and is re-checked here right before sending: only the push services of
// the browsers Linguo supports.

const ALLOWED_HOSTS: readonly RegExp[] = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge, Opera, Samsung Internet, Brave (FCM)
  /^(?:[a-z0-9-]+\.)+push\.services\.mozilla\.com$/, // Firefox (updates.push.services.mozilla.com, ...)
  /^(?:[a-z0-9-]+\.)+notify\.windows\.com$/, // Edge on Windows (WNS)
  /^(?:[a-z0-9-]+\.)+push\.apple\.com$/, // Safari / iOS web apps (web.push.apple.com)
];

/**
 * True for `https://<push service host>[:443]/<path>` with no userinfo, no IP literal, no other port and no
 * whitespace or backslash anywhere. Hosts are compared after URL normalisation (lower case, default port dropped).
 */
export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > 2048) return false;
  if (/[\s\\]/.test(endpoint) || !/^https:\/\/[^/?#]+\//i.test(endpoint)) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return false;
  if (url.port !== '' && url.port !== '443') return false;
  return ALLOWED_HOSTS.some((re) => re.test(url.hostname));
}

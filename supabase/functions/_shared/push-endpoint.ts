// Push destinations come from the browser, but remain untrusted input.
// Accept supported browsers' public push services, never arbitrary HTTPS.
export function allowedPushEndpoint(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.pathname === '/') return false;
    const host = url.hostname;
    return host === 'fcm.googleapis.com' || host === 'android.googleapis.com' ||
      host === 'updates.push.services.mozilla.com' || host === 'web.push.apple.com' ||
      /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.notify\.windows\.com$/.test(host);
  } catch { return false; }
}

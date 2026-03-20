const TWITTER_HOSTS = new Set([
  't.co',
  'www.t.co',
  'twitter.com',
  'www.twitter.com',
  'x.com',
  'www.x.com',
  'mobile.twitter.com',
  'mobile.x.com',
]);

export function isNonProjectWebsiteUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);
    return TWITTER_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return true;
  }
}

export function sanitizeLaunchWebsite(raw: string | null | undefined): string | undefined {
  if (raw == null || !raw.trim()) return undefined;
  const s = raw.trim();
  if (isNonProjectWebsiteUrl(s)) return undefined;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export function pickBestProfileWebsite(
  profileUrl: string | undefined,
  bioExpandedUrls: Array<string | undefined> | undefined
): string | undefined {
  const candidates: string[] = [];
  if (profileUrl?.trim()) candidates.push(profileUrl.trim());
  for (const u of bioExpandedUrls ?? []) {
    if (u?.trim()) candidates.push(u.trim());
  }
  for (const c of candidates) {
    if (!isNonProjectWebsiteUrl(c)) {
      return /^https?:\/\//i.test(c) ? c : `https://${c}`;
    }
  }
  return undefined;
}

const TCO_HOSTS = new Set(['t.co', 'www.t.co']);

export function isResolvableTwitterShortUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return TCO_HOSTS.has(new URL(withProto).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isSafePublicHttpUrl(urlString: string): boolean {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  ) {
    return false;
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const octets = [ipv4[1], ipv4[2], ipv4[3], ipv4[4]].map((x) => Number.parseInt(x, 10));
    if (octets.some((n) => n > 255)) return false;
    const [a, b] = octets;
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
  }
  if (host.includes(':') && !ipv4) {
    const inner = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
    const hl = inner.toLowerCase();
    if (hl === '::1') return false;
    if (hl.startsWith('fe80:')) return false;
    if (hl.startsWith('fc') || hl.startsWith('fd')) return false;
  }
  return true;
}

async function followRedirects(url: string, timeoutMs: number): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': 'LaunchRadar/1.0 (website enrichment)',
        Accept: 'text/html,*/*;q=0.1',
      },
    });
    try {
      await res.body?.cancel();
    } catch {
      //
    }
    return res.url;
  } catch {
    return undefined;
  }
}

export async function expandLaunchWebsite(
  raw: string | null | undefined,
  options?: { timeoutMs?: number }
): Promise<string | undefined> {
  const direct = sanitizeLaunchWebsite(raw);
  if (direct) return direct;
  if (raw == null || !raw.trim()) return undefined;
  const s = raw.trim();
  if (!isResolvableTwitterShortUrl(s)) return undefined;
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  const resolved = await followRedirects(withProto, timeoutMs);
  if (!resolved || !isSafePublicHttpUrl(resolved)) return undefined;
  return sanitizeLaunchWebsite(resolved);
}

export async function pickBestProfileWebsiteResolved(
  profileUrl: string | undefined,
  bioExpandedUrls: Array<string | undefined> | undefined,
  options?: { timeoutMs?: number }
): Promise<string | undefined> {
  const immediate = pickBestProfileWebsite(profileUrl, bioExpandedUrls);
  if (immediate) return immediate;
  const candidates: string[] = [];
  if (profileUrl?.trim()) candidates.push(profileUrl.trim());
  for (const u of bioExpandedUrls ?? []) {
    if (u?.trim()) candidates.push(u.trim());
  }
  for (const c of candidates) {
    if (isResolvableTwitterShortUrl(c)) {
      const expanded = await expandLaunchWebsite(c, options);
      if (expanded) return expanded;
    }
  }
  return undefined;
}

export interface GeoResult {
  country:     string;
  countryCode: string;
  region:      string;
  city:        string;
  isp:         string;
}

/** Strip IPv6-mapped-IPv4 prefix (::ffff:1.2.3.4 → 1.2.3.4) so ip-api.com
 *  receives a plain dotted-quad.  Node listens dual-stack by default, so
 *  every IPv4 connection arrives with this prefix. */
function normalizeIp(raw: string): string {
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

function isPrivate(ip: string): boolean {
  if (!ip || ip === 'unknown') return true;
  if (ip === '::1') return true;
  if (ip.startsWith('127.')) return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  // 172.16.0.0 – 172.31.255.255
  const oct = ip.match(/^172\.(\d+)\./);
  if (oct && +oct[1] >= 16 && +oct[1] <= 31) return true;
  return false;
}

/** Look up country info for an IP via ip-api.com (free, no key needed).
 *  Returns null for private/loopback IPs and on any network error. */
export async function geolocateIp(raw: string): Promise<GeoResult | null> {
  const ip = normalizeIp(raw ?? '');
  if (isPrivate(ip)) return null;
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,isp`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const d = await res.json() as any;
    if (d.status !== 'success') return null;
    return { country: d.country, countryCode: d.countryCode, region: d.regionName, city: d.city, isp: d.isp };
  } catch {
    return null;
  }
}

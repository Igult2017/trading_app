export interface GeoResult {
  country:     string;
  countryCode: string;
  region:      string;
  city:        string;
  isp:         string;
}

/** Look up country info for an IP via ip-api.com (free, no key needed).
 *  Returns null for private/loopback IPs and on any network error. */
export async function geolocateIp(ip: string): Promise<GeoResult | null> {
  if (!ip || ip === 'unknown' || ip.startsWith('127.') || ip.startsWith('::') || ip === '::1') return null;
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

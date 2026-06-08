export function getUtmSource(): string {
  try {
    return new URLSearchParams(window.location.search).get('utm_source') ?? '';
  } catch {
    return '';
  }
}

export function getReferrer(): string {
  try {
    return document.referrer ?? '';
  } catch {
    return '';
  }
}

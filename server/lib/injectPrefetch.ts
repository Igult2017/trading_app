import { getHomepageCalendar, getHomepageRates } from "../services/homepageCalendar";

/**
 * Injects window.__PREFETCH__ into the HTML shell so the client has calendar
 * and rates data synchronously — before React boots, before any network request.
 * Never throws: if data is unavailable the HTML is returned unchanged.
 */
export async function injectPrefetch(html: string): Promise<string> {
  try {
    const [calendar, rates] = await Promise.all([
      getHomepageCalendar(),
      getHomepageRates(),
    ]);
    if (!calendar.length && !Object.keys(rates).length) return html;
    // Escape </script> so the JSON cannot break out of the script tag
    const payload = JSON.stringify({ calendar, rates })
      .replace(/<\/script>/gi, "<\\/script>");
    return html.replace("</head>", `<script>window.__PREFETCH__=${payload}</script></head>`);
  } catch {
    return html;
  }
}

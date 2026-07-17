/** Signed currency, thousands-separated: 142 -> "+$142.00", -96.3 -> "-$96.30". */
export function money(n: number): string {
  const sign = n < 0 ? "-" : "+";
  return `${sign}$${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/** "Sara Lindqvist" -> "SL". First letter of the first two words. */
export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

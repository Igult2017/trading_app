/**
 * ddStyles.testkit.ts — the setup ddStyles.test.ts runs on: the PASS/FAIL counters and the
 * drawdown stylesheet assembled from its four template literals exactly as the bundler sees it.
 * Moved out of ddStyles.test.ts on 2026-11-15, when that file passed 200 lines; nothing in it changed
 * except the exports and finish(). Not a test itself — it only gets run through that file.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
// The REAL function, not a stand-in: the drawdown sheet now calls it for the shared Analytics
// chart's light palette, and a check that substituted a placeholder would prove nothing about it.
import { mpLightCss, DD_PAGE_MP_TOKENS } from '../shared/mpTokens';

let failed = 0;
let count = 0;

export function check(name: string, got: unknown, want: unknown) {
  count++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}` +
              (ok ? '' : `, want ${JSON.stringify(want)}`));
  if (!ok) failed++;
}

export function teeth(name: string, brokeItAndFailed: boolean) {
  count++;
  console.log(`   ${brokeItAndFailed ? 'PASS' : 'FAIL'}  TEETH — ${name}`);
  if (!brokeItAndFailed) failed++;
}

export const here = (f: string) => readFileSync(join(import.meta.dirname, f), 'utf8');

/** Pull a named template literal out of a source file — the same way the bundler would read it. */
function lit(src: string, name: string): string {
  const i = src.indexOf(name);
  if (i < 0) throw new Error(`not found: ${name}`);
  const s = src.indexOf('`', i);
  const e = src.indexOf('`', s + 1);
  return src.slice(s + 1, e);
}

const tokSrc = here('ddTokens.ts');
const ALIASES = lit(tokSrc, 'const ALIASES');
export const DARK = lit(tokSrc, 'DD_TOKENS_DARK').replace('${ALIASES}', ALIASES);
export const LIGHT = lit(tokSrc, 'DD_TOKENS_LIGHT').replace('${ALIASES}', ALIASES);
const core = lit(here('ddStyles.ts'), 'const DD_CORE')
  .replace('${DD_TOKENS_DARK}', DARK)
  .replace('${DD_TOKENS_LIGHT}', LIGHT)
  .replace('${mpLightCss(DD_PAGE_MP_TOKENS)}', mpLightCss(DD_PAGE_MP_TOKENS));
const monthDays = lit(here('monthDays.tsx'), 'MONTH_DAYS_CSS');
const sections = lit(here('ddStyles2.ts'), 'const DD_SECTIONS')
  .replace('${MONTH_DAYS_CSS}', monthDays);
export const css = core + sections;

/** Print the tally and set the exit code. */
export function finish() {
  console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`} — ${count} checks\n`);
  process.exit(failed === 0 ? 0 : 1);
}

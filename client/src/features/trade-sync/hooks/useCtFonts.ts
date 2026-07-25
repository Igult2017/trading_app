import { installCtStyles } from "../styles/install";

/**
 * Ensures this UI's stylesheet + fonts are in <head>.
 *
 * The real work happens at IMPORT time (styles/install runs its side effect immediately), which is
 * the whole point: doing it in a useEffect meant the first paint had no type scale and every
 * heading flashed at the browser default size before snapping down. This function stays as the
 * public entry point the landing page calls, and is now a no-op after the first install.
 */
export function useCtFonts(): void {
  installCtStyles();
}

/**
 * THE TRADE-ENTRY FORM'S READABILITY RULES — his report, 2026-10-25: *"Journaling form is blurred
 * in white theme. Fix white theme make text darker and I guess you may increase font size abit"*
 *
 * ⚠ IT LIVES HERE, NOT IN `OBS_CSS`. JournalForm.tsx is 2,249 lines; this is appended to its style
 * block instead of grown inside it, so the measured numbers below stay next to the rules they
 * justify. It is appended AFTER `OBS_CSS`, which settles every equal-specificity tie in its favour
 * by source order — the same mechanism OBS_CSS already relies on against Journal.tsx.
 *
 * MEASURED BEFORE CHANGING ANYTHING, because `docs/READABILITY.md` says the cause is almost never
 * the colour. The live form needs a login, so it was rebuilt as a static page from the real CSS and
 * measured with `scripts/check-readability.mjs` and a browser probe of computed styles:
 *
 *     blue section headings    #4e8cff   3.19:1 on the warm white   FAILS AA
 *     placeholders             #5C5646 at 35% opacity   1.74:1      FAILS badly (1.18:1 in dark)
 *     field labels             #5C5646   7.24:1                     passes
 *     the value you type       #141310  18.58:1                     passes
 *     Balance / Risk Amount / Start / End / the Entry tab            8px, under the 11px floor
 *
 * ⚠ TWO THINGS THE MEASUREMENT RULED OUT, so they are deliberately absent below:
 *
 *  1. THE WIDE LETTER-SPACING IS ALREADY DEAD. Six headings are authored tracking-[0.3em], but
 *     Journal.tsx:1041 sets letter-spacing:.02em across the journal at equal specificity and later
 *     in source order, so the rendered value is 0.24px, not 3.6px. Reading the source says there is
 *     a problem here; the browser says there is not.
 *  2. THE TYPEFACE IS NOT CHANGED. Everything here is Playfair Display, a DISPLAY serif doing body
 *     work at 11-13.5px, which that doc names as the usual cause of "blurred". The journal's own
 *     paired text face lays down 13-21% more ink at these exact sizes — measured. But
 *     JournalForm.tsx:22-41 forces Playfair on purpose ("Playfair, like the rest of the Journal")
 *     and every panel beside this form is Playfair at small sizes too, so changing the face HERE
 *     would make the form the odd one out. Size is the lever that keeps his font and still fixes
 *     the blur. Putting the journal's small read-text on the paired face is a whole-journal
 *     decision and his to make.
 *
 * NO BACKTICKS ANYWHERE IN THIS FILE, not even in a comment — it is a template literal, and a stray
 * backtick ends the string and crashes at runtime while still building clean. That has shipped
 * twice. Quote with "..".
 */
export const JF_READABLE_CSS = `
  /* ── ONE NOTCH BIGGER, EVERYWHERE ─────────────────────────────────────────────
     OBS_CSS already lifts 9px->11, 10px->12, 11px->13 and text-xs->13.5. These raise each by a
     further step, and add the one that was missing: nothing matched text-[8px], so nine elements
     - Balance, Risk Amount, Start, End, the step bullets and the mobile Entry/Stats tabs - were
     rendering at 8px, three under this project's own 11px floor. */
  .obs-jf [class~="text-[8px]"]  { font-size: 12px !important; }
  .obs-jf [class~="text-[9px]"]  { font-size: 12px !important; }
  .obs-jf [class~="text-[10px]"] { font-size: 13px !important; }
  .obs-jf [class~="text-[11px]"] { font-size: 13.5px !important; }
  .obs-jf .text-xs               { font-size: 14px !important; line-height: 1.5 !important; }

  /* ── THE WHITE THEME ONLY, from here down ─────────────────────────────────────
     The dark themes measure fine on every one of these except the placeholder (1.18:1 there, and
     he pointed at the white theme), so each rule is scoped to .journal-light and the dark themes
     are left exactly as they were. */

  /* THE BLUE SECTION HEADINGS - 3.19:1, the one real contrast failure he is looking at.
     #1d4ed8 measures 6.64:1 on the warm canvas and 6.70:1 on a white card. It is NOT a new colour:
     it is already this repo's light-theme blue for small text (dpStyles.ts, the LIVE badge), picked
     the same way for the same reason.

     MATCHED AS A WHOLE CLASS TOKEN ([class~=]), NEVER AS A SUBSTRING. A substring match would also
     catch "hover:text-[#4e8cff]" on the pin button, which would paint it blue at rest instead of on
     hover - so the hover variant gets its own rule, applied only while hovering. */
  .journal-light .obs-jf [class~="text-[#4e8cff]"],
  .journal-light .obs-jf [class~="text-[#4e8cff]/60"] { color: #1d4ed8 !important; }
  .journal-light .obs-jf [class~="hover:text-[#4e8cff]"]:hover { color: #1d4ed8 !important; }
  /* The 2px rule beside each heading and the pulsing dot, so the accent still matches its heading.
     ALSO [class~=], because the tinted chips are a DIFFERENT token (bg-[#4e8cff]/10) and painting
     those solid would turn every soft blue chip into a block of blue. */
  .journal-light .obs-jf [class~="bg-[#4e8cff]"] { background-color: #1d4ed8 !important; }

  /* PLACEHOLDERS - 1.74:1, which is barely there. The cause is two rules meeting: Journal.tsx gives
     them the theme's muted ink, then OBS_CSS multiplies the whole thing by an 0.35 opacity meant
     for a dark ground. At full strength #7A7362 measures 4.67:1 on the canvas and 4.71:1 on a card,
     so it clears AA while staying clearly lighter than a label (9.47:1) and a typed value (18.58:1)
     - the hint still reads as a hint. */
  .journal-light .obs-jf input::placeholder,
  .journal-light .obs-jf textarea::placeholder { color: #7A7362 !important; opacity: 1 !important; }

  /* THE FIELD LABELS - these ALREADY passed at 7.24:1. This is his request, not a defect being
     fixed: "make text darker". #4A4538 measures 9.47:1. Scoped to the form, so the theme's muted
     ink is unchanged everywhere else in the journal. */
  .journal-light .obs-jf [class~="text-[#3f3f46]"] { color: #4A4538 !important; }
`;

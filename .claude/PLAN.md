# PLAN — password reset (HIS SYMPTOM: pressing the button did nothing at all)

His words: "After clicking reset password and resetting, it dint take effect like saying it was
successful." So he REACHED the form, pressed the button, and NOTHING appeared - no red, no green.
He answered A1 (throwaway user in prod is fine) and B1 (sign out, then the sign-in screen).

## Architecture — every piece the reset touches
  send side      client/src/components/auth/AuthModal.tsx:97-99   resetPasswordForEmail
  login client   client/src/lib/supabase.ts                       createClient, implicit flow
  route          client/src/App.tsx:57, :350                      LAZY-loaded ResetPasswordPage
  landing page   client/src/pages/ResetPasswordPage.tsx           the form, its gate, its submit
  in-app change  client/src/components/profile/ProfileSettings.tsx:52-62
  global auth    client/src/context/AuthContext.tsx:104-116       records the session, no redirect
  server         NOTHING. Password reset never reaches Express.

## Defect 1 — THE ONE THAT MATCHES HIS SYMPTOM
ResetPasswordPage.tsx:57-64 is try/finally with NO CATCH. A THROWN failure skips every line that
puts anything on screen. GoTrueClient.js:2672-2678 hands back login errors but RE-THROWS anything
else (:2677); LockAcquireTimeoutError (lib/locks.js:35) is a plain Error, thrown after 5s
(GoTrueClient.js:28). No error boundary anywhere in client/src (0 hits). So: silence.
⚠ NOT YET PROVED that a lock timeout is what threw for HIM. Step 1 reproduces the real press.
ProfileSettings.tsx:52-62 has the same hole, and leaves the button stuck on "Changing...".

## Defect 2 — found while reading: the form can fail to appear
ResetPasswordPage.tsx:34-38 gates on the one-shot PASSWORD_RECOVERY announcement
(GoTrueClient.js:303-330). Page is lazy-loaded; MEASURED live: chunk 1016ms->1178ms vs a 314ms
cold / 38ms warm round trip = coin-flip. CERTAIN failure on any refresh: the token is stripped
from the address (GoTrueClient.js:3103) so the announcement can never be made again. Every new
listener is already handed the session as INITIAL_SESSION (GoTrueClient.js:3411) and it is ignored.

## Defect 3 — found while reading: a link landing elsewhere is swallowed
One grep hit for the address fragment in all of client/src: AuthCallbackPage.tsx:21, errors only.
⚠ NOT CHECKED: the Supabase approved-redirect list (needs a management token).

## Tasks, in order
1. REPRODUCE his press first - throwaway user + admin generate_link (sends NO email), console on.
2. ResetPasswordPage: add the missing catch; no outcome may leave the screen unchanged.
3. ResetPasswordPage: getSession() on mount; accept ANY event; "invalid or expired" once start-up
   is done and there is still none; unsubscribe on unmount.
4. lib/supabase.ts: above createClient, send a type=recovery address to /auth/reset-password.
5. B1: sign out after success, THEN the sign-in screen (:61 shows it while still signed in).
6. ProfileSettings.tsx:52-62: the same missing catch.

## What will be MEASURED
  - where the link lands (answers the approved-list question)
  - before/after the fix: press the button, record screen AND console
  - a real success: green box AND signing in with the new password works
  - refresh mid-reset: the form still appears
  - no token: "invalid or expired", not "Verifying..." for ever
  - SABOTAGE: force a throw and confirm the new catch shows it
  - the throwaway user is deleted, verified by listing

## Out of scope
Anything server-side. The look of these pages.

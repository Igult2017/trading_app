# Fix the stale brand name on two pages

He pointed at the reset-password page still reading "My FM | Journal".

The 2026-10-11 rename to DailyTradeBook missed two hardcoded copies:
  client/src/pages/ResetPasswordPage.tsx:95-96
  client/src/components/JournalPaywall.tsx:94

Both are replaced with the shared <Brand /> component (client/src/components/Brand.tsx),
which is the single definition of the name - so this cannot drift a third time.

Measured: no "My FM" left in client/src; the rendered page reads DailyTradeBook.

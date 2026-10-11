/*
  CATEGORY_META IS GONE (2026-10-11), and nothing replaced it here.

  It held a label, a colour, a background wash and a border for each of the five categories. All
  four are now dead or moved:

    label   — the category word above each notification's title. Removed on his instruction:
              *"Notification is notification no categorization."*
    border  — read NOWHERE, before or after that change. It was already dead.
    color   — moved into the panel's own stylesheet as the anp-cat- rules, where each category
              takes the admin palette's matching semantic token (--admin-blue, --admin-red,
              --admin-green, --admin-amber, --admin-accent) instead of one hardcoded hex. That is
              what makes the icons correct on all five palettes rather than only the dark one.
    bg      — derived from the colour with color-mix, so it is one value instead of two.

  See AdminNotificationsPanel.tsx for the rules themselves.
*/

export const ADMIN_NOTIF_REFETCH_MS = 20_000;

# PLAN - Drawdown panel rebuilt to his new design (APPROVED, in verification)

## Status: built; verifying visually with Playwright

## Phase 1 - Architecture
Presentation rebuild of the Drawdown panel to his 2026-11-03 mock-up. Data wiring untouched:
/api/drawdown/compute (server/python/drawdown/core.py) already returned all 11 blocks.
Panel lives inside Journal (sidebar item 'drawdown'), mounted at Journal.tsx:1464.

New: client/src/components/drawdown/dd*.{ts,tsx} (tokens, styles x2, header, banner, kpis, profile,
chart, breakdown, riskCards, lossShare, structural, streaks, rr, monthly, bits, empty, periods)
Rewritten: DrawdownPanel.tsx (orchestrator), skeletons/DrawdownSkeleton.tsx
Server: server/lib/periodFilter.ts + routes.ts date-range filter and cache key
Deleted: dpStyles.ts, dpTokens.ts, dpSections.ts, diveProfile.tsx, lossBars.tsx
Reused unchanged: monthDays.tsx (the day-by-day expander)

## Phase 2 - Tasks (all done)
1. ddTokens (his palette + a light remap; mpTokens.ts deliberately untouched)
2. ddStyles/ddStyles2 (gaps reduced: sections 32->16px, grids ->12px, card padding 24->20px)
3. ddHeader (account selector wired to the real session list; period selector)
4. Section components, one per card
5. DrawdownPanel as orchestrator
6. Server period filter + cache key
7. Preserved: monthly day expander, coloured W/L counts via WLB
8. Dead files deleted; stale mpTokens pointer corrected

## Phase 3 - Execute: done

## Phase 4 - Health check
- npx tsc --noEmit: clean
- client/src/components/drawdown/ddStyles.test.ts: 15/15 pass
- server/services/ctraderRateGuard.test.ts: 53/53 (no regression)
- Contrast measured both themes; his dark #64748b was 3.58:1 (below the 4.5:1 floor) -> #7987a3
- Playwright: screenshots of a harness using the REAL extracted stylesheet, dark + light
  NOTE: cannot log into the real journal locally (no Supabase keys / ADMIN_SECRET in .env)

## NOT in scope
Redesigning anything; Metrics page or mpTokens.ts; the Python maths; the signal platform.

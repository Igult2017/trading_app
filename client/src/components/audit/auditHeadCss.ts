/**
 * auditHeadCss — the layout of the audit page's header row, shared by the real header
 * (audit/AuditHeader) and its loading copy (skeletons/AuditSkeleton), so the two cannot drift.
 *
 * WHY IT EXISTS (2026-11-15). The row used to be a wrapping flex row: title + tabs on the left, the
 * four figures on the right. It needed ~1,300px, and on his 1366px screen the page is ~1,181px with
 * the sidebar OPEN, so the figures dropped UNDER the tabs; with it collapsed (~1,294px) they fitted
 * but "AI CONFIDENCE" was clipped. His words: "it must look like image 2 whether the sidebar is
 * collapsed or not."
 *
 * THE FIX: the SPACING that made the row ~1,300px is trimmed, sizes and fonts untouched - tabs 16 ->
 * 10px each side, figures 28 -> 16px apart, the two blocks 24 -> 16px. Measured with the real
 * Playfair: the row now needs ~1,140px, under the ~1,166px his open-sidebar page has once a
 * scrollbar is counted. The row still WRAPS, but a wrapping row only moves the figures down when they
 * genuinely do not fit - a tablet or a phone - and it can never push them off the edge. (A container
 * query was planned for this; measuring showed it added nothing a wrapping row does not already do,
 * and a no-wrap row scrolled sideways on a phone.)
 *
 * NO BACKTICKS inside the string - it is one template literal.
 */
export const AUDIT_HEAD_CSS = `
.sa-head-row{display:flex;align-items:flex-end;justify-content:space-between;column-gap:16px;row-gap:18px;flex-wrap:wrap;}
.sa-head-left{min-width:0;padding-left:10px;display:flex;flex-direction:column;gap:14px;}
.sa-tabs{display:inline-flex;flex-wrap:wrap;align-self:flex-start;padding:4px;border-radius:4px;}
.sa-tab{padding:8px 10px;white-space:nowrap;}
.sa-kpis{display:flex;flex-wrap:wrap;column-gap:16px;row-gap:14px;min-width:0;}
.sa-kpi{display:flex;flex-direction:column;gap:4px;white-space:nowrap;}
`;

import { CT_TOKENS } from "./tokens";
import { CT_FONT_GUARD } from "./fontGuard";
import { CT_UTILITIES } from "./utilities";
import { CT_INTERACTIONS } from "./interactions";
import { CT_PANEL } from "./panel";

/**
 * The complete Trade Sync stylesheet, injected once from the root component as
 * `<div className="ct-app"><style>{CT_STYLES}</style>…</div>`.
 *
 * Order: tokens (declare the face) -> font guard (fence the app's globals out) -> utilities
 * (assign the type scale) -> interactions. Specificity does the real work in every case; the
 * order just keeps the cascade readable.
 *
 * Never put a backtick inside any of these CSS strings, including in a comment — it terminates
 * the template literal and produces a runtime crash that still builds clean.
 */
export const CT_STYLES = CT_TOKENS + CT_FONT_GUARD + CT_UTILITIES + CT_INTERACTIONS + CT_PANEL;

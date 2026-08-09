/** The streak card, expanded — the third view in the profile panel.
 *
 * The card used to be inert: a chevron on a div with no handler. Now it opens this.
 *
 * IT IS NOT A LOGIN STREAK, and that mattered more than the missing click. The server counts days
 * with at least one JOURNAL ENTRY (routes.ts, journal_entries by distinct day). Someone who signs in
 * every day but has not logged a trade sees "0 days" and reasonably concludes the feature is broken.
 * So the label is now "journal streak" and this view says plainly what is being counted.
 */
import { STREAK_CSS } from './streakCss';

function lastNDays(n: number) {
  const out: string[] = [];
  const d = new Date(); d.setUTCHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(d.getTime() - i * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

export default function StreakDetail({ streak, longest, activeDays, onBack }: {
  streak: number; longest: number; activeDays: string[]; onBack: () => void;
}) {
  const active = new Set(activeDays);
  const days = lastNDays(14);
  const label = (n: number) => (n === 1 ? '1 day' : n + ' days');

  return (
    <>
      <style>{STREAK_CSS}</style>
      <div className="sd-head">
        <button className="sd-back" onClick={onBack} type="button" aria-label="Back to profile">‹</button>
        <span className="sd-title">journal streak</span>
      </div>

      <div className="sd-body">
        <div className="sd-figs">
          <div className="sd-fig">
            <div className="sd-fig-v">{label(streak)}</div>
            <div className="sd-fig-l">current</div>
          </div>
          <div className="sd-fig">
            <div className="sd-fig-v">{label(longest)}</div>
            <div className="sd-fig-l">best ever</div>
          </div>
        </div>

        <div className="sd-strip-lab">last 14 days</div>
        <div className="sd-strip" role="img"
             aria-label={activeDays.length + ' days logged in the last 30'}>
          {days.map(d => (
            <span key={d} className={active.has(d) ? 'sd-day on' : 'sd-day'} title={d} />
          ))}
        </div>

        <p className="sd-note">
          This counts days you <strong>logged a trade</strong> — not days you signed in. A filled
          square is a day with at least one journal entry.
        </p>
        {streak === 0 && (
          <p className="sd-note sd-hint">
            Log an entry today and the streak starts at one.
          </p>
        )}
      </div>
    </>
  );
}

/** Account settings — the plan card, and closing your account.
 *
 * Both are READ-ONLY on purpose, because both are honest about what the product can actually do:
 *
 *  - Plan changes go through the pricing page and the payment provider; there is no in-app
 *    downgrade/upgrade endpoint to wire a button to.
 *  - THERE IS NO ACCOUNT-DELETION ENDPOINT. The Terms said "you can delete your account at any time
 *    from your settings", which was not true — no endpoint, no settings page. Rather than ship a
 *    button that silently does nothing, this states the real process (ask, we do it, 90 days) and
 *    the Terms were corrected to match on 2026-08-08. If self-serve deletion is built later, replace
 *    this block with it AND put the sentence back in the Terms — the two must not drift again.
 */
import { aTokens, SERIF, Card, btnStyle } from './accountUI';

export default function AccountPlan({ dm, plan, status, endsAt }:
  { dm: boolean; plan: string; status: string; endsAt: string | null }) {
  const t = aTokens(dm);
  const paid = String(plan).toLowerCase() !== 'free';
  const when = endsAt ? new Date(endsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return (
    <>
      <Card dm={dm} title="Plan">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: t.ink, textTransform: 'capitalize' }}>
            {plan || 'Free'}
          </span>
          <span style={{ fontFamily: SERIF, fontSize: 11.5, letterSpacing: '.06em', textTransform: 'uppercase',
                         padding: '3px 10px', borderRadius: 999,
                         background: paid ? t.okBg : 'transparent',
                         border: `1px solid ${paid ? t.accent : t.fieldBd}`,
                         color: paid ? t.accent : t.dim }}>
            {status || 'free'}
          </span>
        </div>
        <p style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.7, color: t.body, margin: '0 0 16px' }}>
          {paid && when
            ? `Your subscription runs until ${when} and renews automatically unless you cancel.`
            : paid
              ? 'Your subscription is active and renews automatically unless you cancel.'
              : 'You are on the free plan. Upgrading unlocks the paid journal features.'}
        </p>
        <a href="/#pricing" style={{ ...btnStyle(dm, false, paid ? 'quiet' : 'primary'), textDecoration: 'none' }}>
          {paid ? 'See plans' : 'See plans'}
        </a>
        {paid && (
          <p style={{ fontFamily: SERIF, fontSize: 12.5, color: t.dim, margin: '12px 0 0' }}>
            To cancel or change your plan, email support@tradeandjournal.com. Your rights, including
            the 14-day right to change your mind, are on the Terms &amp; Conditions page.
          </p>
        )}
      </Card>

      <Card dm={dm} title="Your data and closing your account">
        <p style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.75, color: t.body, margin: '0 0 12px' }}>
          You can export everything you have logged at any time from the Analytics section of the
          journal, in CSV or JSON.
        </p>
        <p style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.75, color: t.body, margin: 0 }}>
          To close your account, email <strong style={{ color: t.ink }}>support@tradeandjournal.com</strong>{' '}
          with the subject <strong style={{ color: t.ink }}>Account Deletion</strong>. We export your
          data for you first, then remove or anonymise it within 90 days, keeping only what the law
          requires us to keep. We handle this by hand rather than with a one-click button so an
          account cannot be destroyed by accident or by someone who has borrowed your screen.
        </p>
      </Card>
    </>
  );
}

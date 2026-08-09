/** Terms section 6 — billing, cancellation and refunds.
 *
 * Was its own document until 2026-08-08; merged into the Terms when the seven legal pages became
 * four. The content is unchanged in substance, condensed into one numbered section with unnumbered
 * sub-headings so the Terms numbering does not cascade.
 *
 * GAP-003 lives here: the EU/UK 14-day right to change your mind on a distance contract cannot be
 * contracted away, and the previous Terms tried to ("no partial-period refunds", 7-day window). The
 * waiver in the callout is the mechanism that lets a subscription start immediately without the 14
 * days becoming a free month — but it only works if the user genuinely asks for immediate access AND
 * is told they lose the right. Both halves must stay true in the product, not just on this page.
 */
import { H2, P, UL, DL, Note, type Themed } from '../legalUI';

export default function TermsBilling({ dm }: Themed) {
  return (
    <>
      <H2 dm={dm}>6. Billing, cancellation and refunds</H2>
      <UL dm={dm} items={[
        'Some features need a paid subscription. Fees are charged on the cycle shown at purchase and renew automatically until you cancel.',
        'You can cancel at any time from your account settings — you do not need to ask us, and there is no cancellation fee.',
        'Cancelling stops the next renewal. You keep access until the end of the period you have already paid for.',
        'We give at least 30 days notice before a price change affects you. If you do not want the new price, cancel before it takes effect.',
      ]} />

      <Note dm={dm}>
        <strong>If you are a consumer in the EU or UK, you have 14 days to change your mind</strong>{' '}
        after subscribing, without giving a reason, and get your money back. Nothing on this page
        removes that.
        <br /><br />
        There is one exception, and we will always tell you before it applies: if you ask us to start
        your subscription straight away, inside the 14 days, and you acknowledge at that moment that
        you lose the right to cancel once we have fully performed, then the right ends. If you have
        not asked for immediate access, the full 14 days remain yours.
        <br /><br />
        To use it, email <strong>support@tradeandjournal.com</strong> with your account email and a
        clear statement that you want to cancel — no form needed. We refund to the same payment
        method within 14 days of being told.
      </Note>

      <DL dm={dm} items={[
        ['Billing errors.', 'Charged twice, charged after cancelling, or charged the wrong amount — we refund it in full. There is no time limit on our own mistake.'],
        ['Service failure.', 'If a paid feature was unavailable for a meaningful stretch of your billing period, tell us and we will refund a fair proportion.'],
        ['Change of mind later on.', 'Outside the 14 days we do not usually refund part-used periods, but we would rather hear from you than not — ask.'],
      ]} />

      <Note dm={dm} tone="warn">
        <strong>Trading losses are never refundable, in any circumstances.</strong> That includes
        money lost on trades you placed yourself, trades copied automatically from a provider you
        chose, and trades taken after reading a published signal. This is a software subscription. We
        do not hold your money, we do not guarantee outcomes, and we do not compensate market losses.
      </Note>
    </>
  );
}

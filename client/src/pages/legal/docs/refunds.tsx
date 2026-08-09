/** Cancellation & Refunds.
 *
 * New page, 2026-08-08 (gap GAP-003). The old Terms said "no partial-period refunds" and limited
 * refunds to billing errors raised within 7 days. Users are global, so EU/UK consumers are in scope
 * and their 14-day right to change their mind on a distance contract cannot be contracted away.
 *
 * The waiver in section 2 is the mechanism that lets a subscription start immediately without the
 * 14 days becoming a free month — but it only works if the user genuinely asks for immediate access
 * and is told they lose the right. Both halves must stay true in the product, not just on this page.
 */
import { H2, P, UL, DL, Note, type Themed } from '../legalUI';

export default function Refunds({ dm }: Themed) {
  return (
    <>
      <H2 dm={dm}>1. Cancelling a subscription</H2>
      <UL dm={dm} items={[
        'You can cancel at any time from your account settings — you do not need to ask us.',
        'Cancelling stops the next renewal. You keep access until the end of the period you have already paid for.',
        'We do not charge a cancellation fee.',
      ]} />

      <H2 dm={dm}>2. If you are a consumer in the EU or UK: 14 days to change your mind</H2>
      <P dm={dm}>
        You have the right to cancel within 14 days of subscribing, without giving a reason, and get
        your money back. This is your legal right and nothing on this page removes it.
      </P>
      <Note dm={dm}>
        <strong>One exception, and we will always tell you before it applies.</strong> If you ask us
        to start your subscription straight away — inside the 14 days — and you acknowledge at that
        moment that you lose the right to cancel once we have fully performed, then that right ends.
        If you have not asked for immediate access, the full 14 days remain yours.
      </Note>
      <P dm={dm}>
        To use the right, email <strong>support@tradeandjournal.com</strong> with your account email
        and the words "I want to cancel". A clear statement is enough; you do not need a form. We
        refund using the same payment method within 14 days of being told.
      </P>

      <H2 dm={dm}>3. Refunds outside the 14-day right</H2>
      <DL dm={dm} items={[
        ['Billing errors.', 'Charged twice, charged after cancelling, or charged the wrong amount — we refund it in full. Tell us whenever you notice; there is no time limit on our own mistake.'],
        ['Service failure.', 'If a paid feature was unavailable for a meaningful stretch of your billing period, tell us and we will refund a fair proportion.'],
        ['Change of mind later on.', 'Outside the 14 days we do not usually refund part-used periods, but we would rather hear from you than not — ask.'],
      ]} />

      <H2 dm={dm}>4. What we will never refund</H2>
      <Note dm={dm} tone="warn">
        <strong>Trading losses are not refundable, in any circumstances.</strong> That includes money
        lost on trades you placed yourself, trades copied automatically from a provider you chose,
        and trades taken after reading a published signal. We are a software subscription. We do not
        hold your money, we do not guarantee outcomes, and we do not compensate market losses. See
        the Risk Disclosure.
      </Note>

      <H2 dm={dm}>5. Price changes</H2>
      <P dm={dm}>
        We give at least 30 days notice before a price change affects you. If you do not want to pay
        the new price, cancel before it takes effect and you will not be charged it.
      </P>

      <H2 dm={dm}>6. How to reach us</H2>
      <P dm={dm}>
        Billing and refunds: <strong>support@tradeandjournal.com</strong>. If you are unhappy with
        the answer, our Complaints procedure sets out what happens next.
      </P>
    </>
  );
}

/** Terms of Service, sections 9–14 — the machinery that governs disputes rather than the deal.
 *
 * Split out of terms.tsx purely to hold the 150-line-per-file rule. It is one continuous document
 * for the reader; the numbering carries straight on from section 8.
 *
 * Section 12 is the fix for GAP-001: the previous Terms said disputes were "governed by applicable
 * law" and went to "a mutually agreed arbitration body" — no law, no institution, no seat, no rules,
 * which is close to inoperative. English law is named because it is the most widely accepted choice
 * for cross-border consumer software and it matches the recommended UK entity.
 *
 * The consumer carve-outs in 9 and 12 are not decoration. Without them, an unlimited exclusion
 * against a consumer risks the whole clause being struck out rather than merely read down — which
 * would leave no cap at all.
 */
import { H2, P, Note, type Themed } from '../legalUI';

export default function TermsBoilerplate({ dm }: Themed) {
  return (
    <>
      <H2 dm={dm}>9. When things go wrong — the limits of our liability</H2>
      <Note dm={dm}>
        Nothing in these terms limits liability that the law does not allow to be limited. That
        includes death or personal injury caused by our negligence, and fraud or fraudulent
        misrepresentation. If you are a consumer, you keep every right your local law gives you, and
        nothing here takes those away.
      </Note>
      <P dm={dm}>
        Subject to that, and to the fullest extent the law allows: we are not liable for trading
        losses, lost profits, lost opportunity, or loss of data; and our total liability for all
        claims in any twelve-month period is limited to the fees you paid us in that period, or USD
        100 if that is greater. We provide software; we do not underwrite market outcomes.
      </P>

      <H2 dm={dm}>10. Availability and changes to the service</H2>
      <P dm={dm}>
        We aim for high availability but do not guarantee uninterrupted access, and we may change,
        suspend or withdraw features. Where a change materially affects a paid feature you rely on,
        we give at least 30 days notice. We are not liable for delays or failures caused by events
        outside our reasonable control, including outages at brokers, data providers, hosting
        providers or networks.
      </P>

      <H2 dm={dm}>11. Ending the agreement</H2>
      <P dm={dm}>
        You can close your account at any time by emailing support@tradeandjournal.com with the
        subject "Account Deletion". We export your data for you first, then remove or anonymise it
        within 90 days, keeping only what the law requires us to keep. We may suspend or close an
        account that breaches these terms or is used fraudulently, and where it is reasonable to do
        so we will tell you why.
      </P>

      <H2 dm={dm}>12. Governing law and disputes</H2>
      <P dm={dm}>
        These terms, and any dispute arising out of them, are governed by <strong>English law</strong>,
        and the courts of <strong>England and Wales</strong> have jurisdiction.
      </P>
      <Note dm={dm}>
        <strong>If you are a consumer, this does not cut down your rights.</strong> You keep the
        protection of the mandatory law of the country you live in, and you may bring proceedings
        there. Before going to court, please use our Complaints procedure — most problems are faster
        to fix that way.
      </Note>

      <H2 dm={dm}>13. Changes to these terms</H2>
      <P dm={dm}>
        We may update these terms. For changes that materially affect you we will give at least 14
        days notice on the platform before they take effect and update the date at the top. If you
        do not accept a change, stop using the platform and cancel before it takes effect.
      </P>

      <H2 dm={dm}>14. Contact</H2>
      <P dm={dm}>
        Legal: <strong>legal@tradeandjournal.com</strong> · Support:{' '}
        <strong>support@tradeandjournal.com</strong>
      </P>
    </>
  );
}

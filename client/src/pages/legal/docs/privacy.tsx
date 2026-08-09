/** Privacy Policy.
 *
 * Rewritten 2026-08-08. Two substantive additions over the old version (gap GAP-006):
 *   - KENYA. The old policy addressed GDPR only. The service is operated from Kenya, which has its
 *     own regime (Data Protection Act 2019) with its own regulator. It sits ALONGSIDE GDPR.
 *   - BROKER CREDENTIALS. The old policy never mentioned them. They are the most sensitive thing
 *     the platform holds and needed saying out loud.
 */
import { H1, H2, P, UL, DL, Note, Stamp, type Themed } from '../legalUI';

export default function Privacy({ dm }: Themed) {
  return (
    <>
      <H1 dm={dm}>Privacy Policy</H1>
      <Stamp dm={dm}>Last updated 8 August 2026 · What we collect, why, and what you can demand of us</Stamp>

      <Note dm={dm}>
        <strong>The short version.</strong> We collect what we need to run your journal and the
        features you switch on. We do not sell your data. We never sell or share your individual
        trading history. You can export everything, and you can have it all deleted.
      </Note>

      <H2 dm={dm}>1. Who is responsible for your data</H2>
      <P dm={dm}>
        Trade &amp; Journal decides how and why your personal data is used — in data protection
        language, we are the <em>controller</em>. The operating entity is being registered and its
        details will be published in the Legal Notice. The service is operated from Kenya. For
        anything about your data, email <strong>legal@tradeandjournal.com</strong>.
      </P>

      <H2 dm={dm}>2. What we collect</H2>
      <DL dm={dm} items={[
        ['Account details.', 'Email address, and any name or profile information you choose to add.'],
        ['What you put in the journal.', 'Trades, notes, screenshots, tags and psychological reflections. This is your content and it can be revealing — treat it as you would a private diary.'],
        ['Broker connection details.', 'If you connect a broker account, we store the credentials or access tokens needed to operate the features you enabled. They are held encrypted and used for nothing else.'],
        ['Copy trading activity.', 'If you follow a provider, or list yourself as one, we record the settings and the resulting trade activity, because the feature cannot work otherwise.'],
        ['Payment information.', 'Handled by our payment provider. We receive confirmation and subscription status — we never see or store your full card number.'],
        ['Technical data.', 'IP address, device and browser information, and log data, collected to keep the service running and secure.'],
      ]} />

      <H2 dm={dm}>3. Why we are allowed to use it</H2>
      <P dm={dm}>
        Under the UK/EU GDPR we must have a lawful basis for each use. Ours are:
      </P>
      <UL dm={dm} items={[
        'To perform our contract with you — running your account, the journal, and any feature you enabled.',
        'Our legitimate interests — keeping the platform secure, preventing abuse, and improving it, balanced against your rights.',
        'Your consent — for non-essential cookies and for marketing email. You can withdraw it at any time.',
        'Legal obligation — where a law requires us to keep or disclose something.',
      ]} />
      <P dm={dm}>
        Kenya's Data Protection Act 2019 applies to us as well, because the service is operated from
        Kenya. It gives comparable rights, and where the two regimes differ we apply whichever is
        stronger for you.
      </P>

      <H2 dm={dm}>4. Who we share it with</H2>
      <P dm={dm}>
        <strong>We do not sell your data, and we never share your individual trading history.</strong>{' '}
        We use service providers who process data on our instructions only: hosting and database
        providers, our payment processor, our email provider, our AI provider for the analysis
        features you invoke, and Telegram if you opt into notifications. We also disclose data where
        the law compels it.
      </P>

      <H2 dm={dm}>5. Sending data abroad</H2>
      <P dm={dm}>
        Our providers operate internationally, so your data may be processed outside your country,
        including outside the EEA, the UK and Kenya. Where that happens we rely on the appropriate
        safeguards those laws require, such as standard contractual clauses.
      </P>

      <H2 dm={dm}>6. How long we keep it</H2>
      <UL dm={dm} items={[
        'Journal and account data — while your account is open.',
        'After you delete your account — removed or anonymised within 90 days, except where we must keep records (for example tax or fraud prevention).',
        'Broker credentials — deleted as soon as you disconnect the account.',
        'Logs — typically 90 days.',
      ]} />

      <H2 dm={dm}>7. Your rights</H2>
      <P dm={dm}>You can ask us to:</P>
      <UL dm={dm} items={[
        'Give you a copy of your data, or export it in a portable format.',
        'Correct anything inaccurate.',
        'Delete your data ("the right to be forgotten").',
        'Restrict or object to a particular use, including profiling.',
        'Withdraw consent you previously gave.',
      ]} />
      <P dm={dm}>
        Email <strong>legal@tradeandjournal.com</strong>. We reply within 30 days and we do not charge.
      </P>
      <Note dm={dm}>
        <strong>If we get it wrong, complain about us.</strong> In the EU, to your national data
        protection authority. In the UK, to the Information Commissioner's Office. In Kenya, to the
        Office of the Data Protection Commissioner. You can go to them directly — you do not have to
        come to us first, though we would like the chance to fix it.
      </Note>

      <H2 dm={dm}>8. Security</H2>
      <P dm={dm}>
        Data is encrypted in transit and at rest, access is restricted, and credentials are stored
        encrypted. No system is perfectly secure, so use a strong unique password and tell us at once
        if you suspect a problem. If a breach puts you at serious risk, we will tell you and the
        relevant regulator as the law requires.
      </P>

      <H2 dm={dm}>9. Children</H2>
      <P dm={dm}>
        The platform is not for anyone under 18. We do not knowingly collect children's data, and we
        delete it if we discover it.
      </P>

      <H2 dm={dm}>10. Changes</H2>
      <P dm={dm}>
        We will post material changes here at least 14 days before they take effect and update the
        date above.
      </P>
    </>
  );
}

/** Legal Notice (provider identification) + Complaints.
 *
 * New page, 2026-08-08 (gaps GAP-005 and GAP-010). Nothing on the site identified who operates it —
 * no entity, no address, no responsible person, no complaints route.
 *
 * The entity is NOT YET REGISTERED. The honest pattern — and the one on the reference page the user
 * supplied — is to say exactly that, name the fields that are coming, and give a contact that works
 * today. Inventing an address would be worse than admitting the registration is in progress.
 *
 * WHEN REGISTRATION COMPLETES: fill the fields in section 1 and delete the pending note. That is the
 * only edit this page should ever need.
 */
import { H2, P, DL, UL, Note, type Themed } from '../legalUI';

export default function Notice({ dm }: Themed) {
  return (
    <>
      <H2 dm={dm}>1. Who operates this service</H2>
      <P dm={dm}>Trade &amp; Journal is operated by:</P>
      <DL dm={dm} items={[
        ['Legal entity name and form:', 'the business is completing its registration. The full registered name and legal form will be published here at that time.'],
        ['Registered office:', 'the postal address will be published here as part of completing registration. In the meantime the email addresses below are monitored and are the fastest way to reach us.'],
        ['Company register and number:', 'the register entry and number will be published here once registration completes.'],
        ['Tax / VAT registration number:', 'will be published here once registration completes, if and when the business is registered for VAT.'],
        ['Person responsible for this service and its content:', 'the founder. The name will be published here as part of completing registration.'],
        ['Operating location:', 'the service is operated from Kenya.'],
      ]} />

      <Note dm={dm}>
        <strong>Why this page reads like this.</strong> We would rather tell you that registration is
        in progress than publish a placeholder address that is not real. Every field above will be
        completed here as soon as it exists. If you need to reach a person before then, email{' '}
        <strong>legal@tradeandjournal.com</strong> — it is monitored.
      </Note>

      <H2 dm={dm}>2. Regulatory status</H2>
      <Note dm={dm} tone="warn">
        <strong>We are not authorised or regulated as a financial services firm anywhere.</strong> We
        do not hold, and do not claim to hold, any licence, authorisation or registration to give
        investment advice, manage investments, arrange deals or broker trades. We provide software.
        We never hold client money — your funds stay with your own broker. If you want advice, use a
        firm licensed where you live.
      </Note>

      <H2 dm={dm}>3. Contact</H2>
      <UL dm={dm} items={[
        <>Legal, privacy and data protection: <strong>legal@tradeandjournal.com</strong></>,
        <>Support, billing and everything else: <strong>support@tradeandjournal.com</strong></>,
        'We aim to reply within 24–48 hours, Monday to Friday.',
      ]} />

      <H2 dm={dm}>4. Complaints</H2>
      <P dm={dm}>
        If something has gone wrong, tell us first — it is almost always the fastest way to fix it.
      </P>
      <DL dm={dm} items={[
        ['Step 1 — tell us.', 'Email support@tradeandjournal.com with what happened, when, and what you would like us to do. We acknowledge within 2 working days.'],
        ['Step 2 — we investigate.', 'We aim to give you a substantive answer within 15 working days. If we need longer we will tell you why and when to expect one, and in any event we will reply within 35 working days.'],
        ['Step 3 — if you are still unhappy.', 'Ask for the matter to be escalated and it goes to the founder for a final written answer.'],
      ]} />
      <P dm={dm}>
        <strong>If you are a consumer in the EU:</strong> you may also use the European Commission's
        online dispute resolution platform. <strong>Wherever you live,</strong> complaining to us does
        not affect your right to bring a claim in your local courts, or to complain to your local
        consumer or data protection authority.
      </P>

      <H2 dm={dm}>5. Data protection contact</H2>
      <P dm={dm}>
        For anything about your personal data — access, deletion, correction, or a complaint about how
        we handled it — email <strong>legal@tradeandjournal.com</strong>. Your rights, and the
        regulators you can complain to, are set out in the Privacy Policy.
      </P>
    </>
  );
}

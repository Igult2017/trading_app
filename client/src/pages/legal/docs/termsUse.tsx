/** Terms section 7 — acceptable use.
 *
 * Was its own document until 2026-08-08; merged into the Terms when the seven legal pages became
 * four. Substance unchanged.
 *
 * The rules about misleading other users are the ones that matter here and they are not boilerplate:
 * on a platform where one person's trades can move another person's money, a false performance
 * record costs someone else real money. The old acceptable-use list said nothing about either that
 * or posing as licensed.
 */
import { H2, P, UL, DL, Note, type Themed } from '../legalUI';

export default function TermsUse({ dm }: Themed) {
  return (
    <>
      <H2 dm={dm}>7. Acceptable use</H2>
      <P dm={dm}>
        These rules keep the platform safe to use. Breaking them can get your account suspended or
        closed.
      </P>

      <P dm={dm}><strong>Do not attack or abuse the platform.</strong></P>
      <UL dm={dm} items={[
        'Do not try to access any system, account or data that is not yours.',
        'Do not upload malware or anything designed to cause harm.',
        'Do not scrape or bulk-extract data without our written permission.',
        'Do not reverse-engineer, decompile or disassemble any part of the platform.',
        'Do not resell, sublicense or rent access, and do not overload or interfere with the service.',
      ]} />

      <Note dm={dm} tone="warn">
        The rules below matter most. Where one person's trades can move another person's money, a lie
        about performance is not a small thing.
      </Note>
      <DL dm={dm} items={[
        ['Do not falsify performance.', 'Do not manipulate, misrepresent or selectively present results on an account you list, and do not trade in a way designed to flatter the figures rather than to make money.'],
        ['Do not present yourself as licensed.', 'Do not claim, imply or hint that you are regulated, authorised or licensed to advise or manage money unless you genuinely are and can prove it.'],
        ['Do not give personal advice through the platform.', 'You may describe what you are doing and why. Do not tell another user what they personally should do with their money.'],
        ['Do not solicit off-platform.', 'Do not use the platform to recruit users into managed accounts, funds, signal groups or investment schemes elsewhere.'],
      ]} />

      <P dm={dm}><strong>Do not break the law with it.</strong></P>
      <UL dm={dm} items={[
        'No market manipulation, insider dealing, fraud or money laundering.',
        'Do not use the platform where the activities it offers are unlawful for you.',
        'Do not infringe anyone else\'s intellectual property or privacy.',
      ]} />

      <P dm={dm}>
        Depending on severity we may warn you, remove content, delist a provider account, suspend
        features or close the account, and where it is serious or unlawful we may report it. Report
        abuse to <strong>support@tradeandjournal.com</strong>.
      </P>
    </>
  );
}

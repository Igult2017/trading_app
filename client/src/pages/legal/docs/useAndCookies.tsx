/** Acceptable Use + Cookies — two short documents in one file, because neither justifies its own
 * page and the 150-line limit is per file, not per document.
 *
 * Acceptable Use rewritten 2026-08-08 with the rules that matter for THIS product: a marketplace
 * where one user's trades move another user's money. Publishing false performance or posing as
 * licensed harms other users directly, and the old list said nothing about either.
 *
 * Cookies: GAP-007. Whether a consent banner exists in the product is UNVERIFIED — the wording
 * below describes categories without asserting that a banner is live. If a banner is added, say so
 * here explicitly.
 */
import { H1, H2, P, UL, DL, Note, Stamp, type Themed } from '../legalUI';

export function AcceptableUse({ dm }: Themed) {
  return (
    <>
      <H1 dm={dm}>Acceptable Use</H1>
      <Stamp dm={dm}>Last updated 8 August 2026</Stamp>

      <P dm={dm}>
        These rules exist so the platform stays safe to use. Breaking them can get your account
        suspended or closed.
      </P>

      <H2 dm={dm}>1. Do not attack or abuse the platform</H2>
      <UL dm={dm} items={[
        'Do not try to access any system, account or data that is not yours.',
        'Do not upload malware or anything designed to cause harm.',
        'Do not scrape or bulk-extract data without our written permission.',
        'Do not reverse-engineer, decompile or disassemble any part of the platform.',
        'Do not resell, sublicense or rent access to the platform.',
        'Do not overload the service or interfere with anyone else\'s use of it.',
      ]} />

      <H2 dm={dm}>2. Do not mislead other users</H2>
      <Note dm={dm} tone="warn">
        These matter most. On a platform where one person's trades can move another person's money,
        a lie about performance is not a small thing — it costs someone else real money.
      </Note>
      <DL dm={dm} items={[
        ['Do not falsify performance.', 'Do not manipulate, misrepresent or selectively present results on an account you list, and do not trade in a way designed to flatter the figures rather than to make money.'],
        ['Do not present yourself as licensed.', 'Do not claim, imply or hint that you are regulated, authorised or licensed to advise or manage money unless you genuinely are and can prove it.'],
        ['Do not give personal advice through the platform.', 'You may describe what you are doing and why. Do not tell another user what they personally should do with their money.'],
        ['Do not solicit off-platform.', 'Do not use the platform to recruit users into managed accounts, funds, signal groups or investment schemes elsewhere.'],
      ]} />

      <H2 dm={dm}>3. Do not break the law with it</H2>
      <UL dm={dm} items={[
        'No market manipulation, insider dealing, fraud or money laundering.',
        'Do not use the platform where the activities it offers are unlawful for you.',
        'Do not infringe anyone else\'s intellectual property or privacy.',
      ]} />

      <H2 dm={dm}>4. What happens if you break these rules</H2>
      <P dm={dm}>
        Depending on severity we may warn you, remove content, delist a provider account, suspend
        features, or close the account. Where it is serious or unlawful we may report it. Where it is
        reasonable to do so we will tell you what happened and why. Report abuse to{' '}
        <strong>support@tradeandjournal.com</strong>.
      </P>
    </>
  );
}

export function Cookies({ dm }: Themed) {
  return (
    <>
      <H1 dm={dm}>Cookie Policy</H1>
      <Stamp dm={dm}>Last updated 8 August 2026</Stamp>

      <P dm={dm}>
        Cookies are small files stored by your browser. We use as few as we can, in three categories.
      </P>

      <DL dm={dm} items={[
        ['Strictly necessary.', 'Keep you signed in, keep your session secure, and remember settings like your theme. The service cannot work without them, so they do not require consent.'],
        ['Analytics.', 'Help us understand which features are used so we can improve them. These are optional and only set with your consent.'],
        ['Preferences.', 'Remember choices you have made, such as language. Optional.'],
      ]} />

      <Note dm={dm}>
        <strong>We do not use advertising cookies</strong> and we do not sell or share cookie data
        with advertisers.
      </Note>

      <H2 dm={dm}>Your choices</H2>
      <UL dm={dm} items={[
        'Where we ask for consent to optional cookies, you can decline and keep using the platform.',
        'You can withdraw consent at any time by clearing cookies in your browser.',
        'Every browser lets you block or delete cookies in its settings — blocking the strictly necessary ones will stop you being able to sign in.',
      ]} />

      <P dm={dm}>
        Questions: <strong>legal@tradeandjournal.com</strong>. How cookie data relates to your
        personal data is covered in the Privacy Policy.
      </P>
    </>
  );
}

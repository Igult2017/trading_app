/** The document register — title, dates, and the standing intro for every legal page.
 *
 * MERGED 2026-08-08 from seven documents to four, at the user's request ("combine some of these
 * pages into one using &. They are too many unnecessarily"). Nothing was deleted — Cancellation &
 * Refunds and Acceptable Use became numbered sections of the Terms, and the Cookie Policy became a
 * section of the Privacy Policy. Old links still work: see LEGACY in LegalPage.tsx.
 *
 * Risk & No Advice deliberately stays on its own. It is the page a regulator or a complaining user
 * reads first, and burying it inside the Terms would be the one merge that costs something.
 *
 * Layout follows the reference page supplied 2026-08-08: title, bold subtitle, an effective/reviewed/
 * version line, a scope paragraph that cross-links the sibling documents, then a rule.
 */
export const ORG = 'Trade & Journal — Trading Journal & Copy-Trading Platform';
export const EFFECTIVE = '8 August 2026';
export const REVIEWED  = '8 August 2026';
export const VERSION   = '3.0';

export interface DocMeta {
  param: string;
  label: string;      // short name, used in cross-links and the footer
  title: string;      // the H1
  intro: string;      // scope paragraph; sibling links are appended after it
}

export const DOCS: DocMeta[] = [
  {
    param: 'terms',
    label: 'Terms & Conditions',
    title: 'Terms & Conditions',
    intro:
      'These terms form the contract between you and us when you use the platform, and they cover ' +
      'what the service does, what you may and may not do with it, how billing and refunds work, ' +
      'and who is liable for what. They apply to users in the European Union, the United Kingdom, ' +
      'the United States and elsewhere, and are published in English as the governing-language ' +
      'version; where a translation is offered it is for convenience and the English version ' +
      'controls in the event of conflict.',
  },
  {
    param: 'risk',
    label: 'Risk & No Advice',
    title: 'Risk Disclosure & No Advice',
    intro:
      'This page explains the risks of what the platform offers and the limits of what we are. It ' +
      'applies to every user, everywhere, and should be read before you use the signals or the ' +
      'copy-trading features. Nothing on this platform is financial advice and we hold no financial ' +
      'services authorisation.',
  },
  {
    param: 'privacy',
    label: 'Privacy & Cookies',
    title: 'Privacy & Cookies',
    intro:
      'This page explains what personal data we collect, why we are allowed to use it, who we share ' +
      'it with, what we store on your device, and what you can demand of us. It covers users ' +
      'protected by the EU and UK GDPR and by the Kenya Data Protection Act 2019, and it applies ' +
      'wherever you are.',
  },
  {
    param: 'notice',
    label: 'Legal Notice & Complaints',
    title: 'Legal Notice & Complaints',
    intro:
      'This is the central legal notice and identification page for the platform. It states who ' +
      'operates the service, our regulatory status, how to reach a person, and how to complain if ' +
      'something has gone wrong.',
  },
];

export const docByParam = (p: string) => DOCS.find(d => d.param === p) ?? DOCS[0];

/** The document register — title, dates, and the standing intro for every legal page.
 *
 * Kept in ONE file so a version bump or a date change is a single edit, and so DocHeader can render
 * the cross-links without importing LegalPage (which would be a circular import).
 *
 * Layout follows the reference page supplied 2026-08-08: title, bold subtitle, an effective/reviewed/
 * version line, a scope paragraph that cross-links the sibling documents, then a rule.
 */
export const ORG = 'Trade & Journal — Trading Journal & Copy-Trading Platform';
export const EFFECTIVE = '8 August 2026';
export const REVIEWED  = '8 August 2026';
export const VERSION   = '2.0';

export interface DocMeta {
  param: string;
  label: string;      // short name, used in cross-links
  title: string;      // the H1
  intro: string;      // scope paragraph; sibling links are appended after it
}

export const DOCS: DocMeta[] = [
  {
    param: 'terms',
    label: 'Terms of Service',
    title: 'Terms of Service',
    intro:
      'These terms form the contract between you and us when you use the platform. They apply to ' +
      'users in the European Union, the United Kingdom, the United States and elsewhere. They are ' +
      'published in English as the governing-language version; where a translation is offered it is ' +
      'for convenience, and the English version controls in the event of conflict.',
  },
  {
    param: 'risk',
    label: 'Risk & No Advice',
    title: 'Risk Disclosure & No Advice',
    intro:
      'This page explains the risks of what the platform offers and the limits of what we are. It ' +
      'applies to every user, everywhere, and it should be read before you use the signals or the ' +
      'copy-trading features. Nothing on this platform is financial advice and we hold no financial ' +
      'services authorisation.',
  },
  {
    param: 'privacy',
    label: 'Privacy Policy',
    title: 'Privacy Policy',
    intro:
      'This page explains what personal data we collect, why we are allowed to use it, who we share ' +
      'it with, and what you can demand of us. It covers users protected by the EU and UK GDPR and ' +
      'by the Kenya Data Protection Act 2019, and it applies wherever you are.',
  },
  {
    param: 'cookies',
    label: 'Cookie Policy',
    title: 'Cookie Policy',
    intro:
      'This page explains which cookies the platform sets, what each category is for, and how to ' +
      'refuse the ones that are optional. How cookie data relates to your personal data is covered ' +
      'in the Privacy Policy.',
  },
  {
    param: 'refunds',
    label: 'Cancellation & Refunds',
    title: 'Cancellation & Refunds',
    intro:
      'This page explains how to cancel a subscription, when you are entitled to your money back, ' +
      'and the one thing we will never refund. If you are a consumer in the EU or UK it also sets ' +
      'out your 14-day right to change your mind, which nothing on this page removes.',
  },
  {
    param: 'use',
    label: 'Acceptable Use',
    title: 'Acceptable Use',
    intro:
      'These rules exist so the platform stays safe to use — particularly for users whose money can ' +
      'be moved by another user through copy trading. Breaking them can get an account suspended or ' +
      'closed.',
  },
  {
    param: 'notice',
    label: 'Legal Notice',
    title: 'Legal Notice & Complaints',
    intro:
      'This is the central legal notice and identification page for the platform. It states who ' +
      'operates the service, our regulatory status, how to reach a person, and how to complain if ' +
      'something has gone wrong.',
  },
];

export const docByParam = (p: string) => DOCS.find(d => d.param === p) ?? DOCS[0];

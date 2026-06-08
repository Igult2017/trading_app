import { Resend } from 'resend';

const client = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM   = process.env.RESEND_FROM_EMAIL ?? 'noreply@fsdzones.cloud';

export function isEmailConfigured(): boolean {
  return client !== null;
}

export interface CampaignEmailOpts {
  to: string;
  subject: string;
  message: string;
  trackingToken: string;
  baseUrl: string;
}

export async function sendCampaignEmail(opts: CampaignEmailOpts): Promise<void> {
  if (!client) throw new Error('RESEND_API_KEY is not configured');

  const pixelUrl = `${opts.baseUrl}/api/track/email-open/${opts.trackingToken}`;

  await client.emails.send({
    from: FROM,
    to:   opts.to,
    subject: opts.subject || 'Announcement',
    html: buildHtml(opts.subject, opts.message, pixelUrl),
  });
}

function buildHtml(subject: string, body: string, pixelUrl: string): string {
  const safe = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
  <h2 style="margin-top:0">${subject}</h2>
  <p style="line-height:1.6">${safe}</p>
  <img src="${pixelUrl}" width="1" height="1" style="display:block;opacity:0" alt="" />
</body>
</html>`;
}

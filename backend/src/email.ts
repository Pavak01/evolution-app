// Transactional email via Resend's REST API (no SDK). Sends from the
// subdomain already verified in Resend (DKIM + return-path on
// mail.aplccommodities.com); replies go to the real support mailbox.
const DEFAULT_FROM = "Evolution <no-reply@mail.aplccommodities.com>";
const REPLY_TO = "support@aplccommodities.com";

export async function sendEmail({ to, subject, text, html }: { to: string; subject: string; text: string; html: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Only until RESEND_API_KEY is set on the service — lets sign-up be
    // tested end to end before then. Never reached once the key exists.
    console.warn(`[email not configured] RESEND_API_KEY missing — would have sent "${subject}" to ${to}:\n${text}`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || DEFAULT_FROM, to: [to], reply_to: REPLY_TO, subject, text, html })
  });
  if (!response.ok) {
    throw new Error(`Resend rejected the email (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
}

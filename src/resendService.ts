import type { DatabaseSync } from 'node:sqlite';
import { escapeHtml } from './html';
import { buildKatiaEmailBrandHeader } from './logo';

export type EmailProvider = 'resend' | 'gmail';

export interface ResendSettings {
  provider: EmailProvider;
  resendApiKey: string;
  resendFromEmail: string;
  senderName: string;
}

export interface ResendStatus {
  configured: boolean;
  fromEmail?: string;
  senderName?: string;
  provider: EmailProvider;
}

export interface ResendAttachment {
  filename: string;
  content: string; // base64 encoded
}

export interface ResendSendOptions {
  apiKey: string;
  fromEmail: string;
  senderName?: string;
  toEmail: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  attachments?: ResendAttachment[];
}

function readSetting(db: DatabaseSync, key: string): string | null {
  const row = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function getResendSettings(db: DatabaseSync): ResendSettings {
  const provider = (readSetting(db, 'email_provider') ??
    'resend') as EmailProvider;
  return {
    provider: provider === 'gmail' ? 'gmail' : 'resend',
    resendApiKey: readSetting(db, 'resend_api_key') ?? '',
    resendFromEmail: readSetting(db, 'resend_from_email') ?? '',
    senderName:
      readSetting(db, 'email_sender_name') ?? 'Katia Auto Sales & Repairs',
  };
}

export function saveResendSettings(
  settings: Partial<ResendSettings>,
  db: DatabaseSync,
): ResendSettings {
  const current = getResendSettings(db);
  const updated: ResendSettings = {
    provider: settings.provider ?? current.provider,
    resendApiKey: (settings.resendApiKey !== undefined
      ? settings.resendApiKey
      : current.resendApiKey
    ).trim(),
    resendFromEmail: (settings.resendFromEmail !== undefined
      ? settings.resendFromEmail
      : current.resendFromEmail
    ).trim(),
    senderName:
      (settings.senderName !== undefined
        ? settings.senderName
        : current.senderName
      ).trim() || 'Katia Auto Sales & Repairs',
  };

  db.exec('BEGIN IMMEDIATE;');
  try {
    const upsert = db.prepare(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    );
    upsert.run('email_provider', updated.provider);
    upsert.run('resend_api_key', updated.resendApiKey);
    upsert.run('resend_from_email', updated.resendFromEmail);
    upsert.run('email_sender_name', updated.senderName);
    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }

  return updated;
}

export function getResendStatus(db: DatabaseSync): ResendStatus {
  const settings = getResendSettings(db);
  const configured = Boolean(
    settings.resendApiKey.trim() && settings.resendFromEmail.trim(),
  );

  return {
    configured,
    fromEmail: settings.resendFromEmail.trim() || undefined,
    senderName: settings.senderName.trim() || undefined,
    provider: settings.provider,
  };
}

/**
 * Sends an email using the Resend REST API (POST https://api.resend.com/emails).
 * Uses standard Node.js / Electron fetch — zero extra npm dependencies.
 */
export async function sendResendDelivery(
  options: ResendSendOptions,
): Promise<{ id: string }> {
  const apiKey = options.apiKey.trim();
  const fromEmail = options.fromEmail.trim();
  const toEmail = options.toEmail.trim();

  if (!apiKey) {
    throw new Error(
      'Resend API key is missing. Please enter your API key in Settings.',
    );
  }
  if (!fromEmail) {
    throw new Error(
      'Resend sender email is missing. Please enter your sender email in Settings.',
    );
  }
  if (!toEmail) {
    throw new Error('Recipient email address is required.');
  }

  const from = options.senderName?.trim()
    ? `${options.senderName.trim()} <${fromEmail}>`
    : fromEmail;

  const payload: Record<string, unknown> = {
    from,
    to: [toEmail],
    subject: options.subject,
    html: options.htmlBody,
  };

  if (options.textBody) {
    payload.text = options.textBody;
  }

  if (options.attachments && options.attachments.length > 0) {
    payload.attachments = options.attachments.map((att) => ({
      filename: att.filename,
      content: att.content,
    }));
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as {
    id?: string;
    message?: string;
    name?: string;
    statusCode?: number;
  };

  if (!response.ok || !data.id) {
    const errorMsg =
      data.message ||
      `Resend delivery failed with HTTP status ${response.status} (${data.name || 'Error'})`;
    throw new Error(errorMsg);
  }

  return { id: data.id };
}

/**
 * Dispatches a test email via Resend to verify API key and domain configuration.
 */
export async function sendResendTestEmail(
  recipientEmail: string,
  db: DatabaseSync,
): Promise<{ success: boolean; messageId: string }> {
  if (!recipientEmail?.trim()) {
    throw new Error('Please enter a recipient email address for the test.');
  }

  const settings = getResendSettings(db);
  if (!settings.resendApiKey.trim()) {
    throw new Error(
      'Resend API key is not configured. Please enter it in Settings.',
    );
  }
  if (!settings.resendFromEmail.trim()) {
    throw new Error(
      'Resend sender email is not configured. Please enter it in Settings.',
    );
  }

  const shopName = settings.senderName || 'Katia Auto Sales & Repairs';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; color: #1e293b;">
      ${buildKatiaEmailBrandHeader({
        shopName: shopName.toUpperCase(),
        subtitle: '1005 Rural St, Aurora, IL 60505 · Tel: (630) 907-7198',
      })}
      <div style="padding: 16px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; margin-bottom: 20px;">
        <strong style="color: #065f46; font-size: 15px;">✓ Resend Integration Active &amp; Verified</strong>
        <p style="margin: 6px 0 0; color: #047857; font-size: 13px; line-height: 1.4;">
          Your Resend API key and sender address are working properly. Customer repair orders and landscape PDF invoices can now be emailed directly.
        </p>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 8px 0; color: #64748b;">Delivery Service:</td>
          <td style="padding: 8px 0; color: #0f172a; font-weight: 600; text-align: right;">Resend Cloud API</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 8px 0; color: #64748b;">Authorized Sender:</td>
          <td style="padding: 8px 0; color: #0f172a; font-weight: 600; text-align: right;">${escapeHtml(settings.resendFromEmail)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b;">Delivered To:</td>
          <td style="padding: 8px 0; color: #0f172a; font-weight: 600; text-align: right;">${escapeHtml(recipientEmail.trim())}</td>
        </tr>
      </table>
      <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center;">
        ${escapeHtml(shopName)} · Automated Dispatch System
      </div>
    </div>
  `;

  const plainText = `
${shopName.toUpperCase()}
1005 Rural St, Aurora, IL 60505 | Tel: (630) 907-7198

Resend Integration Active & Verified

Your Resend API key and sender address are working properly.
- Delivery Service: Resend Cloud API
- Authorized Sender: ${settings.resendFromEmail}
- Delivered To: ${recipientEmail.trim()}
- Sent At: ${new Date().toLocaleString()}
  `.trim();

  const res = await sendResendDelivery({
    apiKey: settings.resendApiKey,
    fromEmail: settings.resendFromEmail,
    senderName: shopName,
    toEmail: recipientEmail.trim(),
    subject: `Test Email from ${shopName} (Resend)`,
    htmlBody: html,
    textBody: plainText,
  });

  return {
    success: true,
    messageId: res.id,
  };
}

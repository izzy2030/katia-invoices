import crypto from 'node:crypto';

export interface MimeAttachment {
  filename: string;
  contentType?: string;
  data: Buffer;
}

export interface MimeMessageOptions {
  fromEmail: string;
  fromName?: string;
  toEmail: string;
  toName?: string;
  subject: string;
  textBody?: string;
  htmlBody: string;
  attachments?: MimeAttachment[];
}

/**
 * Encodes a header value using RFC 2047 Base64 encoding if it contains
 * non-ASCII characters or special MIME tokens.
 */
export function encodeHeaderValue(value: string): string {
  // If purely ASCII without reserved characters, return as-is
  if (/^[\x20-\x7E]+$/.test(value) && !/[?=_"]/.test(value)) {
    return value;
  }
  const base64 = Buffer.from(value, 'utf8').toString('base64');
  return `=?UTF-8?B?${base64}?=`;
}

/**
 * Formats a display name and email address into a standard RFC 822 address header.
 * e.g. "Katia Auto Sales & Repairs" <katia@gmail.com>
 */
export function formatEmailAddress(email: string, name?: string): string {
  const cleanEmail = email.trim();
  if (!name || !name.trim()) {
    return cleanEmail;
  }
  const encodedName = encodeHeaderValue(name.trim());
  return `"${encodedName}" <${cleanEmail}>`;
}

/**
 * Wraps base64 text into 76-character chunks as recommended by RFC 2045.
 */
export function wrapBase64Lines(base64: string, lineLength = 76): string {
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += lineLength) {
    chunks.push(base64.substring(i, i + lineLength));
  }
  return chunks.join('\r\n');
}

/**
 * Converts a string or Buffer into a standard base64url string without padding,
 * which is the exact format required by the Gmail API `users.messages.send`.
 */
export function base64UrlEncode(data: string | Buffer): string {
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Strips HTML tags and normalizes whitespace to create a plain-text fallback
 * if no plain-text alternative was explicitly provided.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Constructs a fully compliant RFC 2822 / MIME message including:
 * - Recipient, sender, subject headers (RFC 2047 encoded)
 * - multipart/mixed envelope
 * - multipart/alternative inner section (plain-text + HTML)
 * - application/pdf or arbitrary attachments with base64 encoding
 */
export function buildGmailMimeMessage(options: MimeMessageOptions): string {
  const mixedBoundary = `====katia_mixed_${crypto.randomBytes(12).toString('hex')}====`;
  const altBoundary = `====katia_alt_${crypto.randomBytes(12).toString('hex')}====`;

  const from = formatEmailAddress(options.fromEmail, options.fromName);
  const to = formatEmailAddress(options.toEmail, options.toName);
  const subject = encodeHeaderValue(options.subject);
  const textBody = options.textBody ?? htmlToPlainText(options.htmlBody);

  const lines: string[] = [];

  // Top-level headers
  lines.push(`From: ${from}`);
  lines.push(`To: ${to}`);
  lines.push(`Subject: ${subject}`);
  lines.push('MIME-Version: 1.0');
  lines.push(`Date: ${new Date().toUTCString()}`);
  lines.push(`Message-ID: <${crypto.randomUUID()}@katia-body-shop.local>`);

  const hasAttachments = options.attachments && options.attachments.length > 0;

  if (hasAttachments) {
    lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
    lines.push('');
    lines.push(`--${mixedBoundary}`);
    lines.push(
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    );
    lines.push('');
  } else {
    lines.push(
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    );
    lines.push('');
  }

  // Plain-text alternative
  lines.push(`--${altBoundary}`);
  lines.push('Content-Type: text/plain; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(wrapBase64Lines(Buffer.from(textBody, 'utf8').toString('base64')));
  lines.push('');

  // HTML alternative
  lines.push(`--${altBoundary}`);
  lines.push('Content-Type: text/html; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(
    wrapBase64Lines(Buffer.from(options.htmlBody, 'utf8').toString('base64')),
  );
  lines.push('');

  // Close alternative part
  lines.push(`--${altBoundary}--`);

  // Attachments in multipart/mixed
  if (hasAttachments && options.attachments) {
    for (const attachment of options.attachments) {
      const contentType = attachment.contentType || 'application/pdf';
      const encodedFilename = encodeHeaderValue(attachment.filename);
      const base64Data = wrapBase64Lines(attachment.data.toString('base64'));

      lines.push('');
      lines.push(`--${mixedBoundary}`);
      lines.push(`Content-Type: ${contentType}; name="${encodedFilename}"`);
      lines.push('Content-Transfer-Encoding: base64');
      lines.push(
        `Content-Disposition: attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      );
      lines.push('');
      lines.push(base64Data);
    }

    // Close mixed part
    lines.push('');
    lines.push(`--${mixedBoundary}--`);
  }

  return lines.join('\r\n');
}

export type EmailProvider = 'gmail' | 'resend';

export type EmailRoute =
  | { kind: 'gmail'; senderDescription: string }
  | { kind: 'resend'; senderDescription: string }
  | { kind: 'none' };

export type ResendStatus = {
  configured: boolean;
  fromEmail?: string;
  senderName?: string;
  provider?: EmailProvider;
};

/**
 * Decides which delivery path can send an invoice right now.
 * Pure function: supports Gmail, Resend, and automatic fallback between them.
 */
export function resolveEmailRoute(
  gmail: { connected: boolean; email?: string } | null,
  resend?: ResendStatus | null,
  preferredProvider?: EmailProvider | null,
): EmailRoute {
  const isGmailReady = Boolean(gmail?.connected);
  const isResendReady = Boolean(resend?.configured);

  const gmailRoute: EmailRoute = {
    kind: 'gmail',
    senderDescription: gmail?.email
      ? `connected Gmail (${gmail.email})`
      : 'connected Gmail',
  };

  const resendRoute: EmailRoute = {
    kind: 'resend',
    senderDescription: resend?.fromEmail
      ? `Resend (${resend.fromEmail})`
      : 'Resend Cloud API',
  };

  // Explicit provider preference handling
  if (preferredProvider === 'resend') {
    if (isResendReady) return resendRoute;
    if (isGmailReady) return gmailRoute; // Fallback to Gmail
    return { kind: 'none' };
  }

  if (preferredProvider === 'gmail') {
    if (isGmailReady) return gmailRoute;
    if (isResendReady) return resendRoute; // Fallback to Resend
    return { kind: 'none' };
  }

  // If Resend settings indicate a preference
  if (resend?.provider === 'resend' && isResendReady) {
    return resendRoute;
  }
  if (resend?.provider === 'gmail' && isGmailReady) {
    return gmailRoute;
  }

  // Default readiness priority:
  if (isGmailReady) return gmailRoute;
  if (isResendReady) return resendRoute;
  return { kind: 'none' };
}

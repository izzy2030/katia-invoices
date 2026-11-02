export type EmailRoute =
  | { kind: 'gmail'; senderDescription: string }
  | { kind: 'none' };

/**
 * Decides which delivery path can send an invoice right now.
 * Kept pure so the post-save prompt cannot route on stale component state.
 */
export function resolveEmailRoute(
  gmail: { connected: boolean; email?: string } | null,
): EmailRoute {
  if (!gmail?.connected) return { kind: 'none' };
  return {
    kind: 'gmail',
    senderDescription: gmail.email
      ? `connected Gmail (${gmail.email})`
      : 'connected Gmail',
  };
}

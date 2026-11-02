import { Mail } from 'lucide-react';
import { chargeTotals, type WorkOrder } from './workOrder';

export type EmailDraft = {
  mode: 'post-save' | 'full';
  order: WorkOrder;
  recipient: string;
  subject: string;
  note: string;
  senderDescription?: string;
  gmail?: { connected: boolean; email?: string } | null;
};

type Props = {
  draft: EmailDraft;
  sending: boolean;
  error: string;
  onChange: (
    changes: Partial<Pick<EmailDraft, 'recipient' | 'subject' | 'note'>>,
  ) => void;
  onClose: () => void;
  onSend: () => void;
  onOpenSettings: () => void;
};

export default function EmailOrderModal({
  draft,
  sending,
  error,
  onChange,
  onClose,
  onSend,
  onOpenSettings,
}: Props) {
  const postSave = draft.mode === 'post-save';
  const vehicle =
    [draft.order.vehicleYear, draft.order.vehicleMake, draft.order.vehicleModel]
      .filter(Boolean)
      .join(' ') || 'Vehicle on file';
  const total = chargeTotals(draft.order).total.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  const canSend =
    !sending &&
    Boolean(draft.recipient.trim()) &&
    (postSave ||
      (Boolean(draft.subject.trim()) && Boolean(draft.gmail?.connected)));

  return (
    <div
      className="modal-backdrop animate-in"
      role="presentation"
      onClick={onClose}
    >
      <div
        aria-labelledby="email-order-title"
        aria-modal="true"
        className="modal-card email-modal-dialog"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="email-modal-header">
          <div className="email-modal-icon">
            {postSave ? <Mail size={20} /> : '✉'}
          </div>
          <div>
            <h2 id="email-order-title">
              {postSave
                ? 'Send a copy via email?'
                : `Email ${draft.order.orderNumber}`}
            </h2>
            <p>
              {postSave
                ? `${draft.order.orderNumber} was saved and sent to print.`
                : `Send invoice PDF to ${draft.order.customerName}`}
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close"
            disabled={sending}
            style={{ marginLeft: 'auto' }}
          >
            ×
          </button>
        </div>

        <div className="email-modal-order-summary">
          <div className="summary-item">
            <span className="summary-label">Customer</span>
            <strong>{draft.order.customerName}</strong>
          </div>
          <div className="summary-item">
            <span className="summary-label">Vehicle</span>
            <strong>{vehicle}</strong>
          </div>
          <div className="summary-item right">
            <span className="summary-label">Total Amount</span>
            <strong className="summary-total">{total}</strong>
          </div>
        </div>

        <div className="email-provider-status">
          {postSave ? (
            <span className="provider-ready">
              <span className="status-dot online" />
              Sending via {draft.senderDescription}
            </span>
          ) : draft.gmail === null || draft.gmail === undefined ? (
            <span className="provider-warning">
              <span className="status-dot warning" />
              Checking Gmail connection…
            </span>
          ) : draft.gmail.connected ? (
            <span className="provider-ready">
              <span className="status-dot online" />
              Sending via connected Gmail (<strong>{draft.gmail.email}</strong>)
            </span>
          ) : (
            <div className="gmail-modal-disconnected-banner">
              <div className="banner-text">
                <span className="status-dot warning" />
                <span>
                  Gmail account not connected. Connect your Google account in
                  Settings to send invoices.
                </span>
              </div>
              <button
                type="button"
                className="gmail-modal-settings-link"
                onClick={onOpenSettings}
              >
                Open Settings →
              </button>
            </div>
          )}
        </div>

        <div className="email-modal-inputs">
          <label className="field">
            <span>Customer Email Address</span>
            <input
              type="email"
              autoFocus
              placeholder="customer@example.com"
              value={draft.recipient}
              onChange={(event) => onChange({ recipient: event.target.value })}
              disabled={sending}
            />
          </label>

          {!postSave && (
            <>
              <label className="field">
                <span>Subject Line</span>
                <input
                  type="text"
                  placeholder="Repair Order Subject"
                  value={draft.subject}
                  onChange={(event) =>
                    onChange({ subject: event.target.value })
                  }
                  disabled={sending}
                />
              </label>

              <label className="field">
                <span>Personal Note / Email Body</span>
                <textarea
                  rows={3}
                  placeholder="Thank you for bringing your vehicle to Katia Auto Sales & Repairs. Attached is your official repair order..."
                  value={draft.note}
                  onChange={(event) => onChange({ note: event.target.value })}
                  disabled={sending}
                />
              </label>
            </>
          )}

          <div className="email-modal-attachment-chip">
            <div className="attachment-icon">📄</div>
            <div className="attachment-meta">
              <strong>{draft.order.orderNumber}.pdf</strong>
              <span>Official PDF Invoice · Attached automatically</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="email-modal-error-box">
            <span>⚠</span>
            <span>{error}</span>
          </div>
        )}

        {!postSave && (
          <p className="email-modal-confirmation-notice">
            Please review details before sending. Clicking send will deliver
            this invoice directly from your connected Google account (
            <strong>{draft.gmail?.email || 'Gmail'}</strong>).
          </p>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={sending}
            onClick={onClose}
          >
            {postSave ? 'No, thanks' : 'Cancel'}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!canSend}
            onClick={onSend}
          >
            {sending
              ? postSave
                ? 'Sending…'
                : 'Sending via Gmail API…'
              : postSave
                ? 'Send email'
                : 'Send Invoice via Gmail'}
          </button>
        </div>
      </div>
    </div>
  );
}

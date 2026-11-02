import { useState } from 'react';
import {
  Mail,
  LogOut,
  Send,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Check,
  ExternalLink,
  Sparkles,
  Lock,
  Eye,
  EyeOff,
  Zap,
} from 'lucide-react';
import type { EmailTabProps } from './types';

export default function GmailTab({
  selectedProvider,
  onProviderChange,
  resendSettings,
  setResendSettings,
  resendStatus,
  resendLoading,
  resendSaved,
  resendError,
  resendTestEmail,
  setResendTestEmail,
  resendTestLoading,
  resendTestResult,
  onSaveResendSettings,
  onSendResendTest,
  gmailStatus,
  gmailAuthLoading,
  gmailError,
  oauthClientId,
  setOauthClientId,
  oauthClientSecret,
  setOauthClientSecret,
  showOAuthCredentials,
  setShowOAuthCredentials,
  credentialsSaved,
  gmailTestEmail,
  setGmailTestEmail,
  gmailTestLoading,
  gmailTestResult,
  onConnectGmail,
  onDisconnectGmail,
  onSaveOAuthCredentials,
  onSendGmailTest,
}: EmailTabProps) {
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <div className="settings-grid-layout">
      {/* Main Column */}
      <div className="settings-main-col">
        {/* Provider Switcher Tabs */}
        <div
          className="settings-provider-tabs"
          role="tablist"
          aria-label="Email Delivery Provider"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedProvider === 'resend'}
            className={`settings-provider-tab ${selectedProvider === 'resend' ? 'active' : ''}`}
            onClick={() => void onProviderChange('resend')}
          >
            <Zap size={16} />
            <span>Resend API (Cloud)</span>
            <span className="provider-badge">Recommended</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectedProvider === 'gmail'}
            className={`settings-provider-tab ${selectedProvider === 'gmail' ? 'active' : ''}`}
            onClick={() => void onProviderChange('gmail')}
          >
            <Mail size={16} />
            <span>Google Gmail (OAuth 2.0)</span>
            {gmailStatus?.connected && (
              <span className="provider-badge">Connected</span>
            )}
          </button>
        </div>

        {/* ---------------- RESEND API TAB CONTENT ---------------- */}
        {selectedProvider === 'resend' && (
          <div className="settings-card-panel animate-in">
            <div className="settings-card-top">
              <div className="settings-card-icon-box purple">
                <Zap size={26} />
              </div>
              <div>
                <h3>Resend API Cloud Delivery</h3>
                <p>
                  Instant, reliable delivery using an API key — zero Google
                  Cloud setup, consent screens, or verification hurdles.
                </p>
              </div>
            </div>

            {/* Status card */}
            <div className="gmail-connected-card">
              <div className="gmail-connected-header">
                <div
                  className={`gmail-badge-pill ${resendStatus?.configured ? 'online' : ''}`}
                  style={
                    !resendStatus?.configured
                      ? {
                          background: 'var(--surface-subtle)',
                          color: 'var(--muted)',
                        }
                      : undefined
                  }
                >
                  <span
                    className={`status-dot ${resendStatus?.configured ? 'online' : 'warning'}`}
                  />
                  <span>
                    {resendStatus?.configured
                      ? 'Configured & Ready'
                      : 'Setup Required'}
                  </span>
                </div>
                <a
                  href="https://resend.com/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="gmail-cloud-link"
                  onClick={(e) => {
                    e.preventDefault();
                    void window.repairDesk.openExternal(
                      'https://resend.com/api-keys',
                    );
                  }}
                >
                  <ExternalLink size={13} /> Get Free API Key at Resend.com
                </a>
              </div>

              {resendStatus?.configured && resendStatus.fromEmail && (
                <div className="gmail-account-info">
                  <div
                    className="gmail-avatar-box"
                    style={{ background: '#000000' }}
                  >
                    <Zap size={20} />
                  </div>
                  <div>
                    <span className="gmail-subhead">
                      Authorized Sender Address
                    </span>
                    <strong className="gmail-email-address">
                      {resendStatus.fromEmail}
                    </strong>
                  </div>
                </div>
              )}

              {/* Input fields */}
              <div className="settings-inputs-grid" style={{ marginTop: 8 }}>
                <div className="settings-input-group full">
                  <label>
                    <span className="dot" />
                    Resend API Key
                  </label>
                  <div className="settings-input-wrap">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      placeholder="re_123456789_abcdefghijklmnopqrstuvwxyz"
                      value={resendSettings.resendApiKey}
                      onChange={(e) =>
                        setResendSettings((prev) => ({
                          ...prev,
                          resendApiKey: e.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="settings-input-action-btn"
                      onClick={() => setShowApiKey((v) => !v)}
                      aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                    >
                      {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <small className="settings-field-hint">
                    From your dashboard at <code>resend.com/api-keys</code>.
                  </small>
                </div>

                <div className="settings-input-group">
                  <label>
                    <span className="dot" />
                    Sender Email Address (From)
                  </label>
                  <div className="settings-input-wrap">
                    <input
                      type="email"
                      placeholder="invoices@katiaautosales.com or onboarding@resend.dev"
                      value={resendSettings.resendFromEmail}
                      onChange={(e) =>
                        setResendSettings((prev) => ({
                          ...prev,
                          resendFromEmail: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <small className="settings-field-hint">
                    Your verified domain email, or{' '}
                    <code>onboarding@resend.dev</code> for testing.
                  </small>
                </div>

                <div className="settings-input-group">
                  <label>
                    <span className="dot" />
                    Sender Display Name
                  </label>
                  <div className="settings-input-wrap">
                    <input
                      type="text"
                      placeholder="Katia Auto Sales & Repairs"
                      value={resendSettings.senderName}
                      onChange={(e) =>
                        setResendSettings((prev) => ({
                          ...prev,
                          senderName: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              {resendError && (
                <div className="settings-test-feedback error">
                  <AlertCircle size={16} />
                  <span>{resendError}</span>
                </div>
              )}

              <div style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void onSaveResendSettings()}
                  disabled={
                    resendLoading || !resendSettings.resendApiKey.trim()
                  }
                >
                  {resendSaved ? (
                    <>
                      <Check size={16} />
                      <span>Settings Saved!</span>
                    </>
                  ) : resendLoading ? (
                    <>
                      <RefreshCw size={16} className="spin" />
                      <span>Saving…</span>
                    </>
                  ) : (
                    <span>Save Resend Settings</span>
                  )}
                </button>
              </div>

              {/* Resend Test Email Action */}
              {resendStatus?.configured && (
                <div className="settings-test-section">
                  <div className="settings-test-header">
                    <div>
                      <strong>Send Test Email via Resend</strong>
                      <small>
                        Verify that your Resend API key and sender address can
                        deliver to an inbox
                      </small>
                    </div>
                  </div>

                  <div className="settings-test-row">
                    <div className="settings-input-wrap">
                      <input
                        type="email"
                        placeholder="Enter test recipient email (e.g. personal@example.com)"
                        value={resendTestEmail}
                        onChange={(e) => setResendTestEmail(e.target.value)}
                        disabled={resendTestLoading}
                      />
                      <div className="settings-input-icon">
                        <Send size={16} />
                      </div>
                    </div>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void onSendResendTest()}
                      disabled={resendTestLoading || !resendTestEmail.trim()}
                    >
                      {resendTestLoading ? (
                        <>
                          <RefreshCw size={15} className="spin" />
                          <span>Sending…</span>
                        </>
                      ) : (
                        <>
                          <Send size={15} />
                          <span>Send Test Email</span>
                        </>
                      )}
                    </button>
                  </div>

                  {resendTestResult.status !== 'idle' && (
                    <div
                      className={`settings-test-feedback ${resendTestResult.status}`}
                    >
                      {resendTestResult.status === 'success' ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <AlertCircle size={16} />
                      )}
                      <span>{resendTestResult.message}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------------- GMAIL OAUTH TAB CONTENT ---------------- */}
        {selectedProvider === 'gmail' && (
          <div className="settings-card-panel animate-in">
            <div className="settings-card-top">
              <div className="settings-card-icon-box purple">
                <Mail size={26} />
              </div>
              <div>
                <h3>Gmail Integration (Official OAuth 2.0)</h3>
                <p>
                  Send customer estimates and PDF invoices directly from your
                  own authorized Gmail account
                </p>
              </div>
            </div>

            {/* Connected State */}
            {gmailStatus?.connected ? (
              <div className="gmail-connected-card">
                <div className="gmail-connected-header">
                  <div className="gmail-badge-pill online">
                    <span className="status-dot online" />
                    <span>Connected &amp; Active</span>
                  </div>
                  <button
                    type="button"
                    className="gmail-disconnect-btn"
                    onClick={() => void onDisconnectGmail()}
                    disabled={gmailAuthLoading}
                    title="Disconnect Google account and revoke access"
                  >
                    <LogOut size={14} />
                    <span>Disconnect Gmail</span>
                  </button>
                </div>

                <div className="gmail-account-info">
                  <div className="gmail-avatar-box">
                    <Mail size={20} />
                  </div>
                  <div>
                    <span className="gmail-subhead">
                      Authorized Sender Address
                    </span>
                    <strong className="gmail-email-address">
                      {gmailStatus.email}
                    </strong>
                  </div>
                </div>

                <p className="gmail-connected-note">
                  Official invoices, receipts, and estimates will be delivered
                  directly from this address via Google&apos;s secure{' '}
                  <code>gmail.send</code> API.
                </p>

                {/* Send Test Email Action */}
                <div className="settings-test-section">
                  <div className="settings-test-header">
                    <div>
                      <strong>Send Test Email</strong>
                      <small>
                        Verify that your Gmail account can deliver messages to
                        an inbox
                      </small>
                    </div>
                  </div>

                  <div className="settings-test-row">
                    <div className="settings-input-wrap">
                      <input
                        type="email"
                        placeholder="Enter test recipient email (e.g. personal@example.com)"
                        value={gmailTestEmail}
                        onChange={(e) => setGmailTestEmail(e.target.value)}
                        disabled={gmailTestLoading}
                      />
                      <div className="settings-input-icon">
                        <Send size={16} />
                      </div>
                    </div>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void onSendGmailTest()}
                      disabled={gmailTestLoading || !gmailTestEmail.trim()}
                    >
                      {gmailTestLoading ? (
                        <>
                          <RefreshCw size={15} className="spin" />
                          <span>Sending…</span>
                        </>
                      ) : (
                        <>
                          <Send size={15} />
                          <span>Send Test Email</span>
                        </>
                      )}
                    </button>
                  </div>

                  {gmailTestResult.status !== 'idle' && (
                    <div
                      className={`settings-test-feedback ${gmailTestResult.status}`}
                    >
                      {gmailTestResult.status === 'success' ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <AlertCircle size={16} />
                      )}
                      <span>{gmailTestResult.message}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Disconnected State */
              <div className="gmail-disconnected-card">
                <div className="gmail-disconnected-hero">
                  <p className="gmail-disconnected-desc">
                    Connect your Google account using secure{' '}
                    <strong>OAuth 2.0 PKCE</strong>. Invoices and receipts will
                    be delivered straight from your verified Gmail address with
                    official PDF attachments.
                  </p>
                  <div className="gmail-oauth-badge-row">
                    <span className="gmail-scope-tag">Scope: gmail.send</span>
                    <span className="gmail-scope-tag">Zero Inbox Access</span>
                    <span className="gmail-scope-tag">DPAPI Encrypted</span>
                  </div>
                </div>

                {/* Credentials toggle / form */}
                <div className="gmail-credentials-section">
                  <button
                    type="button"
                    className="gmail-credentials-toggle"
                    onClick={() => setShowOAuthCredentials((v) => !v)}
                  >
                    <span>Google Cloud OAuth Client Credentials</span>
                    <span className="toggle-caret">
                      {showOAuthCredentials ? '▲ Hide' : '▼ Configure'}
                    </span>
                  </button>

                  {showOAuthCredentials && (
                    <div className="gmail-credentials-form animate-in">
                      <div className="settings-inputs-grid">
                        <div className="settings-input-group full">
                          <label>
                            <span className="dot" />
                            OAuth 2.0 Client ID (Desktop Application)
                          </label>
                          <div className="settings-input-wrap">
                            <input
                              type="text"
                              placeholder="123456789-abcdef.apps.googleusercontent.com"
                              value={oauthClientId}
                              onChange={(e) => setOauthClientId(e.target.value)}
                            />
                          </div>
                          <small className="settings-field-hint">
                            From your Google Cloud Console &gt; APIs &amp;
                            Services &gt; Credentials (Desktop client)
                          </small>
                        </div>

                        <div className="settings-input-group full">
                          <label>
                            <span className="dot" />
                            OAuth 2.0 Client Secret (Optional for PKCE)
                          </label>
                          <div className="settings-input-wrap">
                            <input
                              type="password"
                              placeholder="GOCSPX-..."
                              value={oauthClientSecret}
                              onChange={(e) =>
                                setOauthClientSecret(e.target.value)
                              }
                            />
                          </div>
                        </div>
                      </div>

                      <div className="gmail-credentials-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => void onSaveOAuthCredentials()}
                          disabled={!oauthClientId.trim()}
                        >
                          {credentialsSaved ? (
                            <>
                              <Check size={15} />
                              <span>Credentials Saved!</span>
                            </>
                          ) : (
                            <span>Save Client Credentials</span>
                          )}
                        </button>
                        <a
                          href="https://console.cloud.google.com/apis/credentials"
                          target="_blank"
                          rel="noreferrer"
                          className="gmail-cloud-link"
                          onClick={(e) => {
                            e.preventDefault();
                            void window.repairDesk.openExternal(
                              'https://console.cloud.google.com/apis/credentials',
                            );
                          }}
                        >
                          <ExternalLink size={14} /> Open Google Cloud Console
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                {gmailError && (
                  <div className="settings-test-feedback error">
                    <AlertCircle size={16} />
                    <span>{gmailError}</span>
                  </div>
                )}

                {gmailStatus?.needsReconnect && (
                  <div className="settings-test-feedback error">
                    <AlertCircle size={16} />
                    <span>
                      Google authorization expired or was revoked. Reconnect to
                      keep sending invoices.
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void onConnectGmail()}
                  disabled={gmailAuthLoading || !oauthClientId.trim()}
                  className="gmail-connect-btn"
                >
                  {gmailAuthLoading ? (
                    <>
                      <RefreshCw size={18} className="spin" />
                      <span>Authorizing in Browser…</span>
                    </>
                  ) : (
                    <>
                      <Mail size={18} />
                      <span>Connect Gmail with Google</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Guide & Security Sidebar */}
      <div className="settings-sidebar-col">
        {selectedProvider === 'resend' ? (
          <div className="settings-guide-card">
            <div className="settings-guide-header">
              <div className="settings-guide-icon">
                <Sparkles size={16} />
              </div>
              <h4>Quick Resend Setup</h4>
            </div>

            <div className="settings-steps-list">
              {[
                {
                  step: '01',
                  strong: 'Create Free Account',
                  text: 'Sign up at Resend.com (includes 3,000 free emails per month).',
                },
                {
                  step: '02',
                  strong: 'Generate API Key',
                  text: 'Go to API Keys in Resend, click Create API Key, and copy the key (starts with re_).',
                },
                {
                  step: '03',
                  strong: 'Configure Sender',
                  text: 'Enter your domain sender email, or use onboarding@resend.dev for testing.',
                },
                {
                  step: '04',
                  strong: 'Save & Send Test',
                  text: 'Click Save Resend Settings, then send a test email to verify delivery.',
                },
              ].map((item, idx) => (
                <div key={idx} className="settings-step-item">
                  <span className="step-num">{item.step}</span>
                  <div>
                    <strong className="step-title">{item.strong}</strong>
                    <p className="step-desc">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="settings-guide-glow" />
          </div>
        ) : (
          <div className="settings-guide-card">
            <div className="settings-guide-header">
              <div className="settings-guide-icon">
                <Sparkles size={16} />
              </div>
              <h4>Step-by-Step Guide</h4>
            </div>

            <div className="settings-steps-list">
              {[
                {
                  step: '01',
                  strong: 'Google Cloud Project',
                  text: 'Create a project and enable the Gmail API in console.cloud.google.com.',
                },
                {
                  step: '02',
                  strong: 'OAuth Consent Screen',
                  text: 'Add your shop info and scope: https://www.googleapis.com/auth/gmail.send',
                },
                {
                  step: '03',
                  strong: 'Desktop App Client',
                  text: 'Create an OAuth Client ID for "Desktop application" and paste the Client ID.',
                },
                {
                  step: '04',
                  strong: 'One-Click Connect',
                  text: 'Click Connect Gmail to authenticate securely with your Google account in browser.',
                },
              ].map((item, idx) => (
                <div key={idx} className="settings-step-item">
                  <span className="step-num">{item.step}</span>
                  <div>
                    <strong className="step-title">{item.strong}</strong>
                    <p className="step-desc">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="settings-guide-glow" />
          </div>
        )}

        {/* Security & Fallback Card */}
        <div className="settings-security-card">
          <div className="settings-security-icon">
            <Lock size={18} />
          </div>
          <p>
            <strong>Dual Delivery &amp; Fallback Support:</strong> Both Resend
            and Gmail can be configured. If your primary service ever has
            delivery issues, you can easily switch or fall back without data
            loss.
          </p>
        </div>
      </div>
    </div>
  );
}

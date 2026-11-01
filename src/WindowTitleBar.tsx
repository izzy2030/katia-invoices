import KatiaLogo from './KatiaLogo';

export default function WindowTitleBar() {
  return (
    <header className="window-titlebar" aria-label="Application title bar">
      <div className="titlebar__brand">
        <span className="titlebar__logo">
          <KatiaLogo size={15} />
        </span>
        <strong className="titlebar__title">Katia Body Shop</strong>
        <span className="titlebar__subtitle">Repair orders & receipts</span>
      </div>
      <div className="titlebar__spacer" />
    </header>
  );
}

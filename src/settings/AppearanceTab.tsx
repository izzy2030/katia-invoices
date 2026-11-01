import { Palette, Check, Sun, Moon, Zap, Snowflake } from 'lucide-react';
import type { AppearanceTabProps } from './types';

const THEMES = [
  {
    id: 'classic',
    name: 'Katia Classic',
    icon: Sun,
    colors: ['#2563eb', '#1d4ed8', '#f4f7fb'],
    desc: 'The original shop blue brand',
  },
  {
    id: 'abyssal',
    name: 'Abyssal Night',
    icon: Moon,
    colors: ['#38bdf8', '#0ea5e9', '#090d16'],
    desc: 'Deep focus dark workspace',
  },
  {
    id: 'amber',
    name: 'Amber Workshop',
    icon: Zap,
    colors: ['#f59e0b', '#d97706', '#fdfaf5'],
    desc: 'High-visibility warm workshop',
  },
  {
    id: 'nordic',
    name: 'Nordic Steel',
    icon: Snowflake,
    colors: ['#64748b', '#475569', '#f1f5f9'],
    desc: 'Professional arctic steel',
  },
];

export default function AppearanceTab({
  currentTheme,
  onThemeChange,
}: AppearanceTabProps) {
  const activeThemeObj = THEMES.find((t) => t.id === currentTheme) ?? THEMES[0];

  return (
    <div className="settings-single-col">
      <div className="settings-card-panel">
        <div className="settings-card-top">
          <div className="settings-card-icon-box amber">
            <Palette size={26} />
          </div>
          <div>
            <h3>Visual Experience &amp; Workspace Themes</h3>
            <p>
              Personalize the color palette and display contrast of your
              workshop software
            </p>
          </div>
        </div>

        <div className="settings-theme-grid">
          {THEMES.map((theme) => {
            const IconComponent = theme.icon;
            const isSelected = currentTheme === theme.id;
            return (
              <button
                type="button"
                key={theme.id}
                onClick={() => onThemeChange(theme.id)}
                className={`settings-theme-card ${isSelected ? 'active' : ''}`}
              >
                <div className="settings-theme-card-top">
                  <div className="settings-theme-icon-box">
                    <IconComponent size={20} />
                  </div>
                  <div className="settings-theme-dots">
                    {theme.colors.map((_, i) => (
                      <div
                        key={i}
                        className={`theme-dot theme-dot-${theme.id}-${i}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="settings-theme-info">
                  <strong>{theme.name}</strong>
                  <small>{theme.desc}</small>
                </div>
                {isSelected && (
                  <div className="settings-theme-check">
                    <Check size={14} />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="settings-theme-preview-box">
          <div className="settings-theme-preview-left">
            <div className="settings-theme-preview-badge">Active Theme</div>
            <div className="settings-theme-preview-meta">
              <strong>{activeThemeObj.name}</strong>
              <small>{activeThemeObj.desc}</small>
            </div>
          </div>
          <span className="settings-theme-preview-note">
            Changes apply instantaneously
          </span>
        </div>
      </div>
    </div>
  );
}

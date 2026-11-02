import { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Plus,
  Search,
  Trash2,
  Edit2,
  RotateCcw,
  Check,
  X,
  Tag,
  AlertCircle,
} from 'lucide-react';
import type { CatalogPreset, ChargeKind } from '../workOrder';

const CATEGORY_OPTIONS: Array<{ value: ChargeKind; label: string }> = [
  { value: 'labor', label: 'Labor / Operation' },
  { value: 'parts', label: 'Replacement Part' },
  { value: 'sublet', label: 'Sublet Service' },
  { value: 'disposal', label: 'EPA / Disposal' },
  { value: 'fluids', label: 'Fluids & Chemicals' },
  { value: 'other', label: 'Other / Misc' },
];

export default function PresetsTab() {
  const [presets, setPresets] = useState<CatalogPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Editor state (null = closed, or Partial<CatalogPreset> = editing/new)
  const [editingPreset, setEditingPreset] =
    useState<Partial<CatalogPreset> | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const fetchPresets = async () => {
    try {
      setLoading(true);
      if (window.repairDesk?.listCatalogPresets) {
        const list = await window.repairDesk.listCatalogPresets();
        setPresets(list);
      }
    } catch (err) {
      console.error('Failed to load catalog presets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPresets();
  }, []);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const handleStartAdd = () => {
    setErrorMsg(null);
    setEditingPreset({
      category: 'labor',
      shortcut: '',
      name: '',
      description: '',
      partNumber: '',
      defaultPrice: 65,
      defaultQuantity: 1,
      taxable: false,
    });
  };

  const handleStartEdit = (preset: CatalogPreset) => {
    setErrorMsg(null);
    setEditingPreset({ ...preset });
  };

  const handleCancelEdit = () => {
    setEditingPreset(null);
    setErrorMsg(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPreset) return;
    setErrorMsg(null);

    if (!editingPreset.shortcut?.trim()) {
      setErrorMsg('Please provide a shortcut (e.g. bumper-paint).');
      return;
    }
    if (!editingPreset.name?.trim()) {
      setErrorMsg('Please provide a preset title.');
      return;
    }
    if (!editingPreset.description?.trim()) {
      setErrorMsg('Please provide a line item description.');
      return;
    }

    try {
      setSaving(true);
      await window.repairDesk.saveCatalogPreset(editingPreset);
      showToast(
        editingPreset.id
          ? 'Preset updated successfully!'
          : 'Preset added to catalog!',
      );
      setEditingPreset(null);
      await fetchPresets();
      window.dispatchEvent(new CustomEvent('katia:presets-updated'));
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to save preset.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (preset: CatalogPreset) => {
    const confirm = window.confirm(
      `Are you sure you want to delete the preset "${preset.name}" (/${preset.shortcut})?`,
    );
    if (!confirm) return;

    try {
      await window.repairDesk.deleteCatalogPreset(preset.id);
      showToast(`Deleted /${preset.shortcut}`);
      await fetchPresets();
      window.dispatchEvent(new CustomEvent('katia:presets-updated'));
    } catch (err) {
      console.error('Failed to delete preset:', err);
      alert('Could not delete preset.');
    }
  };

  const handleResetDefaults = async () => {
    const confirm = window.confirm(
      'Reset all presets to default body shop collision catalog? Your existing custom presets will be preserved unless there is a shortcut collision.',
    );
    if (!confirm) return;

    try {
      setLoading(true);
      const updated = await window.repairDesk.resetCatalogPresets();
      setPresets(updated);
      showToast('Restored body shop default presets!');
      window.dispatchEvent(new CustomEvent('katia:presets-updated'));
    } catch (err) {
      console.error('Failed to reset presets:', err);
      alert('Could not reset presets.');
    } finally {
      setLoading(false);
    }
  };

  // Filtered presets
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return presets.filter((p) => {
      const matchesCategory =
        filterCategory === 'all' || p.category === filterCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        p.shortcut.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.partNumber && p.partNumber.toLowerCase().includes(q))
      );
    });
  }, [presets, search, filterCategory]);

  return (
    <div className="settings-single-col">
      <div className="settings-card-panel">
        {/* Card Header Top */}
        <div className="settings-card-top">
          <div className="settings-card-icon-box amber">
            <Sparkles size={24} />
          </div>
          <div className="presets-header-wrap">
            <div className="presets-header-text">
              <h3>Body Shop Presets &amp; Slash Catalog</h3>
              <p>
                Standard collision repair operations, refinish jobs, and parts.
                Type <code className="presets-code-pill">/</code> in any order
                charge line to quickly auto-fill them.
              </p>
            </div>
            <div className="presets-header-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={handleResetDefaults}
                title="Reset to default collision repair jobs"
              >
                <RotateCcw size={13} />
                <span>Restore Defaults</span>
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleStartAdd}
              >
                <Plus size={14} />
                <span>New Preset</span>
              </button>
            </div>
          </div>
        </div>

        {successToast && (
          <div
            className="settings-test-feedback success"
            style={{ marginBottom: 16 }}
          >
            <Check size={16} />
            <span>{successToast}</span>
          </div>
        )}

        {/* Edit / Create Preset Card */}
        {editingPreset && (
          <div className="preset-editor-card">
            <div className="preset-editor-top">
              <div className="preset-editor-title">
                <Sparkles size={16} color="var(--accent)" />
                <span>
                  {editingPreset.id
                    ? 'Edit Preset'
                    : 'Add New Preset to Body Shop Catalog'}
                </span>
              </div>
              <button
                type="button"
                className="preset-editor-close"
                onClick={handleCancelEdit}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            {errorMsg && (
              <div
                className="settings-test-feedback error"
                style={{ marginBottom: 14 }}
              >
                <AlertCircle size={14} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={(e) => void handleSave(e)}>
              <div className="settings-inputs-grid">
                {/* Shortcut */}
                <div className="settings-input-group">
                  <label>
                    <span className="dot" />
                    Slash Shortcut (e.g. /{editingPreset.shortcut || 'shortcut'}
                    )
                  </label>
                  <div className="settings-input-wrap">
                    <input
                      type="text"
                      placeholder="bumper-paint"
                      value={editingPreset.shortcut ?? ''}
                      onChange={(e) =>
                        setEditingPreset((p) => ({
                          ...p,
                          shortcut: e.target.value
                            .replace(/^\//, '')
                            .toLowerCase(),
                        }))
                      }
                      required
                    />
                    <div className="settings-input-icon">
                      <Tag size={15} />
                    </div>
                  </div>
                </div>

                {/* Category */}
                <div className="settings-input-group">
                  <label>
                    <span className="dot" />
                    Category
                  </label>
                  <div className="settings-input-wrap">
                    <select
                      value={editingPreset.category ?? 'labor'}
                      onChange={(e) =>
                        setEditingPreset((p) => ({
                          ...p,
                          category: e.target.value as ChargeKind,
                        }))
                      }
                    >
                      {CATEGORY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Title */}
                <div className="settings-input-group">
                  <label>
                    <span className="dot" />
                    Preset Title / Label
                  </label>
                  <div className="settings-input-wrap">
                    <input
                      type="text"
                      placeholder="e.g. Front Bumper Refinish"
                      value={editingPreset.name ?? ''}
                      onChange={(e) =>
                        setEditingPreset((p) => ({
                          ...p,
                          name: e.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                </div>

                {/* Part / Op Code */}
                <div className="settings-input-group">
                  <label>
                    <span className="dot" />
                    Part # / Labor Code (optional)
                  </label>
                  <div className="settings-input-wrap">
                    <input
                      type="text"
                      placeholder="PNT-201 or OEM #"
                      value={editingPreset.partNumber ?? ''}
                      onChange={(e) =>
                        setEditingPreset((p) => ({
                          ...p,
                          partNumber: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="settings-input-group full">
                  <label>
                    <span className="dot" />
                    Line Item Description (printed on invoice)
                  </label>
                  <div className="settings-input-wrap">
                    <input
                      type="text"
                      placeholder="e.g. Front bumper cover - refinish & clear coat application"
                      value={editingPreset.description ?? ''}
                      onChange={(e) =>
                        setEditingPreset((p) => ({
                          ...p,
                          description: e.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                </div>

                {/* Default Price */}
                <div className="settings-input-group">
                  <label>
                    <span className="dot" />
                    Default Rate / Price ($)
                  </label>
                  <div className="settings-input-wrap">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="65.00"
                      value={editingPreset.defaultPrice ?? ''}
                      onChange={(e) =>
                        setEditingPreset((p) => ({
                          ...p,
                          defaultPrice: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                </div>

                {/* Default Qty/Hours */}
                <div className="settings-input-group">
                  <label>
                    <span className="dot" />
                    Default Hours / Quantity
                  </label>
                  <div className="settings-input-wrap">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="1.0"
                      value={editingPreset.defaultQuantity ?? 1}
                      onChange={(e) =>
                        setEditingPreset((p) => ({
                          ...p,
                          defaultQuantity: parseFloat(e.target.value) || 1,
                        }))
                      }
                    />
                  </div>
                </div>

                {/* Taxable toggle */}
                <div className="settings-input-group full">
                  <label
                    style={{
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      userSelect: 'none',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(editingPreset.taxable)}
                      onChange={(e) =>
                        setEditingPreset((p) => ({
                          ...p,
                          taxable: e.target.checked,
                        }))
                      }
                      style={{
                        width: 16,
                        height: 16,
                        accentColor: 'var(--accent)',
                        cursor: 'pointer',
                      }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        textTransform: 'none',
                        color: 'var(--ink)',
                        fontWeight: 600,
                      }}
                    >
                      Charge sales tax on this preset item by default
                    </span>
                  </label>
                </div>
              </div>

              <div className="preset-editor-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleCancelEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="primary-button"
                >
                  <Check size={14} />
                  <span>
                    {saving
                      ? 'Saving…'
                      : editingPreset.id
                        ? 'Save Changes'
                        : 'Create Preset'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Toolbar: Search & Filter Pills */}
        <div className="presets-toolbar">
          <div className="presets-search-wrap">
            <Search size={14} className="presets-search-icon" />
            <input
              type="text"
              placeholder="Search presets by shortcut, name, or description…"
              className="presets-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="presets-search-clear"
                onClick={() => setSearch('')}
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="presets-filter-pills">
            {[
              { id: 'all', label: `All (${presets.length})` },
              {
                id: 'labor',
                label: `Labor (${presets.filter((p) => p.category === 'labor').length})`,
              },
              {
                id: 'parts',
                label: `Parts (${presets.filter((p) => p.category === 'parts').length})`,
              },
              {
                id: 'sublet',
                label: `Sublet (${presets.filter((p) => p.category === 'sublet').length})`,
              },
              {
                id: 'disposal',
                label: `Disposal (${presets.filter((p) => p.category === 'disposal').length})`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterCategory(tab.id)}
                className={`presets-filter-pill ${filterCategory === tab.id ? 'active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Presets List */}
        {loading ? (
          <div className="presets-empty-state">Loading catalog presets…</div>
        ) : filtered.length === 0 ? (
          <div className="presets-empty-state">
            <Sparkles
              size={28}
              color="var(--muted)"
              style={{ margin: '0 auto 8px' }}
            />
            <p>
              {search
                ? 'No presets match your search query.'
                : 'No presets found in this category.'}
            </p>
            <button
              type="button"
              className="secondary-button"
              onClick={handleStartAdd}
              style={{ margin: '0 auto' }}
            >
              <Plus size={13} />
              <span>Add a new preset</span>
            </button>
          </div>
        ) : (
          <div className="presets-list-card">
            {filtered.map((preset) => (
              <div key={preset.id} className="preset-item-row">
                <div className="preset-item-main">
                  <span className="preset-shortcut-tag">
                    /{preset.shortcut}
                  </span>
                  <div className="preset-item-info">
                    <div className="preset-item-title-row">
                      <span className="preset-item-title">{preset.name}</span>
                      <span
                        className={`preset-category-badge ${preset.category}`}
                      >
                        {preset.category}
                      </span>
                      {preset.partNumber && (
                        <span className="preset-code-tag">
                          {preset.partNumber}
                        </span>
                      )}
                    </div>
                    <p className="preset-item-desc">{preset.description}</p>
                  </div>
                </div>

                <div className="preset-item-meta">
                  <div className="preset-pricing-box">
                    <div className="preset-price">
                      ${preset.defaultPrice.toFixed(2)}
                      {preset.category === 'labor' ? '/hr' : ''}
                    </div>
                    <div className="preset-qty-tax">
                      <span>
                        {preset.defaultQuantity || 1}{' '}
                        {preset.category === 'labor' ? 'hrs' : 'qty'}
                      </span>
                      <span>·</span>
                      <span className={preset.taxable ? 'taxable' : ''}>
                        {preset.taxable ? 'Taxable' : 'Exempt'}
                      </span>
                    </div>
                  </div>

                  <div className="preset-action-btns">
                    <button
                      type="button"
                      className="preset-icon-btn edit"
                      onClick={() => handleStartEdit(preset)}
                      title="Edit preset"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      className="preset-icon-btn delete"
                      onClick={() => void handleDelete(preset)}
                      title="Delete preset"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

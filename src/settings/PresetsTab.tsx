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
  Wrench,
  Package,
  Tag,
  AlertCircle,
} from 'lucide-react';
import type { CatalogPreset, ChargeKind } from '../workOrder';

interface PresetsTabProps {
  onPresetsChanged?: () => void;
}

const CATEGORY_OPTIONS: Array<{
  value: ChargeKind;
  label: string;
  icon: typeof Wrench;
}> = [
  { value: 'labor', label: 'Labor / Operation', icon: Wrench },
  { value: 'parts', label: 'Replacement Part', icon: Package },
  { value: 'sublet', label: 'Sublet Service', icon: Tag },
  { value: 'disposal', label: 'EPA / Disposal', icon: AlertCircle },
  { value: 'fluids', label: 'Fluids & Chemicals', icon: Tag },
  { value: 'other', label: 'Other / Misc', icon: Tag },
];

export default function PresetsTab({ onPresetsChanged }: PresetsTabProps) {
  const [presets, setPresets] = useState<CatalogPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Editor state (null = closed, 'new' = creating, or CatalogPreset = editing)
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
      onPresetsChanged?.();
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
      onPresetsChanged?.();
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
      onPresetsChanged?.();
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
        <div className="settings-card-top">
          <div className="settings-card-icon-box amber">
            <Sparkles size={24} />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h3>Body Shop Presets &amp; Slash Catalog</h3>
                <p>
                  Standard collision repair operations, refinish jobs, and
                  parts. Type{' '}
                  <code className="text-amber-600 dark:text-amber-400 font-mono font-bold bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800 text-xs">
                    /
                  </code>{' '}
                  in any order charge line to quickly auto-fill them.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="secondary-button text-xs py-1.5 px-3"
                  onClick={handleResetDefaults}
                  title="Reset to default collision repair jobs"
                >
                  <RotateCcw size={13} />
                  <span>Restore Defaults</span>
                </button>
                <button
                  type="button"
                  className="primary-button text-xs py-1.5 px-3 flex items-center gap-1.5"
                  onClick={handleStartAdd}
                >
                  <Plus size={14} />
                  <span>New Preset</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {successToast && (
          <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in">
            <Check size={16} />
            <span>{successToast}</span>
          </div>
        )}

        {/* Edit / Create Preset Drawer / Card */}
        {editingPreset && (
          <div className="mb-6 p-4 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm animate-in">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-amber-200 dark:border-amber-800/60">
              <div className="flex items-center gap-2">
                <Sparkles
                  size={16}
                  className="text-amber-600 dark:text-amber-400"
                />
                <strong className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  {editingPreset.id
                    ? 'Edit Preset'
                    : 'Add New Preset to Body Shop Catalog'}
                </strong>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                onClick={handleCancelEdit}
              >
                <X size={16} />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-3 p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-md text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle size={14} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Shortcut */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Slash Shortcut <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-2.5 text-gray-400 font-mono text-sm font-bold">
                      /
                    </span>
                    <input
                      type="text"
                      className="w-full pl-6 pr-3 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono focus:ring-1 focus:ring-amber-500"
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
                  </div>
                  <span className="text-[10px] text-gray-400">
                    Katia will type{' '}
                    <code>/{editingPreset.shortcut || 'shortcut'}</code> to
                    trigger
                  </span>
                </div>

                {/* Category */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    className="w-full px-3 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-amber-500"
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

                {/* Part / Code */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Part # / Labor Code (optional)
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-amber-500"
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

              {/* Title & Description */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Preset Title / Label{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-amber-500"
                    placeholder="e.g. Front Bumper Refinish"
                    value={editingPreset.name ?? ''}
                    onChange={(e) =>
                      setEditingPreset((p) => ({ ...p, name: e.target.value }))
                    }
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Line Item Description (printed on invoice){' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-amber-500"
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

              {/* Rates, Qty & Taxable */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Default Rate / Unit Price ($)
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-2.5 text-gray-400 text-xs">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full pl-6 pr-3 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-amber-500"
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

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Default Hours / Quantity
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    className="w-full px-3 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-amber-500"
                    value={editingPreset.defaultQuantity ?? 1}
                    onChange={(e) =>
                      setEditingPreset((p) => ({
                        ...p,
                        defaultQuantity: parseFloat(e.target.value) || 1,
                      }))
                    }
                  />
                </div>

                <div className="pt-4">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                      checked={Boolean(editingPreset.taxable)}
                      onChange={(e) =>
                        setEditingPreset((p) => ({
                          ...p,
                          taxable: e.target.checked,
                        }))
                      }
                    />
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                      Charge sales tax on this item
                    </span>
                  </label>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-200 dark:border-amber-800/60">
                <button
                  type="button"
                  className="secondary-button text-xs py-1.5 px-3"
                  onClick={handleCancelEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="primary-button text-xs py-1.5 px-4 flex items-center gap-1.5"
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

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
          {/* Search box */}
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Filter presets by shortcut, name, or description…"
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-1 focus:ring-amber-500 focus:bg-white dark:focus:bg-gray-900 transition-colors"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                onClick={() => setSearch('')}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 text-xs">
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
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  filterCategory === tab.id
                    ? 'bg-amber-600 text-white font-semibold'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Presets List */}
        {loading ? (
          <div className="py-12 text-center text-xs text-gray-400">
            Loading catalog presets…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
            <Sparkles
              size={28}
              className="mx-auto text-gray-300 dark:text-gray-600 mb-2"
            />
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {search
                ? 'No presets match your search query.'
                : 'No presets found in this category.'}
            </p>
            <button
              type="button"
              className="mt-3 text-xs text-amber-600 dark:text-amber-400 font-semibold hover:underline"
              onClick={handleStartAdd}
            >
              + Add a new preset
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-900/40">
            {filtered.map((preset) => {
              const categoryBadgeColors =
                {
                  labor:
                    'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                  parts:
                    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                  sublet:
                    'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800',
                  disposal:
                    'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
                  fluids:
                    'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
                  other:
                    'bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700',
                }[preset.category] ||
                'bg-gray-50 text-gray-700 border-gray-200';

              return (
                <div
                  key={preset.id}
                  className="p-3.5 hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Shortcut pill */}
                    <div className="shrink-0">
                      <span className="inline-flex items-center px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 font-mono text-xs font-bold tracking-tight">
                        /{preset.shortcut}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <strong className="text-xs font-bold text-gray-900 dark:text-gray-100">
                          {preset.name}
                        </strong>
                        <span
                          className={`inline-block px-1.5 py-0.2 rounded border text-[10px] font-semibold uppercase tracking-wider ${categoryBadgeColors}`}
                        >
                          {preset.category}
                        </span>
                        {preset.partNumber && (
                          <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.2 rounded">
                            {preset.partNumber}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {preset.description}
                      </p>
                    </div>
                  </div>

                  {/* Pricing / Tax / Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-gray-800">
                    <div className="text-left sm:text-right">
                      <div className="text-xs font-bold text-gray-900 dark:text-gray-100">
                        ${preset.defaultPrice.toFixed(2)}
                        {preset.category === 'labor' ? '/hr' : ''}
                      </div>
                      <div className="text-[10px] text-gray-400 flex items-center gap-1 sm:justify-end">
                        <span>
                          {preset.defaultQuantity || 1}{' '}
                          {preset.category === 'labor' ? 'hrs' : 'qty'}
                        </span>
                        <span>•</span>
                        <span
                          className={
                            preset.taxable
                              ? 'text-amber-600 dark:text-amber-400 font-semibold'
                              : 'text-gray-400'
                          }
                        >
                          {preset.taxable ? 'Taxable' : 'Exempt'}
                        </span>
                      </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(preset)}
                        className="p-1.5 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 rounded hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                        title="Edit preset"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(preset)}
                        className="p-1.5 text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 rounded hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        title="Delete preset"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

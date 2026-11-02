import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Wrench,
  Package,
  Plus,
  Trash2,
  Sparkles,
  Search,
  ChevronDown,
} from 'lucide-react';
import {
  defaultTaxable,
  lineTotal,
  type ChargeKind,
  type ChargeLine,
  type TaxDefaults,
  type CatalogPreset,
} from './workOrder';

interface WorkOrderChargesProps {
  charges: ChargeLine[];
  defaults: TaxDefaults;
  onChange: (charges: ChargeLine[]) => void;
  presets?: CatalogPreset[];
}

interface ActiveSlashState {
  section: 'labor' | 'parts';
  index: number;
  query: string;
  slashIndex: number;
}

export default function WorkOrderCharges({
  charges,
  defaults,
  onChange,
  presets: propPresets,
}: WorkOrderChargesProps) {
  // Presets catalog state
  const [catalogPresets, setCatalogPresets] = useState<CatalogPreset[]>(
    propPresets || [],
  );
  const [activeSlash, setActiveSlash] = useState<ActiveSlashState | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Quick picker dropdown in section headers ('labor' | 'parts' | null)
  const [quickPickerSection, setQuickPickerSection] = useState<
    'labor' | 'parts' | null
  >(null);
  const [quickSearch, setQuickSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState<string>('all');

  const paletteRef = useRef<HTMLDivElement | null>(null);
  const quickPickerRef = useRef<HTMLDivElement | null>(null);

  // Fetch catalog presets
  const loadPresets = useCallback(async () => {
    try {
      if (window.repairDesk?.listCatalogPresets) {
        const list = await window.repairDesk.listCatalogPresets();
        setCatalogPresets(list);
      }
    } catch (e) {
      console.warn('Could not load catalog presets in charges:', e);
    }
  }, []);

  useEffect(() => {
    if (!propPresets || propPresets.length === 0) {
      void loadPresets();
    } else {
      setCatalogPresets(propPresets);
    }

    const onUpdated = () => void loadPresets();
    window.addEventListener('katia:presets-updated', onUpdated);
    return () => window.removeEventListener('katia:presets-updated', onUpdated);
  }, [loadPresets, propPresets]);

  // Click outside listener for quick picker and slash palette
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (quickPickerRef.current && !quickPickerRef.current.contains(target)) {
        setQuickPickerSection(null);
      }
      if (paletteRef.current && !paletteRef.current.contains(target)) {
        // Only close if not clicking an input
        if (!(target as HTMLElement)?.classList?.contains('row-desc-input')) {
          setActiveSlash(null);
        }
      }
    };
    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, []);

  // Separate charges into Labor/Services vs Replacement Parts
  const laborLines = useMemo(
    () => charges.filter((c) => c.kind !== 'parts'),
    [charges],
  );

  const partLines = useMemo(
    () => charges.filter((c) => c.kind === 'parts'),
    [charges],
  );

  // Subtotals
  const laborSubtotal = useMemo(
    () => laborLines.reduce((sum, line) => sum + lineTotal(line), 0),
    [laborLines],
  );

  const partsSubtotal = useMemo(
    () => partLines.reduce((sum, line) => sum + lineTotal(line), 0),
    [partLines],
  );

  // --- Labor Operations Handlers ---
  const updateLabor = (index: number, patch: Partial<ChargeLine>) => {
    const next = laborLines.map((line, i) =>
      i === index ? { ...line, ...patch } : line,
    );
    onChange([...next, ...partLines]);
  };

  const changeLaborKind = (index: number, kind: ChargeKind) => {
    const line = laborLines[index];
    const overridden =
      line.taxable !== undefined &&
      line.taxable !== defaultTaxable(line.kind, defaults);
    updateLabor(index, {
      kind,
      taxable: overridden ? line.taxable : defaultTaxable(kind, defaults),
    });
  };

  const addLabor = () => {
    const newLine: ChargeLine = {
      kind: 'labor',
      description: '',
      amount: '',
      quantity: '1',
      unitPrice: '',
      taxable: defaultTaxable('labor', defaults),
    };
    onChange([...laborLines, newLine, ...partLines]);
  };

  const removeLabor = (index: number) => {
    const next = laborLines.filter((_, i) => i !== index);
    onChange([...next, ...partLines]);
    if (activeSlash?.section === 'labor' && activeSlash.index === index) {
      setActiveSlash(null);
    }
  };

  // --- Replacement Parts Handlers ---
  const updatePart = (index: number, patch: Partial<ChargeLine>) => {
    const next = partLines.map((line, i) =>
      i === index ? { ...line, ...patch } : line,
    );
    onChange([...laborLines, ...next]);
  };

  const addPart = () => {
    const newLine: ChargeLine = {
      kind: 'parts',
      partNumber: '',
      description: '',
      amount: '',
      quantity: '1',
      unitPrice: '',
      taxable: defaultTaxable('parts', defaults),
    };
    onChange([...laborLines, ...partLines, newLine]);
  };

  const removePart = (index: number) => {
    const next = partLines.filter((_, i) => i !== index);
    onChange([...laborLines, ...next]);
    if (activeSlash?.section === 'parts' && activeSlash.index === index) {
      setActiveSlash(null);
    }
  };

  // --- Quick Presets Appender ---
  const handleInsertPreset = (
    section: 'labor' | 'parts',
    preset: CatalogPreset,
  ) => {
    const newLine: ChargeLine = {
      kind:
        section === 'labor'
          ? preset.category === 'parts'
            ? 'labor'
            : preset.category
          : 'parts',
      description: preset.description,
      partNumber: preset.partNumber || '',
      quantity: String(preset.defaultQuantity ?? 1),
      unitPrice: preset.defaultPrice > 0 ? String(preset.defaultPrice) : '',
      amount:
        preset.defaultPrice > 0
          ? (preset.defaultPrice * (preset.defaultQuantity ?? 1)).toFixed(2)
          : '',
      taxable: preset.taxable,
    };

    if (section === 'labor') {
      onChange([...laborLines, newLine, ...partLines]);
    } else {
      onChange([...laborLines, ...partLines, newLine]);
    }
    setQuickPickerSection(null);
    setQuickSearch('');
  };

  // --- Slash Command Input & Keyboard Detection ---
  const handleDescChange = (
    section: 'labor' | 'parts',
    index: number,
    value: string,
  ) => {
    if (section === 'labor') {
      updateLabor(index, { description: value });
    } else {
      updatePart(index, { description: value });
    }

    const lastSlash = value.lastIndexOf('/');
    if (lastSlash !== -1) {
      const beforeSlash = value.slice(0, lastSlash);
      // Valid slash if at beginning of input or immediately preceded by whitespace
      if (lastSlash === 0 || /\s$/.test(beforeSlash)) {
        const query = value.slice(lastSlash + 1);
        if (!query.includes(' ')) {
          setActiveSlash({
            section,
            index,
            query: query.toLowerCase(),
            slashIndex: lastSlash,
          });
          setHighlightedIndex(0);
          return;
        }
      }
    }

    if (
      activeSlash &&
      activeSlash.section === section &&
      activeSlash.index === index
    ) {
      setActiveSlash(null);
    }
  };

  // Filter presets for the active slash command
  const activeSlashMatches = useMemo(() => {
    if (!activeSlash) return [];
    const q = activeSlash.query.trim();
    const isLabor = activeSlash.section === 'labor';

    // Prioritize section category
    const list = [...catalogPresets].sort((a, b) => {
      const aMatchesSection = isLabor
        ? a.category !== 'parts'
        : a.category === 'parts';
      const bMatchesSection = isLabor
        ? b.category !== 'parts'
        : b.category === 'parts';
      if (aMatchesSection && !bMatchesSection) return -1;
      if (!aMatchesSection && bMatchesSection) return 1;
      return 0;
    });

    if (!q) return list;

    return list.filter((p) => {
      return (
        p.shortcut.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.partNumber && p.partNumber.toLowerCase().includes(q))
      );
    });
  }, [activeSlash, catalogPresets]);

  // Apply selected preset into the active row
  const applyPreset = (
    section: 'labor' | 'parts',
    index: number,
    preset: CatalogPreset,
  ) => {
    const isLabor = section === 'labor';
    const line = isLabor ? laborLines[index] : partLines[index];
    if (!line) return;

    let newDesc = preset.description;
    if (
      activeSlash &&
      activeSlash.section === section &&
      activeSlash.index === index
    ) {
      const beforeSlash = line.description.slice(0, activeSlash.slashIndex);
      if (beforeSlash.trim()) {
        newDesc = `${beforeSlash.trim()} - ${preset.description}`;
      } else {
        newDesc = preset.description;
      }
    }

    const patch: Partial<ChargeLine> = {
      description: newDesc,
      quantity: String(preset.defaultQuantity ?? 1),
      unitPrice: preset.defaultPrice > 0 ? String(preset.defaultPrice) : '',
      taxable: preset.taxable,
    };

    if (preset.partNumber) {
      patch.partNumber = preset.partNumber;
    }

    if (isLabor) {
      patch.kind = preset.category === 'parts' ? 'labor' : preset.category;
      updateLabor(index, patch);
    } else {
      patch.kind = 'parts';
      updatePart(index, patch);
    }

    setActiveSlash(null);
  };

  const handleDescKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    section: 'labor' | 'parts',
    index: number,
  ) => {
    if (
      !activeSlash ||
      activeSlash.section !== section ||
      activeSlash.index !== index
    ) {
      return;
    }

    if (activeSlashMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % activeSlashMatches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex(
          (prev) =>
            (prev - 1 + activeSlashMatches.length) % activeSlashMatches.length,
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (activeSlashMatches[highlightedIndex]) {
          e.preventDefault();
          applyPreset(section, index, activeSlashMatches[highlightedIndex]);
          return;
        }
      }
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setActiveSlash(null);
    }
  };

  // Filtered list for the quick picker header dropdown
  const quickPickerList = useMemo(() => {
    const q = quickSearch.toLowerCase().trim();
    const isLabor = quickPickerSection === 'labor';
    return catalogPresets.filter((p) => {
      if (quickFilter !== 'all') {
        if (p.category !== quickFilter) return false;
      } else {
        // If 'all', default filter to matching section
        if (isLabor && p.category === 'parts' && !q) return false;
        if (!isLabor && p.category !== 'parts' && !q) return false;
      }
      if (!q) return true;
      return (
        p.shortcut.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.partNumber && p.partNumber.toLowerCase().includes(q))
      );
    });
  }, [catalogPresets, quickSearch, quickFilter, quickPickerSection]);

  return (
    <div className="work-order-charges-container full-width">
      {/* 1. Labor & Work Performed Section */}
      <section
        className="charges-section labor-section"
        aria-label="Labor and work performed"
      >
        <div className="section-bar">
          <div className="section-title-wrap">
            <div className="section-badge labor-badge">
              <Wrench size={14} />
            </div>
            <div>
              <h3>Labor / Work Performed</h3>
              <span className="section-subtitle">
                Services, body repairs, paint refinishing &amp; labor operations
              </span>
            </div>
          </div>
          <div className="section-actions">
            <span className="section-subtotal">
              Labor subtotal: <strong>${laborSubtotal.toFixed(2)}</strong>
            </span>

            {/* Quick Presets Picker Button */}
            <div
              className="presets-anchor"
              ref={quickPickerSection === 'labor' ? quickPickerRef : null}
            >
              <button
                type="button"
                className="section-add-btn presets-add"
                onClick={() => {
                  setQuickPickerSection(
                    quickPickerSection === 'labor' ? null : 'labor',
                  );
                  setQuickSearch('');
                  setQuickFilter('all');
                }}
                title="Pick from body shop presets catalog"
              >
                <Sparkles size={13} />
                <span>Presets (/)</span>
                <ChevronDown size={12} className="opacity-70" />
              </button>

              {quickPickerSection === 'labor' && (
                <div className="slash-presets-palette">
                  <div className="palette-header">
                    <div className="palette-header-title">
                      <Sparkles size={13} />
                      <span>Body Shop Labor Presets</span>
                    </div>
                    <span className="palette-header-hint">
                      Click to add line
                    </span>
                  </div>
                  <div className="palette-search-wrap">
                    <Search size={13} className="palette-search-icon" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search labor operations or shortcuts…"
                      className="palette-search-input"
                      value={quickSearch}
                      onChange={(e) => setQuickSearch(e.target.value)}
                    />
                  </div>
                  <div className="palette-list">
                    {quickPickerList.length === 0 ? (
                      <div className="palette-empty">No presets found.</div>
                    ) : (
                      quickPickerList.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="palette-item"
                          onClick={() => handleInsertPreset('labor', p)}
                        >
                          <div className="palette-item-main">
                            <div className="palette-item-header">
                              <span className="palette-shortcut-badge">
                                /{p.shortcut}
                              </span>
                              <strong className="palette-item-name">
                                {p.name}
                              </strong>
                              {p.partNumber && (
                                <span className="palette-item-code">
                                  {p.partNumber}
                                </span>
                              )}
                            </div>
                            <p className="palette-item-desc">{p.description}</p>
                          </div>
                          <div className="palette-item-meta">
                            <div className="palette-item-price">
                              ${p.defaultPrice.toFixed(2)}
                            </div>
                            <div className="palette-item-qty">
                              {p.defaultQuantity ?? 1} hrs
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              className="section-add-btn primary-add"
              onClick={addLabor}
            >
              <Plus size={14} /> Add labor / service
            </button>
          </div>
        </div>

        {laborLines.length > 0 && (
          <div className="charge-column-labels labor-columns">
            <span className="col-type">Type</span>
            <span className="col-qty">Hours/Qty</span>
            <span className="col-desc">Work / service description</span>
            <span className="col-price">Rate/Price</span>
            <span className="col-total">Amount</span>
            <span className="col-tax">Tax</span>
            <span className="col-del" />
          </div>
        )}

        <div className="charges-list">
          {laborLines.length === 0 ? (
            <div className="charges-empty-card">
              <div className="empty-card-text">
                <Wrench size={16} className="empty-icon" />
                <span>
                  No labor operations added yet. Click &ldquo;Add labor /
                  service&rdquo; or &ldquo;Presets (/)&rdquo; to add body work,
                  refinishing, or mechanical labor.
                </span>
              </div>
              <div className="empty-card-actions">
                <button
                  type="button"
                  className="empty-card-action presets"
                  onClick={() => {
                    setQuickPickerSection('labor');
                    setQuickSearch('');
                  }}
                >
                  <Sparkles size={13} />
                  <span>Presets (/)</span>
                </button>
                <button
                  type="button"
                  className="empty-card-action"
                  onClick={addLabor}
                >
                  ＋ Add labor
                </button>
              </div>
            </div>
          ) : (
            laborLines.map((line, index) => {
              const isSlashOpen =
                activeSlash?.section === 'labor' && activeSlash.index === index;

              return (
                <div className="charge-row labor-row" key={index}>
                  <select
                    className="row-kind-select"
                    aria-label="Charge category"
                    value={line.kind}
                    onChange={(e) =>
                      changeLaborKind(index, e.target.value as ChargeKind)
                    }
                  >
                    <option value="labor">Labor</option>
                    <option value="sublet">Sublet</option>
                    <option value="fluids">Gas, oil &amp; fluids</option>
                    <option value="disposal">EPA / disposal</option>
                    <option value="other">Other</option>
                  </select>

                  <input
                    className="row-qty-input"
                    aria-label="Labor hours or quantity"
                    type="number"
                    min="0"
                    step="0.1"
                    value={line.quantity ?? '1'}
                    onChange={(e) =>
                      updateLabor(index, { quantity: e.target.value })
                    }
                    placeholder="Hrs"
                  />

                  {/* Description input with Slash Command Dropdown */}
                  <div className="row-desc-wrap">
                    <input
                      className="row-desc-input"
                      aria-label="Work description"
                      value={line.description}
                      onChange={(e) =>
                        handleDescChange('labor', index, e.target.value)
                      }
                      onKeyDown={(e) => handleDescKeyDown(e, 'labor', index)}
                      placeholder="Description, or / for presets"
                    />

                    {isSlashOpen && (
                      <div
                        className="slash-presets-palette"
                        ref={paletteRef}
                        role="listbox"
                      >
                        <div className="palette-header">
                          <div className="palette-header-title">
                            <Sparkles size={13} />
                            <span>Body Shop Presets</span>
                            {activeSlash.query && (
                              <span className="palette-shortcut-badge">
                                /{activeSlash.query}
                              </span>
                            )}
                          </div>
                          <span className="palette-header-hint">
                            ↑↓ to navigate · Enter to select · Esc to close
                          </span>
                        </div>

                        <div className="palette-list">
                          {activeSlashMatches.length === 0 ? (
                            <div className="palette-empty">
                              No presets matching &ldquo;/{activeSlash.query}
                              &rdquo;. Keep typing or press Esc.
                            </div>
                          ) : (
                            activeSlashMatches.map((preset, pIdx) => {
                              const isSelected = pIdx === highlightedIndex;
                              return (
                                <div
                                  key={preset.id}
                                  role="option"
                                  aria-selected={isSelected}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    applyPreset('labor', index, preset);
                                  }}
                                  onMouseEnter={() => setHighlightedIndex(pIdx)}
                                  className={`palette-item ${isSelected ? 'active' : ''}`}
                                >
                                  <div className="palette-item-main">
                                    <div className="palette-item-header">
                                      <span className="palette-shortcut-badge">
                                        /{preset.shortcut}
                                      </span>
                                      <strong className="palette-item-name">
                                        {preset.name}
                                      </strong>
                                      {preset.partNumber && (
                                        <span className="palette-item-code">
                                          {preset.partNumber}
                                        </span>
                                      )}
                                    </div>
                                    <p className="palette-item-desc">
                                      {preset.description}
                                    </p>
                                  </div>

                                  <div className="palette-item-meta">
                                    <div className="palette-item-price">
                                      ${preset.defaultPrice.toFixed(2)}
                                      {preset.category === 'labor' ? '/hr' : ''}
                                    </div>
                                    <div className="palette-item-qty">
                                      {preset.defaultQuantity ?? 1}{' '}
                                      {preset.category === 'labor'
                                        ? 'hrs'
                                        : 'qty'}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <input
                    className="row-price-input"
                    aria-label="Hourly rate or price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unitPrice ?? ''}
                    onChange={(e) =>
                      updateLabor(index, { unitPrice: e.target.value })
                    }
                    placeholder="0.00"
                  />

                  <output
                    className="row-total-output"
                    aria-label="Labor total"
                    title="Hours × rate"
                  >
                    ${lineTotal(line).toFixed(2)}
                  </output>

                  <label
                    className="row-tax-label"
                    title="Include labor in sales tax"
                  >
                    <input
                      type="checkbox"
                      checked={
                        line.taxable ?? defaultTaxable(line.kind, defaults)
                      }
                      onChange={(e) =>
                        updateLabor(index, { taxable: e.target.checked })
                      }
                    />
                    <span>Tax</span>
                  </label>

                  <button
                    type="button"
                    className="row-remove-btn"
                    aria-label="Remove labor line"
                    onClick={() => removeLabor(index)}
                    title="Remove this line"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* 2. Replacement Parts Section */}
      <section
        className="charges-section parts-section"
        aria-label="Replacement parts"
      >
        <div className="section-bar">
          <div className="section-title-wrap">
            <div className="section-badge parts-badge">
              <Package size={14} />
            </div>
            <div>
              <h3>Parts Replaced</h3>
              <span className="section-subtitle">
                OEM, aftermarket, or replacement components installed on vehicle
              </span>
            </div>
          </div>
          <div className="section-actions">
            <span className="section-subtotal">
              Parts subtotal: <strong>${partsSubtotal.toFixed(2)}</strong>
            </span>

            {/* Quick Parts Presets Picker Button */}
            <div
              className="presets-anchor"
              ref={quickPickerSection === 'parts' ? quickPickerRef : null}
            >
              <button
                type="button"
                className="section-add-btn presets-add"
                onClick={() => {
                  setQuickPickerSection(
                    quickPickerSection === 'parts' ? null : 'parts',
                  );
                  setQuickSearch('');
                  setQuickFilter('parts');
                }}
                title="Pick from body shop replacement parts catalog"
              >
                <Sparkles size={13} />
                <span>Presets (/)</span>
                <ChevronDown size={12} className="opacity-70" />
              </button>

              {quickPickerSection === 'parts' && (
                <div className="slash-presets-palette">
                  <div className="palette-header">
                    <div className="palette-header-title">
                      <Sparkles size={13} />
                      <span>Body Shop Parts &amp; Materials Presets</span>
                    </div>
                    <span className="palette-header-hint">
                      Click to add line
                    </span>
                  </div>
                  <div className="palette-search-wrap">
                    <Search size={13} className="palette-search-icon" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search parts, supplies or shortcuts…"
                      className="palette-search-input"
                      value={quickSearch}
                      onChange={(e) => setQuickSearch(e.target.value)}
                    />
                  </div>
                  <div className="palette-list">
                    {quickPickerList.length === 0 ? (
                      <div className="palette-empty">No presets found.</div>
                    ) : (
                      quickPickerList.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="palette-item"
                          onClick={() => handleInsertPreset('parts', p)}
                        >
                          <div className="palette-item-main">
                            <div className="palette-item-header">
                              <span className="palette-shortcut-badge">
                                /{p.shortcut}
                              </span>
                              <strong className="palette-item-name">
                                {p.name}
                              </strong>
                              {p.partNumber && (
                                <span className="palette-item-code">
                                  {p.partNumber}
                                </span>
                              )}
                            </div>
                            <p className="palette-item-desc">{p.description}</p>
                          </div>
                          <div className="palette-item-meta">
                            <div className="palette-item-price">
                              ${p.defaultPrice.toFixed(2)}
                            </div>
                            <div className="palette-item-qty">
                              {p.defaultQuantity ?? 1} qty
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              className="section-add-btn parts-add"
              onClick={addPart}
            >
              <Plus size={14} /> Add replacement part
            </button>
          </div>
        </div>

        {partLines.length > 0 && (
          <div className="charge-column-labels parts-columns">
            <span className="col-qty">Qty</span>
            <span className="col-partno">Part Number</span>
            <span className="col-desc">Part description</span>
            <span className="col-price">Unit Price</span>
            <span className="col-total">Amount</span>
            <span className="col-tax">Tax</span>
            <span className="col-del" />
          </div>
        )}

        <div className="charges-list">
          {partLines.length === 0 ? (
            <div className="charges-empty-card labor-only-notice">
              <div className="empty-card-text">
                <Package size={16} className="empty-icon" />
                <span>
                  <strong>No parts required</strong> — This is currently a
                  labor-only repair. If replacement parts or materials are
                  needed, click &ldquo;Add replacement part&rdquo; or
                  &ldquo;Presets (/)&rdquo;.
                </span>
              </div>
              <div className="empty-card-actions">
                <button
                  type="button"
                  className="empty-card-action presets"
                  onClick={() => {
                    setQuickPickerSection('parts');
                    setQuickSearch('');
                    setQuickFilter('parts');
                  }}
                >
                  <Sparkles size={13} />
                  <span>Presets (/)</span>
                </button>
                <button
                  type="button"
                  className="empty-card-action"
                  onClick={addPart}
                >
                  ＋ Add a part
                </button>
              </div>
            </div>
          ) : (
            partLines.map((line, index) => {
              const isSlashOpen =
                activeSlash?.section === 'parts' && activeSlash.index === index;

              return (
                <div className="charge-row parts-row" key={index}>
                  <input
                    className="row-qty-input"
                    aria-label="Part quantity"
                    type="number"
                    min="0"
                    step="1"
                    value={line.quantity ?? '1'}
                    onChange={(e) =>
                      updatePart(index, { quantity: e.target.value })
                    }
                    placeholder="Qty"
                  />

                  <input
                    className="row-partno-input"
                    aria-label="Part number"
                    value={line.partNumber ?? ''}
                    onChange={(e) =>
                      updatePart(index, { partNumber: e.target.value })
                    }
                    placeholder="Part no."
                  />

                  {/* Description input with Slash Command Dropdown */}
                  <div className="row-desc-wrap">
                    <input
                      className="row-desc-input"
                      aria-label="Part description"
                      value={line.description}
                      onChange={(e) =>
                        handleDescChange('parts', index, e.target.value)
                      }
                      onKeyDown={(e) => handleDescKeyDown(e, 'parts', index)}
                      placeholder="Description, or / for presets"
                    />

                    {isSlashOpen && (
                      <div
                        className="slash-presets-palette"
                        ref={paletteRef}
                        role="listbox"
                      >
                        <div className="palette-header">
                          <div className="palette-header-title">
                            <Sparkles size={13} />
                            <span>Body Shop Presets</span>
                            {activeSlash.query && (
                              <span className="palette-shortcut-badge">
                                /{activeSlash.query}
                              </span>
                            )}
                          </div>
                          <span className="palette-header-hint">
                            ↑↓ to navigate · Enter to select · Esc to close
                          </span>
                        </div>

                        <div className="palette-list">
                          {activeSlashMatches.length === 0 ? (
                            <div className="palette-empty">
                              No presets matching &ldquo;/{activeSlash.query}
                              &rdquo;. Keep typing or press Esc.
                            </div>
                          ) : (
                            activeSlashMatches.map((preset, pIdx) => {
                              const isSelected = pIdx === highlightedIndex;
                              return (
                                <div
                                  key={preset.id}
                                  role="option"
                                  aria-selected={isSelected}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    applyPreset('parts', index, preset);
                                  }}
                                  onMouseEnter={() => setHighlightedIndex(pIdx)}
                                  className={`palette-item ${isSelected ? 'active' : ''}`}
                                >
                                  <div className="palette-item-main">
                                    <div className="palette-item-header">
                                      <span className="palette-shortcut-badge">
                                        /{preset.shortcut}
                                      </span>
                                      <strong className="palette-item-name">
                                        {preset.name}
                                      </strong>
                                      {preset.partNumber && (
                                        <span className="palette-item-code">
                                          {preset.partNumber}
                                        </span>
                                      )}
                                    </div>
                                    <p className="palette-item-desc">
                                      {preset.description}
                                    </p>
                                  </div>

                                  <div className="palette-item-meta">
                                    <div className="palette-item-price">
                                      ${preset.defaultPrice.toFixed(2)}
                                    </div>
                                    <div className="palette-item-qty">
                                      {preset.defaultQuantity ?? 1} qty
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <input
                    className="row-price-input"
                    aria-label="Unit price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unitPrice ?? ''}
                    onChange={(e) =>
                      updatePart(index, { unitPrice: e.target.value })
                    }
                    placeholder="0.00"
                  />

                  <output
                    className="row-total-output"
                    aria-label="Part total"
                    title="Quantity × unit price"
                  >
                    ${lineTotal(line).toFixed(2)}
                  </output>

                  <label
                    className="row-tax-label"
                    title="Include part in sales tax"
                  >
                    <input
                      type="checkbox"
                      checked={
                        line.taxable ?? defaultTaxable('parts', defaults)
                      }
                      onChange={(e) =>
                        updatePart(index, { taxable: e.target.checked })
                      }
                    />
                    <span>Tax</span>
                  </label>

                  <button
                    type="button"
                    className="row-remove-btn"
                    aria-label="Remove part"
                    onClick={() => removePart(index)}
                    title="Remove this part"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

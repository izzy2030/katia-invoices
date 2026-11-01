import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, User, Car, X, Clock, ChevronDown, Check } from 'lucide-react';
import type { CustomerProfile, CustomerVehicle } from './customerHistory';

interface CustomerAutofillSearchProps {
  customers: CustomerProfile[];
  onSelect: (customer: CustomerProfile, vehicle?: CustomerVehicle) => void;
}

interface SelectableItem {
  id: string;
  type: 'vehicle' | 'customer';
  customer: CustomerProfile;
  vehicle?: CustomerVehicle;
}

export default function CustomerAutofillSearch({
  customers,
  onSelect,
}: CustomerAutofillSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedNotice, setSelectedNotice] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sort customers so the most recent appear first
  const sortedCustomers = useMemo(() => {
    return [...customers].sort((a, b) => {
      const dateA = a.orders[0]?.dateIn || a.lastVisit || '';
      const dateB = b.orders[0]?.dateIn || b.lastVisit || '';
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return a.name.localeCompare(b.name);
    });
  }, [customers]);

  // Default: strictly the 5 most recent customers
  const defaultRecentCustomers = useMemo(() => {
    return sortedCustomers.slice(0, 5);
  }, [sortedCustomers]);

  // Filtered results based on search query
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return defaultRecentCustomers;

    const digits = q.replace(/\D/g, '');

    return sortedCustomers.filter((customer) => {
      if (customer.name.toLowerCase().includes(q)) return true;
      if (customer.phone.toLowerCase().includes(q)) return true;
      if (
        digits.length >= 3 &&
        customer.phone.replace(/\D/g, '').includes(digits)
      )
        return true;
      if (customer.email?.toLowerCase().includes(q)) return true;
      if (customer.address?.toLowerCase().includes(q)) return true;

      return customer.vehicles.some((v) => {
        if (v.label.toLowerCase().includes(q)) return true;
        if (v.vehicleMake.toLowerCase().includes(q)) return true;
        if (v.vehicleModel.toLowerCase().includes(q)) return true;
        if (v.vehicleYear.includes(q)) return true;
        if (v.licensePlate.toLowerCase().includes(q)) return true;
        if (v.vin.toLowerCase().includes(q)) return true;
        return false;
      });
    });
  }, [sortedCustomers, defaultRecentCustomers, query]);

  // Build a flat list of selectable items for arrow key navigation
  const flatItems = useMemo<SelectableItem[]>(() => {
    const items: SelectableItem[] = [];
    for (const customer of searchResults) {
      if (customer.vehicles.length === 0) {
        items.push({
          id: `customer-${customer.key}`,
          type: 'customer',
          customer,
        });
      } else {
        for (const vehicle of customer.vehicles) {
          items.push({
            id: `vehicle-${customer.key}-${vehicle.key}`,
            type: 'vehicle',
            customer,
            vehicle,
          });
        }
        items.push({
          id: `customer-only-${customer.key}`,
          type: 'customer',
          customer,
        });
      }
    }
    return items;
  }, [searchResults]);

  // When query changes or dropdown opens with items, highlight the first item
  useEffect(() => {
    if (isOpen && flatItems.length > 0) {
      setHighlightedIndex(0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [query, isOpen, flatItems.length]);

  // Scroll active item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && highlightedIndex < flatItems.length) {
      const activeItem = flatItems[highlightedIndex];
      const el = itemRefs.current.get(activeItem.id);
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, flatItems]);

  const isSearching = query.trim().length > 0;

  const handleSelect = (
    customer: CustomerProfile,
    vehicle?: CustomerVehicle,
  ) => {
    onSelect(customer, vehicle);
    const vehicleText = vehicle?.label ? ` — ${vehicle.label}` : '';
    setSelectedNotice(`${customer.name}${vehicleText}`);
    setIsOpen(false);
    setHighlightedIndex(-1);
    setQuery('');

    // Clear confirmation badge after 3 seconds
    setTimeout(() => {
      setSelectedNotice(null);
    }, 3200);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
      } else if (flatItems.length > 0) {
        setHighlightedIndex((prev) =>
          prev < flatItems.length - 1 ? prev + 1 : 0,
        );
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(flatItems.length - 1);
      } else if (flatItems.length > 0) {
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : flatItems.length - 1,
        );
      }
    } else if (e.key === 'Enter') {
      if (
        isOpen &&
        highlightedIndex >= 0 &&
        highlightedIndex < flatItems.length
      ) {
        e.preventDefault();
        const selected = flatItems[highlightedIndex];
        handleSelect(selected.customer, selected.vehicle);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setHighlightedIndex(-1);
      inputRef.current?.blur();
    }
  };

  const registerItemRef = (id: string, el: HTMLElement | null) => {
    if (el) {
      itemRefs.current.set(id, el);
    } else {
      itemRefs.current.delete(id);
    }
  };

  const activeId =
    highlightedIndex >= 0 && highlightedIndex < flatItems.length
      ? flatItems[highlightedIndex].id
      : undefined;

  return (
    <div
      className="customer-autofill-search full-width"
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      <div className="autofill-header-row">
        <label htmlFor="customer-autofill-input" className="autofill-label">
          <span>Autofill from history</span>
        </label>
        {selectedNotice && (
          <span className="autofill-success-badge animate-in">
            <Check size={12} />
            <span>Filled: {selectedNotice}</span>
          </span>
        )}
      </div>

      <div className="autofill-input-container">
        <Search size={15} className="autofill-search-icon" />
        <input
          id="customer-autofill-input"
          ref={inputRef}
          type="text"
          className="autofill-input"
          placeholder="Search past customers, vehicles, phone, plate, or VIN…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
          }}
          autoComplete="off"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-activedescendant={activeId}
        />

        {query && (
          <button
            type="button"
            className="autofill-clear-btn"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            title="Clear search"
            aria-label="Clear customer search"
          >
            <X size={14} />
          </button>
        )}

        <button
          type="button"
          className={`autofill-chevron-btn ${isOpen ? 'open' : ''}`}
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) inputRef.current?.focus();
          }}
          aria-label={isOpen ? 'Close suggestions' : 'Show suggestions'}
          title={isOpen ? 'Close suggestions' : 'Show suggestions'}
        >
          <ChevronDown size={15} />
        </button>
      </div>

      {isOpen && (
        <div className="autofill-dropdown animate-in" role="listbox">
          <div className="dropdown-meta-bar">
            {isSearching ? (
              <span className="meta-badge search-badge">
                <Search size={12} />
                <span>
                  {searchResults.length}{' '}
                  {searchResults.length === 1 ? 'match' : 'matches'} for “
                  {query.trim()}”
                </span>
              </span>
            ) : (
              <span className="meta-badge recent-badge">
                <Clock size={12} />
                <span>5 Most Recent Customers</span>
              </span>
            )}
            <span className="dropdown-hint">
              Use ↑↓ arrows + Enter or click to select
            </span>
          </div>

          <div className="dropdown-scroll-body">
            {searchResults.length === 0 ? (
              <div className="dropdown-empty-state">
                <p className="empty-title">
                  No past customers found matching “{query.trim()}”
                </p>
                <p className="empty-desc">
                  Try searching by last name, phone digits, vehicle make, or
                  license plate.
                </p>
              </div>
            ) : (
              searchResults.map((customer) => {
                const customerOnlyId = `customer-only-${customer.key}`;
                const customerOnlyIndex = flatItems.findIndex(
                  (item) => item.id === customerOnlyId,
                );
                const isCustomerOnlyHighlighted =
                  customerOnlyIndex === highlightedIndex;

                const directCustomerId = `customer-${customer.key}`;
                const directCustomerIndex = flatItems.findIndex(
                  (item) => item.id === directCustomerId,
                );
                const isDirectCustomerHighlighted =
                  directCustomerIndex === highlightedIndex;

                return (
                  <div key={customer.key} className="dropdown-customer-group">
                    {/* Customer Row */}
                    <div
                      className={`customer-group-header ${isDirectCustomerHighlighted ? 'highlighted' : ''}`}
                      ref={(el) => registerItemRef(directCustomerId, el)}
                      onClick={() => {
                        if (customer.vehicles.length === 0) {
                          handleSelect(customer);
                        }
                      }}
                      style={{
                        cursor:
                          customer.vehicles.length === 0
                            ? 'pointer'
                            : 'default',
                      }}
                    >
                      <div className="customer-avatar-badge">
                        <User size={13} />
                      </div>
                      <div className="customer-header-info">
                        <span className="customer-header-name">
                          {customer.name}
                        </span>
                        {customer.phone && (
                          <span className="customer-header-phone">
                            {customer.phone}
                          </span>
                        )}
                      </div>
                      {customer.vehicles.length > 0 ? (
                        <button
                          type="button"
                          ref={(el) => registerItemRef(customerOnlyId, el)}
                          className={`autofill-customer-only-btn ${isCustomerOnlyHighlighted ? 'highlighted' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelect(customer);
                          }}
                          onMouseEnter={() => {
                            if (customerOnlyIndex >= 0)
                              setHighlightedIndex(customerOnlyIndex);
                          }}
                          title={`Autofill customer details for ${customer.name}`}
                        >
                          Fill contact only
                        </button>
                      ) : (
                        <span className="customer-select-hint">
                          Click or Enter to select
                        </span>
                      )}
                    </div>

                    {/* Vehicles List */}
                    {customer.vehicles.length > 0 && (
                      <div className="customer-vehicles-list">
                        {customer.vehicles.map((vehicle) => {
                          const vehicleItemId = `vehicle-${customer.key}-${vehicle.key}`;
                          const itemIndex = flatItems.findIndex(
                            (item) => item.id === vehicleItemId,
                          );
                          const isHighlighted = itemIndex === highlightedIndex;

                          return (
                            <button
                              key={vehicle.key}
                              ref={(el) => registerItemRef(vehicleItemId, el)}
                              type="button"
                              className={`vehicle-option-item ${isHighlighted ? 'highlighted' : ''}`}
                              onClick={() => handleSelect(customer, vehicle)}
                              onMouseEnter={() => {
                                if (itemIndex >= 0)
                                  setHighlightedIndex(itemIndex);
                              }}
                            >
                              <div className="vehicle-option-icon">
                                <Car size={14} />
                              </div>
                              <div className="vehicle-option-content">
                                <span className="vehicle-option-title">
                                  {vehicle.label}
                                </span>
                                <div className="vehicle-option-tags">
                                  {vehicle.licensePlate && (
                                    <span className="vehicle-tag plate-tag">
                                      Plate: {vehicle.licensePlate}
                                    </span>
                                  )}
                                  {vehicle.vin && (
                                    <span className="vehicle-tag vin-tag">
                                      VIN: {vehicle.vin}
                                    </span>
                                  )}
                                  {vehicle.lastVisit && (
                                    <span className="vehicle-tag date-tag">
                                      Last in: {vehicle.lastVisit}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className="vehicle-select-arrow">
                                Select →
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

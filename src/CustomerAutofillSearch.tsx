import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, User, Car, X, Clock, ChevronDown, Check } from 'lucide-react';
import type { CustomerProfile, CustomerVehicle } from './customerHistory';

interface CustomerAutofillSearchProps {
  customers: CustomerProfile[];
  onSelect: (customer: CustomerProfile, vehicle?: CustomerVehicle) => void;
}

export default function CustomerAutofillSearch({
  customers,
  onSelect,
}: CustomerAutofillSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedNotice, setSelectedNotice] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
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

  const isSearching = query.trim().length > 0;

  const handleSelect = (
    customer: CustomerProfile,
    vehicle?: CustomerVehicle,
  ) => {
    onSelect(customer, vehicle);
    const vehicleText = vehicle?.label ? ` — ${vehicle.label}` : '';
    setSelectedNotice(`${customer.name}${vehicleText}`);
    setIsOpen(false);
    setQuery('');

    // Clear confirmation badge after 3 seconds
    setTimeout(() => {
      setSelectedNotice(null);
    }, 3200);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown' && !isOpen) {
      setIsOpen(true);
    }
  };

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
          onFocus={() => setIsOpen(true)}
          autoComplete="off"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
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
            <span className="dropdown-hint">Click a vehicle or customer</span>
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
              searchResults.map((customer) => (
                <div key={customer.key} className="dropdown-customer-group">
                  {/* Customer Row */}
                  <div className="customer-group-header">
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
                    <button
                      type="button"
                      className="autofill-customer-only-btn"
                      onClick={() => handleSelect(customer)}
                      title={`Autofill customer details for ${customer.name}`}
                    >
                      Fill contact only
                    </button>
                  </div>

                  {/* Vehicles List */}
                  {customer.vehicles.length > 0 && (
                    <div className="customer-vehicles-list">
                      {customer.vehicles.map((vehicle) => (
                        <button
                          key={vehicle.key}
                          type="button"
                          className="vehicle-option-item"
                          onClick={() => handleSelect(customer, vehicle)}
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
                          <span className="vehicle-select-arrow">Select →</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

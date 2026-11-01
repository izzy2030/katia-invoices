import {
  Store,
  Phone,
  MapPin,
  FileText,
  User,
  Wrench,
  Check,
} from 'lucide-react';
import type { ShopTabProps } from './types';

export default function ShopTab({
  shopName,
  setShopName,
  shopPhone,
  setShopPhone,
  shopAddress,
  setShopAddress,
  shopCity,
  setShopCity,
  shopState,
  setShopState,
  shopZip,
  setShopZip,
  nextOrderNum,
  setNextOrderNum,
  defaultTerms,
  setDefaultTerms,
  defaultWrittenBy,
  setDefaultWrittenBy,
  defaultTechnician,
  setDefaultTechnician,
  defaultCallWhenReady,
  setDefaultCallWhenReady,
  defaultSaveOldParts,
  setDefaultSaveOldParts,
  busy,
  onSave,
  saved,
}: ShopTabProps) {
  return (
    <div className="settings-single-col">
      <div className="settings-card-panel">
        <div className="settings-card-top">
          <div className="settings-card-icon-box primary">
            <Store size={26} />
          </div>
          <div>
            <h3>Shop Profile &amp; Document Defaults</h3>
            <p>
              Manage shop identity, contact details, invoice numbering, and
              repair order defaults
            </p>
          </div>
        </div>

        <div className="settings-section-divider">
          <span>Shop Identity &amp; Contact Info</span>
        </div>

        <div className="settings-inputs-grid">
          <div className="settings-input-group">
            <label>
              <span className="dot" />
              Shop / Business Name
            </label>
            <div className="settings-input-wrap">
              <input
                type="text"
                placeholder="Katia Auto Sales & Repairs"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
              />
              <div className="settings-input-icon">
                <Store size={16} />
              </div>
            </div>
          </div>

          <div className="settings-input-group">
            <label>
              <span className="dot" />
              Shop Business Phone
            </label>
            <div className="settings-input-wrap">
              <input
                type="text"
                placeholder="(630) 907-7198"
                value={shopPhone}
                onChange={(e) => setShopPhone(e.target.value)}
              />
              <div className="settings-input-icon">
                <Phone size={16} />
              </div>
            </div>
          </div>

          <div className="settings-input-group full">
            <label>
              <span className="dot" />
              Shop Street Address &amp; Location
            </label>
            <div className="settings-input-wrap">
              <input
                type="text"
                placeholder="1005 Rural St, Aurora, IL 60505"
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
              />
              <div className="settings-input-icon">
                <MapPin size={16} />
              </div>
            </div>
          </div>

          <div className="settings-input-group">
            <label>
              <span className="dot" />
              Default City
            </label>
            <div className="settings-input-wrap">
              <input
                type="text"
                placeholder="Aurora"
                value={shopCity}
                onChange={(e) => setShopCity(e.target.value)}
              />
            </div>
          </div>

          <div className="settings-input-group">
            <label>
              <span className="dot" />
              Default State
            </label>
            <div className="settings-input-wrap">
              <input
                type="text"
                placeholder="IL"
                value={shopState}
                onChange={(e) => setShopState(e.target.value)}
              />
            </div>
          </div>

          <div className="settings-input-group">
            <label>
              <span className="dot" />
              Default ZIP Code
            </label>
            <div className="settings-input-wrap">
              <input
                type="text"
                placeholder="60505"
                value={shopZip}
                onChange={(e) => setShopZip(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="settings-section-divider">
          <span>Repair Order &amp; Document Defaults</span>
        </div>

        <div className="settings-inputs-grid">
          <div className="settings-input-group">
            <label>
              <span className="dot" />
              Next Repair Order Number
            </label>
            <div className="settings-input-wrap">
              <input
                type="text"
                placeholder="1001"
                value={nextOrderNum}
                onChange={(e) => setNextOrderNum(e.target.value)}
              />
              <div className="settings-input-icon">
                <FileText size={16} />
              </div>
            </div>
            <small className="settings-field-hint">
              Sequence number assigned to the next new repair order.
            </small>
          </div>

          <div className="settings-input-group">
            <label>
              <span className="dot" />
              Default Payment Terms
            </label>
            <div className="settings-input-wrap">
              <input
                type="text"
                placeholder="Balance due at vehicle pickup"
                value={defaultTerms}
                onChange={(e) => setDefaultTerms(e.target.value)}
              />
            </div>
          </div>

          <div className="settings-input-group">
            <label>
              <span className="dot" />
              Default Written By (Service Advisor)
            </label>
            <div className="settings-input-wrap">
              <input
                type="text"
                placeholder="Jamie Example"
                value={defaultWrittenBy}
                onChange={(e) => setDefaultWrittenBy(e.target.value)}
              />
              <div className="settings-input-icon">
                <User size={16} />
              </div>
            </div>
          </div>

          <div className="settings-input-group">
            <label>
              <span className="dot" />
              Default Mechanic / Technician
            </label>
            <div className="settings-input-wrap">
              <input
                type="text"
                placeholder="Riley Example"
                value={defaultTechnician}
                onChange={(e) => setDefaultTechnician(e.target.value)}
              />
              <div className="settings-input-icon">
                <Wrench size={16} />
              </div>
            </div>
          </div>

          <div className="settings-input-group">
            <label>
              <span className="dot" />
              Default Call When Ready
            </label>
            <div className="settings-input-wrap">
              <select
                value={defaultCallWhenReady}
                onChange={(e) => setDefaultCallWhenReady(e.target.value)}
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
          </div>

          <div className="settings-input-group">
            <label>
              <span className="dot" />
              Default Save Old Parts
            </label>
            <div className="settings-input-wrap">
              <select
                value={defaultSaveOldParts}
                onChange={(e) => setDefaultSaveOldParts(e.target.value)}
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void onSave()}
          disabled={busy}
          className={`settings-save-button ${saved ? 'saved' : ''}`}
        >
          {saved ? (
            <>
              <Check size={18} />
              <span>Shop Profile Saved!</span>
            </>
          ) : (
            <>
              <Store size={18} />
              <span>{busy ? 'Saving…' : 'Save Shop Profile'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

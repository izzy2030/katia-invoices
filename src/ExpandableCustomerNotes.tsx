import { useState } from 'react';
import { FileText, ChevronDown, ChevronUp, Edit3 } from 'lucide-react';

interface ExpandableCustomerNotesProps {
  value: string;
  onChange: (value: string) => void;
}

export default function ExpandableCustomerNotes({
  value,
  onChange,
}: ExpandableCustomerNotesProps) {
  const [isExpanded, setIsExpanded] = useState(Boolean(value && value.trim()));

  const hasNotes = Boolean(value && value.trim());

  return (
    <div
      className={`expandable-notes-card ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}
    >
      <div className="expandable-notes-header">
        <div className="notes-header-title">
          <FileText size={14} className="notes-icon" />
          <span>Customer notes / concerns</span>
          {hasNotes && <span className="notes-active-pill">Notes on file</span>}
        </div>
        <button
          type="button"
          className="notes-toggle-btn"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          title={isExpanded ? 'Collapse notes' : 'Expand notes'}
        >
          {isExpanded ? (
            <>
              <span>Collapse</span>
              <ChevronUp size={14} />
            </>
          ) : (
            <>
              <span>{hasNotes ? 'Edit' : '+ Add'}</span>
              <ChevronDown size={14} />
            </>
          )}
        </button>
      </div>

      {isExpanded ? (
        <div className="notes-body-expanded animate-in">
          <textarea
            className="notes-textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Describe customer concerns, damage details, or requested body work…"
            rows={3}
          />
          <div className="notes-footer-hint">
            <span>Prints under vehicle details on customer invoice</span>
            {value.trim() && (
              <button
                type="button"
                className="notes-collapse-link"
                onClick={() => setIsExpanded(false)}
              >
                Done
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          className="notes-body-collapsed"
          onClick={() => setIsExpanded(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setIsExpanded(true);
            }
          }}
        >
          {hasNotes ? (
            <div className="notes-preview-content">
              <p className="notes-preview-text">{value}</p>
              <span className="notes-preview-action">
                <Edit3 size={12} /> Edit
              </span>
            </div>
          ) : (
            <div className="notes-empty-trigger">
              <span>+ Click to add damage details or notes…</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

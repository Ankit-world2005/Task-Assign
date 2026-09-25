import React, { useRef, useState } from 'react';
import { formatDate, parseUsDate } from '../utils/dateFormat';

/**
 * DateInput
 * Date field that always shows and accepts MM/DD/YYYY (whatever the browser's locale), with a calendar button.
 * value and onChange use ISO dates (YYYY-MM-DD), the same as a native date input, so API payloads don't change.
 */
export const DateInput = ({ id, value = '', onChange, className = 'form-control', required = false, disabled = false }) => {
  const pickerRef = useRef(null);
  // Text while the user is typing; null shows the formatted value
  const [draft, setDraft] = useState(null);

  const handleTextChange = (e) => {
    // Keep digits only and insert the slashes automatically: MM/DD/YYYY
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
    let text = digits;
    if (digits.length > 4) text = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) text = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setDraft(text);

    if (!text) {
      onChange('');
    } else {
      const iso = parseUsDate(text);
      if (iso) onChange(iso);
    }
  };

  const openPicker = () => {
    const picker = pickerRef.current;
    if (!picker || disabled) return;
    try {
      picker.showPicker();
    } catch {
      // Browsers without showPicker(): typing MM/DD/YYYY still works
      picker.focus();
    }
  };

  return (
    <div className="date-input-wrap">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        className={className}
        placeholder="MM/DD/YYYY"
        value={draft ?? formatDate(value)}
        onChange={handleTextChange}
        // An incomplete or impossible date reverts to the last valid one
        onBlur={() => setDraft(null)}
        maxLength={10}
        pattern={'\\d{2}/\\d{2}/\\d{4}'}
        title="Enter the date as MM/DD/YYYY"
        autoComplete="off"
        required={required}
        disabled={disabled}
      />
      <button
        type="button"
        className="date-input-btn"
        onClick={openPicker}
        disabled={disabled}
        title="Pick a date"
        aria-label="Open calendar"
      >
        📅
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="date-input-native"
        value={value || ''}
        onChange={(e) => {
          setDraft(null);
          onChange(e.target.value);
        }}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
};

export default DateInput;

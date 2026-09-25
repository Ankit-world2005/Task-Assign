import React, { useState, useRef } from 'react';
import { splitRemarks } from '../utils/remarks';

/**
 * ImagePasteRemarks
 * Reusable text input with native clipboard image pasting (Ctrl+V), drag-and-drop,
 * and file attachment support, complete with thumbnail preview and lightbox zoom.
 */
export const ImagePasteRemarks = ({
  value = '',
  onChange,
  image = null,
  onImageChange,
  label = 'Remarks / Special Notes',
  placeholder = 'Type remarks or press Ctrl+V to paste screenshot / image...',
  rows = 3,
  required = false,
  className = 'form-textarea',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const fileInputRef = useRef(null);

  // Compress & resize image to maintain crisp fidelity while keeping base64 payload light
  const processImageFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1280;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Export as JPEG with 0.82 quality for optimal performance
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
        if (onImageChange) {
          onImageChange(compressedDataUrl);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Clipboard Paste Handler (Ctrl + V)
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          processImageFile(file);
        }
        return;
      }
    }
  };

  // Drag & Drop Handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0 && files[0].type.startsWith('image/')) {
      processImageFile(files[0]);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="image-paste-remarks-container" style={{ position: 'relative' }}>
      {/* Label and Quick Attach Trigger */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px 8px', marginBottom: '5px' }}>
        <label className="form-label" style={{ margin: 0, fontSize: '0.73rem', whiteSpace: 'nowrap' }}>
          {label} {required && <span style={{ color: '#c9192e' }}>*</span>}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
            📋 Ctrl+V paste
          </span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: 'rgba(6, 72, 192, 0.1)',
              border: '1px solid rgba(6, 72, 192, 0.25)',
              borderRadius: '4px',
              color: '#0648c0',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              padding: '2px 6px',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
            title="Attach image from disk or screenshot"
          >
            📷 Attach
          </button>
        </div>
      </div>

      {/* Hidden File Input for Image Upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Main Textarea */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          position: 'relative',
          borderRadius: 'var(--radius-sm)',
          border: isDragging ? '2px dashed #0648c0' : 'none',
          transition: 'all 0.2s ease',
        }}
      >
        <textarea
          className={className}
          rows={rows}
          value={value}
          onChange={(e) => onChange && onChange(e.target.value)}
          onPaste={handlePaste}
          placeholder={placeholder}
          required={required}
          style={{ width: '100%' }}
        />

        {isDragging && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(2, 132, 199, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--navy)',
              fontWeight: 700,
              fontSize: '0.9rem',
              pointerEvents: 'none',
            }}
          >
            📥 Drop Image Here to Attach
          </div>
        )}
      </div>

      {/* Attached / Pasted Image Preview Card */}
      {image && (
        <div
          style={{
            marginTop: '6px',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-2)',
            border: '1px solid rgba(6, 72, 192, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              onClick={() => setShowLightbox(true)}
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '5px',
                overflow: 'hidden',
                border: '1px solid rgba(11, 13, 16, 0.2)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
              title="Click to zoom in"
            >
              <img
                src={image}
                alt="Pasted screenshot"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📷 Screenshot Attached</span>
                <span
                  style={{
                    fontSize: '0.66rem',
                    background: 'rgba(6, 72, 192, 0.2)',
                    color: '#0648c0',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    fontWeight: 700,
                  }}
                >
                  Ready
                </span>
              </div>
              <div style={{ fontSize: '0.70rem', color: 'var(--text-dim)', marginTop: '1px' }}>
                <button
                  type="button"
                  onClick={() => setShowLightbox(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#0648c0',
                    padding: 0,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    fontSize: '0.70rem',
                  }}
                >
                  🔍 View Full Size
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onImageChange && onImageChange(null)}
            style={{
              background: 'rgba(201, 25, 46, 0.15)',
              border: '1px solid rgba(201, 25, 46, 0.35)',
              color: '#c9192e',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '0.74rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            title="Remove attached image"
          >
            ✕ Remove
          </button>
        </div>
      )}

      {/* Lightbox Modal for Full-Size Image Inspection */}
      {showLightbox && image && (
        <div
          className="modal-overlay"
          style={{ zIndex: 10000, background: 'rgba(11, 13, 16, 0.6)' }}
          onClick={() => setShowLightbox(false)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              background: 'var(--surface)',
              border: '1px solid var(--border-glass)',
              borderRadius: '12px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: 'var(--shadow-pop)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: '8px',
                marginBottom: '8px',
                borderBottom: '1px solid rgba(11, 13, 16,0.1)',
              }}
            >
              <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--ink)' }}>
                📷 Attached Image Preview
              </span>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowLightbox(false)}
              >
                ✕
              </button>
            </div>
            <img
              src={image}
              alt="Full size attachment"
              style={{
                maxWidth: '85vw',
                maxHeight: '80vh',
                objectFit: 'contain',
                borderRadius: '8px',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * RemarksDisplay
 * Renders remarks text and any attached image thumbnail with full-size lightbox preview.
 */
export const RemarksDisplay = ({ remarks = '', attachment = null }) => {
  const [showLightbox, setShowLightbox] = useState(false);
  const { text: cleanText, image: embeddedImage } = splitRemarks(remarks, attachment);

  return (
    <div>
      {cleanText && (
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{cleanText}</div>
      )}

      {embeddedImage && (
        <div style={{ marginTop: '8px' }}>
          <div
            onClick={() => setShowLightbox(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 8px',
              borderRadius: '6px',
              background: 'rgba(2, 132, 199, 0.12)',
              border: '1px solid rgba(6, 72, 192, 0.3)',
              cursor: 'pointer',
            }}
            title="Click to zoom image"
          >
            <img
              src={embeddedImage}
              alt="Screenshot attachment"
              style={{
                width: '32px',
                height: '32px',
                objectFit: 'cover',
                borderRadius: '4px',
              }}
            />
            <span style={{ fontSize: '0.74rem', color: '#0648c0', fontWeight: 600 }}>
              📷 Attached Screenshot 🔍
            </span>
          </div>

          {showLightbox && (
            <div
              className="modal-overlay"
              style={{ zIndex: 10000, background: 'rgba(11, 13, 16, 0.6)' }}
              onClick={() => setShowLightbox(false)}
            >
              <div
                style={{
                  position: 'relative',
                  maxWidth: '90vw',
                  maxHeight: '90vh',
                  background: 'var(--surface)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '12px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: '8px',
                    marginBottom: '8px',
                    borderBottom: '1px solid rgba(11, 13, 16,0.1)',
                  }}
                >
                  <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--ink)' }}>
                    📷 Attached Image View
                  </span>
                  <button
                    type="button"
                    className="modal-close-btn"
                    onClick={() => setShowLightbox(false)}
                  >
                    ✕
                  </button>
                </div>
                <img
                  src={embeddedImage}
                  alt="Full view attachment"
                  style={{
                    maxWidth: '85vw',
                    maxHeight: '80vh',
                    objectFit: 'contain',
                    borderRadius: '8px',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImagePasteRemarks;

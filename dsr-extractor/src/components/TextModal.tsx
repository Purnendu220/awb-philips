import { useEffect } from 'react';
import type { ExtractedDoc } from '../lib/types';
import { Icon } from './Icon';

export function TextModal({ doc, onClose }: { doc: ExtractedDoc; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Text read from ${doc.fileName}`} onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <div className="modal-title">Text read from PDF</div>
            <div className="muted small">{doc.fileName}</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        <pre>{doc.rawText}</pre>
      </div>
    </div>
  );
}

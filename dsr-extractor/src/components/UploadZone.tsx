import { useRef, useState } from 'react';
import { Icon } from './Icon';

export function UploadZone({ onFiles, compact }: { onFiles: (files: File[]) => void; compact: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      className={`upload ${over ? 'over' : ''} ${compact ? 'compact' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles([...e.dataTransfer.files]);
      }}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      role="button"
      tabIndex={0}
      aria-label="Upload PDF files"
    >
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      <div className="upload-icon">
        <Icon name="upload" size={compact ? 20 : 28} />
      </div>
      <div>
        <div className="upload-title">{compact ? 'Add more PDFs' : 'Drop shipment PDFs here or click to browse'}</div>
        <div className="upload-sub">
          Air Waybills, Commercial Invoices, Bills of Lading - text or scanned. Files are processed in your browser and never uploaded.
        </div>
      </div>
    </div>
  );
}

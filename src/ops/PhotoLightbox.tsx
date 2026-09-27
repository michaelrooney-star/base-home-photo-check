import { MapPin, X } from 'lucide-react';

export function PhotoLightbox({
  photo,
  address,
  city,
  onClose,
}: {
  photo: { title: string; src: string; note: string };
  address: string;
  city: string;
  onClose: () => void;
}) {
  return (
    <div
      className="console-photo-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${photo.title} preview`}
      onClick={onClose}
    >
      <div className="console-photo-lightbox-card" onClick={(e) => e.stopPropagation()}>
        <button className="console-icon-button" type="button" onClick={onClose} aria-label="Close photo preview">
          <X size={18} />
        </button>
        <img src={photo.src} alt={photo.title} />
        <div>
          <h2>{photo.title}</h2>
          <p>{photo.note}</p>
          <span><MapPin size={13} /> {address}, {city}</span>
        </div>
      </div>
    </div>
  );
}

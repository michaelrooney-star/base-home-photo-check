import { Camera } from 'lucide-react';

export type SitePhoto = { id: string; title: string; src: string; note: string };

export function SiteEvidence({
  photos,
  address,
  onOpen,
  subtitle = 'Customer photos from the Home Photo Check app — source system for site context.',
}: {
  photos: SitePhoto[];
  address: string;
  onOpen: (photo: { title: string; src: string; note: string }) => void;
  subtitle?: string;
}) {
  if (!photos.length) {
    return (
      <section className="console-site-evidence">
        <div className="console-evidence-heading">
          <div>
            <p className="console-eyebrow"><span /> SITE EVIDENCE</p>
            <h2>Photo check submission</h2>
            <p>{subtitle}</p>
          </div>
        </div>
        <div className="console-empty-inline">No photos on file for this case yet.</div>
      </section>
    );
  }

  return (
    <section className="console-site-evidence">
      <div className="console-evidence-heading">
        <div>
          <p className="console-eyebrow"><span /> SITE EVIDENCE</p>
          <h2>Photo check submission</h2>
          <p>{subtitle}</p>
        </div>
        <span className="console-evidence-count"><Camera size={15} /> {photos.length} photos</span>
      </div>
      <div className="console-photo-grid">
        {photos.map((photo) => (
          <button className="console-photo-card" key={photo.id} type="button" onClick={() => onOpen(photo)}>
            <img src={photo.src} alt={photo.title} />
            <span><strong>{photo.title}</strong><small>{photo.note}</small></span>
          </button>
        ))}
      </div>
      <p className="console-photo-disclaimer"><Camera size={13} /> Photo Check evidence · {address}</p>
    </section>
  );
}

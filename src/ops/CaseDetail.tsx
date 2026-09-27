import { ArrowLeft, Camera, MapPin, MessageSquare, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { StatusPill } from '../components/ConsoleShell';
import { ActivationReadiness } from './ActivationReadiness';
import type { ActivationGateVM, ExternalEventVM } from './ActivationReadiness';
import type { SystemEventVM, WorkflowNodeVM } from './WorkflowGraph';

type CaseRec = {
  id: string;
  pack: string;
  operationalStatus: 'OPERATIONAL' | 'WAITING' | 'BLOCKED';
  operationalReason: string;
  fingerprint: { address: string; city: string; utility: string; service_amps: number };
  sitePhotos?: { id: string; title: string; src: string; note: string }[];
  activationRoute: string;
  activationGates: ActivationGateVM[];
  externalEvents: ExternalEventVM[];
  workflow?: { nodes: WorkflowNodeVM[]; events: SystemEventVM[] };
  followUpContact?: { organization: string; name: string; email?: string; phone?: string; url?: string; note?: string };
  notes?: CaseNoteVM[];
};

type CaseNoteVM = {
  id: string;
  author: string;
  body: string;
  createdAt: number;
};

export function CaseDetail() {
  const { caseId } = useParams();
  const [rec, setRec] = useState<CaseRec | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<{ title: string; src: string; note: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/ops/cases/${caseId}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        setRec(null);
        setError('Case not found.');
        return;
      }
      setRec(data);
    } catch {
      setRec(null);
      setError('Could not load this case.');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="console-loading">Loading case…</div>;
  if (error || !rec) return (
    <section className="console-page">
      <Link className="console-back-link" to="/ops/admin"><ArrowLeft size={16} /> Back to queue</Link>
      <div className="console-empty-state">{error || 'Case not found.'}</div>
    </section>
  );

  return (
    <section className="console-page console-case-detail">
      <div className="console-case-header">
        <Link className="console-back-link" to="/ops/admin"><ArrowLeft size={16} /> Back to queue</Link>
        <div className="console-case-title">
          <p className="console-eyebrow"><span /> CASE DETAIL</p>
          <h1>Case {rec.id.slice(0, 6)}<span>.</span></h1>
        </div>
        <div className="console-case-actions">
          <StatusPill tone={operationalTone(rec.operationalStatus)}>{operationalLabel(rec.operationalStatus)}</StatusPill>
        </div>
      </div>

      <div className="console-case-meta">
        <div><span>Address</span><strong>{rec.fingerprint.address}</strong></div>
        <div><span>City</span><strong>{rec.fingerprint.city}</strong></div>
        <div><span>Utility</span><strong>{rec.fingerprint.utility}</strong></div>
        <div><span>Service</span><strong>{rec.fingerprint.service_amps} amp</strong></div>
        <div><span>Jurisdiction pack</span><strong><Link to={`/admin/knowledge/packs/${rec.pack}`}>{rec.pack}</Link></strong></div>
      </div>

      <SiteEvidence photos={rec.sitePhotos ?? []} address={rec.fingerprint.address} onOpen={setSelectedPhoto} />

      <CaseNotes caseId={rec.id} notes={rec.notes ?? []} onSaved={load} />

      <section className={`console-review-summary is-${rec.operationalStatus.toLowerCase()}`}>
        <div>
          <p className="console-eyebrow"><span /> OPERATIONAL STATUS</p>
          <h2>{operationalLabel(rec.operationalStatus)}</h2>
          <p>{rec.operationalReason}</p>
        </div>
        <StatusPill tone={operationalTone(rec.operationalStatus)}>{operationalLabel(rec.operationalStatus)}</StatusPill>
      </section>

      <ActivationReadiness
        route={rec.activationRoute}
        gates={rec.activationGates}
        events={rec.externalEvents}
        followUpContact={rec.followUpContact}
        workflow={rec.workflow}
        caseId={rec.id}
        onWorkflowChange={load}
      />

      {selectedPhoto && (
        <div className="console-photo-lightbox" role="dialog" aria-modal="true" aria-label={`${selectedPhoto.title} preview`} onClick={() => setSelectedPhoto(null)}>
          <div className="console-photo-lightbox-card" onClick={(e) => e.stopPropagation()}>
            <button className="console-icon-button" onClick={() => setSelectedPhoto(null)} aria-label="Close photo preview"><X size={18} /></button>
            <img src={selectedPhoto.src} alt={selectedPhoto.title} />
            <div>
              <h2>{selectedPhoto.title}</h2>
              <p>{selectedPhoto.note}</p>
              <span><MapPin size={13} /> {addressLabel(rec.fingerprint.address, rec.fingerprint.city)}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SiteEvidence({ photos, address, onOpen }: { photos: { id: string; title: string; src: string; note: string }[]; address: string; onOpen: (photo: { title: string; src: string; note: string }) => void }) {
  return (
    <section className="console-site-evidence">
      <div className="console-evidence-heading">
        <div>
          <p className="console-eyebrow"><span /> SITE EVIDENCE</p>
          <h2>Photo check submission</h2>
          <p>Customer photos from the Home Photo Check app — source system for site context.</p>
        </div>
        <span className="console-evidence-count"><Camera size={15} /> {photos.length} photos</span>
      </div>
      <div className="console-photo-grid">
        {photos.map((photo) => (
          <button className="console-photo-card" key={photo.id} onClick={() => onOpen(photo)}>
            <img src={photo.src} alt={photo.title} />
            <span><strong>{photo.title}</strong><small>{photo.note}</small></span>
          </button>
        ))}
      </div>
      <p className="console-photo-disclaimer"><Camera size={13} /> Photo Check evidence · {address}</p>
    </section>
  );
}

function CaseNotes({ caseId, notes, onSaved }: { caseId: string; notes: CaseNoteVM[]; onSaved: () => void }) {
  const [draft, setDraft] = useState('');
  const [author, setAuthor] = useState('Base Ops');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!draft.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/ops/cases/${caseId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft, author }),
      });
      if (!res.ok) {
        setError('Could not save this note.');
        return;
      }
      setDraft('');
      onSaved();
    } catch {
      setError('Could not reach the API.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="console-notes-section">
      <div className="console-evidence-heading">
        <div>
          <p className="console-eyebrow"><span /> OPS NOTES</p>
          <h2>Notes & comments</h2>
          <p>Internal context for this install — visible across the ops queue.</p>
        </div>
        <span className="console-evidence-count"><MessageSquare size={15} /> {notes.length} note{notes.length === 1 ? '' : 's'}</span>
      </div>
      <form className="console-notes-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label>
          <span>Author</span>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" />
        </label>
        <label className="console-notes-compose">
          <span>Add a note</span>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Follow-up context, calls made, blockers, or handoff notes…" rows={3} />
        </label>
        <div className="console-notes-actions">
          <button type="submit" className="console-refresh-button" disabled={saving || !draft.trim()}>
            {saving ? 'Saving…' : 'Add note'}
          </button>
          {error && <span className="console-control-feedback">{error}</span>}
        </div>
      </form>
      {notes.length > 0 ? (
        <ul className="console-notes-list">
          {notes.map((note) => (
            <li key={note.id} className="console-note-item">
              <div className="console-note-meta">
                <strong>{note.author}</strong>
                <span>{new Date(note.createdAt).toLocaleString()}</span>
              </div>
              <p>{note.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="console-notes-empty">No notes yet. Add context for the next person working this case.</p>
      )}
    </section>
  );
}

function addressLabel(address: string, city: string) { return `${address}, ${city}`; }
function operationalLabel(value: CaseRec['operationalStatus']) { return value === 'OPERATIONAL' ? 'Operational' : value === 'BLOCKED' ? 'Blocked' : 'Waiting'; }
function operationalTone(value: CaseRec['operationalStatus']): 'ready' | 'queued' | 'danger' { return value === 'OPERATIONAL' ? 'ready' : value === 'BLOCKED' ? 'danger' : 'queued'; }

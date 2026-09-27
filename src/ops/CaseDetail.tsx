import { ArrowLeft, Camera, MapPin, RefreshCw, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { StatusPill, statusLabel, statusTone } from '../components/ConsoleShell';
import { ActivationReadiness } from './ActivationReadiness';
import type { ActivationGateVM, ExternalEventVM } from './ActivationReadiness';

type Finding = { domain: string; summary: string; citations: { label: string; url?: string }[]; requirement?: string; ruleIds?: string[] };
type CaseRec = { id: string; assignee: string; pack: string; jobState: string; status: string; degraded: boolean; fingerprint: { address: string; city: string; county?: string; utility: string; service_amps: number }; why: Finding[]; plan: { state: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' }[]; sitePhotos?: { id: string; title: string; src: string; note: string }[]; activationRoute: string; activationGates: ActivationGateVM[]; externalEvents: ExternalEventVM[]; followUpContact?: { organization: string; name: string; email?: string; phone?: string; url?: string; note?: string } };

export function CaseDetail() {
  const { caseId } = useParams();
  const [rec, setRec] = useState<CaseRec | null>(null);
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<{ title: string; src: string; note: string } | null>(null);

  async function load() {
    const res = await fetch(`/api/ops/cases/${caseId}`);
    const data = await res.json();
    setRec(data); setLoading(false);
  }
  useEffect(() => { setLoading(true); void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [caseId]);
  async function replan() { setPlanning(true); await fetch(`/api/ops/cases/${caseId}/plan`, { method: 'POST' }); await load(); setPlanning(false); }

  if (loading || !rec) return <div className="console-loading">Loading case…</div>;
  const reviewDone = rec.status === 'OPS_READY' && rec.plan.length > 0 && rec.plan.every((node) => node.state === 'DONE');

  return <section className="console-page console-case-detail">
    <div className="console-case-header"><Link className="console-back-link" to="/ops/admin"><ArrowLeft size={16} /> Back to queue</Link><div className="console-case-title"><p className="console-eyebrow"><span /> CASE DETAIL</p><h1>Case {rec.id.slice(0, 6)}<span>.</span></h1></div><div className="console-case-actions"><StatusPill tone={statusTone(rec.status)}>{statusLabel(rec.status)}</StatusPill><button className="console-primary-button" onClick={replan} disabled={planning || rec.status === 'UNKNOWN'}><RefreshCw size={16} className={planning ? 'console-spin' : ''} />{planning ? 'Replanning…' : 'Replan'}</button></div></div>

    <div className="console-case-meta"><div><span>Address</span><strong>{rec.fingerprint.address}</strong></div><div><span>City</span><strong>{rec.fingerprint.city}</strong></div><div><span>Utility</span><strong>{rec.fingerprint.utility}</strong></div><div><span>Service</span><strong>{rec.fingerprint.service_amps} amp</strong></div><div><span>Jurisdiction pack</span><strong>{rec.pack}</strong></div></div>

    <SiteEvidence photos={rec.sitePhotos ?? []} address={rec.fingerprint.address} onOpen={setSelectedPhoto} />

    <section className={`console-review-summary ${reviewDone ? 'is-done' : 'is-not-done'}`}><div><p className="console-eyebrow"><span /> REVIEW STATUS</p><h2>{reviewDone ? 'Review done' : 'Review not done'}</h2><p>{reviewDone ? 'All review checks have completed.' : 'The review still needs to run or needs attention.'}</p></div><StatusPill tone={reviewDone ? 'ready' : 'review'}>{reviewDone ? 'Done' : 'Not done'}</StatusPill></section>

    <ActivationReadiness route={rec.activationRoute} gates={rec.activationGates} events={rec.externalEvents} followUpContact={rec.followUpContact} />

    {selectedPhoto && <div className="console-photo-lightbox" role="dialog" aria-modal="true" aria-label={`${selectedPhoto.title} preview`} onClick={() => setSelectedPhoto(null)}><div className="console-photo-lightbox-card" onClick={(e) => e.stopPropagation()}><button className="console-icon-button" onClick={() => setSelectedPhoto(null)} aria-label="Close photo preview"><X size={18} /></button><img src={selectedPhoto.src} alt={selectedPhoto.title} /><div><h2>{selectedPhoto.title}</h2><p>{selectedPhoto.note}</p><span><MapPin size={13} /> {addressLabel(rec.fingerprint.address, rec.fingerprint.city)}</span></div></div></div>}
  </section>;
}

function SiteEvidence({ photos, address, onOpen }: { photos: { id: string; title: string; src: string; note: string }[]; address: string; onOpen: (photo: { title: string; src: string; note: string }) => void }) {
  return <section className="console-site-evidence"><div className="console-evidence-heading"><div><p className="console-eyebrow"><span /> SITE EVIDENCE</p><h2>Customer photo capture</h2><p>Review the site context before making a permit decision.</p></div><span className="console-evidence-count"><Camera size={15} /> {photos.length} photos</span></div><div className="console-photo-grid">{photos.map((photo) => <button className="console-photo-card" key={photo.id} onClick={() => onOpen(photo)}><img src={photo.src} alt={photo.title} /><span><strong>{photo.title}</strong><small>{photo.note}</small></span></button>)}</div><p className="console-photo-disclaimer"><Camera size={13} /> Mock customer-submitted evidence for this demo · {address}</p></section>;
}

function addressLabel(address: string, city: string) { return `${address}, ${city}`; }

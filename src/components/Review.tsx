import { useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, CircleAlert, Download, LockKeyhole, Pencil } from 'lucide-react';
import { buildReport, reportText, type Report } from '../lib/report';
import type { Answer, Notes, PhotoId, Photos } from '../lib/photos';

type Props = { photos: Photos; fence: Answer; location: string; notes: Notes; finished: boolean; onNotes: (n: Notes) => void; onFence: (a: Answer) => void; onLocation: (v: string) => void; onRetake: (id: PhotoId) => void; onFinish: () => void; onEdit: () => void; onBack: () => void };
const ANSWERS = [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']] as const;
const LOCATIONS = [['outside', 'Outside'], ['garage', 'Garage'], ['closet', 'Closet'], ['not sure', 'Not sure']] as const;

function Choice<T extends string>({ label, value, options, onChange, hint }: { label: string; value: T | null | ''; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; hint?: string }) {
  return <fieldset className="review-question"><legend>{label}{hint && <small>{hint}</small>}</legend>
    <div className="choice-chips">{options.map(([v, t]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{t}</button>)}</div></fieldset>;
}

/** Photos as JPEG data URLs (≤1600 px), for the downloadable report. */
async function photoData(url: string) {
  const img = new Image(); img.src = url; await img.decode();
  const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
async function download(r: Report, photos: Photos) {
  const rows = r.sections.flatMap(s => s.rows).filter(row => photos[row.id]);
  const files = await Promise.all(rows.map(async row => ({ step: row.id, title: row.title, source: photos[row.id]!.source, check: photos[row.id]!.check ?? null, image: await photoData(photos[row.id]!.url) })));
  const blob = new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), summary: reportText(r), findings: r.findings, missing: r.missing, reviewerNotes: r.reviewerNotes, photos: files }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'base-photo-check.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function Review(p: Props) {
  const r = buildReport(p.photos, p.fence, p.location, p.notes);
  const [saving, setSaving] = useState(false);
  // One screen at a time: the photos, then a few questions, then the finish page.
  const [stage, setStage] = useState<'photos' | 'questions'>('photos');
  const samples = Object.values(p.photos).filter(ph => ph?.source === 'sample').length;
  const back = p.finished ? p.onEdit : stage === 'questions' ? () => setStage('photos') : p.onBack;
  const top = <div className="capture-topbar"><button className="text-button" onClick={back}><ArrowLeft size={16} /> {p.finished ? 'Back to review' : stage === 'questions' ? 'Back to your photos' : 'Back to taking photos'}</button><span className="small-private"><LockKeyhole size={13} /> Nothing is uploaded</span></div>;

  if (p.finished) return <section className="review-page">
    {top}
    <div className="review-heading finished-heading">
      <span className={`result-icon ${r.ready ? '' : 'incomplete'}`}>{r.ready ? <CheckCircle2 size={32} /> : <Camera size={32} />}</span>
      <div className="eyebrow">YOUR PHOTO CHECK</div>
      <h1>{r.ready ? 'Ready for Base’s team.' : 'A few things are still missing.'}</h1>
      <p>{r.ready ? 'Here’s what happens next.' : `Still needed: ${[...r.missing, ...r.findings.filter(f => f.missing && ['Solar panels', 'Fence along the meter wall', 'Breaker box location'].includes(f.label)).map(f => f.label.toLowerCase())].join(', ')}.`}</p>
    </div>
    <ol className="next-steps">
      <li><b>Base’s team reviews your photos</b><span>They confirm where the battery can go, using what your photos show.</span></li>
      <li><b>They check your electrical panel</b><span>{r.findings.find(f => f.label === 'Main breaker')?.missing ? 'Your main breaker’s rating tells them which setup your panel supports.' : `Your main breaker reads ${r.findings.find(f => f.label === 'Main breaker')!.value}; they confirm which setup it supports.`}</span></li>
      <li><b>Base contacts you about installation</b><span>If anything is unclear, they’ll ask — you don’t need to retake anything unless they do.</span></li>
    </ol>
    <section className="report-card"><h2>What we’ll send to Base</h2>
      <dl>{r.findings.map(f => <div key={f.label} className={f.missing ? 'missing' : ''}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
      {r.reviewerNotes.length > 0 && <details><summary>Notes for Base’s reviewers ({r.reviewerNotes.length})</summary><ul>{r.reviewerNotes.map(n => <li key={n}>{n}</li>)}</ul></details>}
      <p className="local-result-note">Demo only: nothing has been sent. Download the summary to see what Base would receive.</p>
      <div className="confirm-actions">
        <button className="button" onClick={p.onEdit}><Pencil size={16} /> Keep editing</button>
        <button className="button primary" disabled={saving} onClick={async () => { setSaving(true); try { await download(r, p.photos); } finally { setSaving(false); } }}><Download size={16} /> {saving ? 'Preparing…' : 'Download summary'}</button>
      </div>
    </section>
  </section>;

  if (stage === 'questions') return <section className="review-page review-stage">
    {top}
    <div className="review-heading"><h1>A few questions.</h1></div>
    <section className="review-section anything-else">
      <Choice label="Does your home have solar panels?" hint="Homes with solar need a 200 A panel." value={p.notes.solar} options={ANSWERS} onChange={v => p.onNotes({ ...p.notes, solar: v })} />
      <Choice label="Is there a fence along the meter wall?" value={p.fence} options={ANSWERS} onChange={p.onFence} />
      <Choice label="Where is your main breaker box?" value={p.location} options={LOCATIONS} onChange={p.onLocation} />
      <label className="notes-label">Anything else Base should know? <span>Optional</span><textarea maxLength={1500} rows={2} value={p.notes.text} onChange={e => p.onNotes({ ...p.notes, text: e.target.value })} placeholder="Gate code, a dog in the yard…" /></label>
    </section>
    <div className="review-finish"><div><CheckCircle2 size={20} /><p>Photos help Base review your home. They don’t approve an installation.</p></div>
      <button className="button primary" onClick={p.onFinish}>{r.ready ? 'Finish' : 'Finish for now'} <ArrowRight size={18} /></button></div>
  </section>;

  const rows = r.sections.flatMap(sec => sec.rows).filter(row => !(row.state === 'skipped' || (row.id === 'fence' && p.fence !== 'yes')));
  return <section className="review-page review-stage">
    {top}
    <div className="review-heading">
      <h1>{r.missing.length ? 'Almost there.' : 'Your photos are in.'}</h1>
      <p>{r.missing.length ? `${r.missing.length} ${r.missing.length === 1 ? 'photo' : 'photos'} still needed. Tap one to take it.` : 'Tap any photo to retake it.'}</p>
      {samples > 0 && <div className="sample-banner"><CircleAlert size={17} />{samples} {samples === 1 ? 'photo is a demo sample' : 'photos are demo samples'} — not your home.</div>}
    </div>
    <div className="review-tiles">{rows.map(row => {
      const ph = p.photos[row.id];
      const status = row.state === 'done' ? (ph?.check?.override ? 'Base will check' : 'Done') : row.state === 'retake' ? 'Retake?' : 'Needed';
      return <button key={row.id} className={`review-tile ${row.state}`} onClick={() => p.onRetake(row.id)} aria-label={`${ph ? 'Retake' : 'Take'} ${row.title}: ${status}`} title={row.note}>
        <span className="tile-img">{ph ? <img src={ph.url} alt="" /> : <Camera size={22} />}{ph?.source === 'sample' && <span className="sample-label">SAMPLE</span>}</span>
        <span className="tile-text"><b>{row.title}</b><small>{row.state === 'done' ? <Check size={12} /> : <CircleAlert size={12} />} {status}</small></span>
      </button>;
    })}</div>
    <div className="review-finish"><div><CheckCircle2 size={20} /><p>{r.missing.length ? 'You can finish now and add the rest later.' : 'Looks complete.'}</p></div>
      <button className="button primary" onClick={() => { setStage('questions'); window.scrollTo({ top: 0, behavior: 'instant' }); }}>Next <ArrowRight size={18} /></button></div>
  </section>;
}

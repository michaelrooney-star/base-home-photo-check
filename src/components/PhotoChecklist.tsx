import { Check, ChevronRight, Camera, Minus, ShieldCheck } from 'lucide-react';
import { checklist, type ChecklistRow } from '../lib/checklist';
import type { Answer, PhotoId, Photos } from '../lib/photos';

type Props = { photos: Photos; fence: Answer; location: string; current: PhotoId; onSelect: (id: PhotoId) => void };

const Icon = ({ r, current }: { r: ChecklistRow; current: boolean }) =>
  <span className={`row-icon ${r.state}${current ? ' current' : ''}`} aria-hidden="true">{r.state === 'done' ? <Check size={13} /> : r.state === 'skipped' ? <Minus size={13} /> : null}</span>;

/** Desktop sidebar: what Base needs, grouped by what it's for, with what each photo told us. */
export function PhotoChecklist({ photos, fence, location, current, onSelect }: Props) {
  const c = checklist(photos, fence, location);
  return <aside className="checklist">
    <div className="checklist-heading"><span>YOUR PHOTOS</span><Camera size={17} /></div>
    <div className="progress-label"><strong>{c.done} of {c.needed} photos</strong><span>{c.needed === c.done ? 'done' : 'to go: ' + (c.needed - c.done)}</span></div>
    <div className="progress-track" role="progressbar" aria-valuenow={c.done} aria-valuemin={0} aria-valuemax={c.needed} aria-label="Photos complete"><span style={{ width: `${(c.done / Math.max(1, c.needed)) * 100}%` }} /></div>
    {c.sections.map(s => <section key={s.id} className="checklist-section">
      <h3>{s.title}{s.finding && <small>{s.finding}</small>}</h3>
      <ol>{s.rows.map(r => <li key={r.id}><button className={`checklist-step ${current === r.id ? 'selected' : ''} ${r.state}`} onClick={() => onSelect(r.id)} aria-current={current === r.id ? 'step' : undefined}>
        <Icon r={r} current={current === r.id} />
        <span>{r.title}{r.note && <small>{r.note}</small>}</span>{current === r.id && <ChevronRight size={16} />}</button></li>)}</ol>
    </section>)}
    <div className="checklist-tip"><ShieldCheck size={20} /><p>A photo is never worth a risk.<br />You can skip any step and ask Base for help.</p></div>
  </aside>;
}

/** Phones: a thin bar with the three sections; tap one to jump to its next photo. */
export function SectionBar({ photos, fence, location, current, onSelect }: Props) {
  const c = checklist(photos, fence, location);
  return <nav className="section-bar" aria-label="Your photos">
    {c.sections.map(s => {
      const needed = s.rows.filter(r => r.counts), done = needed.filter(r => r.state === 'done').length;
      const here = s.rows.some(r => r.id === current);
      const next = needed.find(r => r.state !== 'done') ?? needed[0] ?? s.rows[0];
      return <button key={s.id} className={`${here ? 'here' : ''} ${done === needed.length ? 'complete' : ''}`} onClick={() => onSelect(next.id)} aria-current={here ? 'step' : undefined}>
        <span>{s.short}</span><b>{done}/{needed.length}</b><i style={{ width: `${(done / Math.max(1, needed.length)) * 100}%` }} /></button>;
    })}
  </nav>;
}

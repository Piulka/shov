import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PageAnchor } from '../navigation';

export default function CollapsibleSection({ id, title, meta, action, className = '', children }: {
  id: PageAnchor;
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(`shov-section:${id}`) !== 'closed'; }
    catch { return true; }
  });
  return <details id={id} className={`section-fold ${className}`} open={open} tabIndex={-1} onToggle={event => {
    const next = event.currentTarget.open;
    setOpen(next);
    try { localStorage.setItem(`shov-section:${id}`, next ? 'open' : 'closed'); }
    catch { /* Folding remains available when device storage is blocked. */ }
  }}>
    <summary aria-label={`${open ? 'Свернуть' : 'Развернуть'}: ${title}`} aria-expanded={open} aria-controls={`${id}-content`}>
      <h2>{title}</h2>
      {meta && <span className="section-fold-meta">{meta}</span>}
      <ChevronDown size={18} />
    </summary>
    <div id={`${id}-content`} className="section-fold-content">
      {action && <div className="section-fold-tools">{action}</div>}
      {children}
    </div>
  </details>;
}

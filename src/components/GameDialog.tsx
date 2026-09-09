import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

let openDialogs = 0;
let originalBodyOverflow = '';

export default function GameDialog({ title, children, close, wide = false, footer, busy = false }: {
  title: string; children: ReactNode; close: () => void; wide?: boolean; footer?: ReactNode; busy?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  const busyRef = useRef(busy);
  closeRef.current = close; busyRef.current = busy;
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    if (openDialogs++ === 0) originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (Array.from(document.querySelectorAll('.game-dialog')).at(-1) !== dialog.current) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!busyRef.current) closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []).filter(node => node.getClientRects().length);
      if (!nodes.length) { event.preventDefault(); dialog.current?.focus({ preventScroll: true }); return; }
      const first = nodes[0], last = nodes.at(-1);
      if (!dialog.current?.contains(document.activeElement)) { event.preventDefault(); first?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      if (--openDialogs === 0) document.body.style.overflow = originalBodyOverflow;
      window.removeEventListener('keydown', onKey);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) close(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`dialog game-dialog ${wide ? 'wide' : ''}`}>
      <header><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label="Закрыть" title="Закрыть" disabled={busy} onClick={close}><X size={18} /></button></header>
      <div className="dialog-body">{children}</div>
      {footer && <footer className="dialog-footer">{footer}</footer>}
    </div>
  </div>;
}

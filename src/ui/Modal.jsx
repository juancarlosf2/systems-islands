import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import ActionButton from './ActionButton.jsx';

export default function Modal({ title, children, onClose, wide = false, reduceMotion = false }) {
  const ref = useRef(null);
  const [closing, setClosing] = useState(false);
  const pendingAction = useRef(null);
  const finishClose = () => { onClose(); pendingAction.current?.(); };
  const close = action => {
    if (closing) return;
    pendingAction.current = typeof action === 'function' ? action : null;
    if (reduceMotion) finishClose();
    else { ref.current.querySelector('.modal-header button')?.focus(); setClosing(true); }
  };
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => { ref.current.querySelector('button')?.focus(); }, [title]);
  const trapFocus = event => {
    if (event.key !== 'Tab') return;
    const targets = [...ref.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(target => target.getClientRects().length && !target.closest('[inert]'));
    const first = targets[0];
    const last = targets[targets.length - 1];
    if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  };
  return <motion.dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} aria-labelledby="modal-title"
    initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 8 }}
    animate={closing ? { opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 6 } : { opacity: 1, y: 0 }}
    onAnimationComplete={() => { if (closing) finishClose(); }}
    onKeyDown={trapFocus} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === ref.current) close(); }}>
    <header className="modal-header"><h2 id="modal-title">{title}</h2><ActionButton className="icon-button" aria-label="Close dialog" onClick={close}><X size={20}/></ActionButton></header>
    <motion.div key={title} className="modal-content" inert={closing} initial={{ opacity: reduceMotion ? 1 : 0 }} animate={{ opacity: 1 }}>
      {typeof children === 'function' ? children(close) : children}
    </motion.div>
  </motion.dialog>;
}

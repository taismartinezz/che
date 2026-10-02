import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/** Centred Facebook-style dialog: title row with a round close button, divider, body. */
export default function Modal({ open, onClose, title, children, footer, wide }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-white/70 dark:bg-black/60 sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={`card shadow-pop w-full ${wide ? 'sm:max-w-[620px]' : 'sm:max-w-[500px]'} max-h-[92vh] flex flex-col rounded-b-none sm:rounded-b-card outline-none`}
      >
        <div className="relative flex items-center justify-center h-[60px] border-b border-divider px-14 shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-center leading-tight line-clamp-2">{title}</h2>
          <button className="icon-btn absolute right-3 top-2.5 h-9 w-9" onClick={onClose} aria-label={t('common.close')}>
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto p-4 grow">{children}</div>
        {footer && <div className="p-4 pt-0 shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

/** "…" button with a small popover menu (Report / Block / Close …). */
export default function Menu({ items, small }: { items: MenuItem[]; small?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (items.length === 0) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        className={`rounded-full hover:bg-hover text-ink-2 flex items-center justify-center ${small ? 'h-8 w-8' : 'h-9 w-9'}`}
        aria-label={t('common.more')}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal size={20} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 card shadow-pop p-2 min-w-[220px]" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className={`side-link ${it.danger ? 'text-danger' : ''}`}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

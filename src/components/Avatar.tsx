import { Link } from 'react-router-dom';

const PALETTE = ['#6D3FD1', '#31A24C', '#E4703B', '#1D9BD1', '#D13F8F', '#B36200', '#4B57C9'];

export function initials(name: string | null | undefined) {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function colorFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

interface Props {
  id?: string;
  name: string | null | undefined;
  url?: string | null;
  size?: number;
  link?: boolean;
  ring?: boolean;
}

export default function Avatar({ id = '', name, url, size = 40, link = false, ring = false }: Props) {
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) };
  const cls = `rounded-full shrink-0 overflow-hidden flex items-center justify-center font-bold text-white select-none ${
    ring ? 'ring-4 ring-card' : ''
  }`;
  const inner = url ? (
    <img src={url} alt={name ?? ''} className={cls + ' object-cover bg-field'} style={style} loading="lazy" />
  ) : (
    <span className={cls} style={{ ...style, background: colorFor(id || name || '') }} aria-label={name ?? ''}>
      {initials(name)}
    </span>
  );
  if (link && id) {
    return (
      <Link to={`/perfil/${id}`} className="shrink-0 rounded-full hover:brightness-95">
        {inner}
      </Link>
    );
  }
  return inner;
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import Avatar from '../../components/Avatar';
import { RowSkeleton } from '../../components/States';
import { AyudaShell, EstadoTag } from '../../components/ayuda/ui';
import { useUI } from '../../context/UIContext';
import { ayudaApi, fechaCorta, type MiReclamo } from '../../lib/ayuda';

function Lista({ items, empty }: { items: MiReclamo[]; empty: string }) {
  const { t, i18n } = useTranslation();
  if (items.length === 0) return <p className="text-ink-2 text-[15px] py-2">{empty}</p>;
  return (
    <ul className="divide-y divide-divider">
      {items.map((r) => {
        const urgent = r.soy === 'contra' && r.estado === 'esperando_respuesta' && r.respuesta_limite && new Date(r.respuesta_limite) > new Date();
        return (
          <li key={r.id}>
            <Link to={`/ayuda/reclamos/${r.id}`} className="flex items-center gap-3 py-3 -mx-2 px-2 rounded-lg hover:bg-hover">
              <Avatar id={r.otra_id} name={r.otra_nombre} url={r.otra_avatar} size={40} />
              <div className="grow min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold tabular-nums">{r.codigo}</span>
                  <EstadoTag estado={r.estado} />
                </div>
                <div className="text-sm text-ink-2 truncate">
                  {r.otra_nombre} · {t(`ayuda.reclamo.motivos.${r.motivo}`)} · {fechaCorta(r.creado_en, i18n.language)}
                </div>
                {urgent && (
                  <div className="text-sm font-medium text-soon">{t('ayuda.mis.respond_by', { date: fechaCorta(r.respuesta_limite!, i18n.language) })}</div>
                )}
              </div>
              <ChevronRight size={18} className="text-ink-2 shrink-0" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function MisReclamos() {
  const { t } = useTranslation();
  const { toastError } = useUI();
  const [items, setItems] = useState<MiReclamo[] | null>(null);

  useEffect(() => {
    ayudaApi
      .misReclamos()
      .then(setItems)
      .catch((e) => {
        toastError(e);
        setItems([]);
      });
  }, [toastError]);

  return (
    <AyudaShell>
      <section className="card p-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t('ayuda.mis.title')}</h1>
        <Link to="/ayuda/reclamo" className="btn-primary h-10">
          {t('ayuda.mis.new')}
        </Link>
      </section>
      <section className="card p-4">
        <h2 className="font-semibold">{t('ayuda.mis.recibidos')}</h2>
        {items === null ? <RowSkeleton rows={2} /> : <Lista items={items.filter((r) => r.soy === 'contra')} empty={t('ayuda.mis.empty_recibidos')} />}
      </section>
      <section className="card p-4">
        <h2 className="font-semibold">{t('ayuda.mis.hechos')}</h2>
        {items === null ? <RowSkeleton rows={2} /> : <Lista items={items.filter((r) => r.soy === 'autor')} empty={t('ayuda.mis.empty_hechos')} />}
      </section>
    </AyudaShell>
  );
}

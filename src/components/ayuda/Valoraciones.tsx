import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Modal from '../Modal';
import Avatar from '../Avatar';
import RichText from '../RichText';
import { RadioRows } from './ui';
import { useUI } from '../../context/UIContext';
import { ayudaApi, type ValoracionPendiente } from '../../lib/ayuda';

type Cumplio = 'si' | 'en_parte' | 'no';

function ValorarDialog({ item, onClose, onDone }: { item: ValoracionPendiente; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { toast, toastError } = useUI();
  const [cumplio, setCumplio] = useState<Cumplio | null>(null);
  const [recomendaria, setRecomendaria] = useState<'si' | 'no' | null>(null);
  const [comentario, setComentario] = useState('');
  const [busy, setBusy] = useState(false);
  const [ofrecerReclamo, setOfrecerReclamo] = useState(false);
  const first = item.other_name.split(' ')[0];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cumplio) return;
    setBusy(true);
    try {
      await ayudaApi.valorar(item.favor_id, cumplio, recomendaria === null ? null : recomendaria === 'si', comentario);
      onDone();
      if (cumplio === 'no') setOfrecerReclamo(true);
      else {
        toast(t('ayuda.valorar.sent'));
        onClose();
      }
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  if (ofrecerReclamo) {
    const qs = new URLSearchParams({ con: item.other_id, favor: item.favor_id, rol: item.soy, fecha: item.completed_at.slice(0, 10) });
    return (
      <Modal open onClose={onClose} title={t('ayuda.valorar.sent')}>
        <p className="text-[15px]">{t('ayuda.valorar.no_offer')}</p>
        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <Link to={`/ayuda/reclamo?${qs}`} className="btn-primary h-11 grow" onClick={onClose}>
            {t('ayuda.valorar.open_reclamo')}
          </Link>
          <button className="btn-secondary h-11 grow" onClick={onClose}>
            {t('ayuda.valorar.later')}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={t('ayuda.valorar.title', { name: first })}>
      <form id="valorar" className="space-y-4" onSubmit={submit}>
        <p className="text-sm text-ink-2">"{item.request_text}"</p>
        <RadioRows
          legend={t('ayuda.valorar.cumplio')}
          name="cumplio"
          value={cumplio}
          onChange={setCumplio}
          options={(['si', 'en_parte', 'no'] as const).map((v) => ({ value: v, label: t(`ayuda.valorar.cumplio_opts.${v}`) }))}
        />
        <RadioRows
          legend={t('ayuda.valorar.recomendaria')}
          name="recomendaria"
          value={recomendaria}
          onChange={setRecomendaria}
          options={[
            { value: 'si' as const, label: t('common.yes') },
            { value: 'no' as const, label: t('common.no') },
          ]}
        />
        <div>
          <label htmlFor="valorar-comentario" className="label">
            {t('ayuda.valorar.comment')}
          </label>
          <textarea
            id="valorar-comentario"
            className="input min-h-[70px]"
            maxLength={500}
            value={comentario}
            aria-describedby="valorar-hint"
            onChange={(e) => setComentario(e.target.value)}
          />
          <p id="valorar-hint" className="text-xs text-ink-2 mt-1">
            {t('ayuda.valorar.comment_hint')}
          </p>
        </div>
        <button className="btn-primary h-11 w-full" disabled={busy || !cumplio}>
          {t('ayuda.valorar.submit')}
        </button>
      </form>
    </Modal>
  );
}

/** Feed card: "How did the favour with X go?" for favours marked done in the last 30 days. Also opens from ?valorar=<id>. */
export default function ValoracionesCard() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<ValoracionPendiente[]>([]);
  const [open, setOpen] = useState<ValoracionPendiente | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await ayudaApi.valoracionesPendientes();
      setItems(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  const wanted = params.get('valorar');
  useEffect(() => {
    load().then((list) => {
      if (!wanted) return;
      const hit = list.find((x) => x.favor_id === wanted);
      if (hit) setOpen(hit);
      const next = new URLSearchParams(params);
      next.delete('valorar');
      setParams(next, { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, wanted]);

  const item = items[0];
  return (
    <>
      {item && (
        <div className="card p-3 flex items-center gap-3">
          <Avatar id={item.other_id} name={item.other_name} url={item.other_avatar} size={40} />
          <p className="grow min-w-0 text-[15px] leading-snug line-clamp-3">
            <RichText i18nKey="ayuda.valorar.card" values={{ name: item.other_name, text: item.request_text }} />
          </p>
          <button className="btn-soft shrink-0" onClick={() => setOpen(item)}>
            {t('ayuda.valorar.cta')}
          </button>
        </div>
      )}
      {open && <ValorarDialog item={open} onClose={() => setOpen(null)} onDone={load} />}
    </>
  );
}

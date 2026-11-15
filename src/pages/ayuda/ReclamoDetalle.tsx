import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Lock } from 'lucide-react';
import { EmptyState, PostSkeleton } from '../../components/States';
import { AyudaShell, EmergencyBanner, EstadoTag } from '../../components/ayuda/ui';
import { useMe } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import {
  ayudaApi,
  fechaCorta,
  urlsFirmadas,
  type ReclamoDetalle as Detalle,
  type ReclamoHistorial,
  type ReclamoMensaje,
} from '../../lib/ayuda';

export interface ReclamoData {
  r: Detalle;
  mensajes: ReclamoMensaje[];
  historial: ReclamoHistorial[];
  imagenes: { path: string; url: string }[];
}

export async function loadReclamo(id: string): Promise<ReclamoData | null> {
  const r = await ayudaApi.verReclamo(id);
  if (!r) return null;
  const [mensajes, historial, adj] = await Promise.all([ayudaApi.mensajes(id), ayudaApi.historial(id), ayudaApi.adjuntos(id)]);
  const urls = await urlsFirmadas(adj.map((a) => a.url));
  return { r, mensajes, historial, imagenes: adj.map((a) => ({ path: a.url, url: urls[a.url] })).filter((x) => x.url) };
}

/** Facts, attachments, history and conversation. Shared with the admin panel. */
export function ReclamoBody({ data, meId }: { data: ReclamoData; meId: string }) {
  const { t, i18n } = useTranslation();
  const { r, mensajes, historial, imagenes } = data;
  const lang = i18n.language;

  return (
    <>
      <section className="card p-4 space-y-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[15px]">
          <dt className="text-ink-2">{t('ayuda.detalle.by')}</dt>
          <dd>{r.soy === 'autor' ? t('ayuda.detalle.you') : r.autor_nombre}</dd>
          <dt className="text-ink-2">{t('ayuda.detalle.with')}</dt>
          <dd>{r.soy === 'contra' ? t('ayuda.detalle.you') : r.contra_nombre}</dd>
          <dt className="text-ink-2">{t('ayuda.detalle.role')}</dt>
          <dd>{t(`ayuda.reclamo.roles.${r.rol_autor}`)}</dd>
          <dt className="text-ink-2">{t('ayuda.reclamo.motivo')}</dt>
          <dd>{t(`ayuda.reclamo.motivos.${r.motivo}`)}</dd>
          <dt className="text-ink-2">{t('ayuda.detalle.date')}</dt>
          <dd>{fechaCorta(r.fecha_hecho, lang)}</dd>
          <dt className="text-ink-2">{t('ayuda.detalle.wants')}</dt>
          <dd>{t(`ayuda.reclamo.outcomes.${r.resultado_deseado}`)}</dd>
        </dl>
        <div>
          <h2 className="font-semibold mb-1 flex items-center gap-2">
            {t('ayuda.detalle.description')}
            {r.descripcion_privada && r.soy !== 'contra' && (
              <span className="tag bg-field text-ink-2 gap-1">
                <Lock size={12} aria-hidden /> {t('ayuda.detalle.only_team')}
              </span>
            )}
          </h2>
          {r.descripcion === null ? (
            <p className="text-ink-2 text-[15px]">{t('ayuda.detalle.description_private')}</p>
          ) : (
            <p className="text-[15px] whitespace-pre-wrap break-words rounded-lg bg-field p-3">{r.descripcion}</p>
          )}
        </div>
        {imagenes.length > 0 && (
          <div>
            <h2 className="font-semibold mb-2">{t('ayuda.detalle.files')}</h2>
            <ul className="flex flex-wrap gap-2">
              {imagenes.map((img, i) => (
                <li key={img.path}>
                  <a href={img.url} target="_blank" rel="noreferrer" className="block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
                    <img src={img.url} alt={t('ayuda.detalle.file_n', { n: i + 1 })} className="h-24 w-24 rounded-lg object-cover border border-divider" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-2">{t('ayuda.detalle.history')}</h2>
        <ol className="space-y-2 border-l-2 border-divider pl-4">
          {historial.map((h) => (
            <li key={h.id} className="relative">
              <span className="absolute -left-[23px] top-1.5 h-3 w-3 rounded-full bg-brand-fill" aria-hidden />
              <EstadoTag estado={h.estado} />
              <span className="text-sm text-ink-2 ml-2">{fechaCorta(h.creado_en, lang)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-2">{t('ayuda.detalle.messages')}</h2>
        {mensajes.length === 0 ? (
          <p className="text-ink-2 text-[15px]">{t('ayuda.detalle.no_messages')}</p>
        ) : (
          <ul className="space-y-3">
            {mensajes.map((m) => {
              const mine = m.autor_id === meId;
              const team = !mine && m.autor_id !== r.autor_id && m.autor_id !== r.contra_id;
              return (
                <li key={m.id} className={`rounded-lg p-3 ${m.es_interno ? 'bg-soon-bg' : mine ? 'bg-brand-soft' : 'bg-field'}`}>
                  <div className="text-sm font-semibold flex flex-wrap items-center gap-x-2">
                    {mine ? t('ayuda.detalle.you') : team ? t('ayuda.detalle.team') : m.autor_nombre}
                    {m.es_interno && <span className="tag bg-card text-soon">{t('ayuda.detalle.internal')}</span>}
                    {!m.es_interno && m.visible_para !== 'ambos' && (
                      <span className="tag bg-card text-ink-2 gap-1">
                        <Lock size={12} aria-hidden /> {t('ayuda.detalle.only_team')}
                      </span>
                    )}
                    <span className="font-normal text-ink-2">{fechaCorta(m.creado_en, lang)}</span>
                  </div>
                  <p className="text-[15px] whitespace-pre-wrap break-words mt-1">{m.texto}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

/** /ayuda/reclamos/:id — the person who filed or the other side. */
export default function ReclamoDetallePage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const { me } = useMe();
  const { toast, toastError } = useUI();
  const [data, setData] = useState<ReclamoData | null | undefined>(undefined);
  const [texto, setTexto] = useState('');
  const [privado, setPrivado] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await loadReclamo(id));
    } catch {
      setData(null);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (data === undefined)
    return (
      <AyudaShell>
        <PostSkeleton />
      </AyudaShell>
    );
  if (data === null)
    return (
      <AyudaShell>
        <EmptyState title={t('errors.not_found')} action={<Link to="/ayuda/mis-reclamos" className="btn-primary">{t('ayuda.mis_reclamos')}</Link>} />
      </AyudaShell>
    );

  const { r } = data;
  const cerrado = r.estado === 'resuelto' || r.estado === 'cerrado';
  const canWrite = !cerrado && (r.soy === 'autor' || r.puede_responder);
  const lang = i18n.language;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (texto.trim().length < 2) return;
    setBusy(true);
    try {
      await ayudaApi.responder(r.id, texto.trim(), privado);
      setTexto('');
      setPrivado(false);
      toast(t('ayuda.detalle.sent'));
      await load();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AyudaShell>
      <Link to="/ayuda/mis-reclamos" className="btn-ghost -ml-2">
        <ArrowLeft size={18} aria-hidden /> {t('ayuda.mis_reclamos')}
      </Link>
      {r.motivo === 'inseguro' && r.soy === 'autor' && <EmergencyBanner />}
      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <h1 className="text-xl font-semibold tabular-nums">{t('ayuda.detalle.title', { codigo: r.codigo })}</h1>
          <EstadoTag estado={r.estado} />
        </div>
        {r.soy === 'contra' && <p className="mt-2 text-[15px]">{t('ayuda.detalle.contra_intro')}</p>}
        {!cerrado && r.respuesta_limite && (
          <p className="mt-2 text-sm text-ink-2">
            {r.soy === 'contra'
              ? r.puede_responder
                ? t('ayuda.detalle.deadline', { date: fechaCorta(r.respuesta_limite, lang) })
                : t('ayuda.detalle.expired')
              : r.estado === 'esperando_respuesta' || r.estado === 'recibido'
                ? t('ayuda.detalle.deadline_other', { date: fechaCorta(r.respuesta_limite, lang) })
                : null}
          </p>
        )}
      </section>

      <ReclamoBody data={data} meId={me.id} />

      {cerrado ? (
        <p className="card p-4 text-ink-2">{t('ayuda.detalle.closed')}</p>
      ) : (
        canWrite && (
          <form className="card p-4 space-y-3" onSubmit={send}>
            <label htmlFor="respuesta" className="label">
              {r.soy === 'contra' ? t('ayuda.detalle.tell') : t('ayuda.detalle.add')}
            </label>
            <textarea
              id="respuesta"
              className="input min-h-[110px]"
              maxLength={4000}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <label className="flex items-center gap-3 cursor-pointer text-[15px]">
              <input
                type="checkbox"
                checked={privado}
                onChange={(e) => setPrivado(e.target.checked)}
                className="h-5 w-5 shrink-0 accent-[rgb(var(--brand))]"
              />
              {t('ayuda.detalle.reply_private')}
            </label>
            <button className="btn-primary h-11 w-full" disabled={busy || texto.trim().length < 2}>
              {t('ayuda.detalle.send')}
            </button>
          </form>
        )
      )}
    </AyudaShell>
  );
}

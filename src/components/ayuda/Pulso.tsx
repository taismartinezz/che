import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Angry, Annoyed, Frown, Laugh, MessageCircleHeart, Smile } from 'lucide-react';
import Modal from '../Modal';
import { useUI } from '../../context/UIContext';
import { ayudaApi } from '../../lib/ayuda';

const FACES = [Angry, Frown, Annoyed, Smile, Laugh];
const HIDE_KEY = 'che-pulso-oculto';

/** Small floating "¿Qué te parece?" button on every signed-in page: face 1–5 + optional comment. */
export default function PulsoButton() {
  const { t } = useTranslation();
  const { toast, toastError } = useUI();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Out of the way where it would cover the chat composer or a form's buttons.
  const covers = /^\/(chat\/|ayuda\/)/.test(location.pathname);
  if (hidden || covers) return null;

  const labels = t('ayuda.pulso.faces', { returnObjects: true }) as string[];

  const submit = async () => {
    if (!score) return;
    setBusy(true);
    try {
      await ayudaApi.feedback({ tipo: 'carita', puntaje: score, texto: comment });
      toast(t('ayuda.pulso.sent'));
      setOpen(false);
      setScore(null);
      setComment('');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const hide = () => {
    try {
      localStorage.setItem(HIDE_KEY, '1');
    } catch {
      /* ignore */
    }
    setHidden(true);
    setOpen(false);
  };

  return (
    <>
      <button
        className="fixed z-30 right-3 bottom-3 sm:right-4 sm:bottom-4 h-10 px-3 rounded-full bg-card border border-divider shadow-pop text-sm font-semibold text-ink flex items-center gap-1.5 hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        onClick={() => setOpen(true)}
      >
        <MessageCircleHeart size={18} className="text-brand" aria-hidden />
        {t('ayuda.pulso.button')}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('ayuda.pulso.title')}
        footer={
          <div className="space-y-2">
            <button className="btn-primary h-11 w-full" disabled={busy || !score} onClick={submit}>
              {t('ayuda.pulso.submit')}
            </button>
            <button className="btn-ghost w-full text-sm" onClick={hide}>
              {t('ayuda.pulso.hide')}
            </button>
          </div>
        }
      >
        <fieldset>
          <legend className="sr-only">{t('ayuda.pulso.title')}</legend>
          <div className="flex justify-between gap-1">
            {FACES.map((Icon, i) => {
              const v = i + 1;
              const on = score === v;
              return (
                <label
                  key={v}
                  className={`flex-1 flex flex-col items-center gap-1 rounded-lg py-2 cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${
                    on ? 'bg-brand-soft text-brand' : 'text-ink-2 hover:bg-hover'
                  }`}
                >
                  <input type="radio" name="pulso" className="sr-only" checked={on} onChange={() => setScore(v)} />
                  <Icon size={32} strokeWidth={on ? 2.2 : 1.6} aria-hidden />
                  <span className="text-[11px] leading-tight text-center">{labels[i]}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <label htmlFor="pulso-comment" className="label mt-4">
          {t('ayuda.pulso.comment')}
        </label>
        <textarea id="pulso-comment" className="input min-h-[70px]" maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Modal>
    </>
  );
}

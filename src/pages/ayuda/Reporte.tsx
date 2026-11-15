import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AyudaShell, FieldError, ImagePicker } from '../../components/ayuda/ui';
import { useMe } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { ayudaApi, subirImagenPrivada } from '../../lib/ayuda';

/** /ayuda/reporte — technical report. Page, browser and date are added automatically. */
export default function Reporte() {
  const { t } = useTranslation();
  const { me } = useMe();
  const { toast, toastError } = useUI();
  const navigate = useNavigate();
  const [intentaba, setIntentaba] = useState('');
  const [texto, setTexto] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const ok = texto.trim().length >= 5;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!ok) return;
    setBusy(true);
    try {
      const captura = files[0] ? await subirImagenPrivada(me.id, files[0]) : null;
      await ayudaApi.feedback({ tipo: 'tecnico', texto: texto.trim(), intentaba: intentaba.trim(), captura });
      toast(t('ayuda.reporte.sent'));
      navigate('/ayuda');
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AyudaShell>
      <form className="card p-4 space-y-4" onSubmit={submit} noValidate>
        <h1 className="text-xl font-semibold">{t('ayuda.reporte.title')}</h1>
        <div>
          <label htmlFor="intentaba" className="label">{t('ayuda.reporte.trying')}</label>
          <input id="intentaba" className="input h-11" maxLength={500} placeholder={t('ayuda.reporte.trying_ph')} value={intentaba} onChange={(e) => setIntentaba(e.target.value)} />
        </div>
        <div>
          <label htmlFor="que-paso" className="label">{t('ayuda.reporte.what')}</label>
          <textarea
            id="que-paso"
            className="input min-h-[120px]"
            maxLength={2000}
            placeholder={t('ayuda.reporte.what_ph')}
            value={texto}
            aria-invalid={tried && !ok}
            aria-describedby={tried && !ok ? 'err-que-paso' : undefined}
            onChange={(e) => setTexto(e.target.value)}
          />
          <FieldError id="err-que-paso" text={tried && !ok ? t('errors.invalid') : null} />
        </div>
        <ImagePicker files={files} onChange={setFiles} max={1} label={t('ayuda.reporte.shot')} />
        <p className="text-sm text-ink-2">{t('ayuda.reporte.auto')}</p>
        <button className="btn-primary h-11 w-full" disabled={busy}>{t('ayuda.reporte.submit')}</button>
      </form>
    </AyudaShell>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AyudaShell, FieldError, RadioRows } from '../../components/ayuda/ui';
import { useUI } from '../../context/UIContext';
import { ayudaApi } from '../../lib/ayuda';

type Tipo = 'idea' | 'confuso' | 'gusto';

/** /ayuda/sugerencia — idea, something confusing or something they liked. */
export default function Sugerencia() {
  const { t } = useTranslation();
  const { toast, toastError } = useUI();
  const navigate = useNavigate();
  const [tipo, setTipo] = useState<Tipo>('idea');
  const [texto, setTexto] = useState('');
  const [contacto, setContacto] = useState<'si' | 'no'>('no');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const ok = texto.trim().length >= 5;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!ok) return;
    setBusy(true);
    try {
      await ayudaApi.feedback({ tipo, texto: texto.trim(), permiteContacto: contacto === 'si' });
      toast(t('ayuda.sugerencia.sent'));
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
        <h1 className="text-xl font-semibold">{t('ayuda.sugerencia.title')}</h1>
        <RadioRows
          legend={t('ayuda.sugerencia.type')}
          name="tipo"
          value={tipo}
          onChange={setTipo}
          options={(['idea', 'confuso', 'gusto'] as const).map((v) => ({ value: v, label: t(`ayuda.sugerencia.types.${v}`) }))}
        />
        <div>
          <label htmlFor="sugerencia-texto" className="label">{t('ayuda.sugerencia.text')}</label>
          <textarea
            id="sugerencia-texto"
            className="input min-h-[120px]"
            maxLength={2000}
            value={texto}
            aria-invalid={tried && !ok}
            aria-describedby={tried && !ok ? 'err-sugerencia' : undefined}
            onChange={(e) => setTexto(e.target.value)}
          />
          <FieldError id="err-sugerencia" text={tried && !ok ? t('errors.invalid') : null} />
        </div>
        <RadioRows
          legend={t('ayuda.sugerencia.contact')}
          name="contacto"
          value={contacto}
          onChange={setContacto}
          options={[
            { value: 'si' as const, label: t('common.yes') },
            { value: 'no' as const, label: t('common.no') },
          ]}
        />
        <button className="btn-primary h-11 w-full" disabled={busy}>{t('ayuda.sugerencia.submit')}</button>
      </form>
    </AyudaShell>
  );
}

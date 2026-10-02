import { Trans } from 'react-i18next';
import { Link } from 'react-router-dom';

/** Renders translation strings that contain <b>, <terms> and <privacy> tags. */
export default function RichText({ i18nKey, values }: { i18nKey: string; values?: Record<string, unknown> }) {
  return (
    <Trans
      i18nKey={i18nKey}
      values={values}
      components={{
        b: <strong className="font-semibold" />,
        terms: <Link to="/terminos" target="_blank" className="text-brand hover:underline" />,
        privacy: <Link to="/privacidad" target="_blank" className="text-brand hover:underline" />,
      }}
    />
  );
}

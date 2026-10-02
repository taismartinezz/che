import { useTranslation } from 'react-i18next';
import { CATEGORIES, type CategoryId } from '../lib/constants';

interface Single {
  value: CategoryId | null;
  onChange: (c: CategoryId | null) => void;
  allowAll?: boolean;
  multiple?: false;
}
interface Multi {
  value: CategoryId[];
  onChange: (c: CategoryId[]) => void;
  multiple: true;
}

/** Category chips, either single-select (feed filter, composer) or multi-select (skills). */
export default function CategoryChips(props: (Single | Multi) & { scroll?: boolean }) {
  const { t } = useTranslation();
  const wrap = props.scroll ? 'flex gap-2 overflow-x-auto scrollbar-none pb-1' : 'flex flex-wrap gap-2';

  if (props.multiple) {
    const toggle = (c: CategoryId) =>
      props.onChange(props.value.includes(c) ? props.value.filter((x) => x !== c) : [...props.value, c]);
    return (
      <div className={wrap} role="group">
        {CATEGORIES.map((c) => (
          <button
            type="button"
            key={c.id}
            aria-pressed={props.value.includes(c.id)}
            className={props.value.includes(c.id) ? 'chip-on' : 'chip-off'}
            onClick={() => toggle(c.id)}
          >
            {t(`categories.${c.id}`)}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={wrap} role="group">
      {props.allowAll && (
        <button
          type="button"
          aria-pressed={props.value === null}
          className={props.value === null ? 'chip-on' : 'chip-off'}
          onClick={() => props.onChange(null)}
        >
          {t('categories.all')}
        </button>
      )}
      {CATEGORIES.map((c) => (
        <button
          type="button"
          key={c.id}
          aria-pressed={props.value === c.id}
          className={props.value === c.id ? 'chip-on' : 'chip-off'}
          onClick={() => props.onChange(props.value === c.id && props.allowAll ? null : c.id)}
        >
          {t(`categories.${c.id}`)}
        </button>
      ))}
    </div>
  );
}

export function CategoryTag({ id }: { id: string }) {
  const { t } = useTranslation();
  return <span className="text-ink-2">{t(`categories.${id}`)}</span>;
}

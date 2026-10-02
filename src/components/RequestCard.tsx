import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Ban, CheckCircle2, Eye, Flag, Hand, Lock, Share2, Trash2, Users } from 'lucide-react';
import Avatar from './Avatar';
import Menu, { type MenuItem } from './Menu';
import { CategoryTag } from './CategoryChips';
import RecommendationsDialog from './RecommendationsDialog';
import ResolveDialog from './ResolveDialog';
import ReportDialog from './ReportDialog';
import { useMe } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { useData } from '../context/DataContext';
import { api } from '../lib/api';
import { timeAgo } from '../lib/time';
import { isSensitive } from '../lib/constants';
import type { RequestRow } from '../lib/types';

interface Props {
  request: RequestRow;
  recCount?: number;
  iOffered: boolean;
  onChanged: () => void;
}

export default function RequestCard({ request, recCount, iOffered, onChanged }: Props) {
  const { t, i18n } = useTranslation();
  const { me } = useMe();
  const { showSoon, toast, toastError } = useUI();
  const { refreshNetwork } = useData();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<null | 'recs' | 'resolve' | 'report'>(null);
  const [busy, setBusy] = useState(false);

  const author = request.author;
  const isMine = request.author_id === me.id;
  const offers = request.offers?.[0]?.count ?? 0;
  const short = request.text.length < 85;
  const open = request.status === 'open';

  const toggleHelp = async () => {
    setBusy(true);
    try {
      if (iOffered) {
        await api.withdrawOffer(request.id, me.id);
        toast(t('feed.offer_withdrawn'));
      } else {
        await api.offerHelp(request.id, me.id);
        toast(t('feed.offer_sent'));
      }
      onChanged();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const seeWho = () => (isSensitive(request.category) ? showSoon('verification') : setDialog('recs'));

  const menu: MenuItem[] = [];
  if (!window.location.pathname.startsWith('/pedido/'))
    menu.push({ label: t('feed.view_request'), icon: <Eye size={18} />, onClick: () => navigate(`/pedido/${request.id}`) });
  if (isMine && !request.is_example) {
    if (open) {
      menu.push({ label: t('feed.mark_resolved'), icon: <CheckCircle2 size={18} />, onClick: () => setDialog('resolve') });
      menu.push({
        label: t('feed.close_request'),
        icon: <Lock size={18} />,
        onClick: () => api.setRequestStatus(request.id, 'closed').then(onChanged, toastError),
      });
    }
    menu.push({
      label: t('feed.delete_request'),
      icon: <Trash2 size={18} />,
      danger: true,
      onClick: () => {
        if (window.confirm(t('feed.confirm_delete'))) api.deleteRequest(request.id).then(onChanged, toastError);
      },
    });
  } else if (!isMine) {
    menu.push({ label: t('safety.report_request'), icon: <Flag size={18} />, onClick: () => setDialog('report') });
    if (author)
      menu.push({
        label: `${t('safety.block')} ${author.display_name.split(' ')[0]}`,
        icon: <Ban size={18} />,
        danger: true,
        onClick: async () => {
          if (!window.confirm(t('safety.confirm_block', { name: author.display_name }))) return;
          try {
            await api.block(author.id);
            toast(t('safety.blocked', { name: author.display_name }));
            refreshNetwork();
            onChanged();
          } catch (e) {
            toastError(e);
          }
        },
      });
  }

  return (
    <article className="card">
      <header className="flex items-start gap-2 px-4 pt-3">
        <Avatar id={author?.id} name={author?.display_name} url={author?.avatar_url} size={40} link />
        <div className="grow min-w-0">
          <div className="text-[15px] leading-tight">
            <Link to={`/perfil/${request.author_id}`} className="font-semibold hover:underline">
              {author?.display_name ?? '—'}
            </Link>{' '}
            <span className="text-ink-2">{t('feed.asked_for_help')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-1 text-[13px] text-ink-2">
            <CategoryTag id={request.category} />
            {request.neighbourhood && <span>· {request.neighbourhood}</span>}
            <Link to={`/pedido/${request.id}`} className="hover:underline">
              · {timeAgo(request.created_at, i18n.language)}
            </Link>
            {request.is_example && (
              <span className="tag bg-field text-ink-2" title={t('feed.example_note')}>
                {t('feed.example')}
              </span>
            )}
            {request.status === 'resolved' && <span className="tag-ok">{t('feed.resolved')}</span>}
            {request.status === 'closed' && <span className="tag bg-field text-ink-2">{t('feed.closed')}</span>}
          </div>
        </div>
        <Menu items={menu} />
      </header>

      <p className={`px-4 pt-3 pb-2 whitespace-pre-wrap break-words ${short ? 'text-2xl leading-snug' : 'text-[15px]'}`}>{request.text}</p>

      <div className="flex items-center justify-between px-4 py-2 text-[15px] text-ink-2">
        <span className="flex items-center gap-1.5">
          {offers > 0 && (
            <span className="h-[18px] w-[18px] rounded-full bg-brand text-white flex items-center justify-center">
              <Hand size={11} />
            </span>
          )}
          {t('feed.offers_count', { count: offers })}
        </span>
        {recCount !== undefined && !isSensitive(request.category) && (
          <button className="hover:underline" onClick={seeWho}>
            {t('feed.recommended_count', { count: recCount })}
          </button>
        )}
      </div>

      <div className="mx-2 sm:mx-4 border-t border-divider flex py-1 gap-0.5 sm:gap-1">
        {isMine ? (
          <button
            className="btn-ghost grow h-9 px-1 text-[14px] sm:text-[15px]"
            disabled={!open || request.is_example}
            onClick={() => setDialog('resolve')}
          >
            <CheckCircle2 size={20} /> <span className="truncate">{t('feed.mark_resolved')}</span>
          </button>
        ) : (
          <button
            className={`btn-ghost grow h-9 px-1 text-[14px] sm:text-[15px] ${iOffered ? '!text-brand' : ''}`}
            disabled={busy || (!open && !iOffered)}
            onClick={toggleHelp}
            aria-pressed={iOffered}
          >
            <Hand size={20} fill={iOffered ? 'currentColor' : 'none'} />
            <span className="truncate">{iOffered ? t('feed.helping') : t('feed.help')}</span>
          </button>
        )}
        <button className="btn-ghost grow h-9 px-1 text-[14px] sm:text-[15px]" onClick={seeWho}>
          <Users size={20} /> <span className="truncate">{t('feed.who_do_you_know')}</span>
        </button>
        <button
          className="btn-ghost relative grow h-9 px-1 text-[14px] sm:text-[15px] shrink-0"
          onClick={() => showSoon('share')}
          aria-label={`${t('feed.share')} (${t('soon.tag')})`}
        >
          <Share2 size={20} /> <span className="truncate hidden sm:inline">{t('feed.share')}</span>
          <span className="absolute top-1.5 right-1.5 sm:static h-2 w-2 rounded-full bg-soon" aria-hidden />
        </button>
      </div>

      {dialog === 'recs' && <RecommendationsDialog request={request} open onClose={() => setDialog(null)} />}
      {dialog === 'resolve' && <ResolveDialog request={request} open onClose={() => setDialog(null)} onDone={onChanged} />}
      {dialog === 'report' && <ReportDialog targetType="request" targetId={request.id} open onClose={() => setDialog(null)} />}
    </article>
  );
}

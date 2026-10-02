import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Send } from 'lucide-react';
import Layout from '../components/Layout';
import Avatar from '../components/Avatar';
import { RowSkeleton } from '../components/States';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { supabase } from '../lib/supabase';
import { timeAgo } from '../lib/time';
import { PROFILE_MINI } from '../lib/constants';
import type { Conversation, Message, MiniProfile } from '../lib/types';

function Inbox({ conversations, activeId }: { conversations: Conversation[] | null; activeId?: string }) {
  const { t, i18n } = useTranslation();
  if (conversations === null) return <div className="p-3"><RowSkeleton rows={4} /></div>;
  if (conversations.length === 0)
    return (
      <div className="p-4">
        <p className="font-medium">{t('chat.empty')}</p>
        <p className="text-sm text-ink-2 mt-1">{t('chat.empty_hint')}</p>
      </div>
    );
  return (
    <ul className="p-2">
      {conversations.map((c) => (
        <li key={c.other_id}>
          <Link
            to={`/chat/${c.other_id}`}
            className={`flex items-center gap-3 rounded-lg p-2 ${c.other_id === activeId ? 'bg-hover' : 'hover:bg-hover'}`}
          >
            <Avatar id={c.other_id} name={c.display_name} url={c.avatar_url} size={44} />
            <div className="min-w-0 grow">
              <div className={`truncate ${c.unread ? 'font-semibold' : ''}`}>{c.display_name}</div>
              <div className={`text-sm truncate ${c.unread ? 'text-ink font-medium' : 'text-ink-2'}`}>
                {c.last_from_me && t('chat.you')}
                {c.last_body} · {timeAgo(c.last_at, i18n.language)}
              </div>
            </div>
            {c.unread > 0 && <span className="h-2 w-2 rounded-full bg-brand shrink-0" aria-label={String(c.unread)} />}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Thread({ otherId, onSent }: { otherId: string; onSent: () => void }) {
  const { t, i18n } = useTranslation();
  const { me } = useMe();
  const { refreshMessages, refreshNotifications } = useData();
  const { toastError } = useUI();
  const navigate = useNavigate();
  const [other, setOther] = useState<MiniProfile | null | undefined>(undefined);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [canReply, setCanReply] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const markRead = useCallback(async () => {
    await supabase.rpc('mark_conversation_read', { p_other: otherId });
    refreshMessages();
    refreshNotifications();
  }, [otherId, refreshMessages, refreshNotifications]);

  const load = useCallback(async () => {
    const [{ data: p }, { data: msgs }, { data: ok }] = await Promise.all([
      supabase.from('profiles').select(PROFILE_MINI).eq('id', otherId).maybeSingle(),
      supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${me.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${me.id})`)
        .order('created_at', { ascending: true })
        .limit(200),
      supabase.rpc('can_contact', { a: me.id, b: otherId }),
    ]);
    setOther((p as MiniProfile) ?? null);
    setMessages((msgs ?? []) as Message[]);
    setCanReply(Boolean(ok));
  }, [me.id, otherId]);

  useEffect(() => {
    setMessages(null);
    load().then(markRead);
  }, [load, markRead]);

  // Live: new messages from the other person.
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${me.id}:${otherId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${me.id}` }, (payload) => {
        const m = payload.new as Message;
        if (m.sender_id !== otherId) return;
        setMessages((ms) => (ms && !ms.some((x) => x.id === m.id) ? [...ms, m] : ms));
        markRead();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me.id, otherId, markRead]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    const { data, error } = await supabase
      .from('messages')
      .insert({ sender_id: me.id, recipient_id: otherId, body })
      .select('*')
      .single();
    setSending(false);
    if (error) {
      if (error.code === '42501' || /row-level security/.test(error.message)) {
        setCanReply(false);
        return;
      }
      return toastError(error);
    }
    setDraft('');
    setMessages((ms) => [...(ms ?? []), data as Message]);
    onSent();
  };

  if (other === null) return <p className="p-4 text-ink-2">{t('profile.not_found')}</p>;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 p-2 border-b border-divider shrink-0">
        <button className="icon-btn bg-transparent wide:hidden" onClick={() => navigate('/chat')} aria-label={t('chat.back')}>
          <ArrowLeft size={20} />
        </button>
        {other && (
          <Link to={`/perfil/${other.id}`} className="flex items-center gap-2 rounded-lg p-1 hover:bg-hover min-w-0">
            <Avatar id={other.id} name={other.display_name} url={other.avatar_url} size={36} />
            <span className="font-medium truncate">{other.display_name}</span>
          </Link>
        )}
      </div>
      <div className="grow overflow-y-auto p-3 space-y-1">
        <p className="text-xs text-ink-2 text-center mb-3">{t('chat.safety')}</p>
        {messages === null ? (
          <RowSkeleton rows={3} />
        ) : (
          messages.map((m, i) => {
            const mine = m.sender_id === me.id;
            const prev = messages[i - 1];
            const gap = !prev || new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 15 * 60 * 1000;
            return (
              <div key={m.id}>
                {gap && <p className="text-[11px] text-ink-2 text-center my-2">{timeAgo(m.created_at, i18n.language)}</p>}
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <p
                    className={`max-w-[78%] rounded-2xl px-3 py-2 text-[15px] whitespace-pre-wrap break-words ${
                      mine ? 'bg-brand text-brand-on' : 'bg-field text-ink'
                    }`}
                  >
                    {m.body}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottom} />
      </div>
      {canReply ? (
        <form onSubmit={send} className="flex items-end gap-2 p-2 border-t border-divider shrink-0">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement).requestSubmit();
              }
            }}
            rows={1}
            placeholder={t('chat.placeholder')}
            aria-label={t('chat.placeholder')}
            className="grow resize-none rounded-2xl bg-field px-3 py-2 text-[15px] max-h-32 focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
          <button className="icon-btn bg-transparent text-brand" disabled={sending || !draft.trim()} aria-label={t('chat.send')}>
            <Send size={20} />
          </button>
        </form>
      ) : (
        <p className="p-3 text-sm text-ink-2 border-t border-divider">{messages?.length ? t('chat.cannot_reply') : t('chat.not_allowed')}</p>
      )}
    </div>
  );
}

export default function Chat() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { unreadMessages } = useData();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);

  const loadInbox = useCallback(async () => {
    const { data } = await supabase.rpc('get_conversations');
    setConversations((data ?? []) as Conversation[]);
  }, []);

  // Reload the inbox whenever unread counts change (new message arrived or read).
  useEffect(() => {
    loadInbox();
  }, [loadInbox, unreadMessages, id]);

  return (
    <Layout variant="full">
      <div className="card overflow-hidden flex h-[calc(100dvh-140px)] wide:h-[calc(100dvh-90px)]">
        <aside className={`${id ? 'hidden wide:block' : 'block'} w-full wide:w-[320px] wide:border-r border-divider overflow-y-auto shrink-0`}>
          <h1 className="text-xl font-semibold px-4 pt-3">{t('chat.title')}</h1>
          <Inbox conversations={conversations} activeId={id} />
        </aside>
        <section className={`${id ? 'flex' : 'hidden wide:flex'} grow min-w-0 flex-col`}>
          {id ? (
            <Thread key={id} otherId={id} onSent={loadInbox} />
          ) : (
            <p className="m-auto text-ink-2">{t('chat.pick')}</p>
          )}
        </section>
      </div>
    </Layout>
  );
}

// Supabase Edge Function: delivers a Che notification by email (Resend) and web push.
//
// Trigger: a Database Webhook on INSERT into public.notifications that POSTs here
// with the header `x-webhook-secret: <WEBHOOK_SECRET>` (see README).
//
// Secrets (supabase secrets set …):
//   WEBHOOK_SECRET        shared secret checked on every call
//   RESEND_API_KEY        optional – email is skipped when missing
//   EMAIL_FROM            e.g. "Che <avisos@checonoces.com>"
//   VAPID_PUBLIC_KEY      optional – push is skipped when missing
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT         e.g. "mailto:hola@checonoces.com"
//   APP_URL               e.g. "https://checonoces.com"
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

type Payload = Record<string, string | null | undefined>;
interface NotificationRecord {
  id: string;
  user_id: string;
  type: string;
  payload: Payload;
}

const env = (k: string) => Deno.env.get(k) ?? '';
const APP_URL = env('APP_URL') || 'https://checonoces.com';

const cat = {
  es: { tech: 'Tecnología', clases: 'Clases', mudanza: 'Mudanza y fletes', hogar: 'Arreglos del hogar', objetos: 'Préstamo de objetos', mascotas: 'Mascotas', cuidado: 'Niñeras y cuidado' },
  en: { tech: 'Tech', clases: 'Lessons', mudanza: 'Moving & hauling', hogar: 'Home repairs', objetos: 'Lending things', mascotas: 'Pets', cuidado: 'Babysitting & care' },
} as const;

/** Plain-text title/body for each notification type. Mirrors src/i18n. */
function render(type: string, p: Payload, lang: 'es' | 'en'): { title: string; body: string; path: string } {
  const es = lang === 'es';
  const req = p.request_id ? `/pedido/${p.request_id}` : '/notificaciones';
  switch (type) {
    case 'friend_request':
      return { title: es ? 'Nueva solicitud de amistad' : 'New friend request', body: es ? `${p.from_name} te mandó una solicitud de amistad.` : `${p.from_name} sent you a friend request.`, path: `/perfil/${p.from_id}` };
    case 'friend_accepted':
      return { title: es ? '¡Ya son amigos!' : "You're now friends!", body: es ? `${p.from_name} aceptó tu solicitud.` : `${p.from_name} accepted your request.`, path: `/perfil/${p.from_id}` };
    case 'invite_joined':
      return { title: es ? 'Alguien entró con tu invitación' : 'Someone joined with your invite', body: es ? `${p.from_name} entró a Che. Ya están conectados.` : `${p.from_name} joined Che. You're connected.`, path: `/perfil/${p.from_id}` };
    case 'offer':
      return { title: es ? 'Te ofrecieron ayuda' : 'Someone offered to help', body: es ? `${p.from_name} te dijo "Ta, te ayudo": "${p.request_text}"` : `${p.from_name} offered to help: "${p.request_text}"`, path: req };
    case 'intro_via':
      return { title: es ? 'Te piden una presentación' : 'Intro request', body: es ? `${p.from_name} te pide que lo/la presentes con ${p.target_name}.` : `${p.from_name} asks you to introduce them to ${p.target_name}.`, path: '/notificaciones' };
    case 'intro_target':
      return { title: es ? 'Alguien quiere contactarte' : 'Someone wants to contact you', body: p.via_name ? (es ? `${p.via_name} te quiere presentar a ${p.from_name}: "${p.request_text}"` : `${p.via_name} wants to introduce you to ${p.from_name}: "${p.request_text}"`) : (es ? `${p.from_name} quiere contactarte por: "${p.request_text}"` : `${p.from_name} wants to contact you about: "${p.request_text}"`), path: '/notificaciones' };
    case 'intro_via_accepted':
      return { title: es ? 'Presentación en camino' : 'Intro on its way', body: es ? `${p.via_name} aceptó presentarte a ${p.target_name}.` : `${p.via_name} agreed to introduce you to ${p.target_name}.`, path: req };
    case 'intro_accepted':
      return { title: es ? '¡Ya pueden hablar!' : 'You can talk now!', body: es ? `Vos y ${p.other_name} aceptaron la presentación.` : `You and ${p.other_name} both accepted the intro.`, path: `/chat/${p.other_id}` };
    case 'intro_declined':
      return { title: es ? 'Presentación no aceptada' : 'Intro not accepted', body: es ? `La presentación con ${p.target_name} no pudo ser esta vez.` : `The intro with ${p.target_name} didn't work out.`, path: req };
    case 'exchange':
      return { title: es ? '¡Gracias por dar una mano!' : 'Thanks for helping!', body: es ? `${p.from_name} marcó que lo/la ayudaste.` : `${p.from_name} marked that you helped them.`, path: req };
    case 'endorsement':
      return { title: es ? 'Te avalaron' : 'You were endorsed', body: es ? `${p.from_name} te avaló en ${cat.es[p.category as keyof typeof cat.es] ?? p.category}.` : `${p.from_name} endorsed you for ${cat.en[p.category as keyof typeof cat.en] ?? p.category}.`, path: '/' };
    case 'message':
      return { title: es ? `Mensaje de ${p.from_name}` : `Message from ${p.from_name}`, body: p.preview ?? '', path: `/chat/${p.from_id}` };
    case 'verification_approved':
      return { title: es ? 'Identidad verificada' : 'Identity verified', body: es ? 'Revisamos tus documentos y tu perfil ya está verificado.' : 'We reviewed your documents and your profile is now verified.', path: '/ajustes' };
    case 'verification_rejected':
      return { title: es ? 'No pudimos verificarte' : "We couldn't verify you", body: (es ? 'Revisá los documentos y volvé a enviarlos.' : 'Check your documents and send them again.') + (p.note ? ` ${p.note}` : ''), path: '/ajustes' };
    default:
      return { title: 'Che', body: es ? 'Tenés una novedad.' : 'You have something new.', path: '/notificaciones' };
  }
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function emailHtml(title: string, body: string, url: string, lang: 'es' | 'en') {
  return `<!doctype html><html><body style="margin:0;background:#F0F2F5;font-family:system-ui,Segoe UI,Helvetica,Arial,sans-serif;color:#050505">
  <div style="max-width:480px;margin:24px auto;background:#fff;border:1px solid #E4E6EB;border-radius:8px;padding:24px">
    <div style="color:#6D3FD1;font-weight:700;font-size:20px;margin-bottom:16px">che</div>
    <h1 style="font-size:18px;margin:0 0 8px">${escape(title)}</h1>
    <p style="font-size:15px;line-height:1.5;margin:0 0 20px">${escape(body)}</p>
    <a href="${url}" style="display:inline-block;background:#6D3FD1;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600">${lang === 'es' ? 'Abrir Che' : 'Open Che'}</a>
    <p style="font-size:12px;color:#65676B;margin:24px 0 0">${lang === 'es' ? 'Podés apagar estos avisos en Configuración.' : 'You can turn these emails off in Settings.'}</p>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (!env('WEBHOOK_SECRET') || req.headers.get('x-webhook-secret') !== env('WEBHOOK_SECRET')) {
    return new Response('unauthorized', { status: 401 });
  }

  const { record } = (await req.json()) as { record?: NotificationRecord };
  if (!record?.user_id) return new Response('no record', { status: 400 });

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data: profile } = await db
    .from('profiles')
    .select('email_notifications, push_notifications, locale')
    .eq('id', record.user_id)
    .maybeSingle();
  if (!profile) return new Response('no profile', { status: 200 });

  const lang = profile.locale === 'en' ? 'en' : 'es';
  const { title, body, path } = render(record.type, record.payload ?? {}, lang);
  const url = APP_URL + path;
  const result = { email: 'skipped', push: 0 };

  // Email
  if (profile.email_notifications && env('RESEND_API_KEY')) {
    const { data: user } = await db.auth.admin.getUserById(record.user_id);
    const to = user?.user?.email;
    if (to && !to.endsWith('@seed.checonoces.test')) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env('EMAIL_FROM') || 'Che <avisos@checonoces.com>', to, subject: title, html: emailHtml(title, body, url, lang), text: `${body}\n\n${url}` }),
      });
      result.email = r.ok ? 'sent' : `error ${r.status}`;
      if (!r.ok) console.error('email failed', r.status, await r.text());
    }
  }

  // Web push
  if (profile.push_notifications && env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY')) {
    webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:hola@checonoces.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
    const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', record.user_id);
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title, body, url: path, tag: `${record.type}:${record.payload?.from_id ?? record.id}` }),
        );
        result.push++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // Subscription expired or revoked: forget it.
        if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
        else console.error('push failed', status, (e as Error).message);
      }
    }
  }

  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
});

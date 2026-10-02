import { supabase } from './supabase';

/** Thin wrappers over Supabase calls that throw on error (callers show friendly messages). */
async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

function check<T>(res: { data: T; error: unknown }) {
  if (res.error) throw res.error;
  return res.data;
}

export const api = {
  sendFriendRequest: (to: string) => rpc('send_friend_request', { p_to: to }),
  respondFriend: (connection: string, accept: boolean) =>
    rpc('respond_friend_request', { p_connection: connection, p_accept: accept }),
  removeConnection: async (connection: string) =>
    check(await supabase.from('connections').delete().eq('id', connection)),
  acceptInvite: (code: string) => rpc<string | null>('accept_invite', { p_code: code }),

  offerHelp: async (requestId: string, me: string) =>
    check(await supabase.from('offers').insert({ request_id: requestId, helper_id: me })),
  withdrawOffer: async (requestId: string, me: string) =>
    check(await supabase.from('offers').delete().eq('request_id', requestId).eq('helper_id', me)),

  requestIntro: (request: string, target: string, via: string | null) =>
    rpc('request_intro', { p_request: request, p_target: target, p_via: via }),
  respondIntroVia: (intro: string, accept: boolean) => rpc('respond_intro_via', { p_intro: intro, p_accept: accept }),
  respondIntroTarget: (intro: string, accept: boolean) =>
    rpc('respond_intro_target', { p_intro: intro, p_accept: accept }),
  getContact: (user: string) => rpc<string | null>('get_contact', { p_user: user }),

  resolveRequest: (request: string, helper: string | null, note: string) =>
    rpc('resolve_request', { p_request: request, p_helper: helper, p_note: note }),
  setRequestStatus: async (request: string, status: 'open' | 'closed') =>
    check(await supabase.from('requests').update({ status }).eq('id', request)),
  deleteRequest: async (request: string) => check(await supabase.from('requests').delete().eq('id', request)),

  endorse: (to: string, category: string, note: string) =>
    rpc('endorse', { p_to: to, p_category: category, p_note: note }),

  block: (user: string) => rpc('block_user', { p_user: user }),
  unblock: async (me: string, user: string) =>
    check(await supabase.from('blocks').delete().eq('blocker_id', me).eq('blocked_id', user)),
  report: async (me: string, targetType: 'profile' | 'request', targetId: string, reason: string) =>
    check(
      await supabase.from('reports').insert({ reporter_id: me, target_type: targetType, target_id: targetId, reason }),
    ),

  deleteAccount: async (me: string) => {
    // Remove avatar files first (storage rows are not covered by the DB cascade).
    const { data: files } = await supabase.storage.from('avatars').list(me);
    if (files?.length) await supabase.storage.from('avatars').remove(files.map((f) => `${me}/${f.name}`));
    await rpc('delete_my_account');
  },
};

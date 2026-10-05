/** Shares a text + link: native share sheet on phones, WhatsApp elsewhere. */
export async function shareLink(text: string, url: string) {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text, url });
      return;
    } catch (e) {
      // User closed the sheet: nothing to do.
      if ((e as DOMException)?.name === 'AbortError') return;
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank', 'noopener');
}

export const requestUrl = (id: string) => `${window.location.origin}/pedido/${id}`;

/** Direct WhatsApp share link (works on phones and WhatsApp Web). */
export const whatsappShareUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

export const INVITE_GOAL = 3;

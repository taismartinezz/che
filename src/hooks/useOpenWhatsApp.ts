import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { whatsappLink } from '../lib/whatsapp';
import { useUI } from '../context/UIContext';

/** Fetches a contact only when the server allows it (friends / accepted intro) and opens WhatsApp. */
export function useOpenWhatsApp() {
  const { t } = useTranslation();
  const { toast, toastError } = useUI();
  return useCallback(
    async (userId: string, name: string, message?: string) => {
      // Open the tab synchronously so mobile browsers don't block it as a popup.
      const win = window.open('', '_blank');
      if (win) win.opener = null;
      try {
        const phone = await api.getContact(userId);
        if (!phone) {
          win?.close();
          toast(t('recs.no_whatsapp', { name }));
          return;
        }
        const url = whatsappLink(phone, message);
        if (win) win.location.href = url;
        else window.location.href = url;
      } catch (e) {
        win?.close();
        toastError(e);
      }
    },
    [t, toast, toastError],
  );
}

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';
import NotificationList from '../components/NotificationList';
import { useData } from '../context/DataContext';

export default function Notifications() {
  const { t } = useTranslation();
  const { unread, markAllRead } = useData();
  useEffect(() => {
    if (unread > 0) {
      const id = setTimeout(markAllRead, 2000);
      return () => clearTimeout(id);
    }
  }, [unread, markAllRead]);
  return (
    <Layout>
      <section className="card p-2 sm:p-4">
        <h1 className="text-2xl font-bold px-2 mb-2">{t('notifications.title')}</h1>
        <NotificationList />
      </section>
    </Layout>
  );
}

import type { ReactNode } from 'react';
import TopBar from './TopBar';
import LeftSidebar from './LeftSidebar';
import RightSidebar from './RightSidebar';

/**
 * Facebook-style shell. "feed": shortcuts | feed (max 680px) | "Tu red".
 * "full": single centred column for profile, network, roadmap… Under 900px everything is one column.
 */
export default function Layout({ children, variant = 'feed' }: { children: ReactNode; variant?: 'feed' | 'full' }) {
  return (
    <div className="min-h-screen bg-page">
      <TopBar />
      {variant === 'feed' ? (
        <div className="flex justify-between gap-4 wide:px-2">
          <aside className="hidden wide:block w-[220px] xl3:w-[300px] shrink-0 sticky top-14 h-[calc(100vh-56px)] overflow-y-auto scrollbar-none py-4">
            <LeftSidebar />
          </aside>
          <main className="grow min-w-0 flex justify-center py-3 sm:py-4">
            <div className="w-full max-w-feed space-y-3 sm:space-y-4">{children}</div>
          </main>
          <aside className="hidden wide:block w-[240px] xl3:w-[320px] shrink-0 sticky top-14 h-[calc(100vh-56px)] overflow-y-auto scrollbar-none py-4">
            <RightSidebar />
          </aside>
        </div>
      ) : (
        <main className="mx-auto w-full max-w-[940px] py-3 sm:py-4 sm:px-4 space-y-3 sm:space-y-4">{children}</main>
      )}
    </div>
  );
}

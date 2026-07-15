import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="cc-layout bg-muted/30">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="cc-content">
        <Topbar onMenu={() => setSidebarOpen(true)} />
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-6 overflow-x-hidden p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

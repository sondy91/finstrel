import { ReactNode } from 'react';

import Sidebar from './Sidebar';

type View = 'Dashboard' | 'Accounts' | 'Categories' | 'Transactions' | 'Budgets' | 'Reports' | 'Settings' | 'Calendar';

interface AppShellProps {
  currentView: View;
  onNavigate: (view: View) => void;
  children: ReactNode;
}

export default function AppShell({ currentView, onNavigate, children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar currentView={currentView} onNavigate={onNavigate} />
      <main className="flex-1 overflow-y-auto pt-16 lg:pt-0">
        {children}
      </main>
    </div>
  );
}

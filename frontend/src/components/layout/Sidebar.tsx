import {
  BarChart3,
  CreditCard,
  Flame,
  FolderKanban,
  Home,
  Menu,
  Settings,
  Tag,
  Wallet,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type View = 'Dashboard' | 'Accounts' | 'Categories' | 'Transactions' | 'Budgets' | 'Reports' | 'Settings';

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
}

interface MobileSidebarProps extends SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navigationItems = [
  { id: 'Dashboard' as View, label: 'Dashboard', icon: Home },
  { id: 'Budgets' as View, label: 'Budgets', icon: Wallet },
  { id: 'Accounts' as View, label: 'Accounts', icon: CreditCard },
  { id: 'Transactions' as View, label: 'Transactions', icon: FolderKanban },
  { id: 'Categories' as View, label: 'Categories', icon: Tag },
  { id: 'Reports' as View, label: 'Reports', icon: BarChart3 },
];

function SidebarContent({ currentView, onNavigate, onItemClick }: SidebarProps & { onItemClick?: () => void }) {
  return (
    <>
      {/* Logo/Brand */}
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
          <Flame className="h-5 w-5" />
        </div>
        <span className="text-lg font-semibold tracking-tight">Finstrel</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => {
                onNavigate(item.id);
                onItemClick?.();
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Settings at bottom */}
      <div className="border-t p-4">
        <button
          onClick={() => {
            onNavigate('Settings');
            onItemClick?.();
          }}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            currentView === 'Settings'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>
    </>
  );
}

// Desktop Sidebar
function DesktopSidebar({ currentView, onNavigate }: SidebarProps) {
  return (
    <aside className="hidden lg:flex h-screen w-64 flex-col border-r bg-card">
      <SidebarContent currentView={currentView} onNavigate={onNavigate} />
    </aside>
  );
}

// Mobile Sidebar
function MobileSidebar({ currentView, onNavigate, isOpen, onClose }: MobileSidebarProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 z-40 bg-black/50 lg:hidden" 
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card lg:hidden">
        {/* Close button */}
        <div className="flex h-16 items-center justify-between border-b px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Flame className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Finstrel</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        
        <div className="flex flex-1 flex-col">
          <SidebarContent currentView={currentView} onNavigate={onNavigate} onItemClick={onClose} />
        </div>
      </aside>
    </>
  );
}

export default function Sidebar({ currentView, onNavigate }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile menu button */}
      <div className="fixed top-4 left-4 z-30 lg:hidden">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMobileOpen(true)}
          className="bg-background shadow-md"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {/* Desktop Sidebar */}
      <DesktopSidebar currentView={currentView} onNavigate={onNavigate} />

      {/* Mobile Sidebar */}
      <MobileSidebar 
        currentView={currentView} 
        onNavigate={onNavigate}
        isOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
    </>
  );
}

// Legacy sidebar content (removed)
function _LegacySidebar({ currentView, onNavigate }: SidebarProps) {
  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card">
      {/* Logo/Brand */}
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
          <Flame className="h-5 w-5" />
        </div>
        <span className="text-lg font-semibold tracking-tight">Finstrel</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Settings at bottom */}
      <div className="border-t p-4">
        <button
          onClick={() => onNavigate('Settings')}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            currentView === 'Settings'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>
    </aside>
  );
}

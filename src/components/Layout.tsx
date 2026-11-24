import React, { useState } from 'react';
import {
  Award,
  BarChart3,
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  Clock,
  FileSpreadsheet,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { type AppRole, type NavSection, ROLE_LABELS } from '../types';

interface NavItemConfig {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[];
  group: 'Overview' | 'Programme Delivery' | 'Intelligence & Impact' | 'Administration';
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    roles: ['super_admin', 'programme_manager', 'facilitator', 'participant'],
    group: 'Overview',
  },
  {
    id: 'programmes',
    label: 'Programmes',
    icon: BookOpen,
    roles: ['super_admin', 'programme_manager', 'facilitator'],
    group: 'Programme Delivery',
  },
  {
    id: 'participants',
    label: 'Participants',
    icon: Users,
    roles: ['super_admin', 'programme_manager', 'facilitator'],
    group: 'Programme Delivery',
  },
  {
    id: 'attendance',
    label: 'Attendance',
    icon: CalendarCheck,
    roles: ['super_admin', 'programme_manager', 'facilitator', 'participant'],
    group: 'Programme Delivery',
  },
  {
    id: 'assessments',
    label: 'Assessments',
    icon: ClipboardCheck,
    roles: ['super_admin', 'programme_manager', 'facilitator', 'participant'],
    group: 'Programme Delivery',
  },
  {
    id: 'projects',
    label: 'STEM Projects',
    icon: FolderKanban,
    roles: ['super_admin', 'programme_manager', 'facilitator', 'participant'],
    group: 'Programme Delivery',
  },
  {
    id: 'performance',
    label: 'Performance Engine',
    icon: Gauge,
    roles: ['super_admin', 'programme_manager', 'facilitator', 'participant'],
    group: 'Intelligence & Impact',
  },
  {
    id: 'impact',
    label: 'Programme Impact',
    icon: BarChart3,
    roles: ['super_admin', 'programme_manager'],
    group: 'Intelligence & Impact',
  },
  {
    id: 'reports',
    label: 'Reports & Export',
    icon: FileSpreadsheet,
    roles: ['super_admin', 'programme_manager'],
    group: 'Intelligence & Impact',
  },
  {
    id: 'certificates',
    label: 'Certificates',
    icon: Award,
    roles: ['super_admin', 'programme_manager', 'participant'],
    group: 'Intelligence & Impact',
  },
  {
    id: 'users',
    label: 'Users & Access',
    icon: Shield,
    roles: ['super_admin'],
    group: 'Administration',
  },
];

const SECTION_TITLES: Record<NavSection, string> = {
  dashboard: 'Programme Dashboard',
  programmes: 'Programme Management',
  participants: 'Participant Management',
  attendance: 'Attendance & Engagement',
  assessments: 'Assessments & Rubric Grading',
  projects: 'STEM Projects & Teams',
  performance: 'Performance Measurement Engine',
  impact: 'Programme Impact Analytics',
  reports: 'Reports & Exports',
  certificates: 'Certificates & Recognition',
  users: 'Users & Access Control',
};

interface LayoutProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

export function Layout({
  activeSection,
  onSelectSection,
  headerAction,
  children,
}: LayoutProps) {
  const { user, signOut, refreshProfile } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!user) return null;

  const allowedItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role));
  const groups = ['Overview', 'Programme Delivery', 'Intelligence & Impact', 'Administration'] as const;

  const handleNavClick = (section: NavSection) => {
    onSelectSection(section);
    setMobileMenuOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#B5121B] text-white">
      {/* Brand header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-white/15 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/assets/aistudio/Celebration_Church_International_3_9816efbc.jpg"
            alt="CCI STEM Connect logo"
            referrerPolicy="no-referrer"
            className="h-8 w-auto rounded-md object-contain ring-1 ring-white/25 shrink-0"
          />
          <span className="font-semibold text-base tracking-tight text-white truncate">
            CCI STEM Connect
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1.5 rounded-md text-red-100 hover:text-white hover:bg-white/10"
          aria-label="Close navigation menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Grouped Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6" aria-label="Main navigation">
        {groups.map((group) => {
          const items = allowedItems.filter((item) => item.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group}>
              <p className="px-3 mb-2 text-xs font-medium text-red-100/80">{group}</p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleNavClick(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          isActive
                            ? 'bg-white/18 text-white'
                            : 'text-red-50/85 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            isActive ? 'text-white' : 'text-red-100/80'
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Account Footer */}
      <div className="p-4 border-t border-white/15 shrink-0 bg-[#9E0F17]/40">
        <div className="flex items-center gap-3">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.fullName}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-cover border border-white/25 shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-white/15 text-white flex items-center justify-center text-xs font-semibold shrink-0">
              {user.fullName
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">{user.fullName}</p>
            <p className="text-xs text-red-100 truncate">{ROLE_LABELS[user.role]}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            title="Sign out"
            aria-label="Sign out"
            className="p-2 rounded-lg text-red-100 hover:text-white hover:bg-white/15 transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:block w-[260px] shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Slide-Over Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-[270px] max-w-[85vw] h-full z-10 shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Clean Workspace Top Bar */}
        <header className="sticky top-0 z-20 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">
                CCI STEM Connect
              </span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-semibold text-slate-900 truncate">
                {SECTION_TITLES[activeSection]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {headerAction}
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap">
              <span className="font-medium text-slate-700">{ROLE_LABELS[user.role]}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate max-w-[180px]">{user.email}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1440px] w-full mx-auto">
          {user.approvalStatus === 'pending_approval' && user.requestedRole && (
            <div className="mb-6 p-3.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-950 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-2.5">
                <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0" />
                <span>
                  Your request for{' '}
                  <strong className="font-semibold">{ROLE_LABELS[user.requestedRole]}</strong>{' '}
                  access is pending Super Administrator approval. You currently have Participant
                  access.
                </span>
              </div>
              <button
                type="button"
                onClick={refreshProfile}
                className="h-8 px-3 rounded-md border border-amber-300 bg-white text-amber-900 text-xs font-semibold hover:bg-amber-100/70 transition-colors cursor-pointer whitespace-nowrap self-start sm:self-auto"
              >
                Check Approval Status
              </button>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

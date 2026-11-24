import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { SignInView } from './components/SignInView';
import { DashboardPage } from './pages/DashboardPage';
import { ProgrammesPage } from './pages/ProgrammesPage';
import { ParticipantsPage } from './pages/ParticipantsPage';
import { AttendancePage } from './pages/AttendancePage';
import { AssessmentsPage } from './pages/AssessmentsPage';
import { PerformancePage } from './pages/PerformancePage';
import { UsersAccessPage } from './pages/UsersAccessPage';
import { ModulePlaceholderPage } from './pages/ModulePlaceholderPage';
import type { NavSection } from './types';

function AppShell() {
  const { user, loading } = useAuth();
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <img
            src="/assets/aistudio/Celebration_Church_International_3_9816efbc.jpg"
            alt="CCI STEM Connect logo"
            referrerPolicy="no-referrer"
            className="h-11 w-auto rounded-lg object-contain mx-auto shadow-xs"
          />
          <p className="text-sm text-slate-600">Loading CCI STEM Connect workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <SignInView />;
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard':
        return <DashboardPage onNavigate={setActiveSection} />;
      case 'programmes':
        if (user.role === 'participant') return <DashboardPage onNavigate={setActiveSection} />;
        return <ProgrammesPage />;
      case 'participants':
        if (user.role === 'participant') return <DashboardPage onNavigate={setActiveSection} />;
        return <ParticipantsPage />;
      case 'attendance':
        return <AttendancePage />;
      case 'assessments':
        return <AssessmentsPage />;
      case 'users':
        if (user.role !== 'super_admin') return <DashboardPage onNavigate={setActiveSection} />;
        return <UsersAccessPage />;
      case 'performance':
        return <PerformancePage />;
      case 'projects':
      case 'impact':
      case 'reports':
      case 'certificates':
        return <ModulePlaceholderPage section={activeSection} />;
      default:
        return <DashboardPage onNavigate={setActiveSection} />;
    }
  };

  return (
    <Layout activeSection={activeSection} onSelectSection={setActiveSection}>
      {renderSection()}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

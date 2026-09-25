import React, { useState } from 'react';
import './index.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import LoginModal from './components/LoginModal';
import LoginPage from './components/LoginPage';
import DashboardTab from './components/DashboardTab';
import TaskAssignTab from './components/TaskAssignTab';
import ActionTab from './components/ActionTab';
import EnrollmentTab from './components/EnrollmentTab';
import UsersTab from './components/UsersTab';
import ProfileDashboard from './components/ProfileDashboard';

function AppContent() {
  const { currentUser, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [activeEnrollmentCategory, setActiveEnrollmentCategory] = useState('all');
  const [selectedStaffUser, setSelectedStaffUser] = useState(null);

  // If session is being checked, show sleek portal loader
  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#070c18' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="login-spinner" style={{ width: '44px', height: '44px', margin: '0 auto 16px auto', borderWidth: '3px' }} />
          <div style={{ color: '#38bdf8', fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.08em' }}>
            AUTHENTICATING US24 PORTAL...
          </div>
        </div>
      </div>
    );
  }

  // If user is not authenticated, display full Two-Step Verification Login Page
  if (!currentUser) {
    return <LoginPage />;
  }

  const handleSelectEnrollmentCategory = (category) => {
    setActiveEnrollmentCategory(category);
    setCurrentTab('enrollment');
  };

  const handleSelectStaff = (staffUser) => {
    setSelectedStaffUser(staffUser);
    setCurrentTab('employee-task');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header Bar with Enrollment Category Dropdown */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={(tab) => {
          if (tab === 'employee-task' || tab === 'action-tab') {
            // If navigating to employee-task from nav directly, keep or clear as appropriate
          }
          setCurrentTab(tab);
        }}
        activeCategory={activeEnrollmentCategory}
        onSelectCategory={handleSelectEnrollmentCategory}
      />

      {/* Main Tab View */}
      <main className="main-content" style={{ flex: 1 }}>
        {currentTab === 'dashboard' && (
          <DashboardTab
            setCurrentTab={setCurrentTab}
            onSelectStaff={handleSelectStaff}
            onSelectCategory={handleSelectEnrollmentCategory}
          />
        )}
        {currentTab === 'profile' && (
          <ProfileDashboard
            setCurrentTab={setCurrentTab}
          />
        )}
        {currentTab === 'task-portal-creation' && (
          <TaskAssignTab
            taskType="task-portal-creation"
            setCurrentTab={setCurrentTab}
            onSelectStaff={handleSelectStaff}
          />
        )}
        {currentTab === 'task-era-eft' && (
          <TaskAssignTab
            taskType="task-era-eft"
            setCurrentTab={setCurrentTab}
            onSelectStaff={handleSelectStaff}
          />
        )}
        {currentTab === 'task-password-reset' && (
          <TaskAssignTab
            taskType="task-password-reset"
            setCurrentTab={setCurrentTab}
            onSelectStaff={handleSelectStaff}
          />
        )}
        {(currentTab === 'employee-task' || currentTab === 'action-tab') && (
          <ActionTab
            setCurrentTab={setCurrentTab}
            selectedStaffUser={selectedStaffUser}
            setSelectedStaffUser={setSelectedStaffUser}
          />
        )}
        {currentTab === 'enrollment' && (
          <EnrollmentTab
            setCurrentTab={setCurrentTab}
            activeCategory={activeEnrollmentCategory}
            setActiveCategory={setActiveEnrollmentCategory}
            onSelectStaff={handleSelectStaff}
          />
        )}
        {currentTab === 'users' && currentUser?.profile?.role === 'admin' && (
          <UsersTab />
        )}
      </main>

      {/* 2-Step OTP Authentication Modal */}
      <LoginModal />

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-glass)',
          padding: '1.5rem 2rem',
          textAlign: 'center',
          fontSize: '0.8rem',
          color: 'var(--text-dim)',
          background: 'rgba(7, 12, 24, 0.9)',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <strong>US24 Solutions</strong> • Healthcare Provider Credentialing & Portal Operations Management
          </div>
          <div>
            Django 5 REST API + React Vite SPA • PostgreSQL Enterprise Connected
          </div>
        </div>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;

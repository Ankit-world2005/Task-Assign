import React, { Suspense, lazy, useState } from 'react';
import './index.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import { canAccessTab } from './utils/departments';
import Navbar from './components/Navbar';

const LoginPage = lazy(() => import('./components/LoginPage'));
const DashboardTab = lazy(() => import('./components/DashboardTab'));
const TaskAssignTab = lazy(() => import('./components/TaskAssignTab'));
const ActionTab = lazy(() => import('./components/ActionTab'));
const EnrollmentTab = lazy(() => import('./components/EnrollmentTab'));
const UsersTab = lazy(() => import('./components/UsersTab'));
const ProfileDashboard = lazy(() => import('./components/ProfileDashboard'));
const PaymentPostingTab = lazy(() => import('./components/PaymentPostingTab'));

function TabFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '240px' }}>
      <div className="login-spinner" style={{ width: '34px', height: '34px', borderWidth: '3px' }} />
    </div>
  );
}

function AppContent() {
  const { currentUser, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [activeEnrollmentCategory, setActiveEnrollmentCategory] = useState('all');
  const [selectedStaffUser, setSelectedStaffUser] = useState(null);

  // If session is being checked, show sleek portal loader
  if (isLoading) {
    return (
      <div className="portal-loader">
        <div style={{ textAlign: 'center' }}>
          <div className="login-spinner" style={{ width: '44px', height: '44px', margin: '0 auto 16px auto', borderWidth: '3px' }} />
          <div className="portal-loader-text">
            AUTHENTICATING US24 PORTAL...
          </div>
        </div>
      </div>
    );
  }

  // If user is not authenticated, display full Two-Step Verification Login Page
  if (!currentUser) {
    return (
      <Suspense fallback={<TabFallback />}>
        <LoginPage />
      </Suspense>
    );
  }

  const activeTab = canAccessTab(currentUser, currentTab) ? currentTab : 'dashboard';
  const selectTab = (tab) => {
    setCurrentTab(canAccessTab(currentUser, tab) ? tab : 'dashboard');
  };

  const handleSelectEnrollmentCategory = (category) => {
    if (!canAccessTab(currentUser, 'enrollment')) {
      selectTab('employee-task');
      return;
    }
    setActiveEnrollmentCategory(category);
    selectTab('enrollment');
  };

  const handleSelectStaff = (staffUser) => {
    setSelectedStaffUser(staffUser);
    selectTab('employee-task');
  };

  const isAdminUser = currentUser?.profile?.role === 'admin';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header Bar with Enrollment Category Dropdown */}
      <Navbar
        currentTab={activeTab}
        setCurrentTab={selectTab}
        activeCategory={activeEnrollmentCategory}
        onSelectCategory={handleSelectEnrollmentCategory}
      />

      {/* Main Tab View */}
      <main className="main-content" style={{ flex: 1 }}>
        <Suspense fallback={<TabFallback />}>
          {activeTab === 'dashboard' && (
          <DashboardTab
            setCurrentTab={selectTab}
            onSelectStaff={handleSelectStaff}
            onSelectCategory={handleSelectEnrollmentCategory}
          />
        )}
        {activeTab === 'profile' && (
          <ProfileDashboard
            setCurrentTab={selectTab}
          />
        )}
        {activeTab === 'task-portal-creation' && (
          isAdminUser ? (
            <TaskAssignTab
              taskType="task-portal-creation"
              setCurrentTab={selectTab}
              onSelectStaff={handleSelectStaff}
            />
          ) : (
            <ActionTab
              setCurrentTab={selectTab}
              selectedStaffUser={selectedStaffUser}
              setSelectedStaffUser={setSelectedStaffUser}
            />
          )
        )}
        {activeTab === 'task-era-eft' && (
          isAdminUser ? (
            <TaskAssignTab
              taskType="task-era-eft"
              setCurrentTab={selectTab}
              onSelectStaff={handleSelectStaff}
            />
          ) : (
            <ActionTab
              setCurrentTab={selectTab}
              selectedStaffUser={selectedStaffUser}
              setSelectedStaffUser={setSelectedStaffUser}
            />
          )
        )}
        {activeTab === 'task-password-reset' && (
          isAdminUser ? (
            <TaskAssignTab
              taskType="task-password-reset"
              setCurrentTab={selectTab}
              onSelectStaff={handleSelectStaff}
            />
          ) : (
            <ActionTab
              setCurrentTab={selectTab}
              selectedStaffUser={selectedStaffUser}
              setSelectedStaffUser={setSelectedStaffUser}
            />
          )
        )}
        {(activeTab === 'employee-task' || activeTab === 'action-tab') && (
          <ActionTab
            setCurrentTab={selectTab}
            selectedStaffUser={selectedStaffUser}
            setSelectedStaffUser={setSelectedStaffUser}
          />
        )}
        {activeTab === 'enrollment' && canAccessTab(currentUser, 'enrollment') && (
          <EnrollmentTab
            setCurrentTab={selectTab}
            activeCategory={activeEnrollmentCategory}
            setActiveCategory={setActiveEnrollmentCategory}
            onSelectStaff={handleSelectStaff}
          />
        )}
        {activeTab === 'payment-posting' && canAccessTab(currentUser, 'payment-posting') && (
          <PaymentPostingTab
            setCurrentTab={selectTab}
            onSelectStaff={handleSelectStaff}
          />
        )}
          {activeTab === 'users' && currentUser?.profile?.role === 'admin' && (
            <UsersTab />
          )}
        </Suspense>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-inner">
          <span>© {new Date().getFullYear()} US24 Solutions</span>
          <span>Need access? Contact your administrator</span>
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

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

export const Navbar = ({ currentTab, setCurrentTab, activeCategory, onSelectCategory }) => {
  const { currentUser, setIsLoginModalOpen, logout } = useAuth();
  const [openDropdown, setOpenDropdown] = useState(null); // 'task' | 'enrollment' | 'profile' | null
  const [isPinned, setIsPinned] = useState(false);
  const hoverTimeoutRef = useRef(null);
  const navRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setOpenDropdown(null);
        setIsPinned(false);
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleMouseEnter = (menuName) => {
    if (menuName === 'profile') return; // Profile only toggles on click
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setOpenDropdown(menuName);
  };

  const handleMouseLeave = () => {
    if (isPinned || openDropdown === 'profile') return;
    hoverTimeoutRef.current = setTimeout(() => {
      setOpenDropdown(null);
    }, 250);
  };

  const handleToggleClick = (menuName) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (openDropdown === menuName && isPinned) {
      setOpenDropdown(null);
      setIsPinned(false);
    } else {
      setOpenDropdown(menuName);
      setIsPinned(true);
    }
  };

  const handleSelectOption = (callback) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setOpenDropdown(null);
    setIsPinned(false);
    callback();
  };

  const taskTypes = [
    {
      id: 'task-portal-creation',
      label: 'Portal Creation',
      desc: 'New portal account setup & provisioning',
      icon: '🌐',
    },
    {
      id: 'task-era-eft',
      label: 'ERA / EFT',
      desc: 'Remittance advice & electronic fund transfer',
      icon: '💳',
    },
    {
      id: 'task-password-reset',
      label: 'Password Reset',
      desc: 'Portal password recovery & credential update',
      icon: '🔑',
    },
  ];

  const isTaskTabActive = taskTypes.some((t) => t.id === currentTab) || currentTab === 'employee-task' || currentTab === 'action-tab';

  const getTaskTabLabel = () => {
    if (currentTab === 'employee-task' || currentTab === 'action-tab') return 'Employee Tasks';
    const found = taskTypes.find((t) => t.id === currentTab);
    if (found) return found.label;
    return 'Task Assignment';
  };




  return (
    <header className="app-header" ref={navRef}>
      {/* Brand Identification */}
      <div className="brand-logo-container" onClick={() => setCurrentTab('dashboard')} title="US24 Solutions Portal Home">
        <div className="brand-logo-badge">U24</div>
        <div>
          <div className="brand-title">
            US24 SOLUTIONS <span className="brand-badge-tag">ENTERPRISE</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
            Provider Credentialing & Task Operations
          </div>
        </div>
      </div>

      {/* Clean Navigation Bar */}
      <nav className="nav-tabs">
        {/* Dashboard Tab */}
        <button
          id="nav-tab-dashboard"
          className={`nav-tab-btn ${currentTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => {
            setCurrentTab('dashboard');
            setOpenDropdown(null);
            setIsPinned(false);
          }}
        >
          <span>Dashboard</span>
        </button>

        {/* Task Assign Dropdown */}
        <div
          className={`nav-dropdown-wrapper ${openDropdown === 'task' ? 'open' : ''}`}
          onMouseEnter={() => handleMouseEnter('task')}
          onMouseLeave={handleMouseLeave}
        >
          <button
            id="nav-tab-task-assign"
            className={`nav-tab-btn ${isTaskTabActive ? 'active' : ''}`}
            onClick={() => handleToggleClick('task')}
          >
            <span>{getTaskTabLabel()}</span>
            <span className="dropdown-caret">▾</span>
          </button>

          {openDropdown === 'task' && (
            <div className="nav-dropdown-menu" style={{ minWidth: '300px' }}>
              <div className="dropdown-section-title">Assign Task by Type</div>
              {taskTypes.map((op) => {
                const isCurrent = currentTab === op.id;
                return (
                  <button
                    key={op.id}
                    type="button"
                    className={`nav-dropdown-item ${isCurrent ? 'active-item' : ''}`}
                    onClick={() => handleSelectOption(() => setCurrentTab(op.id))}
                  >
                    <span style={{ fontSize: '1.15rem', marginRight: '8px', flexShrink: 0 }}>{op.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div className="dropdown-item-label">{op.label}</div>
                      <div className="dropdown-item-desc">{op.desc}</div>
                    </div>
                    {isCurrent && <span className="active-dot">●</span>}
                  </button>
                );
              })}
              <div style={{ borderTop: '1px solid var(--border-glass)', margin: '6px 0' }} />
              <button
                type="button"
                className={`nav-dropdown-item ${(currentTab === 'employee-task' || currentTab === 'action-tab') ? 'active-item' : ''}`}
                onClick={() => handleSelectOption(() => setCurrentTab('employee-task'))}
              >
                <span style={{ fontSize: '1.15rem', marginRight: '8px', flexShrink: 0 }}>📋</span>
                <div style={{ flex: 1 }}>
                  <div className="dropdown-item-label">Employee Tasks</div>
                  <div className="dropdown-item-desc">View personal queue and update task logs</div>
                </div>
                {(currentTab === 'employee-task' || currentTab === 'action-tab') && <span className="active-dot">●</span>}
              </button>
            </div>
          )}
        </div>

        {/* Enrollment Tab */}
        <button
          id="nav-tab-enrollment"
          className={`nav-tab-btn ${currentTab === 'enrollment' ? 'active' : ''}`}
          onClick={() => {
            if (onSelectCategory) onSelectCategory('all');
            setCurrentTab('enrollment');
            setOpenDropdown(null);
            setIsPinned(false);
          }}
        >
          <span>Enrollment</span>
        </button>

        {/* Users Management Tab (Admin Only) */}
        {currentUser?.profile?.role === 'admin' && (
          <button
            id="nav-tab-users"
            className={`nav-tab-btn ${currentTab === 'users' ? 'active' : ''}`}
            onClick={() => {
              setCurrentTab('users');
              setOpenDropdown(null);
              setIsPinned(false);
            }}
          >
            <span>Users</span>
            <span
              style={{
                marginLeft: '6px',
                fontSize: '0.62rem',
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: '999px',
                background: 'rgba(56, 189, 248, 0.18)',
                color: '#38bdf8',
                letterSpacing: '0.05em',
                border: '1px solid rgba(56, 189, 248, 0.35)',
              }}
            >
              ADMIN
            </span>
          </button>
        )}
      </nav>

      {/* Clean User Profile Trigger */}
      <div className="header-actions">
        {currentUser ? (
          <div className="profile-menu-wrapper">
            <button
              type="button"
              className={`user-profile-trigger ${currentTab === 'profile' ? 'active' : ''}`}
              onClick={() => handleToggleClick('profile')}
              title="User profile and account settings"
            >
              <div
                className="user-avatar"
                style={{ backgroundColor: currentUser.profile?.avatar_color || '#2563eb' }}
              >
                {currentUser.first_name ? currentUser.first_name[0] : (currentUser.username ? currentUser.username[0].toUpperCase() : 'U')}
              </div>
              <div className="user-profile-text">
                <span className="user-profile-name">{currentUser.full_name || currentUser.username}</span>
                <span className="user-profile-role">{currentUser.profile?.role === 'admin' ? 'Admin' : 'Staff'}</span>
              </div>
              <span className="dropdown-caret" style={{ marginLeft: '4px' }}>▾</span>
            </button>

            {/* Compact Profile Popover Menu */}
            {openDropdown === 'profile' && (
              <div className="profile-popover">
                <div
                  className="profile-popover-header"
                  onClick={() => {
                    setOpenDropdown(null);
                    setCurrentTab('profile');
                  }}
                  style={{ cursor: 'pointer' }}
                  title="Click to open your Profile Task Dashboard"
                >
                  <div className="profile-popover-avatar">
                    {currentUser.first_name ? currentUser.first_name[0] : (currentUser.username ? currentUser.username[0].toUpperCase() : 'U')}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '0.92rem' }}>
                      {currentUser.full_name}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {currentUser.email || `${currentUser.username}@us24solutions.com`}
                    </div>
                    <div style={{ marginTop: '6px' }}>
                      <span className="role-tag">
                        {currentUser.profile?.employee_id || (currentUser.profile?.role === 'admin' ? 'ADMINISTRATOR' : 'STAFF MEMBER')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="profile-popover-actions">
                  <button
                    type="button"
                    className="popover-action-btn"
                    style={{ color: '#38bdf8', fontWeight: 600 }}
                    onClick={() => {
                      setOpenDropdown(null);
                      setCurrentTab('profile');
                    }}
                  >
                    📊 My Task Dashboard
                  </button>

                  {currentUser?.profile?.role === 'admin' && (
                    <button
                      type="button"
                      className="popover-action-btn"
                      style={{ color: '#94a3b8' }}
                      onClick={() => {
                        setOpenDropdown(null);
                        setCurrentTab('users');
                      }}
                    >
                      👥 Manage Users & Access
                    </button>
                  )}
                  <button
                    type="button"
                    className="popover-action-btn danger"
                    onClick={() => {
                      setOpenDropdown(null);
                      if (logout) logout();
                    }}
                  >
                    Log Out
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            className="btn-primary"
            onClick={() => setIsLoginModalOpen(true)}
            style={{ padding: '8px 18px', fontSize: '0.86rem' }}
          >
            Sign In with OTP
          </button>
        )}
      </div>
    </header>
  );
};

export default Navbar;

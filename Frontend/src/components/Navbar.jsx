import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

export const Navbar = ({ currentTab, setCurrentTab, activeCategory, onSelectCategory }) => {
  const { currentUser, logout } = useAuth();
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
    {
      id: 'payment-posting',
      label: 'Payment Posting',
      desc: 'Batch & manual posting, denials, and PPT queues',
      icon: '💰',
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
    <div className="portal-nav-shell" ref={navRef}>
      {/* Row 1: Brand, profile & sign out */}
      <header className="portal-header">
        <div className="portal-header-inner">
          <div className="header-brand-group">
            <button type="button" className="logo" onClick={() => setCurrentTab('dashboard')} title="US24 Solutions Portal Home">
              <span className="logo-mark">
                <span>U<span className="orange">S</span>24</span>
              </span>
              <span className="wordmark">
                <span className="wordmark-name">U<span className="orange">S</span>24 SOLUTIONS</span>
                <span className="tagline">Innovative Technology Driven</span>
              </span>
            </button>
            <span className="portal-badge hide-sm">Employee Portal</span>
          </div>

          <div className="header-right-group">
            {currentUser ? (
              <>
                <div className="profile-menu-wrapper">
                  <button
                    type="button"
                    className={`user-profile-pill ${openDropdown === 'profile' || currentTab === 'profile' ? 'open' : ''}`}
                    onClick={() => handleToggleClick('profile')}
                    title="User profile and account settings"
                  >
                    <span
                      className="user-avatar"
                      style={{ backgroundColor: currentUser.profile?.avatar_color || '#2563eb' }}
                    >
                      {currentUser.first_name ? currentUser.first_name[0] : (currentUser.username ? currentUser.username[0].toUpperCase() : 'U')}
                    </span>
                    <span className="user-info hide-sm">
                      <span className="user-name">{currentUser.full_name || currentUser.username}</span>
                      <span className="user-sub">{currentUser.profile?.role === 'admin' ? 'Admin' : 'Staff'}</span>
                    </span>
                    <span className="dropdown-caret">▾</span>
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
                          <div className="profile-popover-name">
                            {currentUser.full_name}
                          </div>
                          <div className="profile-popover-email">
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
                          className="popover-action-btn primary"
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
                            className="popover-action-btn muted"
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

                <button
                  type="button"
                  className="btn-header-logout"
                  onClick={() => {
                    setOpenDropdown(null);
                    if (logout) logout();
                  }}
                  title="Sign out of employee portal"
                >
                  Sign out
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {/* Row 2: Workspace tabs */}
      <nav className="workspace-subnav">
        <div className="subnav-inner">
          <div className="subnav-tabs-group">
            {/* Dashboard Tab */}
            <button
              id="nav-tab-dashboard"
              type="button"
              className={`workspace-tab-btn ${currentTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => {
                setCurrentTab('dashboard');
                setOpenDropdown(null);
                setIsPinned(false);
              }}
            >
              Dashboard
            </button>

            {/* Task Assign Dropdown */}
            <div
              className={`nav-dropdown-wrapper ${openDropdown === 'task' ? 'open' : ''}`}
              onMouseEnter={() => handleMouseEnter('task')}
              onMouseLeave={handleMouseLeave}
            >
              <button
                id="nav-tab-task-assign"
                type="button"
                className={`workspace-tab-btn ${isTaskTabActive ? 'active' : ''}`}
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
                        <span className="dropdown-item-icon">{op.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div className="dropdown-item-label">{op.label}</div>
                          <div className="dropdown-item-desc">{op.desc}</div>
                        </div>
                        {isCurrent && <span className="active-dot">●</span>}
                      </button>
                    );
                  })}
                  <div className="dropdown-divider" />
                  <button
                    type="button"
                    className={`nav-dropdown-item ${(currentTab === 'employee-task' || currentTab === 'action-tab') ? 'active-item' : ''}`}
                    onClick={() => handleSelectOption(() => setCurrentTab('employee-task'))}
                  >
                    <span className="dropdown-item-icon">📋</span>
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
              type="button"
              className={`workspace-tab-btn ${currentTab === 'enrollment' ? 'active' : ''}`}
              onClick={() => {
                if (onSelectCategory) onSelectCategory('all');
                setCurrentTab('enrollment');
                setOpenDropdown(null);
                setIsPinned(false);
              }}
            >
              Enrollment
            </button>

            {/* Payment Posting Tab */}
            <button
              id="nav-tab-payment-posting"
              type="button"
              className={`workspace-tab-btn ${currentTab === 'payment-posting' ? 'active' : ''}`}
              onClick={() => {
                setCurrentTab('payment-posting');
                setOpenDropdown(null);
                setIsPinned(false);
              }}
            >
              Payment Posting
            </button>

            {/* Users Management Tab (Admin Only) */}
            {currentUser?.profile?.role === 'admin' && (
              <button
                id="nav-tab-users"
                type="button"
                className={`workspace-tab-btn ${currentTab === 'users' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentTab('users');
                  setOpenDropdown(null);
                  setIsPinned(false);
                }}
              >
                <span>Users</span>
                <span className="mini-tag">ADMIN</span>
              </button>
            )}
          </div>
        </div>
      </nav>
    </div>
  );
};

export default Navbar;

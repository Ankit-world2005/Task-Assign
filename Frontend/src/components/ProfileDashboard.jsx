import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import TaskLogsModal from './TaskLogsModal';
import { FINISHED_STATUSES, isFollowUpOverdue } from '../utils/followUp';
import { formatDate } from '../utils/dateFormat';
import { canAccessCategory, parseDepartments } from '../utils/departments';
import StatusBadge from './StatusBadge';

export const ProfileDashboard = ({ setCurrentTab }) => {
  const { currentUser } = useAuth();
  const [dashData, setDashData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Selected category for the detail cards page: null = Overview Dashboard, string = Detail Page
  const [selectedCategory, setSelectedCategory] = useState(null);
  // Status card selected on the detail page: total, new, old, approved or pending
  const [selectedStatus, setSelectedStatus] = useState('total');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTaskForLogs, setSelectedTaskForLogs] = useState(null);

  const fetchProfileDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getProfileDashboard();
      setDashData(res);
    } catch (err) {
      console.error('Failed to load profile dashboard:', err);
      setError('Unable to load assigned task metrics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileDashboard();
  }, []);

  const counts = dashData?.counts || { total: 0 };
  const profileUser = dashData?.user || currentUser;
  const assignedTasks = (dashData?.tasks?.total || []).filter((t) => canAccessCategory(profileUser, t.category));

  // Task type cards in order: Total Task, followed by only task types accessible to the user, then Follow-Up.
  const categoryConfigs = [
    {
      key: 'total',
      title: 'Total Task',
      badge: 'All Assigned',
      desc: 'Complete history of tasks assigned to your queue',
      icon: '📊',
      class: 'stat-total',
      match: () => true,
    },
    {
      key: 'credentialing',
      title: 'Credentialing',
      badge: 'Enrollments',
      desc: 'Provider credentialing and payer enrollment tasks',
      icon: '🏥',
      class: 'stat-portal-creation',
      match: (t) => t.category === 'credentialing' && !isFollowUpOverdue(t),
    },
    {
      key: 'era_eft',
      title: 'ERA/EFT',
      badge: 'Payments',
      desc: 'Electronic remittance advice and funds transfer setup tasks',
      icon: '💳',
      class: 'stat-era-eft',
      match: (t) => t.category === 'era_eft' && !isFollowUpOverdue(t),
    },
    {
      key: 'portal_creation',
      title: 'Portal Creation',
      badge: 'Portal Setup',
      desc: 'New payer portal account setup tasks',
      icon: '🌐',
      class: 'stat-portal-creation',
      match: (t) => t.category === 'portal_creation' && !isFollowUpOverdue(t),
    },
    {
      key: 'password_reset',
      title: 'Password Reset',
      badge: 'Access Recovery',
      desc: 'Portal password reset and access recovery tasks',
      icon: '🔑',
      class: 'stat-password-reset',
      match: (t) => t.category === 'password_reset' && !isFollowUpOverdue(t),
    },
    {
      key: 'portal_unblock',
      title: 'Portal Unblock',
      badge: 'Account Unlock',
      desc: 'Unblock locked payer and clearinghouse portal accounts',
      icon: '🔓',
      class: 'stat-portal-creation',
      match: (t) => t.category === 'portal_unblock' && !isFollowUpOverdue(t),
    },
    {
      key: 'payment_posting',
      title: 'Payment Posting',
      badge: 'Posting Queue',
      desc: 'Payment posting, ERA and EOB batch processing tasks',
      icon: '💰',
      class: 'stat-era-eft',
      match: (t) => t.category === 'payment_posting' && !isFollowUpOverdue(t),
    },
    {
      key: 'follow_up',
      title: 'Follow-Up',
      badge: 'Overdue',
      desc: 'MOC F/W days have passed and the task is not yet approved',
      icon: '📞',
      class: 'stat-follow-up',
      match: isFollowUpOverdue,
    },
  ]
    .filter((cfg) => cfg.key === 'total' || cfg.key === 'follow_up' || canAccessCategory(profileUser, cfg.key))
    .map((cfg) => {
      const tasks = assignedTasks.filter(cfg.match);
      return { ...cfg, tasks, count: tasks.length };
    });

  // Same rules as profile_dashboard_api: dates are server (UTC) dates, finished tasks are neither new nor old
  const today = new Date().toISOString().split('T')[0];
  const pendingStatuses = ['Pending', 'Pending Info', 'In Progress', 'In Process'];

  // Status cards shown on every task type page, in order: Total Task, New Task, Old Task, Approved, Pending
  const statusConfigs = [
    {
      key: 'total',
      title: 'Total Task',
      listLabel: 'Tasks',
      badge: 'All',
      desc: 'Every task of this type assigned to you',
      icon: '📊',
      class: 'stat-total',
      match: () => true,
    },
    {
      key: 'new',
      title: 'New Task',
      listLabel: 'New Tasks',
      badge: 'Assigned Today',
      desc: 'Assigned today and not yet finished',
      icon: '✨',
      class: 'stat-new',
      match: (t) => t.creation_date === today && !FINISHED_STATUSES.includes(t.status),
    },
    {
      key: 'old',
      title: 'Old Task',
      listLabel: 'Old Tasks',
      badge: 'Needs Follow-Up',
      desc: 'Assigned before today and not yet finished',
      icon: '⏳',
      class: 'stat-old',
      match: (t) => Boolean(t.creation_date) && t.creation_date < today && !FINISHED_STATUSES.includes(t.status),
    },
    {
      key: 'approved',
      title: 'Approved',
      listLabel: 'Approved Tasks',
      badge: 'Approved',
      desc: 'Tasks marked as Approved',
      icon: '✅',
      class: 'stat-approved',
      match: (t) => t.status === 'Approved',
    },
    {
      key: 'pending',
      title: 'Pending',
      listLabel: 'Pending Tasks',
      badge: 'Awaiting',
      desc: 'In process or awaiting payer response',
      icon: '⚡',
      class: 'stat-pending',
      match: (t) => pendingStatuses.includes(t.status),
    },
  ];

  const openCategory = (key) => {
    setSelectedCategory(key);
    setSelectedStatus('total');
    setSearchQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading && !dashData) {
    return (
      <div className="profile-dash-container" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
        <div className="login-spinner" style={{ width: '46px', height: '46px', margin: '0 auto 1.5rem auto' }} />
        <div style={{ color: 'var(--brand-cyan-light)', fontWeight: 600, fontSize: '0.95rem' }}>
          Loading Your Personal Task Dashboard...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="profile-dash-container">
        <div className="empty-tasks-state">
          <div className="empty-tasks-icon">⚠️</div>
          <div className="empty-tasks-title">Failed to Load Dashboard</div>
          <div className="empty-tasks-desc">{error}</div>
          <button
            type="button"
            className="btn-primary"
            style={{ marginTop: '1.25rem' }}
            onClick={fetchProfileDashboard}
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // Determine which tasks to show on detail view
  const currentCategoryConfig = categoryConfigs.find((c) => c.key === selectedCategory);
  const categoryTasks = currentCategoryConfig?.tasks || [];
  const statusCards = statusConfigs.map((s) => {
    const tasks = categoryTasks.filter(s.match);
    return { ...s, tasks, count: tasks.length };
  });
  const currentStatusConfig = statusCards.find((s) => s.key === selectedStatus) || statusCards[0];

  const filteredTasks = currentStatusConfig.tasks.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (t.task_id && t.task_id.toLowerCase().includes(q)) ||
      (t.task_name && t.task_name.toLowerCase().includes(q)) ||
      (t.project_name && t.project_name.toLowerCase().includes(q)) ||
      (t.insurance_name && t.insurance_name.toLowerCase().includes(q)) ||
      (t.provider_name && t.provider_name.toLowerCase().includes(q)) ||
      (t.status && t.status.toLowerCase().includes(q))
    );
  });

  return (
    <div className="profile-dash-container">
      {/* Top User Profile Hero Header */}
      <div className="profile-hero-card">
        <div className="profile-hero-user">
          <div
            className="profile-avatar-large"
            style={{ backgroundColor: profileUser?.profile?.avatar_color || '#2563eb' }}
          >
            {profileUser?.first_name
              ? profileUser.first_name[0]
              : (profileUser?.username ? profileUser.username[0].toUpperCase() : 'U')}
          </div>
          <div className="profile-hero-meta">
            <h1>{profileUser?.full_name || profileUser?.username}</h1>
            <p>
              {profileUser?.email || `${profileUser?.username}@us24solutions.com`} •{' '}
              {parseDepartments(profileUser?.profile?.department).join(', ') || 'No Department Assigned'}
            </p>
            <div className="profile-badge-strip">
              <span className="profile-info-pill highlight">
                👤 {profileUser?.profile?.role === 'admin' ? 'Administrator' : 'Staff Member'}
              </span>
              {profileUser?.profile?.employee_id && (
                <span className="profile-info-pill">
                  ID: <strong>{profileUser.profile.employee_id}</strong>
                </span>
              )}
              {profileUser?.profile?.phone && (
                <span className="profile-info-pill">
                  📞 {profileUser.profile.phone}
                </span>
              )}
              <span className="profile-info-pill">
                📋 Assigned Tasks: <strong>{counts.total}</strong>
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={fetchProfileDashboard}
            title="Refresh current metrics"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
          >
            ↻ Refresh
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setCurrentTab('employee-task')}
            style={{ fontSize: '0.82rem' }}
          >
            Open Work Queue →
          </button>
        </div>
      </div>

      {/* VIEW 1: Dashboard Overview with Task Type Cards */}
      {!selectedCategory ? (
        <>
          <div className="section-header-clean" style={{ marginBottom: '1.25rem' }}>
            <div>
              <h2 className="section-title">Assigned Task Dashboard</h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: '2px 0 0 0' }}>
                Tap any task type card below to open all of your assigned tasks of that type.
              </p>
            </div>
            <span className="section-tag">
              Today: {formatDate(new Date())}
            </span>
          </div>

          {/* Cards in order: Total Task, ERA/EFT, Portal Creation, Password Reset */}
          <div className="task-summary-grid">
            {categoryConfigs.map((cfg) => (
              <div
                key={cfg.key}
                className={`task-stat-card ${cfg.class}`}
                onClick={() => openCategory(cfg.key)}
                title={`Tap to view all ${cfg.title} tasks`}
              >
                <div>
                  <div className="task-stat-card-top">
                    <span className="task-stat-badge">{cfg.badge}</span>
                    <span className="task-stat-icon">{cfg.icon}</span>
                  </div>
                  <div className="task-stat-card-title">{cfg.title}</div>
                  <div className="task-stat-card-value">{cfg.count}</div>
                  <div className="task-stat-card-desc">{cfg.desc}</div>
                </div>

                <div className="task-stat-card-action">
                  <span>Inspect Tasks</span>
                  <span>➔</span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* VIEW 2: Task Type Page listing every assigned task of the tapped type */
        <div className="detail-page-container">
          <div className="detail-page-header">
            <div className="detail-nav-row">
              <button
                type="button"
                className="btn-back-to-dash"
                onClick={() => openCategory(null)}
              >
                <span>←</span>
                <span>Back to Profile Dashboard</span>
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="search-input-wrapper" style={{ minWidth: '260px' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search by ID, name, provider, payer..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ padding: '8px 14px', fontSize: '0.84rem' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '8px', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.3rem', fontFamily: 'var(--serif)', fontWeight: 400, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{currentCategoryConfig?.icon}</span>
                  <span>{currentCategoryConfig?.title} Tasks</span>
                </h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {currentCategoryConfig?.desc} • {currentStatusConfig.title}: showing {filteredTasks.length} {filteredTasks.length === 1 ? 'task card' : 'task cards'}
                </p>
              </div>

              {searchQuery && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                  onClick={() => setSearchQuery('')}
                >
                  Clear Search ✕
                </button>
              )}
            </div>
          </div>

          {/* Status cards for this task type: Total Task, New Task, Old Task, Approved, Pending */}
          <div className="task-summary-grid status-summary-grid">
            {statusCards.map((s) => (
              <div
                key={s.key}
                className={`task-stat-card ${s.class} ${selectedStatus === s.key ? 'active-filter' : ''}`}
                onClick={() => setSelectedStatus(s.key)}
                title={`Tap to show ${s.listLabel.toLowerCase()} in ${currentCategoryConfig?.title}`}
              >
                <div>
                  <div className="task-stat-card-top">
                    <span className="task-stat-badge">{s.badge}</span>
                    <span className="task-stat-icon">{s.icon}</span>
                  </div>
                  <div className="task-stat-card-title">{s.title}</div>
                  <div className="task-stat-card-value">{s.count}</div>
                  <div className="task-stat-card-desc">{s.desc}</div>
                </div>

                <div className="task-stat-card-action">
                  <span>{selectedStatus === s.key ? 'Showing Tasks' : 'Show Tasks'}</span>
                  <span>{selectedStatus === s.key ? '✓' : '➔'}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Cards Grid */}
          {filteredTasks.length === 0 ? (
            <div className="empty-tasks-state">
              <div className="empty-tasks-icon">📋</div>
              <div className="empty-tasks-title">
                No {currentStatusConfig.listLabel} Found in {currentCategoryConfig?.title}
              </div>
              <div className="empty-tasks-desc">
                {searchQuery
                  ? `No tasks matched "${searchQuery}". Try refining your query.`
                  : `You currently have 0 ${currentStatusConfig.listLabel.toLowerCase()} under ${currentCategoryConfig?.title}.`}
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ marginTop: '1rem' }}
                onClick={() => openCategory(null)}
              >
                Return to Dashboard
              </button>
            </div>
          ) : (
            <div className="task-cards-grid">
              {filteredTasks.map((task) => {
                const isToday = task.creation_date === today;
                return (
                  <div key={task.id} className="task-item-card">
                    {/* Header */}
                    <div>
                      <div className="task-item-card-header">
                        <span className="task-id-badge">{task.task_id}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {isToday ? (
                            <span className="task-timing-badge today">Today</span>
                          ) : (
                            <span className="task-timing-badge old">Old</span>
                          )}
                          <StatusBadge status={task.status} />
                        </div>
                      </div>

                      <div className="task-item-card-title">
                        {task.task_name || task.project_name}
                      </div>
                      <div className="task-item-card-subtitle">
                        {task.project_name} • <span style={{ textTransform: 'capitalize' }}>{task.category?.replace(/_/g, ' ')}</span>
                      </div>
                    </div>

                    {/* Metadata detail list */}
                    <div className="task-item-details-list">
                      <div className="task-detail-row">
                        <span className="task-detail-label">Insurance / Payer:</span>
                        <span className="task-detail-val">{task.insurance_name || '—'}</span>
                      </div>

                      {task.provider_name && (
                        <div className="task-detail-row">
                          <span className="task-detail-label">Provider Name:</span>
                          <span className="task-detail-val">{task.provider_name}</span>
                        </div>
                      )}

                      <div className="task-detail-row">
                        <span className="task-detail-label">Creation Date:</span>
                        <span className="task-detail-val">{formatDate(task.creation_date, '—')}</span>
                      </div>

                      {task.follow_up_value && (
                        <div className="task-detail-row">
                          <span className="task-detail-label">Follow-Up ({task.follow_up_type}):</span>
                          <span className="task-detail-val">{task.follow_up_value}</span>
                        </div>
                      )}

                      {task.follow_up_due_date && (
                        <div className="task-detail-row">
                          <span className="task-detail-label">Next Follow-Up:</span>
                          <span className="task-detail-val" style={isFollowUpOverdue(task) ? { color: '#c2410c', fontWeight: 700 } : undefined}>
                            {formatDate(task.follow_up_due_date)}{isFollowUpOverdue(task) ? ' (Overdue)' : ''}
                          </span>
                        </div>
                      )}

                      {(task.group_ptan || task.individual_ptan) && (
                        <div className="task-detail-row">
                          <span className="task-detail-label">PTAN IDs:</span>
                          <span className="task-detail-val">
                            {task.group_ptan ? `G:${task.group_ptan} ` : ''}
                            {task.individual_ptan ? `P:${task.individual_ptan}` : ''}
                          </span>
                        </div>
                      )}

                      {task.sub_plan && (
                        <div className="task-detail-row">
                          <span className="task-detail-label">Sub Plan:</span>
                          <span className="task-detail-val">{task.sub_plan}</span>
                        </div>
                      )}
                    </div>

                    {/* Footer Actions */}
                    <div className="task-item-card-footer">
                      <button
                        type="button"
                        className="btn-task-action"
                        onClick={() => setSelectedTaskForLogs(task)}
                      >
                        <span>📝</span>
                        <span>Logs & Details</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Task Logs & Update Modal */}
      {selectedTaskForLogs && (
        <TaskLogsModal
          task={selectedTaskForLogs}
          onClose={() => setSelectedTaskForLogs(null)}
          onTaskUpdated={(updated) => {
            setSelectedTaskForLogs(updated);
            fetchProfileDashboard();
          }}
        />
      )}
    </div>
  );
};

export default ProfileDashboard;

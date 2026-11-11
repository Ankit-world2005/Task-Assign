import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import TaskLogsModal from './TaskLogsModal';
import { RemarksDisplay } from './ImagePasteRemarks';
import { formatDate } from '../utils/dateFormat';
import { canAccessCategory, getAllowedTaskCategories } from '../utils/departments';
import StatusBadge from './StatusBadge';

const CATEGORY_OPTIONS = [
  { value: 'credentialing', label: 'Credentialing' },
  { value: 'portal_creation', label: 'Portal Creation' },
  { value: 'era_eft', label: 'ERA / EFT' },
  { value: 'password_reset', label: 'Password Reset' },
  { value: 'portal_unblock', label: 'Portal Unblock' },
  { value: 'payment_posting', label: 'Payment Posting' },
  { value: 'general', label: 'General' },
];
const CATEGORY_LABEL_MAP = Object.fromEntries(CATEGORY_OPTIONS.map((o) => [o.value, o.label]));

// Approving these task types needs portal details, which are entered on the Update page
const PORTAL_CREDENTIAL_CATEGORIES = ['portal_creation', 'password_reset'];

export const ActionTab = ({ setCurrentTab, selectedStaffUser, setSelectedStaffUser }) => {
  const { currentUser, usersList } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskForLogs, setSelectedTaskForLogs] = useState(null);
  // Set when a quick "Approved" change must be completed on the Update page
  const [approvalTask, setApprovalTask] = useState(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState('');

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [staffSearchQuery, setStaffSearchQuery] = useState('');

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const data = await api.getTasks();
      setTasks(data);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleTaskUpdated = (updatedTask) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === updatedTask.id ? updatedTask : t))
    );
    if (selectedTaskForLogs && selectedTaskForLogs.id === updatedTask.id) {
      setSelectedTaskForLogs(updatedTask);
    }
    setActionSuccessMsg(`Task ${updatedTask.task_id} successfully updated.`);
    setTimeout(() => setActionSuccessMsg(''), 3000);
  };

  const handleQuickStatusChange = async (task, newStatus) => {
    if (task.status === newStatus) return;
    if (newStatus === 'Approved' && PORTAL_CREDENTIAL_CATEGORIES.includes(task.category)) {
      setApprovalTask(task);
      return;
    }
    try {
      const res = await api.addTaskLog(task.id, {
        status: newStatus,
        remarks: `Status updated to "${newStatus}" by ${currentUser?.full_name || 'Staff'}.`,
      });
      if (res.task) {
        handleTaskUpdated(res.task);
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // Filter tasks based on search, status, and category
  const matchesTask = (task) => {
    if (statusFilter !== 'all' && task.status !== statusFilter) return false;
    const activeCategory = categoryFilter === 'all' || canAccessCategory(currentUser, categoryFilter) ? categoryFilter : 'all';
    if (activeCategory !== 'all' && task.category !== activeCategory) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchId = task.task_id?.toLowerCase().includes(q);
      const matchName = task.task_name?.toLowerCase().includes(q);
      const matchProject = task.project_name?.toLowerCase().includes(q);
      const matchProvider = task.provider_name?.toLowerCase().includes(q);
      const matchInsurance = task.insurance_name?.toLowerCase().includes(q);
      const matchNotes = task.notes?.toLowerCase().includes(q);
      if (!matchId && !matchName && !matchProject && !matchProvider && !matchInsurance && !matchNotes) {
        return false;
      }
    }
    return true;
  };

  // Global metrics across all tasks
  const totalTasksCount = tasks.length;
  const totalPending = tasks.filter((t) => t.status === 'Pending' || t.status === 'Request').length;
  const totalApproved = tasks.filter((t) => t.status === 'Approved').length;
  const totalClosed = tasks.filter((t) => t.status === 'Panel closed').length;

  // Filter staff directory
  const filteredStaffList = usersList.filter((user) => {
    if (!staffSearchQuery.trim()) return true;
    const q = staffSearchQuery.toLowerCase().trim();
    const matchName = (user.full_name || user.username).toLowerCase().includes(q);
    const matchEmpId = user.profile?.employee_id?.toLowerCase().includes(q);
    const matchRole = user.profile?.role?.toLowerCase().includes(q);
    return matchName || matchEmpId || matchRole;
  });

  const unassignedTasks = tasks.filter((t) => !t.assignee);
  const isAdminUser = currentUser?.profile?.role === 'admin';
  const effectiveStaff = isAdminUser ? selectedStaffUser : currentUser;

  // If a staff user is selected, find their active user profile and tasks
  const activeStaff = effectiveStaff
    ? usersList.find((u) => u.id === effectiveStaff.id) || effectiveStaff
    : (isAdminUser ? null : currentUser);

  const isUnassignedView = isAdminUser && selectedStaffUser?.id === 'unassigned';

  const rawStaffTasks = activeStaff
    ? isUnassignedView
      ? unassignedTasks
      : tasks.filter((t) => t.assignee === activeStaff.id)
    : [];
  const allowedCategories = isAdminUser ? null : (getAllowedTaskCategories(currentUser) || []);
  const currentStaffTasks = isAdminUser
    ? rawStaffTasks
    : rawStaffTasks.filter((t) => canAccessCategory(currentUser, t.category));
  const visibleCategoryOptions = isAdminUser
    ? CATEGORY_OPTIONS
    : CATEGORY_OPTIONS.filter((opt) => opt.value !== 'general' && canAccessCategory(currentUser, opt.value));

  const filteredStaffTasks = currentStaffTasks.filter(matchesTask);

  const staffPending = currentStaffTasks.filter((t) => t.status === 'Pending' || t.status === 'Request').length;
  const staffApproved = currentStaffTasks.filter((t) => t.status === 'Approved').length;
  const staffClosed = currentStaffTasks.filter((t) => t.status === 'Panel closed').length;

  const statusOptions = ['Request', 'Pending', 'Approved', 'Panel closed'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Toast message for fast status updates */}
      {actionSuccessMsg && (
        <div className="modal-toast success" style={{ position: 'sticky', top: '70px', zIndex: 50 }}>
          ✓ {actionSuccessMsg}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW A: DEDICATED EMPLOYEE TASK PAGE                                      */}
      {/* (Rendered when tapping on an employee or viewing an individual queue)    */}
      {/* ========================================================================= */}
      {activeStaff ? (
        <div>
          {/* Top Navigation & Breadcrumb Bar (Admin Only) */}
          {isAdminUser && (
            <div className="emp-page-back-bar">
              <button
                type="button"
                className="emp-back-btn"
                onClick={() => {
                  if (setSelectedStaffUser) setSelectedStaffUser(null);
                }}
              >
                ← Back to Staff Directory
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>Switch Staff Queue:</span>
                <select
                  className="form-select"
                  style={{ width: '220px', padding: '6px 10px', fontSize: '0.82rem' }}
                  value={isUnassignedView ? 'unassigned' : activeStaff.id}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'unassigned') {
                      if (setSelectedStaffUser) setSelectedStaffUser({ id: 'unassigned', full_name: 'Unassigned Tasks' });
                    } else {
                      const u = usersList.find((x) => x.id === parseInt(val));
                      if (u && setSelectedStaffUser) setSelectedStaffUser(u);
                    }
                  }}
                >
                  {usersList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name || u.username} ({tasks.filter((t) => t.assignee === u.id).length} tasks)
                    </option>
                  ))}
                  {unassignedTasks.length > 0 && (
                    <option value="unassigned">
                      Unassigned ({unassignedTasks.length} tasks)
                    </option>
                  )}
                </select>

                {setCurrentTab && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setCurrentTab('task-portal-creation')}
                    style={{ padding: '7px 14px', fontSize: '0.82rem' }}
                  >
                    + Assign New Task
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Profile Hero Banner */}
          <div className="emp-profile-hero">
            <div className="emp-profile-hero-left">
              <div
                className="emp-profile-avatar-lg"
                style={{
                  background: isUnassignedView
                    ? '#555b63'
                    : activeStaff.profile?.avatar_color || '#2563eb',
                }}
              >
                {isUnassignedView
                  ? '?'
                  : activeStaff.first_name
                  ? activeStaff.first_name[0]
                  : activeStaff.username[0].toUpperCase()}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--ink)', lineHeight: 1.2 }}>
                    {isUnassignedView ? 'Unassigned Task Queue' : activeStaff.full_name || activeStaff.username}
                  </h1>
                  {currentUser?.id === activeStaff.id && (
                    <span className="badge-pill active" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                      YOUR QUEUE
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                  {!isUnassignedView && (
                    <>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem', color: 'var(--brand-cyan-light)', fontWeight: 700 }}>
                        {activeStaff.profile?.employee_id || `EMP-${activeStaff.id}`}
                      </span>
                      <span style={{ color: 'var(--text-dim)' }}>•</span>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {activeStaff.profile?.role === 'admin' ? 'Administrator' : 'Staff Associate'}
                      </span>
                      {activeStaff.email && (
                        <>
                          <span style={{ color: 'var(--text-dim)' }}>•</span>
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            {activeStaff.email}
                          </span>
                        </>
                      )}
                    </>
                  )}
                  {isUnassignedView && (
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      Tasks waiting to be delegated to an operations specialist
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Individual Employee Metrics */}
            <div className="emp-hero-kpis">
              <div className="emp-kpi-chip">
                <div className="num">{currentStaffTasks.length}</div>
                <div className="lbl">Total Tasks</div>
              </div>
              <div className="emp-kpi-chip pending">
                <div className="num">{staffPending}</div>
                <div className="lbl">Pending</div>
              </div>
              <div className="emp-kpi-chip approved">
                <div className="num">{staffApproved}</div>
                <div className="lbl">Approved</div>
              </div>
              <div className="emp-kpi-chip closed">
                <div className="num">{staffClosed}</div>
                <div className="lbl">Panel closed</div>
              </div>
            </div>
          </div>

          {/* Filter Toolbar for This Employee's Tasks */}
          <div
            className="glass-panel"
            style={{
              padding: '1rem 1.5rem',
              marginBottom: '1.25rem',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
              <input
                type="text"
                className="form-input"
                style={{ minWidth: '240px', maxWidth: '380px', padding: '7px 12px', fontSize: '0.84rem' }}
                placeholder="Search by ID, project, provider, payer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              <select
                className="form-select"
                style={{ width: '170px', padding: '7px 10px', fontSize: '0.84rem' }}
                value={visibleCategoryOptions.some((o) => o.value === categoryFilter) ? categoryFilter : 'all'}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">All Categories</option>
                {visibleCategoryOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <select
                className="form-select"
                style={{ width: '150px', padding: '7px 10px', fontSize: '0.84rem' }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="Request">Request</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Panel closed">Panel closed</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Showing <strong>{filteredStaffTasks.length}</strong> of {currentStaffTasks.length} tasks
              </span>
              <button
                type="button"
                className="btn-secondary"
                onClick={fetchTasks}
                style={{ padding: '7px 12px', fontSize: '0.82rem' }}
                title="Refresh tasks"
              >
                ↻
              </button>
            </div>
          </div>

          {/* List of Tasks for this Employee */}
          {loading ? (
            <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading tasks for {activeStaff.full_name || activeStaff.username}...
            </div>
          ) : filteredStaffTasks.length === 0 ? (
            <div
              className="glass-panel"
              style={{
                padding: '3.5rem 2rem',
                textAlign: 'center',
                color: 'var(--text-muted)',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '10px' }}>📋</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px' }}>
                No Tasks Found
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', maxWidth: '440px', margin: '0 auto 1.25rem auto' }}>
                {!isAdminUser && allowedCategories.length === 0
                  ? 'No department tasks are assigned to your account yet. Please contact your administrator.'
                  : currentStaffTasks.length === 0
                    ? `There are currently no accessible tasks assigned to ${activeStaff.full_name || activeStaff.username}.`
                    : 'No tasks match your active search and filter criteria.'}
              </p>
              {isAdminUser && setCurrentTab && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setCurrentTab('task-portal-creation')}
                  style={{ padding: '8px 18px', fontSize: '0.86rem' }}
                >
                  + Assign a Task to {activeStaff.first_name || activeStaff.username}
                </button>
              )}
            </div>
          ) : (
            <div className="emp-tasks-list">
              {filteredStaffTasks.map((task) => (
                <div key={task.id} className="emp-task-card">
                  {/* Task Header: ID, Category, Title, Status Badge */}
                  <div className="emp-task-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span className="task-code-badge">
                        {task.task_id}
                      </span>
                      <span className={`category-tag ${task.category || 'general'}`}>
                        {CATEGORY_LABEL_MAP[task.category] || task.category || 'General'}
                      </span>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
                        {task.task_name || task.project_name}
                      </h3>
                    </div>

                    <StatusBadge status={task.status} />
                  </div>

                  {/* Task Details Grid */}
                  <div className="emp-task-details-grid">
                    <div>
                      <div className="emp-task-field-label">Project / Clinic</div>
                      <div className="emp-task-field-val" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                        {task.project_name}
                      </div>
                    </div>

                    {task.provider_name && (
                      <div>
                        <div className="emp-task-field-label">Provider Name</div>
                        <div className="emp-task-field-val" style={{ color: 'var(--brand-cyan-light)', fontWeight: 600 }}>
                          {task.provider_name}
                        </div>
                      </div>
                    )}

                    {task.provider_effective_date && (
                      <div>
                        <div className="emp-task-field-label">Provider Effect Date</div>
                        <div className="emp-task-field-val">
                          {formatDate(task.provider_effective_date)}
                        </div>
                      </div>
                    )}

                    {(task.group_ptan || task.individual_ptan) && (
                      <div>
                        <div className="emp-task-field-label">PTAN Numbers</div>
                        <div className="emp-task-field-val" style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem' }}>
                          {task.group_ptan ? `G: ${task.group_ptan}` : ''} {task.individual_ptan ? `| P: ${task.individual_ptan}` : ''}
                        </div>
                      </div>
                    )}

                    {task.early_start_date && (
                      <div>
                        <div className="emp-task-field-label">Early Start Date</div>
                        <div className="emp-task-field-val">
                          {formatDate(task.early_start_date)}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="emp-task-field-label">Insurance / Clearinghouse</div>
                      <div className="emp-task-field-val">
                        {task.insurance_name}
                      </div>
                    </div>

                    <div>
                      <div className="emp-task-field-label">Sub-Plan</div>
                      <div className="emp-task-field-val">
                        {task.sub_plan || 'Standard'}
                      </div>
                    </div>

                    <div>
                      <div className="emp-task-field-label">MOC (Channel)</div>
                      <div className="emp-task-field-val" style={{ fontFamily: 'var(--mono)', fontSize: '0.8rem' }}>
                        <span style={{ textTransform: 'capitalize', color: '#0648c0', fontWeight: 600 }}>
                          {task.follow_up_type || 'Portal'}:
                        </span>{' '}
                        {task.follow_up_value || 'Direct'}
                      </div>
                    </div>

                    <div>
                      <div className="emp-task-field-label">Assigned Date</div>
                      <div className="emp-task-field-val">
                        {formatDate(task.creation_date || task.created_at, 'N/A')}
                      </div>
                    </div>
                  </div>

                  {/* Initial or latest remarks excerpt if present */}
                  {(task.notes || task.attachment) && (
                    <div
                      style={{
                        fontSize: '0.78rem',
                        color: 'var(--text-muted)',
                        background: 'rgba(11, 13, 16, 0.02)',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        marginBottom: '10px',
                        borderLeft: '3px solid rgba(6, 72, 192, 0.4)',
                      }}
                    >
                      <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                        Initial Remarks / Instructions:
                      </div>
                      <RemarksDisplay remarks={task.notes} attachment={task.attachment} />
                    </div>
                  )}

                  {/* Footer Actions: Inline Quick Status + 3-Box Log Modal trigger */}
                  <div className="emp-task-card-footer">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                        Change Status:
                      </span>
                      <select
                        className="form-select"
                        style={{ width: '135px', padding: '5px 10px', fontSize: '0.78rem' }}
                        value={task.status || 'Request'}
                        onChange={(e) => handleQuickStatusChange(task, e.target.value)}
                      >
                        {statusOptions.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      className="btn-primary"
                      style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                      onClick={() => setSelectedTaskForLogs(task)}
                    >
                      Logs & Timeline (3-Box Modal) →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ========================================================================= */
        /* VIEW B: STAFF DIRECTORY OVERVIEW                                          */
        /* (Clean cards: tap any employee to navigate to their dedicated page)       */
        /* ========================================================================= */
        <div>
          {/* Header Banner */}
          <div
            className="glass-panel"
            style={{
              padding: '1.75rem 2rem',
              marginBottom: '1.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1.5rem',
            }}
          >
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--brand-cyan-light)', fontWeight: 700, marginBottom: '4px' }}>
                TEAM WORKLOAD & ASSIGNMENTS
              </div>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--ink)', lineHeight: 1.2 }}>
                Staff Tasks Directory
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginTop: '4px' }}>
                Tap on any team member below to navigate to their dedicated task queue and record updates.
              </p>
            </div>

            {/* Global Team Metrics */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div className="emp-kpi-chip">
                <div className="num">{totalTasksCount}</div>
                <div className="lbl">Total Active</div>
              </div>
              <div className="emp-kpi-chip pending">
                <div className="num">{totalPending}</div>
                <div className="lbl">Pending</div>
              </div>
              <div className="emp-kpi-chip approved">
                <div className="num">{totalApproved}</div>
                <div className="lbl">Approved</div>
              </div>
              <div className="emp-kpi-chip closed">
                <div className="num">{totalClosed}</div>
                <div className="lbl">Panel closed</div>
              </div>
            </div>
          </div>

          {/* Search & Quick Filter Toolbar */}
          <div
            className="glass-panel"
            style={{
              padding: '1rem 1.5rem',
              marginBottom: '1.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '260px' }}>
              <input
                type="text"
                className="form-input"
                style={{ width: '100%', maxWidth: '360px', padding: '7px 12px', fontSize: '0.84rem' }}
                placeholder="Search staff by name, @username, or employee code..."
                value={staffSearchQuery}
                onChange={(e) => setStaffSearchQuery(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {currentUser && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    if (setSelectedStaffUser) setSelectedStaffUser(currentUser);
                  }}
                  style={{ padding: '7px 14px', fontSize: '0.84rem' }}
                >
                  👤 My Personal Queue
                </button>
              )}

              {isAdminUser && setCurrentTab && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setCurrentTab('task-portal-creation')}
                  style={{ padding: '7px 14px', fontSize: '0.84rem' }}
                >
                  + Assign New Task
                </button>
              )}

              <button
                type="button"
                className="btn-secondary"
                onClick={fetchTasks}
                style={{ padding: '7px 12px', fontSize: '0.84rem' }}
                title="Refresh tasks"
              >
                ↻
              </button>
            </div>
          </div>

          {/* Staff Directory Cards Grid - restricted to current user for staff members */}
          {loading ? (
            <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading staff directory...
            </div>
          ) : (
            <div className="staff-dir-grid">
              {filteredStaffList.filter((u) => isAdminUser || u.id === currentUser?.id).map((user) => {
                const userAllTasks = tasks.filter((t) => t.assignee === user.id);
                const userPending = userAllTasks.filter((t) => t.status === 'Pending' || t.status === 'Request').length;
                const userApproved = userAllTasks.filter((t) => t.status === 'Approved').length;
                const userClosed = userAllTasks.filter((t) => t.status === 'Panel closed').length;
                const isCurrentUser = currentUser?.id === user.id;

                return (
                  <div
                    key={user.id}
                    className={`staff-dir-card ${isCurrentUser ? 'is-current-user' : ''}`}
                    onClick={() => {
                      if (setSelectedStaffUser) setSelectedStaffUser(user);
                    }}
                  >
                    {/* Card Top: Avatar, Name, Role, Badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          className="staff-dir-avatar"
                          style={{ background: user.profile?.avatar_color || '#2563eb' }}
                        >
                          {user.first_name ? user.first_name[0] : user.username[0].toUpperCase()}
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
                              {user.full_name || user.username}
                            </h3>
                            {isCurrentUser && (
                              <span className="badge-pill active" style={{ fontSize: '0.66rem', padding: '1px 6px' }}>
                                YOU
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.74rem', color: 'var(--brand-cyan-light)', fontWeight: 700 }}>
                              {user.profile?.employee_id || `EMP-${user.id}`}
                            </span>
                            <span style={{ color: 'var(--text-dim)', fontSize: '0.74rem' }}>•</span>
                            <span style={{ fontSize: '0.72rem', color: user.profile?.role === 'admin' ? '#b45309' : 'var(--text-muted)', fontWeight: 500 }}>
                              {user.profile?.role === 'admin' ? 'Administrator' : 'Staff Associate'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Total Task Count Pill */}
                      <span
                        style={{
                          background: 'rgba(10, 36, 99, 0.2)',
                          border: '1px solid rgba(10, 36, 99, 0.35)',
                          borderRadius: 'var(--radius-full)',
                          padding: '4px 10px',
                          color: '#0648c0',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {userAllTasks.length} {userAllTasks.length === 1 ? 'Task' : 'Tasks'}
                      </span>
                    </div>

                    {/* Status Breakdown Chips */}
                    <div className="staff-dir-counts">
                      <span className="staff-count-chip pending">
                        Pending: {userPending}
                      </span>
                      <span className="staff-count-chip approved">
                        Approved: {userApproved}
                      </span>
                      <span className="staff-count-chip panel-closed">
                        Panel closed: {userClosed}
                      </span>
                    </div>

                    {/* Action Footer Bar */}
                    <div className="staff-dir-footer-btn">
                      <span>View Tasks ({userAllTasks.length})</span>
                      <span style={{ fontSize: '0.9rem' }}>→</span>
                    </div>
                  </div>
                );
              })}

              {/* Unassigned Tasks Card if any exist (Admin Only) */}
              {isAdminUser && unassignedTasks.length > 0 && (
                <div
                  className="staff-dir-card"
                  style={{ borderStyle: 'dashed' }}
                  onClick={() => {
                    if (setSelectedStaffUser) setSelectedStaffUser({ id: 'unassigned', full_name: 'Unassigned Tasks' });
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div className="staff-dir-avatar" style={{ background: '#555b63' }}>
                        ?
                      </div>
                      <div>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
                          Unassigned Tasks
                        </h3>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                          Needs delegation to staff
                        </div>
                      </div>
                    </div>

                    <span
                      style={{
                        background: 'rgba(201, 25, 46, 0.2)',
                        border: '1px solid rgba(201, 25, 46, 0.35)',
                        borderRadius: 'var(--radius-full)',
                        padding: '4px 10px',
                        color: '#c9192e',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      {unassignedTasks.length} Tasks
                    </span>
                  </div>

                  <div className="staff-dir-footer-btn">
                    <span>View Unassigned Queue</span>
                    <span style={{ fontSize: '0.9rem' }}>→</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3-BOX TASK LOGS MODAL                                                     */}
      {/* (Box 1: Task Spec | Box 2: Audit Timeline & History | Box 3: Add Updates) */}
      {/* ========================================================================= */}
      {selectedTaskForLogs && (
        <TaskLogsModal
          task={selectedTaskForLogs}
          onClose={() => setSelectedTaskForLogs(null)}
          onTaskUpdated={handleTaskUpdated}
        />
      )}

      {/* Approving a portal creation / password reset task opens the Update page for the required portal details */}
      {approvalTask && (
        <TaskLogsModal
          task={approvalTask}
          onClose={() => setApprovalTask(null)}
          onTaskUpdated={handleTaskUpdated}
          openOnUpdate
          presetStatus="Approved"
        />
      )}
    </div>
  );
};

export default ActionTab;

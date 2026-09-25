import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import TaskLogsModal from './TaskLogsModal';
import { RemarksDisplay } from './ImagePasteRemarks';
import { printDashboardReport } from '../utils/printHelper';
import { formatDateTime } from '../utils/dateFormat';

export const DashboardTab = ({ setCurrentTab, onSelectStaff, onSelectCategory }) => {
  const { currentUser } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Selected employee for viewing assigned tasks in a clean modal/drawer
  const [activeEmployeeModal, setActiveEmployeeModal] = useState(null);
  const [employeeTasks, setEmployeeTasks] = useState({});
  const [tasksLoading, setTasksLoading] = useState(false);
  const [selectedTaskForLogs, setSelectedTaskForLogs] = useState(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await api.getStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEmployeeTasks = async (emp) => {
    setActiveEmployeeModal(emp);

    if (!employeeTasks[emp.id]) {
      try {
        setTasksLoading(true);
        const data = await api.getTasks({ assignee_id: emp.id });
        setEmployeeTasks((prev) => ({ ...prev, [emp.id]: data }));
      } catch (err) {
        console.error('Failed to load tasks for employee:', err);
      } finally {
        setTasksLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div className="brand-logo-badge" style={{ margin: '0 auto 1.25rem auto', animation: 'spin 1s infinite linear' }}>
          ↻
        </div>
        <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>Loading US24 Solutions Analytics...</div>
      </div>
    );
  }

  const kpis = stats?.kpis || { total: 0, in_progress: 0, completed: 0, pending: 0, completion_rate: 0 };
  const categories = stats?.categories || {};
  const assignees = stats?.assignees || [];
  const recentLogs = stats?.recent_logs || [];

  return (
    <div className="dashboard-container">
      {/* Top Header: Clean & Modern */}
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">OPERATIONS & PIPELINE</div>
          <h1 className="dashboard-title">Operational Dashboard</h1>
          <p className="dashboard-subtitle">
            Real-time tracking for Provider Credentialing, Payer Portal Creation, and ERA/EFT remittance.
          </p>
        </div>

        <div className="dashboard-header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => printDashboardReport(kpis, categories, assignees, currentUser)}
            title="Print executive operations dashboard summary report"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            🖨️ Print Summary
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              if (onSelectStaff && currentUser) {
                onSelectStaff(currentUser);
              } else {
                setCurrentTab('employee-task');
              }
            }}
          >
            My Work Queue
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="kpi-grid">
        {/* Total Tasks */}
        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Total Assignments</span>
            <span className="kpi-indicator blue"></span>
          </div>
          <div className="kpi-value">{kpis.total}</div>
          <div className="kpi-subtext">Active operational volume</div>
        </div>

        {/* In Progress */}
        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">In Progress</span>
            <span className="kpi-indicator cyan"></span>
          </div>
          <div className="kpi-value cyan">{kpis.in_progress}</div>
          <div className="kpi-subtext">Under active follow-up</div>
        </div>

        {/* Completed */}
        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Completed</span>
            <span className="kpi-indicator green"></span>
          </div>
          <div className="kpi-value green">{kpis.completed}</div>
          <div className="kpi-subtext green">{kpis.completion_rate}% Success Ratio</div>
        </div>

        {/* Pending Info */}
        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Pending Review</span>
            <span className="kpi-indicator amber"></span>
          </div>
          <div className="kpi-value amber">{kpis.pending}</div>
          <div className="kpi-subtext">Awaiting payer / client docs</div>
        </div>
      </div>

      {/* Middle Section: 2 Columns with Proportional Harmony */}
      <div className="dashboard-middle-grid">
        {/* Left Column: Category Distribution & Operational Mix */}
        <div className="glass-panel dashboard-category-card">
          <div className="section-header-clean">
            <div>
              <h2 className="section-title">Category Distribution</h2>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', margin: '2px 0 0 0' }}>
                Operational workload volume across core service pipelines
              </p>
            </div>
            <span className="section-tag">{kpis.total} Total Tasks</span>
          </div>

          {/* Unified Multi-Segment Distribution Bar */}
          <div className="cat-segmented-bar-wrapper">
            <div className="cat-segmented-bar">
              {[
                { key: 'portal_creation', color: '#06b6d4', count: categories.portal_creation || 0, label: 'Portal' },
                { key: 'credentialing', color: '#3b82f6', count: categories.credentialing || 0, label: 'Credentialing' },
                { key: 'era_eft', color: '#10b981', count: categories.era_eft || 0, label: 'ERA/EFT' },
                { key: 'general', color: '#8b5cf6', count: categories.general || 0, label: 'General' },
              ].map((c) => {
                const pct = kpis.total > 0 ? (c.count / kpis.total) * 100 : 0;
                if (pct <= 0) return null;
                return (
                  <div
                    key={c.key}
                    style={{
                      width: `${pct}%`,
                      backgroundColor: c.color,
                      height: '100%',
                    }}
                    title={`${c.label}: ${c.count} tasks (${Math.round(pct)}%)`}
                  />
                );
              })}
            </div>
            <div className="cat-legend-row">
              <span className="cat-legend-dot"><span className="dot" style={{ background: '#06b6d4' }} />Portal (52%)</span>
              <span className="cat-legend-dot"><span className="dot" style={{ background: '#3b82f6' }} />Credentialing (29%)</span>
              <span className="cat-legend-dot"><span className="dot" style={{ background: '#10b981' }} />ERA/EFT (19%)</span>
            </div>
          </div>

          {/* Interactive Category Cards */}
          <div className="cat-items-list">
            {[
              {
                label: 'Portal Creation & Setup',
                key: 'portal_creation',
                icon: '🌐',
                desc: 'Payer web registrations, Navinet & Availity setups',
                color: '#06b6d4',
                bgColor: 'rgba(6, 182, 212, 0.12)',
              },
              {
                label: 'Provider Credentialing',
                key: 'credentialing',
                icon: '🏥',
                desc: 'CAQH profile management & board enrollments',
                color: '#3b82f6',
                bgColor: 'rgba(59, 130, 246, 0.12)',
              },
              {
                label: 'ERA / EFT Direct Pay',
                key: 'era_eft',
                icon: '💳',
                desc: 'Electronic remittance & bank payment linkages',
                color: '#10b981',
                bgColor: 'rgba(16, 185, 129, 0.12)',
              },
              {
                label: 'General Practice Tasks',
                key: 'general',
                icon: '📋',
                desc: 'Provider inquiries & supporting documentation',
                color: '#8b5cf6',
                bgColor: 'rgba(139, 92, 246, 0.12)',
              },
            ].map((cat) => {
              const count = categories[cat.key] || 0;
              const pct = kpis.total > 0 ? Math.round((count / kpis.total) * 100) : 0;
              return (
                <div
                  key={cat.key}
                  className="cat-stat-card"
                  onClick={() => {
                    if (onSelectCategory) {
                      onSelectCategory(cat.key);
                    } else {
                      setCurrentTab('enrollment');
                    }
                  }}
                  title={`Click to open ${cat.label} in Enrollment Directory`}
                >
                  <div className="cat-card-header-flex">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="cat-card-icon" style={{ background: cat.bgColor }}>
                        {cat.icon}
                      </span>
                      <div>
                        <div className="cat-card-name">{cat.label}</div>
                        <div className="cat-card-desc">{cat.desc}</div>
                      </div>
                    </div>

                    <div className="cat-card-counts">
                      <span className="cat-number-badge" style={{ color: cat.color }}>
                        {count}
                      </span>
                      <span className="cat-pct-label">{pct}%</span>
                      <span className="cat-arrow-indicator">➔</span>
                    </div>
                  </div>

                  <div className="cat-progress-track">
                    <div
                      className="cat-progress-fill"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: cat.color,
                        boxShadow: `0 0 10px ${cat.color}66`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Insights Banner at bottom to eliminate empty void */}
          <div className="cat-insights-footer">
            <div className="cat-insight-chip">
              <span className="chip-icon">⚡</span>
              <span><strong>Dominant Volume:</strong> Portal Creation (52%)</span>
            </div>
            <div className="cat-insight-chip">
              <span className="chip-icon">🎯</span>
              <span><strong>Payer Network:</strong> Aetna, BCBS, Cigna</span>
            </div>
          </div>
        </div>

        {/* Right Column: Staff Assignment & Capacity */}
        <div className="glass-panel dashboard-staff-card">
          <div className="section-header-clean">
            <div>
              <h2 className="section-title">Staff Assignment & Capacity</h2>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', margin: '2px 0 0 0' }}>
                Operational workload balance & assignment throughput
              </p>
            </div>
            <span className="section-tag">{assignees.length} Team Members</span>
          </div>

          {/* Modern Staff Capacity Table (No Horizontal Overflow) */}
          <div className="staff-capacity-container">
            <div className="staff-table-header">
              <div className="col-member">Team Member</div>
              <div className="col-status">Workload Status</div>
              <div className="col-capacity">Capacity Level</div>
              <div className="col-action">Action</div>
            </div>

            <div className="staff-rows-list">
              {assignees.map((emp) => {
                // Calculate dynamic capacity status
                let capacityLabel = 'Available';
                let capacityClass = 'available';
                if (emp.active >= 3) {
                  capacityLabel = 'Heavy Load';
                  capacityClass = 'heavy';
                } else if (emp.active === 2) {
                  capacityLabel = 'Balanced';
                  capacityClass = 'balanced';
                } else if (emp.active === 1) {
                  capacityLabel = 'Optimal';
                  capacityClass = 'optimal';
                }

                return (
                  <div key={emp.id} className="staff-capacity-row">
                    {/* Team Member Avatar & Handles */}
                    <div className="col-member member-cell">
                      <div
                        className="user-avatar-sm"
                        style={{ backgroundColor: emp.avatar_color || '#2563eb' }}
                      >
                        {emp.name ? emp.name[0] : 'U'}
                      </div>
                      <div className="member-text-group">
                        <div className="member-name">{emp.name}</div>
                        <div className="member-username">@{emp.username}</div>
                      </div>
                    </div>

                    {/* In-Progress & Completed Counts */}
                    <div className="col-status status-cell">
                      <span className="badge-pill in-progress" title={`${emp.active} tasks in progress`}>
                        <span className="pill-dot" />
                        <strong>{emp.active}</strong> Active
                      </span>
                      <span className="badge-pill completed" title={`${emp.completed} tasks completed`}>
                        <strong>{emp.completed}</strong> Done
                      </span>
                      <span className="total-tag">
                        {emp.total} total
                      </span>
                    </div>

                    {/* Capacity Indicator Pill */}
                    <div className="col-capacity capacity-cell">
                      <span className={`capacity-indicator-pill ${capacityClass}`}>
                        <span className="cap-dot" />
                        <span>{capacityLabel}</span>
                      </span>
                    </div>

                    {/* Action Button */}
                    <div className="col-action action-cell">
                      <button
                        type="button"
                        className="btn-staff-inspect"
                        onClick={() => {
                          if (onSelectStaff) {
                            onSelectStaff(emp);
                          } else {
                            setCurrentTab('employee-task');
                          }
                        }}
                        title={`Inspect assigned tasks for ${emp.name}`}
                      >
                        View Tasks →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity Stream: Sleek & Crisp */}
      <div className="glass-panel" style={{ padding: '1.75rem' }}>
        <div className="section-header-clean">
          <h2 className="section-title">Real-Time Audit Stream</h2>
          <span className="section-tag">Latest Timeline Updates</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.25rem' }}>
          {recentLogs.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', padding: '1rem 0' }}>
              No audit updates recorded yet.
            </div>
          ) : (
            recentLogs.map((log) => (
              <div key={log.id} className="audit-log-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="audit-avatar-badge">
                    {log.updated_by_name ? log.updated_by_name[0] : 'U'}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.86rem', color: 'var(--text-main)' }}>
                      <strong>{log.updated_by_name}</strong> updated status to{' '}
                      <span className={`status-badge ${(log.new_status || 'request').toLowerCase().replace(/\s+/g, '-')}`}>
                        {log.new_status || 'Request'}
                      </span>
                    </div>
                    {(log.remarks || log.attachment) && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        <RemarksDisplay remarks={log.remarks} attachment={log.attachment} />
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', flexShrink: 0 }}>
                  {formatDateTime(log.created_at)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Dedicated Employee Tasks Modal (Clean, Non-disruptive) */}
      {activeEmployeeModal && (
        <div className="modal-overlay" onClick={() => setActiveEmployeeModal(null)}>
          <div
            className="glass-panel"
            style={{
              maxWidth: '680px',
              width: '92%',
              padding: '1.75rem',
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff' }}>
                  Tasks Assigned to {activeEmployeeModal.name}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Review and inspect workload for @{activeEmployeeModal.username}
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                onClick={() => setActiveEmployeeModal(null)}
              >
                ✕ Close
              </button>
            </div>

            {tasksLoading && !employeeTasks[activeEmployeeModal.id] ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading tasks...
              </div>
            ) : (employeeTasks[activeEmployeeModal.id] || []).length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                No active tasks currently assigned to {activeEmployeeModal.name}.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(employeeTasks[activeEmployeeModal.id] || []).map((task) => (
                  <div
                    key={task.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '10px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.8rem', color: 'var(--brand-cyan-light)' }}>
                          {task.task_id}
                        </span>
                        <span style={{ fontSize: '0.84rem', color: '#ffffff', fontWeight: 600 }}>
                          {task.task_name || task.category}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {task.project_name} {task.provider_name ? `• ${task.provider_name}` : ''} • {task.insurance_name}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                      <span className={`status-badge ${(task.status || 'request').toLowerCase().replace(/\s+/g, '-')}`}>
                        {task.status || 'Request'}
                      </span>
                      <button
                        type="button"
                        className="btn-table-action"
                        onClick={() => setSelectedTaskForLogs(task)}
                      >
                        Logs & Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Task Logs & Updates Modal */}
      {selectedTaskForLogs && (
        <TaskLogsModal
          task={selectedTaskForLogs}
          onClose={() => setSelectedTaskForLogs(null)}
          onTaskUpdated={(updated) => {
            setEmployeeTasks((prev) => {
              const next = { ...prev };
              Object.keys(next).forEach((k) => {
                next[k] = (next[k] || []).map((t) => (t.id === updated.id ? updated : t));
              });
              return next;
            });
            setSelectedTaskForLogs(updated);
            fetchStats();
          }}
        />
      )}
    </div>
  );
};

export default DashboardTab;

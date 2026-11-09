import React, { useState, useEffect, useRef } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import TaskLogsModal from './TaskLogsModal';
import { ImagePasteRemarks } from './ImagePasteRemarks';
import { formatDate } from '../utils/dateFormat';
import DateInput from './DateInput';
import StatusBadge from './StatusBadge';

// Task type configuration map
const TASK_TYPE_CONFIG = {
  'task-credentialing': {
    label: 'Credentialing',
    category: 'credentialing',
    icon: '🏥',
    accent: '#7c3aed',
    accentBg: 'rgba(124, 58, 237, 0.15)',
    accentBorder: 'rgba(124, 58, 237, 0.35)',
    taskNameValue: 'Credentialing',
    description: 'Provider credentialing & payer enrollment task',
  },
  'task-portal-creation': {
    label: 'Portal Creation',
    category: 'portal_creation',
    icon: '🌐',
    accent: '#0284c7',
    accentBg: 'rgba(2, 132, 199, 0.15)',
    accentBorder: 'rgba(2, 132, 199, 0.35)',
    taskNameValue: 'Portal Creation',
    description: 'New portal account setup & provisioning task',
  },
  'task-era-eft': {
    label: 'ERA / EFT',
    category: 'era_eft',
    icon: '💳',
    accent: '#d97706',
    accentBg: 'rgba(217, 119, 6, 0.15)',
    accentBorder: 'rgba(217, 119, 6, 0.35)',
    taskNameValue: 'ERA / EFT',
    description: 'Remittance advice & electronic fund transfer task',
  },
  'task-password-reset': {
    label: 'Password Reset',
    category: 'password_reset',
    icon: '🔑',
    accent: '#c9192e',
    accentBg: 'rgba(201, 25, 46, 0.15)',
    accentBorder: 'rgba(201, 25, 46, 0.35)',
    taskNameValue: 'Password Reset',
    description: 'Portal password recovery & credential update task',
  },
  'task-portal-unblock': {
    label: 'Portal Unblock',
    category: 'portal_unblock',
    icon: '🔓',
    accent: '#16a34a',
    accentBg: 'rgba(22, 163, 74, 0.15)',
    accentBorder: 'rgba(22, 163, 74, 0.35)',
    taskNameValue: 'Portal Unblock',
    description: 'Unblock locked-out portal accounts task',
  },
};

// "Ankit Kumar" -> "AK"
const getInitials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

export const TaskAssignTab = ({ taskType, setCurrentTab, onSelectStaff }) => {
  const { usersList, currentUser } = useAuth();
  const config = TASK_TYPE_CONFIG[taskType] || TASK_TYPE_CONFIG['task-credentialing'];

  const [formData, setFormData] = useState({
    task_id: '',
    creation_date: new Date().toISOString().split('T')[0],
    project_name: '',
    insurance_name: '',
    sub_plan: '',
    assignee: '',
    notes: '',
    attachment: null,
  });

  const [assignedTasks, setAssignedTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);
  const [justAssignedId, setJustAssignedId] = useState(null);
  // The assigned tasks table scrolls inside its own box
  const tableScrollRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Guaranteed Unique Task ID generator
  const generateClientUniqueTaskId = (allTasks = assignedTasks) => {
    const currentYear = new Date().getFullYear();
    let maxNum = 0;
    (allTasks || []).forEach((t) => {
      const m = t.task_id && t.task_id.match(new RegExp(`TSK-${currentYear}-(\\d+)`));
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
    const nextNum = maxNum + 1;
    let candidate = `TSK-${currentYear}-${String(nextNum).padStart(3, '0')}`;
    const existingSet = new Set((allTasks || []).map((t) => t.task_id));
    let counter = nextNum;
    while (existingSet.has(candidate)) {
      counter++;
      candidate = `TSK-${currentYear}-${String(counter).padStart(3, '0')}`;
    }
    return candidate;
  };

  const handleFetchAndSetUniqueTaskId = async () => {
    try {
      const res = await api.getNextTaskId();
      if (res && res.task_id) {
        setFormData((prev) => ({ ...prev, task_id: res.task_id }));
        return res.task_id;
      }
    } catch (err) {
      console.warn('Backend next-id unavailable, using client unique generator:', err);
    }
    const fallback = generateClientUniqueTaskId();
    setFormData((prev) => ({ ...prev, task_id: fallback }));
    return fallback;
  };

  // Fetch all assigned tasks for this task type
  const fetchAssignedTasks = async () => {
    try {
      setTasksLoading(true);
      const tasks = await api.getTasks();
      // Filter tasks by this task type's category
      const filtered = tasks.filter((t) => t.category === config.category);
      setAssignedTasks(filtered);

      if (!formData.task_id) {
        const uniqueId = generateClientUniqueTaskId(tasks);
        setFormData((prev) => ({
          ...prev,
          task_id: uniqueId,
        }));
      }
      handleFetchAndSetUniqueTaskId();
    } catch (err) {
      console.error('Failed to load assigned tasks:', err);
    } finally {
      setTasksLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignedTasks();
  }, [taskType]);

  // Reset form when switching task types
  useEffect(() => {
    setSuccessMsg('');
    setErrorMsg('');
    setJustAssignedId(null);
  }, [taskType]);

  // Set default assignee to first staff employee
  useEffect(() => {
    if (usersList.length > 0 && !formData.assignee) {
      const staffUser = usersList.find((u) => u.profile?.role === 'employee') || usersList[0];
      if (staffUser) {
        setFormData((prev) => ({ ...prev, assignee: staffUser.id }));
      }
    }
  }, [usersList]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccessMsg('');
    setErrorMsg('');
    setLoading(true);

    try {
      const payload = {
        task_id: formData.task_id,
        task_name: config.taskNameValue,
        category: config.category,
        project_name: formData.project_name,
        insurance_name: formData.insurance_name,
        sub_plan: formData.sub_plan || '',
        provider_name: '',
        assignee: formData.assignee ? parseInt(formData.assignee) : null,
        creation_date: formData.creation_date || null,
        status: 'Request',
        notes: formData.notes || '',
        attachment: formData.attachment || '',
        follow_up_type: 'call',
        follow_up_value: '',
      };

      const created = await api.createTask(payload);
      setSuccessMsg(`Task ${created.task_id} — ${config.label} has been assigned successfully!`);
      setJustAssignedId(created.id);

      // Prepend the new task into the list
      setAssignedTasks((prev) => [created, ...prev.filter((t) => t.id !== created.id)]);

      // Reset form for next assignment
      const nextId = generateClientUniqueTaskId([created, ...assignedTasks]);
      setFormData((prev) => ({
        ...prev,
        task_id: nextId,
        project_name: '',
        insurance_name: '',
        sub_plan: '',
        notes: '',
        attachment: null,
      }));
      handleFetchAndSetUniqueTaskId();

      // Smooth scroll to the assigned tasks, with the table at the top where the new task was added
      setTimeout(() => {
        const el = document.getElementById('assignedTasksSection');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        tableScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }, 200);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to create and assign task. Please check all fields.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div className="glass-panel" style={{ padding: '2.5rem' }}>
        {/* Header with task type indicator */}
        <div style={{ borderBottom: `1px solid ${config.accentBorder}`, paddingBottom: '1.25rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  fontSize: '2rem',
                  width: '52px',
                  height: '52px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '14px',
                  background: config.accentBg,
                  border: `1px solid ${config.accentBorder}`,
                  flexShrink: 0,
                }}
              >
                {config.icon}
              </div>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontFamily: 'var(--serif)', fontWeight: 400, color: 'var(--ink)', margin: 0 }}>
                  {config.label}
                  <span
                    style={{
                      marginLeft: '10px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '3px 10px',
                      borderRadius: '999px',
                      background: config.accentBg,
                      color: config.accent,
                      border: `1px solid ${config.accentBorder}`,
                      letterSpacing: '0.04em',
                      verticalAlign: 'middle',
                    }}
                  >
                    TASK ASSIGN
                  </span>
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px', margin: 0 }}>
                  {config.description}
                </p>
              </div>
            </div>
            <div
              style={{
                background: 'rgba(10, 36, 99, 0.15)',
                border: '1px solid rgba(10, 36, 99, 0.3)',
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                color: '#0648c0',
                fontWeight: 700,
                fontSize: '0.85rem',
                fontFamily: 'var(--mono)',
              }}
            >
              {formData.task_id || 'AUTO-ID'}
            </div>
          </div>
        </div>

        {successMsg && (
          <div
            style={{
              background: 'rgba(22, 163, 74, 0.15)',
              border: '1px solid rgba(22, 163, 74, 0.3)',
              color: '#15803d',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '1.5rem',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            ✓ {successMsg}
          </div>
        )}

        {errorMsg && (
          <div
            style={{
              background: 'rgba(201, 25, 46, 0.15)',
              border: '1px solid rgba(201, 25, 46, 0.3)',
              color: '#c9192e',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '1.5rem',
              fontSize: '0.9rem',
            }}
          >
            ✕ {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Row 1: Task ID + Assign Date */}
          <div className="form-section-card">
            <div className="form-section-header">
              <div className="form-section-title">
                <span>📋 Task Identification</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="compact-form-group">
                <label className="compact-form-label">
                  <span>Task ID</span>
                  <span style={{ fontSize: '0.68rem', color: config.accent, fontWeight: 600 }}>Auto Unique</span>
                </label>
                <input
                  type="text"
                  className="compact-form-input"
                  style={{ fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: '0.04em', color: '#0648c0' }}
                  value={formData.task_id}
                  onChange={(e) => handleChange('task_id', e.target.value)}
                  placeholder="TSK-2026-XXX"
                  required
                />
              </div>

              <div className="compact-form-group">
                <label className="compact-form-label">Assign Date *</label>
                <DateInput
                  className="compact-form-input"
                  value={formData.creation_date}
                  onChange={(value) => handleChange('creation_date', value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Row 2: Project Name + INS Name */}
          <div className="form-section-card">
            <div className="form-section-header">
              <div className="form-section-title">
                <span>🏢 Project & Insurance Details</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.65rem' }}>
              <div className="compact-form-group">
                <label className="compact-form-label">Project Name *</label>
                <input
                  type="text"
                  className="compact-form-input"
                  value={formData.project_name}
                  onChange={(e) => handleChange('project_name', e.target.value)}
                  placeholder="e.g. US24 Healthcare Partners"
                  required
                />
              </div>

              <div className="compact-form-group">
                <label className="compact-form-label">INS Name *</label>
                <input
                  type="text"
                  className="compact-form-input"
                  value={formData.insurance_name}
                  onChange={(e) => handleChange('insurance_name', e.target.value)}
                  placeholder="e.g. BCBS, Medicare, Aetna"
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="compact-form-group">
                <label className="compact-form-label">Sub INS</label>
                <input
                  type="text"
                  className="compact-form-input"
                  value={formData.sub_plan}
                  onChange={(e) => handleChange('sub_plan', e.target.value)}
                  placeholder="e.g. BCBS of Illinois, Medicare Part B"
                />
              </div>

              <div className="compact-form-group">
                <label className="compact-form-label">To Assign *</label>
                <select
                  className="compact-form-select"
                  value={formData.assignee}
                  onChange={(e) => handleChange('assignee', e.target.value)}
                  required
                >
                  <option value="">Select Assignee...</option>
                  {usersList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} - {u.profile?.employee_id || u.username}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Row 3: Remark with Image Paste */}
          <div className="form-section-card" style={{ marginBottom: '1.25rem' }}>
            <ImagePasteRemarks
              label="Remark"
              placeholder="Add any special instructions, notes, or press Ctrl+V to paste an image..."
              rows={2}
              value={formData.notes}
              onChange={(val) => handleChange('notes', val)}
              image={formData.attachment}
              onImageChange={(img) => setFormData((p) => ({ ...p, attachment: img }))}
              className="compact-form-input"
            />
          </div>

          {/* Submit Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '0.75rem', borderTop: '1px solid rgba(11, 13, 16, 0.08)' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setCurrentTab('employee-task')}
              style={{ padding: '7px 16px', fontSize: '0.84rem' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{
                minWidth: '190px',
                justifyContent: 'center',
                padding: '7px 18px',
                fontSize: '0.84rem',
              }}
            >
              {loading ? 'Assigning...' : `✓ Assign ${config.label} Task`}
            </button>
          </div>
        </form>
      </div>

      {/* Assigned Tasks Section */}
      <div
        id="assignedTasksSection"
        className="glass-panel"
        style={{ marginTop: '2.5rem', padding: '2rem' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
            borderBottom: '1px solid var(--border-glass)',
            paddingBottom: '1rem',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{config.icon}</span> {config.label} — Assigned Tasks
              <span
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  background: config.accentBg,
                  color: config.accent,
                  padding: '2px 10px',
                  borderRadius: '12px',
                  border: `1px solid ${config.accentBorder}`,
                }}
              >
                {assignedTasks.length} {assignedTasks.length === 1 ? 'Task' : 'Tasks'}
              </span>
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
              Recently assigned {config.label.toLowerCase()} records and live status
            </p>
          </div>

          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: '0.82rem', padding: '6px 12px' }}
            onClick={fetchAssignedTasks}
            disabled={tasksLoading}
          >
            🔄 Refresh
          </button>
        </div>

        {tasksLoading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading assigned tasks...
          </div>
        ) : assignedTasks.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No {config.label.toLowerCase()} tasks assigned yet. Fill out the form above to create your first task.
          </div>
        ) : (
          <div className="us24-table-container scroll-body" ref={tableScrollRef}>
            <table className="us24-table fit-columns">
              <thead>
                <tr>
                  <th>Task ID</th>
                  <th>Project / Insurance</th>
                  <th>Assigned To</th>
                  <th>Assign Date</th>
                  <th>Status</th>
                  <th className="cell-align-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignedTasks.map((t) => {
                  const isJustAssigned = t.id === justAssignedId;
                  const isUnassigned = !t.assignee || !t.assignee_name || t.assignee_name === 'Unassigned';
                  const avatarColor = usersList.find((u) => u.id === t.assignee)?.profile?.avatar_color;

                  return (
                    <tr key={t.id} className={isJustAssigned ? 'row-highlight' : ''}>
                      <td>
                        <div className="cell-stack">
                          <span className="cell-id">{t.task_id}</span>
                          {isJustAssigned && <span className="cell-new-tag">New</span>}
                        </div>
                      </td>

                      {/* Project (up to 2 lines), insurance and sub INS stacked; longer text is cut with … and shown in full on hover */}
                      <td className="cell-flex">
                        <span className="cell-primary cell-clamp-2" title={t.project_name || ''}>
                          {t.project_name || '—'}
                        </span>
                        <span className="cell-link-text cell-truncate" title={t.insurance_name || ''}>
                          {t.insurance_name || '—'}
                        </span>
                        {t.sub_plan && (
                          <span className="cell-secondary cell-truncate" title={t.sub_plan}>
                            {t.sub_plan}
                          </span>
                        )}
                      </td>

                      <td>
                        <div className="assignee-cell">
                          <span
                            className={`assignee-avatar${isUnassigned ? ' unassigned' : ''}`}
                            style={!isUnassigned && avatarColor ? { background: avatarColor } : undefined}
                          >
                            {isUnassigned ? '?' : getInitials(t.assignee_name)}
                          </span>
                          <span
                            className={`assignee-name${isUnassigned ? ' unassigned' : ''}`}
                            title={isUnassigned ? undefined : t.assignee_name}
                          >
                            {isUnassigned ? 'Unassigned' : t.assignee_name}
                          </span>
                        </div>
                      </td>

                      <td className="cell-date">{formatDate(t.creation_date, '—')}</td>

                      <td>
                        <StatusBadge status={t.status} />
                      </td>

                      <td className="cell-align-right">
                        <button type="button" className="table-action-btn" onClick={() => setSelectedTask(t)}>
                          📋 View Logs
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Task Logs Modal */}
      {selectedTask && (
        <TaskLogsModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onTaskUpdated={(updated) => {
            setAssignedTasks((prev) =>
              prev.map((t) => (t.id === updated.id ? updated : t))
            );
            setSelectedTask(updated);
          }}
        />
      )}
    </div>
  );
};

export default TaskAssignTab;

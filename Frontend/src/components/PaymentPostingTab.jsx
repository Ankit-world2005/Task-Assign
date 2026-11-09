import React, { useState, useEffect, useMemo, useRef } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import StatusBadge from './StatusBadge';
import TaskLogsModal from './TaskLogsModal';
import DateInput from './DateInput';
import { formatDate } from '../utils/dateFormat';

/**
 * Extracts Payment Posting metadata fields safely from the task record's notes.
 */
export function extractPaymentPostingFields(task) {
  let meta = {};
  if (task.notes) {
    try {
      const trimmed = task.notes.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        meta = JSON.parse(trimmed);
      } else {
        meta = { remarks: task.notes };
      }
    } catch {
      meta = { remarks: task.notes };
    }
  }

  return {
    ...task,
    date: task.creation_date,
    task_type: task.task_name || 'Payment Posting',
    file_name: meta.file_name || (task.insurance_name !== 'Payment Posting' ? task.insurance_name : '') || '',
    num_files_ppt: meta.num_files_ppt || '',
    denials_ss: meta.denials_ss || '',
    remaining: meta.remaining || '',
    approx_time_min: meta.approx_time_min || '',
    final_time_user: meta.final_time_user || '',
    remarks: meta.remarks || '',
    sup_qa: meta.sup_qa || task.follow_up_value || '',
    time_by_manish: meta.time_by_manish || '',
  };
}

export const PaymentPostingTab = ({ setCurrentTab, onSelectStaff }) => {
  const { currentUser, usersList } = useAuth();
  const isAdminUser = currentUser?.profile?.role === 'admin';
  const isStaff = !isAdminUser;

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTaskForLogs, setSelectedTaskForLogs] = useState(null);

  // Sub-tabs: 'assign' (Task Assign form view) or 'action' (Action Tab queue view).
  // Staff members default directly to 'action' so they immediately view their assigned tasks.
  const [activeSubTab, setActiveSubTab] = useState(isStaff ? 'action' : 'assign');

  // Import Tasks State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const fileInputRef = useRef(null);

  // Form state matching the 13 Excel columns
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    project_name: '',
    task_type: 'Payment Posting',
    file_name: '',
    num_files_ppt: '',
    denials_ss: '',
    remaining: '',
    approx_time_min: '',
    final_time_user: '',
    remarks: '',
    assignee_id: isStaff ? (currentUser?.id || '') : '',
    sup_qa: '',
    time_by_manish: '',
  });

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [staffFilter, setStaffFilter] = useState('all');

  // Inline feedback alert
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  const showFeedback = (type, message) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback({ type: '', message: '' }), 5000);
  };

  // Fetch payment posting tasks (scoped to current user for staff)
  const fetchTasks = async () => {
    try {
      setLoading(true);
      const params = { category: 'payment_posting' };
      if (isStaff && currentUser?.id) {
        params.assignee_id = currentUser.id;
      }
      const data = await api.getTasks(params);
      const enriched = (data || []).map(extractPaymentPostingFields);
      setTasks(enriched);
    } catch (err) {
      console.error('Failed to load payment posting tasks:', err);
      showFeedback('error', 'Failed to load Payment Posting tasks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  // Set default assignee
  useEffect(() => {
    if (isStaff && currentUser?.id) {
      setFormData((prev) => ({ ...prev, assignee_id: currentUser.id }));
    } else if (usersList.length > 0 && !formData.assignee_id) {
      const staffUser = usersList.find((u) => u.profile?.role === 'employee') || usersList[0];
      if (staffUser) {
        setFormData((prev) => ({ ...prev, assignee_id: staffUser.id }));
      }
    }
  }, [usersList, isStaff, currentUser]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Bulk import Payment Posting tasks from Excel (.xlsx, .xls) or CSV spreadsheet
  const handleImportFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportMsg('');

    try {
      const res = await api.importExcel(file, 'payment_posting');
      const msg = res.message || 'Payment Posting tasks imported successfully!';
      setImportMsg(msg);
      showFeedback('success', msg);
      await fetchTasks();
      setActiveSubTab('action');
      if (e.target) e.target.value = '';
    } catch (err) {
      const errMsg = err.response?.data?.detail || 'Import failed. Please check spreadsheet formatting.';
      setImportMsg(errMsg);
      showFeedback('error', errMsg);
    } finally {
      setImporting(false);
    }
  };

  // Submit Handler for Task Assignment
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.project_name.trim()) {
      showFeedback('error', 'Project Name is required.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        category: 'payment_posting',
        task_name: formData.task_type || 'Payment Posting',
        project_name: formData.project_name.trim(),
        insurance_name: formData.file_name.trim() || 'Payment Posting',
        sub_plan: formData.num_files_ppt ? `Files: ${formData.num_files_ppt}` : '',
        creation_date: formData.date || new Date().toISOString().split('T')[0],
        assignee: formData.assignee_id ? parseInt(formData.assignee_id) : null,
        status: 'Assigned',
        notes: JSON.stringify({
          file_name: formData.file_name || '',
          num_files_ppt: formData.num_files_ppt || '',
          denials_ss: formData.denials_ss || '',
          remaining: formData.remaining || '',
          approx_time_min: formData.approx_time_min || '',
          final_time_user: formData.final_time_user || '',
          remarks: formData.remarks || '',
          sup_qa: formData.sup_qa || '',
          time_by_manish: formData.time_by_manish || '',
        }),
        follow_up_type: 'call',
        follow_up_value: formData.sup_qa || '',
      };

      const created = await api.createTask(payload);
      showFeedback('success', `Task ${created.task_id} assigned successfully!`);

      // Reset form fields
      setFormData((prev) => ({
        ...prev,
        file_name: '',
        num_files_ppt: '',
        denials_ss: '',
        remaining: '',
        approx_time_min: '',
        final_time_user: '',
        remarks: '',
        sup_qa: '',
        time_by_manish: '',
      }));

      fetchTasks();
    } catch (err) {
      console.error('Failed to create payment posting task:', err);
      showFeedback('error', err.response?.data?.detail || 'Failed to assign task. Please check required fields.');
    } finally {
      setSubmitting(false);
    }
  };

  // Quick Status Change on Action Tab
  const handleQuickStatusChange = async (task, newStatus) => {
    if (task.status === newStatus) return;
    try {
      const res = await api.addTaskLog(task.id, {
        status: newStatus,
        remarks: `Status updated to "${newStatus}" by ${currentUser?.full_name || 'Staff'}.`,
      });
      if (res.task) {
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? extractPaymentPostingFields(res.task) : t))
        );
        showFeedback('success', `Task ${task.task_id} updated to "${newStatus}".`);
      }
    } catch (err) {
      console.error('Failed to update status:', err);
      showFeedback('error', 'Failed to update task status.');
    }
  };

  // Unique projects list for filtering
  const uniqueProjects = useMemo(() => {
    const set = new Set();
    tasks.forEach((t) => {
      if (t.project_name) set.add(t.project_name);
    });
    return Array.from(set).sort();
  }, [tasks]);

  // Filtered tasks calculation (only assigned tasks visible to staff users)
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Security & Portal Scoping: staff members strictly only see tasks assigned to them
      if (isStaff && String(t.assignee_id || t.assignee) !== String(currentUser?.id)) {
        return false;
      }
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (projectFilter !== 'all' && t.project_name !== projectFilter) return false;
      if (isAdminUser && staffFilter !== 'all') {
        if (staffFilter === 'unassigned') {
          if (t.assignee_id || t.assignee) return false;
        } else if (String(t.assignee_id || t.assignee) !== String(staffFilter)) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          (t.task_id && t.task_id.toLowerCase().includes(q)) ||
          (t.project_name && t.project_name.toLowerCase().includes(q)) ||
          (t.file_name && t.file_name.toLowerCase().includes(q)) ||
          (t.task_type && t.task_type.toLowerCase().includes(q)) ||
          (t.assignee_name && t.assignee_name.toLowerCase().includes(q)) ||
          (t.remarks && t.remarks.toLowerCase().includes(q)) ||
          (t.sup_qa && t.sup_qa.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [tasks, statusFilter, projectFilter, staffFilter, searchQuery, isStaff, isAdminUser, currentUser]);

  // Metrics
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'Completed' || t.status === 'Approved').length;
    const inProgress = tasks.filter((t) => t.status === 'In Progress' || t.status === 'In Process').length;
    const totalFiles = tasks.reduce((sum, t) => sum + (parseInt(t.num_files_ppt) || 0), 0);
    return { total, completed, inProgress, totalFiles };
  }, [tasks]);

  // Export current filtered table as CSV
  const handleExportCsv = () => {
    const headers = [
      'Date',
      'Project Name',
      'Task Type',
      'File Name',
      'Number of File for PPT',
      'DENIALS SS',
      'Remaining',
      'Approx Time Min',
      'Final Time by User',
      'Remarks',
      'Assinged User',
      'Sup QA',
      'Time By Manish',
      'Status',
    ];

    const rows = filteredTasks.map((t) => [
      t.date || '',
      t.project_name || '',
      t.task_type || '',
      t.file_name || '',
      t.num_files_ppt || '',
      t.denials_ss || '',
      t.remaining || '',
      t.approx_time_min || '',
      t.final_time_user || '',
      t.remarks || '',
      t.assignee_name || '',
      t.sup_qa || '',
      t.time_by_manish || '',
      t.status || '',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(','))].join(
        '\n'
      );

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Payment_Posting_Tasks_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="tab-container" style={{ padding: '24px 28px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Banner Alert */}
      {feedback.message && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 18px',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: 600,
            background: feedback.type === 'error' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
            color: feedback.type === 'error' ? '#dc2626' : '#16a34a',
            border: `1px solid ${feedback.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback({ type: '', message: '' })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              fontSize: '1.8rem',
              width: '46px',
              height: '46px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '12px',
              background: 'rgba(37, 99, 235, 0.1)',
              border: '1px solid rgba(37, 99, 235, 0.25)',
              flexShrink: 0,
            }}
          >
            💰
          </div>
          <div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>
                Payment Posting
              </h1>
            </div>
            <p style={{ margin: '3px 0 0 0', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
              {activeSubTab === 'action'
                ? 'Review payment posting queues, update task statuses, and record final times.'
                : 'Assign payment posting, denials, ERA remittance, and PPT queues.'}
            </p>
          </div>
        </div>

        {/* Header Right: Import Task & Task Toggle Buttons */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '999px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: '1px solid var(--border-glass)',
              background: 'rgba(11, 13, 16, 0.05)',
              color: 'var(--text-main)',
              transition: 'all 0.15s ease',
            }}
            title="Import Payment Posting tasks from Excel (.xlsx, .xls) or CSV"
          >
            <span>📤</span>
            <span>Import Task</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab((prev) => (prev === 'action' ? 'assign' : 'action'))}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '999px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: activeSubTab === 'action' ? '1px solid #2563eb' : '1px solid var(--border-glass)',
              background: activeSubTab === 'action' ? '#2563eb' : 'rgba(11, 13, 16, 0.05)',
              color: activeSubTab === 'action' ? '#ffffff' : 'var(--text-main)',
              transition: 'all 0.15s ease',
            }}
          >
            <span>⚡</span>
            <span>Task</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SUB-TAB 1: ACTION TAB (QUEUE, ACTION CARDS, WORK LOGS)       */}
      {/* ============================================================ */}
      {activeSubTab === 'action' && (
        <div>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div className="glass-panel" style={{ padding: '14px 18px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Queue</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink)', marginTop: '4px' }}>{stats.total}</div>
            </div>
            <div className="glass-panel" style={{ padding: '14px 18px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#2563eb', textTransform: 'uppercase' }}>In Progress</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2563eb', marginTop: '4px' }}>{stats.inProgress}</div>
            </div>
            <div className="glass-panel" style={{ padding: '14px 18px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#16a34a', textTransform: 'uppercase' }}>Completed</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a', marginTop: '4px' }}>{stats.completed}</div>
            </div>
            <div className="glass-panel" style={{ padding: '14px 18px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#d97706', textTransform: 'uppercase' }}>Total Files (PPT)</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#d97706', marginTop: '4px' }}>{stats.totalFiles}</div>
            </div>
          </div>

          {/* Action Filter Bar */}
          <div
            className="glass-panel"
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            {/* Search */}
            <div style={{ flex: '1 1 220px' }}>
              <input
                type="text"
                className="filter-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by project, file, staff, remarks..."
                style={{ width: '100%', padding: '7px 12px', fontSize: '0.82rem' }}
              />
            </div>

            {/* Staff Queue Filter - Only selectable for admins; staff members see their own assigned queue */}
            {isAdminUser ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Staff:</label>
                <select
                  className="box-select"
                  value={staffFilter}
                  onChange={(e) => setStaffFilter(e.target.value)}
                  style={{ padding: '5px 10px', fontSize: '0.82rem' }}
                >
                  <option value="all">All Staff</option>
                  <option value="unassigned">Unassigned</option>
                  {usersList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name || u.username}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    background: 'rgba(37, 99, 235, 0.1)',
                    color: '#2563eb',
                    border: '1px solid rgba(37, 99, 235, 0.25)',
                  }}
                >
                  👤 Assigned Queue: {currentUser?.full_name || currentUser?.username}
                </span>
              </div>
            )}

            {/* Status Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Status:</label>
              <select
                className="box-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ padding: '5px 10px', fontSize: '0.82rem' }}
              >
                <option value="all">All</option>
                <option value="Request">Request</option>
                <option value="Assigned">Assigned</option>
                <option value="In Progress">In Progress</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Completed">Completed</option>
              </select>
            </div>

            {/* Project Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Project:</label>
              <select
                className="box-select"
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                style={{ padding: '5px 10px', fontSize: '0.82rem' }}
              >
                <option value="all">All ({uniqueProjects.length})</option>
                {uniqueProjects.map((proj) => (
                  <option key={proj} value={proj}>
                    {proj}
                  </option>
                ))}
              </select>
            </div>

            {/* Reset */}
            {(searchQuery || statusFilter !== 'all' || projectFilter !== 'all' || staffFilter !== 'all') && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setProjectFilter('all');
                  setStaffFilter('all');
                }}
                style={{ padding: '5px 10px', fontSize: '0.78rem' }}
              >
                Reset
              </button>
            )}

            {/* Export CSV button */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleExportCsv}
                disabled={filteredTasks.length === 0}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', fontSize: '0.82rem' }}
                title="Export current view to Excel CSV"
              >
                <span>📥</span>
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Action Tasks Queue Table */}
          <div className="glass-panel" style={{ borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(11, 13, 16, 0.04)', borderBottom: '1px solid var(--border-glass)', textAlign: 'left' }}>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Task ID</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Date</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Project Name</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Task Type</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>File Name</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Files (PPT)</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Denials SS</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Remaining</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Approx Time</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Final Time</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Remarks</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Assigned User</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Sup QA</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Time (Manish)</th>
                    <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Quick Status</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="16" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                        <div className="login-spinner" style={{ width: '28px', height: '28px', margin: '0 auto 12px auto' }} />
                        Loading Payment Posting tasks...
                      </td>
                    </tr>
                  ) : filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan="16" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📋</div>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--ink)' }}>No Payment Posting Tasks Found</div>
                      </td>
                    </tr>
                  ) : (
                    filteredTasks.map((t) => (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 700, fontFamily: 'var(--mono)', color: '#2563eb' }}>
                          {t.task_id}
                        </td>
                        <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                          {formatDate(t.date) || '—'}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--ink)' }}>
                          {t.project_name}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(124, 58, 237, 0.08)', color: '#7c3aed', fontWeight: 600, fontSize: '0.78rem' }}>
                            {t.task_type || 'Payment Posting'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.file_name}>
                          {t.file_name || '—'}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 600 }}>
                          {t.num_files_ppt || '—'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>{t.denials_ss || '—'}</td>
                        <td style={{ padding: '12px 14px' }}>{t.remaining || '—'}</td>
                        <td style={{ padding: '12px 14px' }}>{t.approx_time_min ? `${t.approx_time_min} min` : '—'}</td>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: t.final_time_user ? '#16a34a' : 'inherit' }}>
                          {t.final_time_user || '—'}
                        </td>
                        <td style={{ padding: '12px 14px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.remarks}>
                          {t.remarks || '—'}
                        </td>
                        <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                          {t.assignee_name ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 700 }}>
                                {t.assignee_name[0]?.toUpperCase()}
                              </span>
                              <span>{t.assignee_name}</span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unassigned</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px' }}>{t.sup_qa || '—'}</td>
                        <td style={{ padding: '12px 14px' }}>{t.time_by_manish || '—'}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <select
                            className="box-select"
                            value={t.status || 'Request'}
                            onChange={(e) => handleQuickStatusChange(t, e.target.value)}
                            style={{ fontSize: '0.78rem', padding: '3px 8px', borderRadius: '6px' }}
                          >
                            <option value="Request">Request</option>
                            <option value="Assigned">Assigned</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Pending">Pending</option>
                            <option value="Approved">Approved</option>
                            <option value="Completed">Completed</option>
                          </select>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            className="btn-table-action"
                            onClick={() => setSelectedTaskForLogs(t)}
                            title="View audit logs, update status, and enter final time"
                          >
                            📋 Logs & Details
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SUB-TAB 2: TASK ASSIGN (THE 13 COLUMNS ASSIGNMENT FORM)      */}
      {/* ============================================================ */}
      {activeSubTab === 'assign' && (
        <div className="glass-panel" style={{ padding: '2rem 2.5rem', borderRadius: '12px' }}>
          {/* The 13 Columns Form */}
          <form onSubmit={handleSubmit}>
            {/* Row 1: Date & Project Details */}
            <div className="form-section-card" style={{ marginBottom: '1rem' }}>
              <div className="form-section-header" style={{ marginBottom: '0.75rem' }}>
                <div className="form-section-title" style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--ink)' }}>
                  <span>📅 1. Date & Project Details</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                {/* 1. Date */}
                <div className="compact-form-group">
                  <label className="compact-form-label">Date *</label>
                  <DateInput
                    className="compact-form-input"
                    value={formData.date}
                    onChange={(val) => handleChange('date', val)}
                    required
                  />
                </div>

                {/* 2. Project Name */}
                <div className="compact-form-group">
                  <label className="compact-form-label">Project Name *</label>
                  <input
                    type="text"
                    className="compact-form-input"
                    value={formData.project_name}
                    onChange={(e) => handleChange('project_name', e.target.value)}
                    placeholder="e.g. Hari Kisan, ARRA, WESTAZ"
                    required
                  />
                </div>

                {/* 3. Task Type */}
                <div className="compact-form-group">
                  <label className="compact-form-label">Task Type</label>
                  <input
                    type="text"
                    className="compact-form-input"
                    value={formData.task_type}
                    onChange={(e) => handleChange('task_type', e.target.value)}
                    placeholder="e.g. Payment Posting, Denials, PPT"
                  />
                </div>

                {/* 4. File Name */}
                <div className="compact-form-group">
                  <label className="compact-form-label">File Name</label>
                  <input
                    type="text"
                    className="compact-form-input"
                    value={formData.file_name}
                    onChange={(e) => handleChange('file_name', e.target.value)}
                    placeholder="e.g. Batch_01.pdf"
                  />
                </div>
              </div>
            </div>

            {/* Row 2: File Counts, Denials & Remaining */}
            <div className="form-section-card" style={{ marginBottom: '1rem' }}>
              <div className="form-section-header" style={{ marginBottom: '0.75rem' }}>
                <div className="form-section-title" style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--ink)' }}>
                  <span>📁 2. File Allocation & Denials</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                {/* 5. Number of File for PPT */}
                <div className="compact-form-group">
                  <label className="compact-form-label">Number of File for PPT</label>
                  <input
                    type="text"
                    className="compact-form-input"
                    value={formData.num_files_ppt}
                    onChange={(e) => handleChange('num_files_ppt', e.target.value)}
                    placeholder="e.g. 5"
                  />
                </div>

                {/* 6. DENIALS SS */}
                <div className="compact-form-group">
                  <label className="compact-form-label">DENIALS SS</label>
                  <input
                    type="text"
                    className="compact-form-input"
                    value={formData.denials_ss}
                    onChange={(e) => handleChange('denials_ss', e.target.value)}
                    placeholder="e.g. Done, Pending, 5 denials"
                  />
                </div>

                {/* 7. Remaining */}
                <div className="compact-form-group">
                  <label className="compact-form-label">Remaining</label>
                  <input
                    type="text"
                    className="compact-form-input"
                    value={formData.remaining}
                    onChange={(e) => handleChange('remaining', e.target.value)}
                    placeholder="e.g. 0, 2"
                  />
                </div>

                {/* 8. Approx Time Min */}
                <div className="compact-form-group">
                  <label className="compact-form-label">Approx Time (Min)</label>
                  <input
                    type="text"
                    className="compact-form-input"
                    value={formData.approx_time_min}
                    onChange={(e) => handleChange('approx_time_min', e.target.value)}
                    placeholder="e.g. 45"
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Assignment, QA & Staff Time Tracking */}
            <div className="form-section-card" style={{ marginBottom: '1rem' }}>
              <div className="form-section-header" style={{ marginBottom: '0.75rem' }}>
                <div className="form-section-title" style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--ink)' }}>
                  <span>👤 3. Staff Assignment & QA Details</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                {/* 11. Assigned User */}
                <div className="compact-form-group">
                  <label className="compact-form-label">
                    Assigned User * {isStaff && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>(Assigned to You)</span>}
                  </label>
                  <select
                    className="compact-form-select"
                    value={formData.assignee_id}
                    onChange={(e) => handleChange('assignee_id', e.target.value)}
                    disabled={isStaff}
                    required
                  >
                    {isStaff ? (
                      <option value={currentUser?.id}>
                        {currentUser?.full_name || currentUser?.username} ({currentUser?.profile?.employee_id || 'Staff'})
                      </option>
                    ) : (
                      <>
                        <option value="">Select Employee...</option>
                        {usersList.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name || u.username} ({u.profile?.role || 'staff'})
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                {/* 12. Sup QA */}
                <div className="compact-form-group">
                  <label className="compact-form-label">Sup QA</label>
                  <input
                    type="text"
                    className="compact-form-input"
                    value={formData.sup_qa}
                    onChange={(e) => handleChange('sup_qa', e.target.value)}
                    placeholder="e.g. Approved, Pending QA"
                  />
                </div>

                {/* 13. Time By Manish */}
                <div className="compact-form-group">
                  <label className="compact-form-label">Time By Manish</label>
                  <input
                    type="text"
                    className="compact-form-input"
                    value={formData.time_by_manish}
                    onChange={(e) => handleChange('time_by_manish', e.target.value)}
                    placeholder="e.g. 10 min"
                  />
                </div>

                {/* 9. Final Time by User */}
                <div className="compact-form-group">
                  <label className="compact-form-label">Final Time by User</label>
                  <input
                    type="text"
                    className="compact-form-input"
                    value={formData.final_time_user}
                    onChange={(e) => handleChange('final_time_user', e.target.value)}
                    placeholder="e.g. 40 min"
                  />
                </div>
              </div>
            </div>

            {/* Row 4: Remarks (Column 10) */}
            <div className="form-section-card" style={{ marginBottom: '1.5rem' }}>
              <div className="compact-form-group">
                <label className="compact-form-label">Remarks</label>
                <textarea
                  rows="2"
                  className="compact-form-input"
                  style={{ resize: 'vertical' }}
                  value={formData.remarks}
                  onChange={(e) => handleChange('remarks', e.target.value)}
                  placeholder="Enter remarks, special instructions, batch notes..."
                />
              </div>
            </div>

            {/* Submit Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setActiveSubTab('action')}
                style={{ padding: '10px 18px', fontSize: '0.9rem' }}
              >
                Cancel & View Action Tab
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={submitting}
                style={{ minWidth: '180px', padding: '10px 22px', fontSize: '0.92rem', fontWeight: 600 }}
              >
                {submitting ? 'Assigning...' : 'Assign Payment Posting Task'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Import Tasks Modal */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div
            className="glass-panel"
            style={{ maxWidth: '500px', width: '100%', padding: '2rem', borderRadius: '14px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--ink)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📤</span>
                <span>Import Payment Posting Tasks</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', padding: '4px' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Select or drop your Microsoft Excel (.xlsx, .xls) or CSV spreadsheet file to bulk import Payment Posting tasks into the queue.
            </p>

            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx, .xls, .csv"
              onChange={handleImportFileUpload}
              style={{ display: 'none' }}
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed rgba(37, 99, 235, 0.35)',
                borderRadius: '10px',
                padding: '2.5rem 1.5rem',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'rgba(37, 99, 235, 0.03)',
                marginBottom: '1rem',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📊</div>
              <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: '0.95rem' }}>
                {importing ? 'Importing tasks from spreadsheet...' : 'Click to browse or drop Excel file here'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '6px' }}>
                Supports Microsoft Excel (.xlsx, .xls) and CSV spreadsheets
              </div>
            </div>

            {importing && (
              <div style={{ textAlign: 'center', color: '#2563eb', fontSize: '0.85rem', marginBottom: '12px', fontWeight: 600 }}>
                ⏳ Processing and creating tasks in database...
              </div>
            )}

            {importMsg && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  background: importMsg.toLowerCase().includes('success') ? 'rgba(22, 163, 74, 0.12)' : 'rgba(201, 25, 46, 0.12)',
                  color: importMsg.toLowerCase().includes('success') ? '#15803d' : '#c9192e',
                  border: `1px solid ${importMsg.toLowerCase().includes('success') ? 'rgba(22, 163, 74, 0.25)' : 'rgba(201, 25, 46, 0.25)'}`,
                  marginBottom: '1rem',
                }}
              >
                {importMsg}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1rem' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowImportModal(false);
                  setImportMsg('');
                }}
                style={{ padding: '7px 16px', fontSize: '0.84rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Logs & Update Modal */}
      {selectedTaskForLogs && (
        <TaskLogsModal
          task={selectedTaskForLogs}
          onClose={() => setSelectedTaskForLogs(null)}
          onTaskUpdated={() => {
            fetchTasks();
            setSelectedTaskForLogs(null);
          }}
        />
      )}
    </div>
  );
};

export default PaymentPostingTab;

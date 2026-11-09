import React, { useState, useEffect, useMemo } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import StatusBadge from './StatusBadge';
import TaskLogsModal from './TaskLogsModal';
import DateInput from './DateInput';
import { formatDate } from '../utils/dateFormat';

/**
 * Parses raw text pasted from Excel (TSV or CSV) matching the requested columns:
 * Date,Project Name,Task Type,File Name,Number of File for PPT,DENIALS SS,Remaining,Approx Time Min,Final Time by User,Remarks,Assinged User,Sup QA,Time By Manish
 */
export function parsePastedExcelRows(rawText, usersList = []) {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const isTab = lines[0].includes('\t');
  const splitCells = (line) => {
    if (isTab) {
      return line.split('\t').map((c) => c.trim().replace(/^["']|["']$/g, ''));
    }
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(cur.trim().replace(/^["']|["']$/g, ''));
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim().replace(/^["']|["']$/g, ''));
    return cells;
  };

  const parsedMatrix = lines.map(splitCells);
  if (parsedMatrix.length === 0) return [];

  // Detect header row by checking column keywords
  const firstRowNorm = parsedMatrix[0].map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const hasHeader = firstRowNorm.some((h) =>
    h.includes('date') ||
    h.includes('project') ||
    h.includes('filename') ||
    h.includes('tasktype') ||
    h.includes('user') ||
    h.includes('denial') ||
    h.includes('ppt')
  );

  let colMap = {
    date: 0,
    project_name: 1,
    task_type: 2,
    file_name: 3,
    num_files_ppt: 4,
    denials_ss: 5,
    remaining: 6,
    approx_time_min: 7,
    final_time_user: 8,
    remarks: 9,
    assigned_user: 10,
    sup_qa: 11,
    time_by_manish: 12,
  };

  let dataRows = parsedMatrix;
  if (hasHeader) {
    firstRowNorm.forEach((h, idx) => {
      if (h.includes('date')) colMap.date = idx;
      else if (h.includes('project') || h.includes('client')) colMap.project_name = idx;
      else if (h.includes('tasktype') || h === 'type') colMap.task_type = idx;
      else if (h.includes('filename') || h.includes('file')) colMap.file_name = idx;
      else if (h.includes('ppt') || h.includes('numberoffile')) colMap.num_files_ppt = idx;
      else if (h.includes('denial')) colMap.denials_ss = idx;
      else if (h.includes('remaining') || h.includes('rem')) colMap.remaining = idx;
      else if (h.includes('approx') || h.includes('esttime')) colMap.approx_time_min = idx;
      else if (h.includes('finaltime') || h.includes('usertime')) colMap.final_time_user = idx;
      else if (h.includes('remark') || h.includes('notes')) colMap.remarks = idx;
      else if (h.includes('user') || h.includes('assign')) colMap.assigned_user = idx;
      else if (h.includes('qa') || h.includes('sup')) colMap.sup_qa = idx;
      else if (h.includes('manish')) colMap.time_by_manish = idx;
    });
    dataRows = parsedMatrix.slice(1);
  }

  // Helper to match user name/username against usersList
  const matchUser = (rawName) => {
    if (!rawName) return null;
    const clean = rawName.toLowerCase().trim();
    if (!clean || ['none', 'unassigned', '-', 'n/a'].includes(clean)) return null;
    return (
      usersList.find((u) => {
        const uName = (u.username || '').toLowerCase();
        const fName = (u.full_name || '').toLowerCase();
        return uName === clean || fName === clean || fName.includes(clean) || clean.includes(uName);
      }) || null
    );
  };

  return dataRows
    .map((row, idx) => {
      const rawDate = row[colMap.date] || '';
      let cleanDate = rawDate;
      if (rawDate) {
        const parsed = new Date(rawDate);
        if (!isNaN(parsed.getTime())) {
          cleanDate = parsed.toISOString().split('T')[0];
        }
      } else {
        cleanDate = new Date().toISOString().split('T')[0];
      }

      const assignedRaw = row[colMap.assigned_user] || '';
      const matched = matchUser(assignedRaw);

      return {
        _tempKey: `row-${idx}-${Math.random().toString(36).slice(2, 7)}`,
        date: cleanDate,
        project_name: row[colMap.project_name] || '',
        task_type: row[colMap.task_type] || 'Payment Posting',
        file_name: row[colMap.file_name] || '',
        num_files_ppt: row[colMap.num_files_ppt] || '',
        denials_ss: row[colMap.denials_ss] || '',
        remaining: row[colMap.remaining] || '',
        approx_time_min: row[colMap.approx_time_min] || '',
        final_time_user: row[colMap.final_time_user] || '',
        remarks: row[colMap.remarks] || '',
        assigned_user_raw: assignedRaw,
        assignee_id: matched ? matched.id : null,
        assignee_name: matched ? (matched.full_name || matched.username) : assignedRaw,
        sup_qa: row[colMap.sup_qa] || '',
        time_by_manish: row[colMap.time_by_manish] || '',
      };
    })
    .filter((r) => r.project_name || r.file_name || r.task_type || r.remarks);
}

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
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskForLogs, setSelectedTaskForLogs] = useState(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');

  // Excel Paste Modal / Drawer state
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteInput, setPasteInput] = useState('');
  const [parsedPreviewRows, setParsedPreviewRows] = useState([]);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

  // Single Task Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [singleSubmitting, setSingleSubmitting] = useState(false);
  const [singleForm, setSingleForm] = useState({
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
    assignee_id: '',
    sup_qa: '',
    time_by_manish: '',
  });

  // User feedback notice
  const [banner, setBanner] = useState({ type: '', message: '' });

  const showBanner = (type, message) => {
    setBanner({ type, message });
    setTimeout(() => setBanner({ type: '', message: '' }), 5000);
  };

  // Fetch all payment posting tasks
  const fetchTasks = async () => {
    try {
      setLoading(true);
      const data = await api.getTasks({ category: 'payment_posting' });
      const enriched = (data || []).map(extractPaymentPostingFields);
      setTasks(enriched);
    } catch (err) {
      console.error('Failed to load payment posting tasks:', err);
      showBanner('error', 'Failed to load Payment Posting tasks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  // Update parsed preview whenever pasteInput changes
  useEffect(() => {
    if (pasteInput.trim()) {
      const parsed = parsePastedExcelRows(pasteInput, usersList);
      setParsedPreviewRows(parsed);
    } else {
      setParsedPreviewRows([]);
    }
  }, [pasteInput, usersList]);

  // Bulk Assign Handler
  const handleBulkAssign = async () => {
    if (parsedPreviewRows.length === 0) return;

    setBulkAssigning(true);
    setBulkProgress({ current: 0, total: parsedPreviewRows.length });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < parsedPreviewRows.length; i++) {
      const row = parsedPreviewRows[i];
      setBulkProgress({ current: i + 1, total: parsedPreviewRows.length });

      try {
        const payload = {
          category: 'payment_posting',
          task_name: row.task_type || 'Payment Posting',
          project_name: row.project_name || 'Payment Posting Project',
          insurance_name: row.file_name || 'Payment Posting',
          sub_plan: row.num_files_ppt ? `Files: ${row.num_files_ppt}` : '',
          creation_date: row.date || new Date().toISOString().split('T')[0],
          assignee: row.assignee_id ? parseInt(row.assignee_id) : null,
          status: 'Assigned',
          notes: JSON.stringify({
            file_name: row.file_name || '',
            num_files_ppt: row.num_files_ppt || '',
            denials_ss: row.denials_ss || '',
            remaining: row.remaining || '',
            approx_time_min: row.approx_time_min || '',
            final_time_user: row.final_time_user || '',
            remarks: row.remarks || '',
            sup_qa: row.sup_qa || '',
            time_by_manish: row.time_by_manish || '',
          }),
          follow_up_type: 'call',
          follow_up_value: row.sup_qa || '',
        };

        await api.createTask(payload);
        successCount++;
      } catch (err) {
        console.error('Failed to assign task row:', row, err);
        failCount++;
      }
    }

    setBulkAssigning(false);
    setIsPasteModalOpen(false);
    setPasteInput('');
    setParsedPreviewRows([]);
    showBanner(
      failCount === 0 ? 'success' : 'warning',
      `Assigned ${successCount} Payment Posting task(s)${failCount > 0 ? ` (${failCount} failed)` : ''} successfully!`
    );
    fetchTasks();
  };

  // Single Task Submit Handler
  const handleSingleSubmit = async (e) => {
    e.preventDefault();
    if (!singleForm.project_name.trim()) {
      showBanner('error', 'Project Name is required.');
      return;
    }

    setSingleSubmitting(true);
    try {
      const payload = {
        category: 'payment_posting',
        task_name: singleForm.task_type || 'Payment Posting',
        project_name: singleForm.project_name.trim(),
        insurance_name: singleForm.file_name.trim() || 'Payment Posting',
        sub_plan: singleForm.num_files_ppt ? `Files: ${singleForm.num_files_ppt}` : '',
        creation_date: singleForm.date || new Date().toISOString().split('T')[0],
        assignee: singleForm.assignee_id ? parseInt(singleForm.assignee_id) : null,
        status: 'Assigned',
        notes: JSON.stringify({
          file_name: singleForm.file_name || '',
          num_files_ppt: singleForm.num_files_ppt || '',
          denials_ss: singleForm.denials_ss || '',
          remaining: singleForm.remaining || '',
          approx_time_min: singleForm.approx_time_min || '',
          final_time_user: singleForm.final_time_user || '',
          remarks: singleForm.remarks || '',
          sup_qa: singleForm.sup_qa || '',
          time_by_manish: singleForm.time_by_manish || '',
        }),
        follow_up_type: 'call',
        follow_up_value: singleForm.sup_qa || '',
      };

      await api.createTask(payload);
      setIsAddModalOpen(false);
      setSingleForm({
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
        assignee_id: '',
        sup_qa: '',
        time_by_manish: '',
      });
      showBanner('success', 'Payment Posting task assigned successfully!');
      fetchTasks();
    } catch (err) {
      console.error('Failed to create single task:', err);
      showBanner('error', 'Failed to assign task. Please verify required fields.');
    } finally {
      setSingleSubmitting(false);
    }
  };

  // Filtered tasks calculation
  const uniqueProjects = useMemo(() => {
    const set = new Set();
    tasks.forEach((t) => {
      if (t.project_name) set.add(t.project_name);
    });
    return Array.from(set).sort();
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (projectFilter !== 'all' && t.project_name !== projectFilter) return false;
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
  }, [tasks, statusFilter, projectFilter, searchQuery]);

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

  // Metrics
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'Completed' || t.status === 'Approved').length;
    const inProgress = tasks.filter((t) => t.status === 'In Progress' || t.status === 'In Process').length;
    const totalFiles = tasks.reduce((sum, t) => sum + (parseInt(t.num_files_ppt) || 0), 0);
    return { total, completed, inProgress, totalFiles };
  }, [tasks]);

  return (
    <div className="tab-container" style={{ padding: '24px 28px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Top Banner Alert */}
      {banner.message && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 18px',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: 600,
            background: banner.type === 'error' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
            color: banner.type === 'error' ? '#dc2626' : '#16a34a',
            border: `1px solid ${banner.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{banner.message}</span>
          <button
            type="button"
            onClick={() => setBanner({ type: '', message: '' })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '22px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.6rem' }}>💰</span>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>
              Payment Posting
            </h1>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 8px', borderRadius: '12px', background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' }}>
              {tasks.length} {tasks.length === 1 ? 'Task' : 'Tasks'}
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Assign, manage, and track Payment Posting (PPT), Denials, and ERA remittance queues.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setIsPasteModalOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 16px', fontWeight: 600 }}
            title="Paste copied rows directly from Excel"
          >
            <span>📋</span>
            <span>Paste from Excel</span>
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => setIsAddModalOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 16px', fontWeight: 600 }}
          >
            <span>➕</span>
            <span>Assign Single Task</span>
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={handleExportCsv}
            disabled={filteredTasks.length === 0}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', fontSize: '0.85rem' }}
            title="Export current view to Excel-compatible CSV"
          >
            <span>📥</span>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '22px' }}>
        <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '10px' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Tasks</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--ink)', marginTop: '4px' }}>{stats.total}</div>
        </div>
        <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '10px' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#2563eb', textTransform: 'uppercase' }}>In Progress</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#2563eb', marginTop: '4px' }}>{stats.inProgress}</div>
        </div>
        <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '10px' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#16a34a', textTransform: 'uppercase' }}>Completed</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#16a34a', marginTop: '4px' }}>{stats.completed}</div>
        </div>
        <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '10px' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#d97706', textTransform: 'uppercase' }}>Total Files (PPT)</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#d97706', marginTop: '4px' }}>{stats.totalFiles}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-panel" style={{ padding: '14px 18px', borderRadius: '10px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', position: 'relative' }}>
          <input
            type="text"
            className="filter-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by project, file, remarks, staff..."
            style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>Status:</label>
          <select
            className="box-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
          >
            <option value="all">All Statuses</option>
            <option value="Request">Request</option>
            <option value="Assigned">Assigned</option>
            <option value="In Progress">In Progress</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Completed">Completed</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>Project:</label>
          <select
            className="box-select"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
          >
            <option value="all">All Projects ({uniqueProjects.length})</option>
            {uniqueProjects.map((proj) => (
              <option key={proj} value={proj}>
                {proj}
              </option>
            ))}
          </select>
        </div>

        {(searchQuery || statusFilter !== 'all' || projectFilter !== 'all') && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
              setProjectFilter('all');
            }}
            style={{ padding: '6px 10px', fontSize: '0.78rem' }}
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Main Data Table */}
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
                <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>Actions</th>
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
                    <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>
                      Click <strong>"Paste from Excel"</strong> to batch-assign copied tasks or <strong>"Assign Single Task"</strong> to create one.
                    </div>
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
                    <td style={{ padding: '12px 14px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.remarks}>
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
                      <StatusBadge status={t.status} />
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn-table-action"
                        onClick={() => setSelectedTaskForLogs(t)}
                        title="View audit logs, update status, and enter final time"
                      >
                        📋 Logs & Update
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: PASTE EXCEL TASKS */}
      {isPasteModalOpen && (
        <div className="modal-backdrop" onClick={() => !bulkAssigning && setIsPasteModalOpen(false)}>
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '960px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.4rem' }}>📋</span>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
                    Paste Tasks from Excel
                  </h2>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Copy rows directly from your spreadsheet and paste below.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !bulkAssigning && setIsPasteModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            {/* Expected format header reminder */}
            <div style={{ padding: '10px 14px', borderRadius: '6px', background: 'rgba(37, 99, 235, 0.06)', border: '1px solid rgba(37, 99, 235, 0.2)', marginBottom: '14px', fontSize: '0.78rem', color: 'var(--text-main)' }}>
              <strong>Expected Excel columns (with or without header):</strong>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', color: '#2563eb', marginTop: '4px', wordBreak: 'break-all' }}>
                Date, Project Name, Task Type, File Name, Number of File for PPT, DENIALS SS, Remaining, Approx Time Min, Final Time by User, Remarks, Assinged User, Sup QA, Time By Manish
              </div>
            </div>

            {/* Paste textarea */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                Paste clipboard content here (Ctrl + V):
              </label>
              <textarea
                rows="6"
                className="filter-input"
                style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: '0.8rem', padding: '10px', resize: 'vertical' }}
                placeholder="2026-11-09&#9;Hari Kisan&#9;Payment Posting&#9;Batch_01.pdf&#9;5&#9;Done&#9;0&#9;45&#9;40 min&#9;Completed&#9;sourabh&#9;Approved&#9;10 min"
                value={pasteInput}
                onChange={(e) => setPasteInput(e.target.value)}
                disabled={bulkAssigning}
              />
            </div>

            {/* Live Parsed Preview Table */}
            {parsedPreviewRows.length > 0 && (
              <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#16a34a' }}>
                    ✓ Parsed {parsedPreviewRows.length} task(s) ready to assign:
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPasteInput('');
                      setParsedPreviewRows([]);
                    }}
                    style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Clear All
                  </button>
                </div>

                <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: '6px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                    <thead>
                      <tr style={{ background: 'rgba(11, 13, 16, 0.05)', textAlign: 'left', borderBottom: '1px solid var(--border-glass)' }}>
                        <th style={{ padding: '6px 8px' }}>#</th>
                        <th style={{ padding: '6px 8px' }}>Date</th>
                        <th style={{ padding: '6px 8px' }}>Project</th>
                        <th style={{ padding: '6px 8px' }}>Task Type</th>
                        <th style={{ padding: '6px 8px' }}>File Name</th>
                        <th style={{ padding: '6px 8px' }}>PPT Files</th>
                        <th style={{ padding: '6px 8px' }}>Denials</th>
                        <th style={{ padding: '6px 8px' }}>Approx (min)</th>
                        <th style={{ padding: '6px 8px' }}>Assigned User</th>
                        <th style={{ padding: '6px 8px' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedPreviewRows.map((r, i) => (
                        <tr key={r._tempKey} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                          <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{i + 1}</td>
                          <td style={{ padding: '6px 8px' }}>{r.date}</td>
                          <td style={{ padding: '6px 8px', fontWeight: 600 }}>{r.project_name}</td>
                          <td style={{ padding: '6px 8px' }}>{r.task_type}</td>
                          <td style={{ padding: '6px 8px' }}>{r.file_name}</td>
                          <td style={{ padding: '6px 8px' }}>{r.num_files_ppt}</td>
                          <td style={{ padding: '6px 8px' }}>{r.denials_ss}</td>
                          <td style={{ padding: '6px 8px' }}>{r.approx_time_min}</td>
                          <td style={{ padding: '6px 8px' }}>
                            {r.assignee_id ? (
                              <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ {r.assignee_name}</span>
                            ) : r.assigned_user_raw ? (
                              <span style={{ color: '#d97706' }}>⚠️ {r.assigned_user_raw} (not matched)</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>
                            )}
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <button
                              type="button"
                              onClick={() => setParsedPreviewRows((prev) => prev.filter((item) => item._tempKey !== r._tempKey))}
                              style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem' }}
                              title="Remove row"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Modal actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsPasteModalOpen(false)}
                disabled={bulkAssigning}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleBulkAssign}
                disabled={bulkAssigning || parsedPreviewRows.length === 0}
                style={{ minWidth: '150px' }}
              >
                {bulkAssigning
                  ? `Assigning ${bulkProgress.current} / ${bulkProgress.total}...`
                  : `Assign ${parsedPreviewRows.length} Task(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ASSIGN SINGLE TASK */}
      {isAddModalOpen && (
        <div className="modal-backdrop" onClick={() => !singleSubmitting && setIsAddModalOpen(false)}>
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '680px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.4rem' }}>➕</span>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
                  Assign Payment Posting Task
                </h2>
              </div>
              <button
                type="button"
                onClick={() => !singleSubmitting && setIsAddModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSingleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                {/* Date */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                    Date *
                  </label>
                  <DateInput
                    value={singleForm.date}
                    onChange={(val) => setSingleForm((prev) => ({ ...prev, date: val }))}
                  />
                </div>

                {/* Project Name */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                    Project Name *
                  </label>
                  <input
                    type="text"
                    required
                    className="filter-input"
                    placeholder="e.g. Hari Kisan, ARRA, WESTAZ"
                    value={singleForm.project_name}
                    onChange={(e) => setSingleForm((prev) => ({ ...prev, project_name: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px' }}
                  />
                </div>

                {/* Task Type */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                    Task Type
                  </label>
                  <input
                    type="text"
                    className="filter-input"
                    placeholder="Payment Posting, Denials, etc."
                    value={singleForm.task_type}
                    onChange={(e) => setSingleForm((prev) => ({ ...prev, task_type: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px' }}
                  />
                </div>

                {/* File Name */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                    File Name
                  </label>
                  <input
                    type="text"
                    className="filter-input"
                    placeholder="e.g. Batch_01.pdf"
                    value={singleForm.file_name}
                    onChange={(e) => setSingleForm((prev) => ({ ...prev, file_name: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px' }}
                  />
                </div>

                {/* Number of File for PPT */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                    Number of File for PPT
                  </label>
                  <input
                    type="text"
                    className="filter-input"
                    placeholder="e.g. 5"
                    value={singleForm.num_files_ppt}
                    onChange={(e) => setSingleForm((prev) => ({ ...prev, num_files_ppt: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px' }}
                  />
                </div>

                {/* DENIALS SS */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                    DENIALS SS
                  </label>
                  <input
                    type="text"
                    className="filter-input"
                    placeholder="e.g. Done, Pending, 5 denials"
                    value={singleForm.denials_ss}
                    onChange={(e) => setSingleForm((prev) => ({ ...prev, denials_ss: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px' }}
                  />
                </div>

                {/* Remaining */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                    Remaining
                  </label>
                  <input
                    type="text"
                    className="filter-input"
                    placeholder="e.g. 0 or 2"
                    value={singleForm.remaining}
                    onChange={(e) => setSingleForm((prev) => ({ ...prev, remaining: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px' }}
                  />
                </div>

                {/* Approx Time Min */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                    Approx Time (Min)
                  </label>
                  <input
                    type="text"
                    className="filter-input"
                    placeholder="e.g. 45"
                    value={singleForm.approx_time_min}
                    onChange={(e) => setSingleForm((prev) => ({ ...prev, approx_time_min: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px' }}
                  />
                </div>

                {/* Assigned User */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                    Assigned User
                  </label>
                  <select
                    className="box-select"
                    value={singleForm.assignee_id}
                    onChange={(e) => setSingleForm((prev) => ({ ...prev, assignee_id: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px' }}
                  >
                    <option value="">Select Employee...</option>
                    {usersList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.username} ({u.profile?.role || 'staff'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sup QA */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                    Sup QA
                  </label>
                  <input
                    type="text"
                    className="filter-input"
                    placeholder="Supervisor / QA status"
                    value={singleForm.sup_qa}
                    onChange={(e) => setSingleForm((prev) => ({ ...prev, sup_qa: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px' }}
                  />
                </div>

                {/* Time By Manish */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                    Time By Manish
                  </label>
                  <input
                    type="text"
                    className="filter-input"
                    placeholder="e.g. 15 min"
                    value={singleForm.time_by_manish}
                    onChange={(e) => setSingleForm((prev) => ({ ...prev, time_by_manish: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px' }}
                  />
                </div>

                {/* Final Time by User */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                    Final Time by User
                  </label>
                  <input
                    type="text"
                    className="filter-input"
                    placeholder="e.g. 40 min"
                    value={singleForm.final_time_user}
                    onChange={(e) => setSingleForm((prev) => ({ ...prev, final_time_user: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px' }}
                  />
                </div>
              </div>

              {/* Remarks */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                  Remarks
                </label>
                <textarea
                  rows="3"
                  className="filter-input"
                  placeholder="Additional task notes, batch info, or remarks..."
                  value={singleForm.remarks}
                  onChange={(e) => setSingleForm((prev) => ({ ...prev, remarks: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={singleSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={singleSubmitting}
                  style={{ minWidth: '120px' }}
                >
                  {singleSubmitting ? 'Assigning...' : 'Assign Task'}
                </button>
              </div>
            </form>
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

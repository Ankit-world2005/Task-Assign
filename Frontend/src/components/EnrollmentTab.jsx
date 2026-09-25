import React, { useState, useEffect, useRef } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import TaskLogsModal from './TaskLogsModal';
import { ImagePasteRemarks } from './ImagePasteRemarks';
import { printEnrollmentsReport } from '../utils/printHelper';
import { formatDate, formatDateTime } from '../utils/dateFormat';
import DateInput from './DateInput';

const CREDENTIALING_PROJECTS = [
  'Hari Kisan',
  'ARRA',
  'WESTAZ',
  'ICURE',
  'THIRD EYE',
  'MAYERLAND',
  'NAMASTE',
];

export const EnrollmentTab = ({ setCurrentTab, activeCategory = 'all', setActiveCategory, onSelectStaff }) => {
  const { usersList, currentUser } = useAuth();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(activeCategory || 'all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedTask, setSelectedTask] = useState(null);

  // Sync category prop when selected from Navbar dropdown
  useEffect(() => {
    if (activeCategory) {
      setCategory(activeCategory);
    }
  }, [activeCategory]);

  const handleCategoryChange = (catId) => {
    setCategory(catId);
    if (setActiveCategory) {
      setActiveCategory(catId);
    }
  };

  // Excel Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const fileInputRef = useRef(null);

  // New Enrollment Task Modal State
  const [showNewEnrollmentModal, setShowNewEnrollmentModal] = useState(false);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalSuccess, setModalSuccess] = useState('');

  const [newFormData, setNewFormData] = useState({
    task_id: '',
    task_name: 'Provider Credentialing',
    category: 'credentialing',
    project_name: 'Hari Kisan',
    custom_project: '',
    insurance_name: 'BCBS',
    creation_date: new Date().toISOString().split('T')[0],
    provider_name: '',
    provider_effective_date: '',
    group_ptan: '',
    individual_ptan: '',
    early_start_date: '',
    sub_plan: 'Provider Credentialing Specialist Plan',
    assignee: '',
    follow_up_type: 'portal',
    follow_up_value: '',
    status: 'Request',
    notes: '',
    attachment: null,
  });

  const [insuranceOptions, setInsuranceOptions] = useState(['BCBS', 'Aetna', 'Cigna']);
  const [isAddingInsurance, setIsAddingInsurance] = useState(false);
  const [newInsuranceInput, setNewInsuranceInput] = useState('');
  const [isCustomProject, setIsCustomProject] = useState(false);
  const [autoMoveToAssignee, setAutoMoveToAssignee] = useState(true);

  // Set default assignee for the modal
  useEffect(() => {
    if (usersList.length > 0 && !newFormData.assignee) {
      const defaultUser = usersList.find((u) => u.profile?.role !== 'admin') || usersList[0];
      if (defaultUser) {
        setNewFormData((prev) => ({ ...prev, assignee: defaultUser.id }));
      }
    }
  }, [usersList]);

  // Guaranteed Unique Task ID generator
  const generateClientUniqueTaskId = (allTasks = tasks) => {
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
        setNewFormData((prev) => ({ ...prev, task_id: res.task_id }));
        return res.task_id;
      }
    } catch (err) {
      console.warn('Backend next-id unavailable, using client unique generator:', err);
    }
    const fallback = generateClientUniqueTaskId();
    setNewFormData((prev) => ({ ...prev, task_id: fallback }));
    return fallback;
  };

  const handleOpenNewEnrollmentModal = (overrideCategory = null) => {
    const instantId = generateClientUniqueTaskId();
    const defaultUser = usersList.find((u) => u.profile?.role !== 'admin') || usersList[0];

    // Safely check if string category was passed; ignore event objects from onClick
    const validOverride = typeof overrideCategory === 'string' ? overrideCategory : null;
    const currentCat = validOverride || category || activeCategory;
    const isPortal = currentCat === 'portal_creation';
    const targetCategory = isPortal ? 'portal_creation' : 'credentialing';

    setNewFormData({
      task_id: instantId,
      task_name: isPortal ? 'Portal Creation' : 'Provider Credentialing',
      category: targetCategory,
      project_name: 'Hari Kisan',
      custom_project: '',
      insurance_name: 'BCBS',
      creation_date: new Date().toISOString().split('T')[0],
      provider_name: '',
      provider_effective_date: '',
      group_ptan: '',
      individual_ptan: '',
      early_start_date: '',
      sub_plan: isPortal ? 'Clearinghouse Direct Web Portal' : 'Provider Credentialing Specialist Plan',
      assignee: defaultUser ? defaultUser.id : '',
      follow_up_type: 'portal',
      follow_up_value: '',
      status: 'Request',
      notes: '',
      attachment: null,
    });
    setIsCustomProject(false);
    setIsAddingInsurance(false);
    setNewInsuranceInput('');
    setModalError('');
    setModalSuccess('');
    setShowNewEnrollmentModal(true);

    // Synchronize with server next-id
    handleFetchAndSetUniqueTaskId();
  };


  const fetchEnrollments = async () => {
    try {
      setLoading(true);
      const params = {};
      if (category !== 'all') params.category = category;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();

      const data = await api.getTasks(params);
      setTasks(data);

      if (!newFormData.task_id) {
        const uniqueId = generateClientUniqueTaskId(data);
        setNewFormData((prev) => ({
          ...prev,
          task_id: uniqueId,
        }));
      }
    } catch (err) {
      console.error('Failed to fetch enrollments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnrollments();
  }, [category, statusFilter]);

  const handleExportExcel = () => {
    const list = tasks;
    const fileName = `US24_${category || 'All'}_Enrollments_${new Date().toISOString().slice(0, 10)}.xls`;
    
    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Enrollments</x:Name>
                <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
        <style>
          body { font-family: Arial, sans-serif; font-size: 10.5pt; }
          .title { font-size: 14pt; font-weight: bold; color: #0284c7; }
          .th { background-color: #0284c7; color: #ffffff; font-weight: bold; border: 1px solid #94a3b8; padding: 6px; }
          .td { border: 1px solid #cbd5e1; padding: 5px; vertical-align: top; }
        </style>
      </head>
      <body>
        <table>
          <tr><td colspan="10" class="title">US24 SOLUTIONS - ENROLLMENTS & OPERATIONS DIRECTORY</td></tr>
          <tr><td colspan="10">Category: ${(category || 'All').toUpperCase()} | Exported: ${formatDateTime(new Date())} | Total Records: ${list.length}</td></tr>
          <tr><td colspan="10"></td></tr>
          <tr>
            <th class="th">Task Code</th>
            <th class="th">Task Name</th>
            <th class="th">Project Name</th>
            <th class="th">Insurance / Payer</th>
            <th class="th">Provider Name</th>
            <th class="th">Early Start Date</th>
            <th class="th">Status</th>
            <th class="th">Assignee</th>
            <th class="th">MOC</th>
            <th class="th">Remarks</th>
          </tr>
          ${list.map((t) => `
            <tr>
              <td class="td" style="font-weight: bold;">${t.task_id || ''}</td>
              <td class="td">${t.task_name || ''}</td>
              <td class="td"><strong>${t.project_name || ''}</strong></td>
              <td class="td">${t.insurance_name || ''}</td>
              <td class="td">${t.provider_name || 'N/A'}</td>
              <td class="td">${formatDate(t.early_start_date, 'N/A')}</td>
              <td class="td">${t.status || ''}</td>
              <td class="td">${t.assignee_name || 'Unassigned'}</td>
              <td class="td">${t.follow_up_type || 'Portal'}: ${t.follow_up_value || ''}</td>
              <td class="td">${(t.notes || '').replace(/"/g, '')}</td>
            </tr>
          `).join('')}
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintTable = () => {
    printEnrollmentsReport(tasks, category, statusFilter, currentUser);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportMsg('');

    try {
      const res = await api.importExcel(file);
      setImportMsg(res.message || 'Import completed successfully!');
      fetchEnrollments();
    } catch (err) {
      setImportMsg(err.response?.data?.detail || 'Import failed. Please check spreadsheet formatting.');
    } finally {
      setImporting(false);
    }
  };

  const handleAddInsuranceOption = (e) => {
    e.preventDefault();
    const trimmed = newInsuranceInput.trim();
    if (trimmed) {
      if (!insuranceOptions.includes(trimmed)) {
        setInsuranceOptions((prev) => [...prev, trimmed]);
      }
      setNewFormData((prev) => ({ ...prev, insurance_name: trimmed }));
      setNewInsuranceInput('');
      setIsAddingInsurance(false);
    }
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    setModalError('');
    setModalSuccess('');
    setModalSubmitting(true);

    try {
      const finalProjectName = isCustomProject ? newFormData.custom_project.trim() : newFormData.project_name;
      if (!finalProjectName) {
        setModalError('Please specify a valid project name.');
        setModalSubmitting(false);
        return;
      }

      const isPortal = newFormData.category === 'portal_creation';
      const payload = {
        ...newFormData,
        project_name: finalProjectName,
        task_name: isPortal ? 'Portal Creation' : newFormData.task_name || 'Provider Credentialing',
        sub_plan: isPortal ? 'Clearinghouse Direct Web Portal' : newFormData.sub_plan,
        assignee: newFormData.assignee ? parseInt(newFormData.assignee) : null,
        provider_effective_date: isPortal ? null : (newFormData.provider_effective_date || null),
        group_ptan: isPortal ? '' : (newFormData.group_ptan || ''),
        individual_ptan: isPortal ? '' : (newFormData.individual_ptan || ''),
        early_start_date: newFormData.early_start_date || null,
      };
      delete payload.custom_project;

      const created = await api.createTask(payload);
      setTasks((prev) => [created, ...prev]);

      const assignedUser = usersList.find((u) => u.id === parseInt(newFormData.assignee));
      const assigneeName = assignedUser ? (assignedUser.full_name || assignedUser.username) : 'Staff';

      setModalSuccess(`Task ${created.task_id} successfully created!`);

      if (autoMoveToAssignee && assignedUser && onSelectStaff) {
        setTimeout(() => {
          setShowNewEnrollmentModal(false);
          onSelectStaff(assignedUser);
        }, 700);
      } else {
        setTimeout(() => {
          setShowNewEnrollmentModal(false);
          setModalSuccess('');
        }, 1200);
      }
    } catch (err) {
      setModalError(err.response?.data?.detail || 'Failed to create enrollment task. Please verify required fields.');
    } finally {
      setModalSubmitting(false);
    }
  };

  const categoryMeta = {
    all: {
      title: 'All Enrollment Operations',
      icon: '📁',
      badge: 'All Categories',
      description: 'Master ledger of all provider credentialing, portal creations, and ERA/EFT remittance accounts',
    },
    credentialing: {
      title: 'Provider Credentialing Directory',
      icon: '🩺',
      badge: 'Credentialing',
      description: 'Physician, facility & clinic CAQH payer enrollments, NPI registrations, and hospital privileges',
    },
    portal_creation: {
      title: 'Portal Creation Directory',
      icon: '🌐',
      badge: 'Portal Creation',
      description: 'Clearinghouses & payer web portals (Availity, Optum, UnitedHealthcare, Medicare CMS, etc.)',
    },
    era_eft: {
      title: 'ERA / EFT Direct Pay Setup',
      icon: '💳',
      badge: 'ERA / EFT',
      description: '835 Electronic Remittance Advice and automated ACH electronic funds transfer enrollments',
    },
  };

  const currentMeta = categoryMeta[category] || categoryMeta.all;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Category Header */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-glass)',
          paddingBottom: '1.25rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(10, 36, 99, 0.25), rgba(2, 132, 199, 0.25))',
              border: '1px solid rgba(6, 72, 192, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.6rem',
            }}
          >
            {currentMeta.icon}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.35rem', fontFamily: 'var(--serif)', fontWeight: 400, color: 'var(--ink)', margin: 0 }}>
                {currentMeta.title}
              </h2>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '0.74rem',
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(6, 72, 192, 0.15)',
                  border: '1px solid rgba(6, 72, 192, 0.35)',
                  color: '#0648c0',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {currentMeta.badge}
              </span>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                ({tasks.length} {tasks.length === 1 ? 'record' : 'records'})
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              {currentMeta.description}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn-secondary"
            onClick={handlePrintTable}
            style={{ padding: '8px 13px', fontSize: '0.84rem' }}
            title="Print printable summary of currently displayed tasks"
          >
            🖨️ Print
          </button>
          <button
            className="btn-secondary"
            onClick={handleExportExcel}
            style={{ padding: '8px 13px', fontSize: '0.84rem' }}
            title="Export filtered directory to Excel (.xls)"
          >
            📊 Export Excel
          </button>
          <button
            className="btn-secondary"
            onClick={() => setShowImportModal(true)}
            style={{ padding: '8px 13px', fontSize: '0.84rem' }}
            title="Upload Excel (.xlsx, .xls) or spreadsheet to bulk import tasks"
          >
            📤 Import Excel
          </button>
          {category === 'portal_creation' ? (
            <button
              className="btn-primary"
              onClick={() => handleOpenNewEnrollmentModal('portal_creation')}
              style={{ padding: '8px 16px', fontSize: '0.84rem', fontWeight: 700 }}
            >
              + New Portal Creation Task
            </button>
          ) : category === 'credentialing' ? (
            <button
              className="btn-primary"
              onClick={() => handleOpenNewEnrollmentModal('credentialing')}
              style={{ padding: '8px 16px', fontSize: '0.84rem', fontWeight: 700 }}
            >
              + New Credentialing Task
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn-primary"
                onClick={() => handleOpenNewEnrollmentModal('credentialing')}
                style={{ padding: '8px 14px', fontSize: '0.84rem', fontWeight: 700 }}
              >
                + New Credentialing Task
              </button>
              <button
                className="btn-secondary"
                onClick={() => handleOpenNewEnrollmentModal('portal_creation')}
                style={{ padding: '8px 14px', fontSize: '0.84rem', fontWeight: 600 }}
              >
                + New Portal Task
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div
        className="glass-panel"
        style={{
          padding: '1rem 1.5rem',
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
            style={{ padding: '8px 14px', fontSize: '0.88rem' }}
            placeholder="Search by Task ID, Clinic Name, Insurance Payer, Provider..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchEnrollments()}
          />
          <button className="btn-secondary" onClick={fetchEnrollments} style={{ padding: '8px 14px' }}>
            Search
          </button>
        </div>

        {/* Status Filter Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '0.82rem', color: 'var(--text-dim)', fontWeight: 600 }}>Status:</label>
          <select
            className="form-select"
            style={{ width: '160px', padding: '7px 12px', fontSize: '0.85rem' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="Request">Request</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="In Progress">In Progress</option>
            <option value="Panel closed">Panel closed</option>
          </select>
        </div>
      </div>

      {/* Directory Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading directory records...
          </div>
        ) : tasks.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No enrollment tasks match your query.
          </div>
        ) : (
          <div className="table-responsive us24-table-container">
            <table className="us24-table">
              <thead>
                <tr>
                  <th>Task ID</th>
                  <th>Category</th>
                  <th>Project Name</th>
                  <th>Provider / PTAN</th>
                  <th>Insurance Payer</th>
                  <th>Creation Date</th>
                  <th>Assignee</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: '#0648c0' }}>
                      {task.task_id}
                    </td>

                    <td>
                      <span className={`category-tag ${task.category || 'general'}`}>
                        {task.category === 'credentialing' ? 'Credentialing' : task.category === 'portal_creation' ? 'Portal' : 'ERA / EFT'}
                      </span>
                    </td>

                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{task.project_name}</div>
                    </td>

                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                        {task.provider_name || '—'}
                      </div>
                      {(task.group_ptan || task.individual_ptan) && (
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                          {task.group_ptan ? `G: ${task.group_ptan}` : ''} {task.individual_ptan ? `| P: ${task.individual_ptan}` : ''}
                        </div>
                      )}
                    </td>

                    <td style={{ color: '#0648c0', fontWeight: 500 }}>
                      {task.insurance_name}
                    </td>

                    <td style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>
                      {formatDate(task.creation_date)}
                    </td>

                    <td>
                      <span style={{ color: 'var(--ink)' }}>👤 {task.assignee_name || 'Unassigned'}</span>
                    </td>

                    <td>
                      <span className={`status-badge ${(task.status || 'request').toLowerCase().replace(/\s+/g, '-')}`}>
                        {task.status || 'Request'}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn-secondary"
                        style={{ padding: '5px 10px', fontSize: '0.78rem' }}
                        onClick={() => setSelectedTask(task)}
                      >
                        View Logs & Updates →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* NEW ENROLLMENT TASK MODAL (Structured Sections & Compact Space Management) */}
      {/* ========================================================================= */}
      {showNewEnrollmentModal && (
        <div className="modal-overlay" onClick={() => setShowNewEnrollmentModal(false)}>
          <div
            className="glass-panel"
            style={{
              maxWidth: '860px',
              width: '95%',
              padding: '1.5rem 1.75rem',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: 'var(--shadow-pop)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.85rem', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '0.70rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--brand-cyan-light)', fontWeight: 700 }}>
                  {newFormData.category === 'portal_creation' ? 'PAYER / CLEARINGHOUSE PORTAL SETUP' : 'PROVIDER CREDENTIALING ENROLLMENT'}
                </div>
                <h3 style={{ fontSize: '1.25rem', fontFamily: 'var(--serif)', fontWeight: 400, color: 'var(--ink)', margin: '2px 0 0 0' }}>
                  {newFormData.category === 'portal_creation' ? 'New Portal Creation Task' : 'New Credentialing Enrollment Task'}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowNewEnrollmentModal(false)}
              >
                ✕
              </button>
            </div>

            {modalSuccess && (
              <div className="modal-toast success" style={{ margin: '0 0 1rem 0' }}>
                ✓ {modalSuccess}
              </div>
            )}
            {modalError && (
              <div className="modal-toast error" style={{ margin: '0 0 1rem 0' }}>
                ✕ {modalError}
              </div>
            )}

            <form onSubmit={handleModalSubmit}>
              {/* Card 1: Task & Organization Metadata */}
              <div className="form-section-card">
                <div className="form-section-header">
                  <div className="form-section-title">
                    <span>📋 01 • Task & Payer Setup</span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.2fr', gap: '0.75rem', alignItems: 'flex-start' }}>
                  {/* Task ID */}
                  <div className="compact-form-group">
                    <label className="compact-form-label">
                      <span>Task ID</span>
                      <span style={{ fontSize: '0.68rem', color: '#0648c0', fontWeight: 600 }}>Auto Unique</span>
                    </label>
                    <input
                      type="text"
                      className="compact-form-input"
                      style={{ fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: '0.04em', color: '#0648c0' }}
                      placeholder="TSK-2026-XXX"
                      value={newFormData.task_id}
                      onChange={(e) => setNewFormData((p) => ({ ...p, task_id: e.target.value }))}
                      required
                    />
                  </div>

                  {/* Project Name */}
                  <div className="compact-form-group">
                    <label className="compact-form-label">
                      <span>Project Name</span>
                    </label>
                    <select
                      className="compact-form-select"
                      value={isCustomProject ? 'other' : newFormData.project_name}
                      onChange={(e) => {
                        if (e.target.value === 'other') {
                          setIsCustomProject(true);
                        } else {
                          setIsCustomProject(false);
                          setNewFormData((p) => ({ ...p, project_name: e.target.value }));
                        }
                      }}
                    >
                      {CREDENTIALING_PROJECTS.map((proj) => (
                        <option key={proj} value={proj}>{proj}</option>
                      ))}
                      <option value="other">+ Other / Custom Project...</option>
                    </select>
                    {isCustomProject && (
                      <input
                        type="text"
                        className="compact-form-input"
                        style={{ marginTop: '4px' }}
                        placeholder="Enter custom project..."
                        value={newFormData.custom_project}
                        onChange={(e) => setNewFormData((p) => ({ ...p, custom_project: e.target.value }))}
                        autoFocus
                        required
                      />
                    )}
                  </div>

                  {/* Insurance Name */}
                  <div className="compact-form-group">
                    <label className="compact-form-label">
                      <span>Insurance Name</span>
                      {!isAddingInsurance && (
                        <button
                          type="button"
                          onClick={() => setIsAddingInsurance(true)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#0648c0',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          + Add Payer
                        </button>
                      )}
                    </label>

                    {!isAddingInsurance ? (
                      <select
                        className="compact-form-select"
                        value={newFormData.insurance_name}
                        onChange={(e) => {
                          if (e.target.value === 'add+') {
                            setIsAddingInsurance(true);
                          } else {
                            setNewFormData((p) => ({ ...p, insurance_name: e.target.value }));
                          }
                        }}
                      >
                        {insuranceOptions.map((ins) => (
                          <option key={ins} value={ins}>{ins}</option>
                        ))}
                        <option value="add+">+ Add New Insurance (add+)</option>
                      </select>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="text"
                          className="compact-form-input"
                          placeholder="Payer name..."
                          value={newInsuranceInput}
                          onChange={(e) => setNewInsuranceInput(e.target.value)}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={handleAddInsuranceOption}
                          style={{ padding: '4px 8px', fontSize: '0.76rem', flexShrink: 0 }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setIsAddingInsurance(false)}
                          style={{ padding: '4px 6px', fontSize: '0.76rem', flexShrink: 0 }}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Card 2: Provider Identifiers & Timeline */}
              <div className="form-section-card">
                <div className="form-section-header">
                  <div className="form-section-title">
                    <span>
                      {newFormData.category === 'portal_creation' ? '🌐 02 • Provider & Portal Setup Details' : '🩺 02 • Provider Credentials & Identifiers'}
                    </span>
                  </div>
                </div>

                {newFormData.category === 'portal_creation' ? (
                  /* Portal Creation Provider & Date Grid */
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: '0.75rem' }}>
                    <div className="compact-form-group">
                      <label className="compact-form-label">Provider Name *</label>
                      <input
                        type="text"
                        className="compact-form-input"
                        placeholder="e.g. Dr. Rajiv Patel, MD"
                        value={newFormData.provider_name}
                        onChange={(e) => setNewFormData((p) => ({ ...p, provider_name: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="compact-form-group">
                      <label className="compact-form-label">Early Start Date</label>
                      <DateInput
                        className="compact-form-input"
                        value={newFormData.early_start_date}
                        onChange={(value) => setNewFormData((p) => ({ ...p, early_start_date: value }))}
                      />
                    </div>

                    <div className="compact-form-group">
                      <label className="compact-form-label">Created On (Date) *</label>
                      <DateInput
                        className="compact-form-input"
                        value={newFormData.creation_date}
                        onChange={(value) => setNewFormData((p) => ({ ...p, creation_date: value }))}
                        required
                      />
                    </div>
                  </div>
                ) : (
                  /* Credentialing Symmetrical 3x3 Provider Grid */
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.65rem' }}>
                      <div className="compact-form-group">
                        <label className="compact-form-label">Provider Name *</label>
                        <input
                          type="text"
                          className="compact-form-input"
                          placeholder="e.g. Dr. Rajiv Patel, MD"
                          value={newFormData.provider_name}
                          onChange={(e) => setNewFormData((p) => ({ ...p, provider_name: e.target.value }))}
                          required
                        />
                      </div>

                      <div className="compact-form-group">
                        <label className="compact-form-label">Provider Effect Date</label>
                        <DateInput
                          className="compact-form-input"
                          value={newFormData.provider_effective_date}
                          onChange={(value) => setNewFormData((p) => ({ ...p, provider_effective_date: value }))}
                        />
                      </div>

                      <div className="compact-form-group">
                        <label className="compact-form-label">Early Start Date</label>
                        <DateInput
                          className="compact-form-input"
                          value={newFormData.early_start_date}
                          onChange={(value) => setNewFormData((p) => ({ ...p, early_start_date: value }))}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: '0.75rem' }}>
                      <div className="compact-form-group">
                        <label className="compact-form-label">G-PTAN ID (Group)</label>
                        <input
                          type="text"
                          className="compact-form-input"
                          placeholder="e.g. GPTAN-88210"
                          value={newFormData.group_ptan}
                          onChange={(e) => setNewFormData((p) => ({ ...p, group_ptan: e.target.value }))}
                        />
                      </div>

                      <div className="compact-form-group">
                        <label className="compact-form-label">P-PTAN ID (Individual)</label>
                        <input
                          type="text"
                          className="compact-form-input"
                          placeholder="e.g. PPTAN-99432"
                          value={newFormData.individual_ptan}
                          onChange={(e) => setNewFormData((p) => ({ ...p, individual_ptan: e.target.value }))}
                        />
                      </div>

                      <div className="compact-form-group">
                        <label className="compact-form-label">Created On (Date) *</label>
                        <DateInput
                          className="compact-form-input"
                          value={newFormData.creation_date}
                          onChange={(value) => setNewFormData((p) => ({ ...p, creation_date: value }))}
                          required
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Card 3: Execution, Assignment & Mode of Communication */}
              <div className="form-section-card">
                <div className="form-section-header">
                  <div className="form-section-title">
                    <span>👥 03 • Assignment & Communication Channel</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '0.75rem', marginBottom: '0.65rem' }}>
                  <div className="compact-form-group">
                    <label className="compact-form-label">Status</label>
                    <select
                      className="compact-form-select"
                      value={newFormData.status}
                      onChange={(e) => setNewFormData((p) => ({ ...p, status: e.target.value }))}
                    >
                      <option value="Request">Request</option>
                      <option value="Pending">Pending</option>
                      {/* Portal creation is approved later through Add Update, where the portal details are required */}
                      {newFormData.category !== 'portal_creation' && <option value="Approved">Approved</option>}
                      <option value="In Progress">In Progress</option>
                      <option value="Panel closed">Panel closed</option>
                    </select>
                  </div>

                  <div className="compact-form-group">
                    <div className="compact-form-label">
                      <span>Assigned To *</span>
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          cursor: 'pointer',
                          fontSize: '0.70rem',
                          color: '#0648c0',
                          fontWeight: 500,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={autoMoveToAssignee}
                          onChange={(e) => setAutoMoveToAssignee(e.target.checked)}
                        />
                        <span>Auto-open staff queue</span>
                      </label>
                    </div>
                    <select
                      className="compact-form-select"
                      value={newFormData.assignee}
                      onChange={(e) => setNewFormData((p) => ({ ...p, assignee: e.target.value }))}
                      required
                    >
                      <option value="">Select Assignee...</option>
                      {usersList.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.profile?.employee_id || u.username})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* MOC (Mode of Communication) - Single Line Segmented Control */}
                <div className="compact-form-group">
                  <div className="compact-form-label">
                    <span>Mode of Communication (MOC)</span>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.68rem' }}>Select method & enter contact info</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-glass)', flexShrink: 0 }}>
                      {[
                        { id: 'portal', label: '🌐 Portal' },
                        { id: 'call', label: '📞 Call' },
                        { id: 'email', label: '✉️ Email' },
                      ].map((moc) => {
                        const isSelected = newFormData.follow_up_type === moc.id;
                        return (
                          <button
                            key={moc.id}
                            type="button"
                            onClick={() => setNewFormData((p) => ({ ...p, follow_up_type: moc.id }))}
                            style={{
                              padding: '6px 11px',
                              border: 'none',
                              borderRight: '1px solid var(--border-glass)',
                              background: isSelected ? 'rgba(2, 132, 199, 0.25)' : 'rgba(11, 13, 16, 0.03)',
                              color: isSelected ? '#0648c0' : 'var(--text-muted)',
                              cursor: 'pointer',
                              fontWeight: isSelected ? 700 : 500,
                              fontSize: '0.78rem',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {moc.label}
                          </button>
                        );
                      })}
                    </div>

                    <input
                      type="text"
                      className="compact-form-input"
                      style={{ flex: 1 }}
                      placeholder={
                        newFormData.follow_up_type === 'portal'
                          ? 'Portal URL or login address (e.g. https://availity.com)'
                          : newFormData.follow_up_type === 'call'
                          ? 'Payer contact phone number (e.g. +1 800-555-0199)'
                          : 'Payer contact email address'
                      }
                      value={newFormData.follow_up_value}
                      onChange={(e) => setNewFormData((p) => ({ ...p, follow_up_value: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Card 4: Remarks & Screenshot Attachment */}
              <div className="form-section-card" style={{ marginBottom: '1rem' }}>
                <ImagePasteRemarks
                  label="Remarks / Special Notes"
                  placeholder={
                    newFormData.category === 'portal_creation'
                      ? 'Enter portal login URLs, clearinghouse credentials, or press Ctrl+V to paste screenshot...'
                      : 'Enter credentialing notes, physician state license IDs, or press Ctrl+V to paste screenshot...'
                  }
                  value={newFormData.notes}
                  onChange={(val) => setNewFormData((p) => ({ ...p, notes: val }))}
                  image={newFormData.attachment}
                  onImageChange={(img) => setNewFormData((p) => ({ ...p, attachment: img }))}
                  rows={2}
                  className="compact-form-input"
                />
              </div>

              {/* Submit / Cancel Footer Action Bar */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '0.5rem', borderTop: '1px solid rgba(11, 13, 16, 0.08)' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowNewEnrollmentModal(false)}
                  style={{ padding: '7px 16px', fontSize: '0.84rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={modalSubmitting}
                  style={{ minWidth: '170px', justifyContent: 'center', padding: '7px 18px', fontSize: '0.84rem' }}
                >
                  {modalSubmitting
                    ? 'Saving Task...'
                    : newFormData.category === 'portal_creation'
                    ? '✓ Create Portal Task'
                    : '✓ Create Credentialing Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Excel Import Modal */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div
            className="glass-panel"
            style={{ maxWidth: '480px', width: '100%', padding: '2rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontFamily: 'var(--serif)', fontWeight: 400, color: 'var(--ink)' }}>
                📤 Import Enrollment Tasks (Excel)
              </h3>
              <button
                onClick={() => setShowImportModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Select a standard Microsoft Excel (.xlsx, .xls) or spreadsheet file to bulk import or update tasks.
            </p>

            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--border-glass-bright)',
                borderRadius: 'var(--radius-md)',
                padding: '2rem',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'rgba(11, 13, 16, 0.02)',
                marginBottom: '1rem',
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📊</div>
              <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '0.92rem' }}>
                Click to browse or drop Excel file here
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                Supports Microsoft Excel (.xlsx, .xls) and CSV spreadsheets
              </div>
            </div>

            {importing && (
              <div style={{ textAlign: 'center', color: '#0648c0', fontSize: '0.85rem', marginBottom: '10px' }}>
                Importing spreadsheet records into database...
              </div>
            )}

            {importMsg && (
              <div
                style={{
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                  background: importMsg.includes('success') ? 'rgba(22, 163, 74, 0.15)' : 'rgba(201, 25, 46, 0.15)',
                  color: importMsg.includes('success') ? '#15803d' : '#c9192e',
                  marginBottom: '1rem',
                }}
              >
                {importMsg}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowImportModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Logs Modal */}
      {selectedTask && (
        <TaskLogsModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onTaskUpdated={(updated) => {
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            setSelectedTask(updated);
          }}
        />
      )}
    </div>
  );
};

export default EnrollmentTab;

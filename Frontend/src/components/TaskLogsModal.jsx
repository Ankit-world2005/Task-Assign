import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ImagePasteRemarks, RemarksDisplay } from './ImagePasteRemarks';
import { splitRemarks } from '../utils/remarks';
import { addDays, isFollowUpOverdue, localDateString } from '../utils/followUp';
import { formatDate, formatDateTime, formatTime } from '../utils/dateFormat';
import DateInput from './DateInput';
import StatusBadge from './StatusBadge';

const MOC_OPTIONS = [
  { value: 'call', label: 'Call', icon: '📞' },
  { value: 'email', label: 'Email', icon: '✉️' },
  { value: 'fax', label: 'Fax', icon: '📠' },
];
const MOC_LOOKUP = Object.fromEntries(MOC_OPTIONS.map((m) => [m.value, m]));
const TAT_OPTIONS = ['15 min', '30 min', '45 min', '1 hr', '1.5 hr', '2 hr', '3 hr', '4 hr+'];
const UPDATE_STATUS_OPTIONS = ['Approved', 'In Process', 'Pending'];
const CATEGORY_LABELS = {
  credentialing: 'Credentialing',
  portal_creation: 'Portal Creation',
  era_eft: 'ERA/EFT',
  password_reset: 'Password Reset',
  portal_unblock: 'Portal Unblock',
  payment_posting: 'Payment Posting',
  general: 'General',
};

// Portal details start from the task's saved values so re-approving doesn't mean retyping them
const emptyUpdateForm = (task, presetStatus = '') => ({
  moc: '',
  tat: '',
  status: presetStatus || (UPDATE_STATUS_OPTIONS.includes(task?.status) ? task.status : ''),
  workDate: localDateString(),
  followUpDays: '',
  portalLink: task?.portal_link || '',
  portalUserId: task?.portal_user_id || '',
  portalPassword: task?.portal_password || '',
});

// Masked value with Show/Hide and Copy, used for saved portal passwords
const SecretValue = ({ value }) => {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard is unavailable outside secure (HTTPS/localhost) pages; Show still works
    }
  };

  return (
    <span className="secret-value">
      <code>{revealed ? value : '••••••••'}</code>
      <button type="button" className="secret-btn" onClick={() => setRevealed((r) => !r)}>
        {revealed ? 'Hide' : 'Show'}
      </button>
      <button type="button" className="secret-btn" onClick={handleCopy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
};

// Only http(s) links are clickable (bare domains get https://), so javascript: and similar URLs never render as links
const PortalLink = ({ url }) => {
  let href = null;
  if (/^https?:\/\//i.test(url)) href = url;
  else if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(url)) href = `https://${url}`;

  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="portal-link">{url}</a>
  ) : (
    <span className="portal-cred-val">{url}</span>
  );
};

const PortalCredentials = ({ link, userId, password }) => (
  <div className="portal-cred-box">
    {link && (
      <div className="portal-cred-row">
        <span className="portal-cred-label">Portal Link</span>
        <PortalLink url={link} />
      </div>
    )}
    {userId && (
      <div className="portal-cred-row">
        <span className="portal-cred-label">User ID</span>
        <span className="portal-cred-val">{userId}</span>
      </div>
    )}
    {password && (
      <div className="portal-cred-row">
        <span className="portal-cred-label">Password</span>
        <SecretValue value={password} />
      </div>
    )}
  </div>
);

const NotProvided = () => <span className="readonly-empty">Not provided</span>;

const ReadonlyField = ({ label, wide = false, children }) => (
  <div className={`form-group-compact${wide ? ' span-2' : ''}`}>
    <span className="box-field-label">{label}</span>
    <div className="readonly-value">{children}</div>
  </div>
);

// Read-only page showing everything saved with one timeline entry; log history can't be edited
const LogDetailsView = ({ log, number, category, onBack }) => {
  const moc = MOC_LOOKUP[log.moc];
  const loggedAt = new Date(log.created_at);
  const isApprovedLog = log.new_status === 'Approved';
  // Portal fields are always listed for Approved portal creation / password reset updates, so missing details are visible
  const showLinkField = Boolean(log.portal_link) || (isApprovedLog && category === 'portal_creation');
  const showCredentialFields =
    Boolean(log.portal_user_id || log.portal_password) ||
    (isApprovedLog && ['portal_creation', 'password_reset'].includes(category));
  const followUpDue =
    log.work_date && log.follow_up_days != null && !isApprovedLog ? addDays(log.work_date, log.follow_up_days) : null;

  return (
    <div className="update-page custom-scrollbar">
      <div className="update-page-card log-details-card">
        <div className="update-page-header">
          <div>
            <button type="button" className="btn-back-to-dash" onClick={onBack}>
              <span>←</span>
              <span>Back to Logs</span>
            </button>
            <div className="update-page-title">🧾 Update #{number}</div>
            <div className="update-page-sub">
              {CATEGORY_LABELS[category] || 'General'} • Logged by <strong>{log.updated_by_name || 'Staff Member'}</strong> on{' '}
              {formatDate(loggedAt)} at {formatTime(loggedAt)}
            </div>
          </div>
          <span className="readonly-pill">🔒 Read-only</span>
        </div>

        <div className="update-form-grid">
          <ReadonlyField label="Status">
            <div className="history-status-row">
              {log.previous_status && (
                <>
                  <span className="status-chip prev">{log.previous_status}</span>
                  <span className="status-chip-arrow">→</span>
                </>
              )}
              <StatusBadge status={log.new_status} />
            </div>
          </ReadonlyField>
          <ReadonlyField label="Reassigned To">{log.reassigned_to_name || <NotProvided />}</ReadonlyField>

          <ReadonlyField label="MOC">{moc ? `${moc.icon} ${moc.label}` : log.moc || <NotProvided />}</ReadonlyField>
          <ReadonlyField label="TAT (Time)">{log.tat || <NotProvided />}</ReadonlyField>

          <ReadonlyField label="Work Date">{formatDate(log.work_date) || <NotProvided />}</ReadonlyField>
          <ReadonlyField label="MOC F/W">
            {log.follow_up_days != null ? (
              `${log.follow_up_days} ${log.follow_up_days === 1 ? 'day' : 'days'}${followUpDue ? ` • follow-up by ${formatDate(followUpDue)}` : ''}`
            ) : (
              <NotProvided />
            )}
          </ReadonlyField>

          {(showLinkField || showCredentialFields) && (
            <div className="update-portal-section">
              <div className="update-portal-section-title">🔐 Portal Details</div>
              {showLinkField && (
                <ReadonlyField label="Portal Link" wide>
                  {log.portal_link ? <PortalLink url={log.portal_link} /> : <NotProvided />}
                </ReadonlyField>
              )}
              {showCredentialFields && (
                <>
                  <ReadonlyField label="User ID">{log.portal_user_id || <NotProvided />}</ReadonlyField>
                  <ReadonlyField label="Password">
                    {log.portal_password ? <SecretValue value={log.portal_password} /> : <NotProvided />}
                  </ReadonlyField>
                </>
              )}
            </div>
          )}

          <ReadonlyField label="Remarks (Text / Image)" wide>
            {log.remarks || log.attachment ? (
              <RemarksDisplay remarks={log.remarks} attachment={log.attachment} />
            ) : (
              <NotProvided />
            )}
          </ReadonlyField>
        </div>
      </div>
    </div>
  );
};

// openOnUpdate / presetStatus open the Update page directly, e.g. when approving needs portal details
export const TaskLogsModal = ({ task, onClose, onTaskUpdated, openOnUpdate = false, presetStatus = '' }) => {
  const { usersList, currentUser } = useAuth();

  const [currentTask, setCurrentTask] = useState(task);
  const [logsList, setLogsList] = useState(task?.logs || []);
  const [updateForm, setUpdateForm] = useState(() => emptyUpdateForm(task, presetStatus));
  const [remarks, setRemarks] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [reassignTo, setReassignTo] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  // Page shown in the log window: 'logs', 'update' (Add Update form) or 'log-details' (read-only timeline entry)
  const [view, setView] = useState(openOnUpdate ? 'update' : 'logs');
  const [selectedLog, setSelectedLog] = useState(null);

  // Keep internal state synchronized whenever the task prop updates
  useEffect(() => {
    if (task) {
      setCurrentTask(task);
      setLogsList(task.logs || []);
    }
  }, [task]);

  if (!currentTask) return null;

  const isAdminUser = currentUser?.profile?.role === 'admin';
  const setField = (name, value) => setUpdateForm((prev) => ({ ...prev, [name]: value }));

  // Portal fields appear automatically once Approved is chosen for the matching task types
  const isApprovedUpdate = updateForm.status === 'Approved';
  const showPortalLink = isApprovedUpdate && currentTask.category === 'portal_creation';
  const showCredentials = isApprovedUpdate && ['portal_creation', 'password_reset'].includes(currentTask.category);
  const followUpDue =
    updateForm.workDate && updateForm.followUpDays !== '' && !isApprovedUpdate
      ? addDays(updateForm.workDate, Number(updateForm.followUpDays))
      : null;

  const openUpdatePage = () => {
    setError('');
    setSuccessMsg('');
    setView('update');
  };

  // number counts from the oldest entry (logsList is newest first)
  const openLogDetails = (log, number) => {
    setError('');
    setSuccessMsg('');
    setSelectedLog({ log, number });
    setView('log-details');
  };

  const backToLogs = () => setView('logs');

  const handleSubmitLog = async (e) => {
    e.preventDefault();
    // F/W days don't apply once Approved
    const days = isApprovedUpdate ? '' : updateForm.followUpDays;

    if (!updateForm.status) {
      setError('Please select a status for this update.');
      return;
    }
    if (!updateForm.workDate) {
      setError('Please select the work date.');
      return;
    }
    if (days !== '' && (!Number.isInteger(Number(days)) || Number(days) < 0 || Number(days) > 365)) {
      setError('MOC F/W must be a whole number of days between 0 and 365.');
      return;
    }
    if (showPortalLink && !updateForm.portalLink.trim()) {
      setError('Please enter the Portal Link for this approved portal creation.');
      return;
    }
    if (showCredentials && (!updateForm.portalUserId.trim() || !updateForm.portalPassword)) {
      setError('Please enter the portal User ID and Password for this approved task.');
      return;
    }
    if (!remarks.trim() && !attachment) {
      setError('Please add remarks or attach an image for this update.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccessMsg('');

    try {
      const payload = {
        status: updateForm.status,
        moc: updateForm.moc,
        tat: updateForm.tat,
        work_date: updateForm.workDate,
        follow_up_days: days === '' ? null : Number(days),
        portal_link: showPortalLink ? updateForm.portalLink.trim() : '',
        portal_user_id: showCredentials ? updateForm.portalUserId.trim() : '',
        portal_password: showCredentials ? updateForm.portalPassword : '',
        remarks: remarks.trim(),
        attachment: attachment || '',
        reassigned_to: isAdminUser && reassignTo ? parseInt(reassignTo, 10) : null,
        updated_by: currentUser?.id || null,
      };

      const res = await api.addTaskLog(currentTask.id, payload);

      if (res && res.success) {
        setSuccessMsg('Update and audit log recorded successfully.');
        setRemarks('');
        setAttachment(null);
        setReassignTo('');
        setShowPassword(false);
        setView('logs');

        if (res.task) {
          setCurrentTask(res.task);
          setLogsList(res.task.logs || []);
          setUpdateForm(emptyUpdateForm(res.task));
          if (onTaskUpdated) onTaskUpdated(res.task);
        } else if (res.log) {
          setLogsList((prev) => [res.log, ...prev]);
          const updatedTaskObj = { ...currentTask, status: res.log.new_status || updateForm.status };
          setCurrentTask(updatedTaskObj);
          setUpdateForm(emptyUpdateForm(updatedTaskObj));
          if (onTaskUpdated) onTaskUpdated(updatedTaskObj);
        }

        setTimeout(() => setSuccessMsg(''), 3500);
      } else {
        setError(res?.detail || 'Failed to submit update.');
      }
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        err.message ||
        'Failed to submit update. Please check network connection.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // =========================================================================
  // EXPORT TO EXCEL (.xls with styled native XML table)
  // =========================================================================
  const handleExportExcel = () => {
    const fileName = `${currentTask.task_id || 'Task'}_${(currentTask.project_name || 'Details').replace(/\s+/g, '_')}_Audit.xls`;
    
    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Task Summary & Audit</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
        <style>
          body { font-family: Arial, sans-serif; font-size: 11pt; }
          .title-header { font-size: 16pt; font-weight: bold; color: #0369a1; }
          .sub-header { font-size: 10pt; color: #64748b; }
          .section-title { font-size: 12pt; font-weight: bold; background-color: #0284c7; color: #ffffff; padding: 6px; }
          .table-header { background-color: #e0f2fe; color: #0369a1; font-weight: bold; border: 1px solid #94a3b8; }
          .meta-label { font-weight: bold; background-color: #f1f5f9; width: 170px; border: 1px solid #cbd5e1; }
          .meta-value { border: 1px solid #cbd5e1; }
          .log-cell { border: 1px solid #cbd5e1; padding: 4px 6px; vertical-align: top; }
        </style>
      </head>
      <body>
        <table>
          <tr>
            <td colspan="6" class="title-header">US24 SOLUTIONS - TASK AUDIT & SPECIFICATION REPORT</td>
          </tr>
          <tr>
            <td colspan="6" class="sub-header">Exported: ${formatDateTime(new Date())} | User: ${currentUser?.full_name || 'Admin'} | Status: ${currentTask.status}</td>
          </tr>
          <tr><td colspan="6"></td></tr>

          <!-- SECTION 1: SPECIFICATIONS -->
          <tr>
            <td colspan="6" class="section-title">1. TASK SPECIFICATION & DETAILS</td>
          </tr>
          <tr>
            <td class="meta-label">Task Code ID:</td>
            <td class="meta-value">${currentTask.task_id || ''}</td>
            <td class="meta-label">Current Status:</td>
            <td class="meta-value">${currentTask.status || ''}</td>
            <td class="meta-label">Creation Date:</td>
            <td class="meta-value">${formatDate(currentTask.creation_date)}</td>
          </tr>
          <tr>
            <td class="meta-label">Task Name:</td>
            <td class="meta-value">${currentTask.task_name || ''}</td>
            <td class="meta-label">Project Name:</td>
            <td class="meta-value">${currentTask.project_name || ''}</td>
            <td class="meta-label">Insurance / Payer:</td>
            <td class="meta-value">${currentTask.insurance_name || ''}</td>
          </tr>
          <tr>
            <td class="meta-label">Category / Stream:</td>
            <td class="meta-value">${currentTask.category || ''}</td>
            <td class="meta-label">Sub-Plan:</td>
            <td class="meta-value">${currentTask.sub_plan || 'Standard Plan'}</td>
            <td class="meta-label">Current Assignee:</td>
            <td class="meta-value">${currentTask.assignee_name || 'Unassigned'}</td>
          </tr>
          <tr>
            <td class="meta-label">Provider Name:</td>
            <td class="meta-value">${currentTask.provider_name || 'N/A'}</td>
            <td class="meta-label">Early Start Date:</td>
            <td class="meta-value">${formatDate(currentTask.early_start_date, 'N/A')}</td>
            <td class="meta-label">Provider Effective Date:</td>
            <td class="meta-value">${formatDate(currentTask.provider_effective_date, 'N/A')}</td>
          </tr>
          <tr>
            <td class="meta-label">Group PTAN (G-PTAN):</td>
            <td class="meta-value">${currentTask.group_ptan || 'N/A'}</td>
            <td class="meta-label">Individual PTAN (P-PTAN):</td>
            <td class="meta-value">${currentTask.individual_ptan || 'N/A'}</td>
            <td class="meta-label">MOC Channel & Address:</td>
            <td class="meta-value">${currentTask.follow_up_type || 'Portal'}: ${currentTask.follow_up_value || 'N/A'}</td>
          </tr>
          <tr>
            <td class="meta-label">Initial Remarks:</td>
            <td colspan="5" class="meta-value">${currentTask.notes || 'None recorded'}</td>
          </tr>

          <tr><td colspan="6"></td></tr>

          <!-- SECTION 2: AUDIT TIMELINE -->
          <tr>
            <td colspan="6" class="section-title">2. AUDIT TIMELINE & UPDATE HISTORY (${logsList.length} Entries)</td>
          </tr>
          <tr>
            <th class="table-header" style="width: 50px;">Log #</th>
            <th class="table-header" style="width: 160px;">Timestamp</th>
            <th class="table-header" style="width: 140px;">Updated By</th>
            <th class="table-header" style="width: 120px;">Status</th>
            <th class="table-header" style="width: 130px;">Reassigned To</th>
            <th class="table-header" style="width: 320px;">Follow-up Remarks / Details</th>
          </tr>
          ${logsList.length === 0 ? `
            <tr>
              <td colspan="6" class="log-cell" style="text-align: center; color: #64748b; padding: 12px;">No historical updates recorded for this task.</td>
            </tr>
          ` : logsList.map((log, idx) => `
            <tr>
              <td class="log-cell" style="text-align: center; font-weight: bold;">${idx + 1}</td>
              <td class="log-cell">${formatDateTime(log.created_at)}</td>
              <td class="log-cell">${log.updated_by_name || 'Staff Member'}</td>
              <td class="log-cell">${log.new_status || log.status || currentTask.status}</td>
              <td class="log-cell">${log.reassigned_to_name || '-'}</td>
              <td class="log-cell">${log.remarks || 'Status update logged.'}</td>
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-3box-container" onClick={(e) => e.stopPropagation()}>
        {/* Top Header Bar */}
        <div className="modal-3box-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span className="task-code-badge">
              {currentTask.task_id}
            </span>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontFamily: 'var(--serif)', fontWeight: 400, color: 'var(--ink)', lineHeight: 1.2 }}>
                {currentTask.task_name || currentTask.project_name}
              </h3>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {currentTask.project_name} • {currentTask.insurance_name}
              </div>
            </div>
            <StatusBadge status={currentTask.status} />
          </div>

          {/* Excel Export Action Button */}
          <div className="modal-topbar-export-actions">
            <button
              type="button"
              className="modal-action-pill excel-pill"
              onClick={handleExportExcel}
              title="Export complete details and audit timeline to Excel (.xls)"
            >
              📊 Export Excel
            </button>
          </div>

          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            title="Close log box"
          >
            ✕
          </button>
        </div>

        {/* Notification Toasts */}
        {successMsg && (
          <div className="modal-toast success">
            ✓ {successMsg}
          </div>
        )}
        {error && (
          <div className="modal-toast error">
            ✕ {error}
          </div>
        )}

        {view === 'update' ? (
          /* ========================================================= */
          /* UPDATE PAGE (opened from the footer Add Update button)     */
          /* ========================================================= */
          <form id="task-update-form" className="update-page custom-scrollbar" onSubmit={handleSubmitLog} noValidate>
            <div className="update-page-card">
              <div className="update-page-header">
                <div>
                  <button type="button" className="btn-back-to-dash" onClick={backToLogs}>
                    <span>←</span>
                    <span>Back to Logs</span>
                  </button>
                  <div className="update-page-title">📝 Update Task</div>
                  <div className="update-page-sub">
                    {CATEGORY_LABELS[currentTask.category] || 'General'} • Updating as{' '}
                    <strong>{currentUser?.full_name || 'Administrator'}</strong>
                  </div>
                </div>
                <StatusBadge status={currentTask.status}>
                  Current: {currentTask.status || 'Request'}
                </StatusBadge>
              </div>

              <div className="update-form-grid">
                {/* MOC & TAT */}
                <div className="form-group-compact">
                  <label className="box-field-label" htmlFor="upd-moc">MOC</label>
                  <select
                    id="upd-moc"
                    className="box-select"
                    value={updateForm.moc}
                    onChange={(e) => setField('moc', e.target.value)}
                  >
                    <option value="">Select MOC</option>
                    {MOC_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group-compact">
                  <label className="box-field-label" htmlFor="upd-tat">TAT (Time)</label>
                  <select
                    id="upd-tat"
                    className="box-select"
                    value={updateForm.tat}
                    onChange={(e) => setField('tat', e.target.value)}
                  >
                    <option value="">Select TAT</option>
                    {TAT_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Status & Work Date */}
                <div className="form-group-compact">
                  <label className="box-field-label" htmlFor="upd-status">
                    Status <span className="required-star">*</span>
                  </label>
                  <select
                    id="upd-status"
                    className="box-select"
                    value={updateForm.status}
                    onChange={(e) => setField('status', e.target.value)}
                  >
                    <option value="">Select status</option>
                    {UPDATE_STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group-compact">
                  <label className="box-field-label" htmlFor="upd-work-date">
                    Work Date <span className="required-star">*</span>
                  </label>
                  <DateInput
                    id="upd-work-date"
                    className="box-input"
                    value={updateForm.workDate}
                    onChange={(value) => setField('workDate', value)}
                  />
                </div>

                {/* Portal details shown automatically for Approved portal creation / password reset */}
                {showCredentials && (
                  <div className="update-portal-section">
                    <div className="update-portal-section-title">🔐 Portal Details (Approved)</div>

                    {showPortalLink && (
                      <div className="form-group-compact span-2">
                        <label className="box-field-label" htmlFor="upd-portal-link">
                          Portal Link <span className="required-star">*</span>
                        </label>
                        <input
                          id="upd-portal-link"
                          type="text"
                          className="box-input"
                          placeholder="https://payer-portal.example.com"
                          value={updateForm.portalLink}
                          onChange={(e) => setField('portalLink', e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                    )}

                    <div className="form-group-compact">
                      <label className="box-field-label" htmlFor="upd-portal-user">
                        User ID <span className="required-star">*</span>
                      </label>
                      <input
                        id="upd-portal-user"
                        type="text"
                        className="box-input"
                        value={updateForm.portalUserId}
                        onChange={(e) => setField('portalUserId', e.target.value)}
                        autoComplete="off"
                      />
                    </div>

                    <div className="form-group-compact">
                      <label className="box-field-label" htmlFor="upd-portal-password">
                        Password <span className="required-star">*</span>
                      </label>
                      <div className="input-with-action">
                        <input
                          id="upd-portal-password"
                          type={showPassword ? 'text' : 'password'}
                          className="box-input"
                          value={updateForm.portalPassword}
                          onChange={(e) => setField('portalPassword', e.target.value)}
                          autoComplete="new-password"
                        />
                        <button type="button" className="inline-toggle-btn" onClick={() => setShowPassword((s) => !s)}>
                          {showPassword ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* MOC F/W days */}
                <div className="form-group-compact">
                  <label className="box-field-label" htmlFor="upd-fw-days">MOC F/W (No. of Days)</label>
                  <input
                    id="upd-fw-days"
                    type="number"
                    min="0"
                    max="365"
                    step="1"
                    className="box-input"
                    placeholder="e.g. 3"
                    value={updateForm.followUpDays}
                    onChange={(e) => setField('followUpDays', e.target.value)}
                    disabled={isApprovedUpdate}
                  />
                  <span className="field-hint">
                    {isApprovedUpdate
                      ? 'Not needed once the task is Approved.'
                      : followUpDue
                        ? `Moves to the Follow-Up card if not approved by ${formatDate(followUpDue)}.`
                        : 'If these days pass without approval, the task moves to the Follow-Up card.'}
                  </span>
                </div>

                {/* Reassign To (Optional, Admin Only) */}
                {isAdminUser && (
                  <div className="form-group-compact">
                    <label className="box-field-label" htmlFor="upd-reassign">Reassign To (Optional)</label>
                    <select
                      id="upd-reassign"
                      className="box-select"
                      value={reassignTo}
                      onChange={(e) => setReassignTo(e.target.value)}
                    >
                      <option value="">Keep current assignee ({currentTask.assignee_name || 'Unassigned'})</option>
                      {usersList.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.profile?.employee_id || u.username})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Remarks: text and/or image */}
                <div className="form-group-compact span-2">
                  <ImagePasteRemarks
                    label="Remarks"
                    required
                    value={remarks}
                    onChange={setRemarks}
                    image={attachment}
                    onImageChange={setAttachment}
                    placeholder="Record outcome, paste screenshot (Ctrl+V), or attach an image..."
                    rows={4}
                    className="box-textarea"
                  />
                </div>
              </div>
            </div>
          </form>
        ) : view === 'log-details' && selectedLog ? (
          <LogDetailsView
            log={selectedLog.log}
            number={selectedLog.number}
            category={currentTask.category}
            onBack={backToLogs}
          />
        ) : (
        <div className="modal-3box-grid">
          {/* ========================================================= */}
          {/* BOX 1: TASK SPECIFICATION */}
          {/* ========================================================= */}
          <div className="modal-box-card spec-box">
            <div className="modal-box-header">
              <div className="box-header-title">
                <span className="box-number-badge">1</span>
                <span>Task Specification</span>
              </div>
              <span className="box-header-tag">Overview</span>
            </div>

            <div className="spec-content custom-scrollbar">
              {/* Project & Insurance Primary Spec Card */}
              <div className="spec-highlight-card">
                <div className="spec-2col-grid">
                  <div className="spec-field">
                    <div className="spec-label">Project Name</div>
                    <div className="spec-value highlight">{currentTask.project_name}</div>
                  </div>
                  <div className="spec-field">
                    <div className="spec-label">Insurance / Payer</div>
                    <div className="spec-value cyan" style={{ fontWeight: 700 }}>{currentTask.insurance_name}</div>
                  </div>
                </div>
              </div>

              {/* Provider & Schedule 2-Col Grid */}
              <div className="spec-2col-grid">
                {currentTask.provider_name && (
                  <div className="spec-field">
                    <div className="spec-label">Provider Name</div>
                    <div className="spec-value cyan">{currentTask.provider_name}</div>
                  </div>
                )}

                {currentTask.early_start_date && (
                  <div className="spec-field">
                    <div className="spec-label">Early Start Date</div>
                    <div className="spec-value">{formatDate(currentTask.early_start_date)}</div>
                  </div>
                )}
              </div>

              {/* Provider Effective Date & PTANs if present */}
              {(currentTask.provider_effective_date || currentTask.group_ptan || currentTask.individual_ptan) && (
                <div className="spec-2col-grid">
                  {currentTask.provider_effective_date && (
                    <div className="spec-field">
                      <div className="spec-label">Provider Effect Date</div>
                      <div className="spec-value">{formatDate(currentTask.provider_effective_date)}</div>
                    </div>
                  )}

                  {(currentTask.group_ptan || currentTask.individual_ptan) && (
                    <div className="spec-field">
                      <div className="spec-label">PTAN Identifiers</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {currentTask.group_ptan && (
                          <span className="channel-pill" style={{ background: 'rgba(6, 72, 192, 0.15)', color: '#0648c0' }}>
                            G: {currentTask.group_ptan}
                          </span>
                        )}
                        {currentTask.individual_ptan && (
                          <span className="channel-pill" style={{ background: 'rgba(22, 163, 74, 0.15)', color: '#15803d' }}>
                            P: {currentTask.individual_ptan}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Category & Sub-Plan 2-Col Grid */}
              <div className="spec-2col-grid">
                <div className="spec-field">
                  <div className="spec-label">Category / Stream</div>
                  <div className="spec-value" style={{ fontSize: '0.80rem' }}>
                    {currentTask.category === 'credentialing' && 'Provider Credentialing'}
                    {currentTask.category === 'portal_creation' && 'Portal Creation & Setup'}
                    {currentTask.category === 'era_eft' && 'ERA / EFT Direct Pay'}
                    {(!['credentialing', 'portal_creation', 'era_eft'].includes(currentTask.category)) && (currentTask.category || 'General Task')}
                  </div>
                </div>

                <div className="spec-field">
                  <div className="spec-label">Sub-Plan</div>
                  <div className="spec-value" style={{ fontSize: '0.80rem' }}>{currentTask.sub_plan || 'Standard Plan'}</div>
                </div>
              </div>

              {/* Assignee & Creation Date 2-Col Grid */}
              <div className="spec-2col-grid">
                <div className="spec-field">
                  <div className="spec-label">Current Assignee</div>
                  <div className="spec-value staff">
                    <div className="spec-avatar">
                      {currentTask.assignee_name ? currentTask.assignee_name[0] : 'U'}
                    </div>
                    <span>{currentTask.assignee_name || 'Unassigned'}</span>
                  </div>
                </div>

                <div className="spec-field">
                  <div className="spec-label">Creation Date</div>
                  <div className="spec-value" style={{ fontSize: '0.80rem' }}>
                    {formatDate(currentTask.creation_date)}
                  </div>
                </div>
              </div>

              {/* MOC (Mode of Communication) */}
              <div className="spec-field">
                <div className="spec-label">MOC (Mode of Communication)</div>
                <div className="spec-value follow-up">
                  <span className="channel-pill">{currentTask.follow_up_type || 'Portal'}</span>
                  <span className="channel-detail" style={{ fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '210px' }}>
                    {currentTask.follow_up_value || 'None provided'}
                  </span>
                </div>
              </div>

              {/* Latest Work Date & Follow-Up schedule */}
              {(currentTask.work_date || currentTask.follow_up_due_date) && (
                <div className="spec-2col-grid">
                  {currentTask.work_date && (
                    <div className="spec-field">
                      <div className="spec-label">Last Work Date</div>
                      <div className="spec-value" style={{ fontSize: '0.80rem' }}>{formatDate(currentTask.work_date)}</div>
                    </div>
                  )}
                  {currentTask.follow_up_due_date && (
                    <div className="spec-field">
                      <div className="spec-label">Next Follow-Up</div>
                      <div className="spec-value" style={{ fontSize: '0.80rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span>{formatDate(currentTask.follow_up_due_date)}</span>
                        {isFollowUpOverdue(currentTask) && <span className="overdue-pill">Overdue</span>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Saved Portal Credentials */}
              {(currentTask.portal_link || currentTask.portal_user_id || currentTask.portal_password) && (
                <div className="spec-field">
                  <div className="spec-label">Portal Credentials</div>
                  <PortalCredentials
                    link={currentTask.portal_link}
                    userId={currentTask.portal_user_id}
                    password={currentTask.portal_password}
                  />
                </div>
              )}

              {/* Initial Remarks / Attachment */}
              {(currentTask.notes || currentTask.attachment) && (
                <div className="spec-field" style={{ marginTop: '2px' }}>
                  <div className="spec-label">Initial Remarks / Attachment</div>
                  <div className="spec-notes-box">
                    <RemarksDisplay remarks={currentTask.notes} attachment={currentTask.attachment} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ========================================================= */}
          {/* BOX 2: AUDIT TIMELINE & HISTORY */}
          {/* ========================================================= */}
          <div className="modal-box-card timeline-box">
            <div className="modal-box-header">
              <div className="box-header-title">
                <span className="box-number-badge">2</span>
                <span>Audit Timeline & History</span>
              </div>
              <span className="box-header-tag">{logsList.length} updates • 🔒 Read-only</span>
            </div>

            <div className="timeline-content custom-scrollbar">
              {logsList.length === 0 ? (
                <div className="timeline-empty-state">
                  No previous audit updates recorded for this task.
                </div>
              ) : (
                logsList.map((log, idx) => {
                  const logNumber = logsList.length - idx;
                  const { text: remarksText, image: remarksImage } = splitRemarks(log.remarks, log.attachment);
                  const hasPortalDetails = Boolean(log.portal_link || log.portal_user_id || log.portal_password);

                  return (
                  <div key={log.id || idx} className="history-item">
                    <div className="history-node" />

                    {/* Summary card: tap to open everything saved with this update (read-only) */}
                    <div
                      className="history-card clickable"
                      role="button"
                      tabIndex={0}
                      onClick={() => openLogDetails(log, logNumber)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openLogDetails(log, logNumber);
                        }
                      }}
                      title="Tap to view the full update"
                    >
                      <div className="history-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="history-user-badge">
                            {log.updated_by_name ? log.updated_by_name[0] : 'U'}
                          </span>
                          <span className="history-user-name">
                            {log.updated_by_name || 'Staff Member'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="history-timestamp">
                            {formatDate(log.created_at)} at {formatTime(log.created_at)}
                          </span>
                          <span className="history-open-hint">View full update ›</span>
                        </div>
                      </div>

                      {/* Status Transition & Reassignment */}
                      <div className="history-status-row">
                        {log.previous_status && (
                          <>
                            <span className="status-chip prev">{log.previous_status}</span>
                            <span className="status-chip-arrow">→</span>
                          </>
                        )}
                        <StatusBadge status={log.new_status} />

                        {log.reassigned_to_name && (
                          <span className="reassign-pill">
                            Reassigned to {log.reassigned_to_name}
                          </span>
                        )}
                      </div>

                      {/* MOC, TAT, Work Date, Follow-Up days & saved portal details */}
                      {(log.moc || log.tat || log.work_date || log.follow_up_days != null || hasPortalDetails) && (
                        <div className="log-meta-row">
                          {log.moc && (
                            <span className="log-meta-pill">
                              {MOC_LOOKUP[log.moc]?.icon} {MOC_LOOKUP[log.moc]?.label || log.moc}
                            </span>
                          )}
                          {log.tat && <span className="log-meta-pill">⏱ TAT {log.tat}</span>}
                          {log.work_date && <span className="log-meta-pill">📅 Work {formatDate(log.work_date)}</span>}
                          {log.follow_up_days != null && (
                            <span className="log-meta-pill">↻ F/W {log.follow_up_days} {log.follow_up_days === 1 ? 'day' : 'days'}</span>
                          )}
                          {hasPortalDetails && <span className="log-meta-pill">🔐 Portal details</span>}
                        </div>
                      )}

                      {/* Remarks preview (full text and image open with the card) */}
                      {(remarksText || remarksImage) && (
                        <div className="history-remarks-box">
                          {remarksText && <div className="history-remarks-text">{remarksText}</div>}
                          {remarksImage && <span className="log-meta-pill history-image-pill">📷 Image attached</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
        )}

        {/* Footer Action Bar: Add Update on the logs view, Submit on the update page, Back on log details */}
        <div className="modal-3box-footer">
          {view === 'log-details' ? (
            <>
              <span className="modal-3box-footer-hint">🔒 Log history is read-only and can't be edited</span>
              <button
                type="button"
                className="btn-secondary"
                onClick={backToLogs}
                style={{ padding: '8px 18px', fontSize: '0.84rem' }}
              >
                ← Back to Logs
              </button>
            </>
          ) : view === 'update' ? (
            <>
              <span className="modal-3box-footer-hint">
                Fields marked <span className="required-star">*</span> are required • Remarks accept text or an image
              </span>
              <button
                type="submit"
                form="task-update-form"
                className="btn-primary"
                disabled={submitting}
                style={{ padding: '8px 18px', fontSize: '0.84rem' }}
              >
                {submitting ? 'Recording Update...' : '✓ Submit Update'}
              </button>
            </>
          ) : (
            <>
              <span className="modal-3box-footer-hint">
                {logsList.length} {logsList.length === 1 ? 'update' : 'updates'} logged • Current status: {currentTask.status || 'Request'}
              </span>
              <button
                type="button"
                className="btn-primary"
                onClick={openUpdatePage}
                style={{ padding: '8px 18px', fontSize: '0.84rem' }}
              >
                📝 Add Update
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskLogsModal;

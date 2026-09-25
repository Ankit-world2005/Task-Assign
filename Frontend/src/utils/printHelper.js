/**
 * US24 Solutions - Universal Bulletproof Print Helper
 * 
 * Provides reliable, pop-up-blocker-proof printing using dynamic hidden iframes,
 * with fallbacks and high-resolution, print-optimized layouts.
 */

import { formatDate, formatDateTime, formatTime } from './dateFormat';

/**
 * Core print engine: creates a hidden iframe, writes HTML content,
 * waits for rendering and media loading, and invokes the print dialog.
 */
export const printHtml = (htmlContent, documentTitle = 'US24 Document') => {
  return new Promise((resolve) => {
    try {
      // Remove any leftover print iframe
      const oldFrame = document.getElementById('us24-print-frame');
      if (oldFrame) {
        oldFrame.remove();
      }

      // Create hidden iframe
      const iframe = document.createElement('iframe');
      iframe.id = 'us24-print-frame';
      iframe.name = 'us24-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      iframe.setAttribute('aria-hidden', 'true');

      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow.document;
      frameDoc.open();
      frameDoc.write(htmlContent);
      frameDoc.close();

      const executePrint = () => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          // Clean up iframe after printing dialog closes
          setTimeout(() => {
            if (iframe && iframe.parentNode) {
              iframe.parentNode.removeChild(iframe);
            }
            resolve(true);
          }, 1500);
        } catch (err) {
          console.warn('Iframe print trigger failed, using fallback:', err);
          fallbackWindowPrint(htmlContent, documentTitle);
          resolve(false);
        }
      };

      // Check if images or assets need to finish loading
      const images = frameDoc.querySelectorAll('img');
      if (images.length > 0) {
        let loaded = 0;
        const total = images.length;
        const checkDone = () => {
          loaded++;
          if (loaded >= total) {
            setTimeout(executePrint, 150);
          }
        };
        images.forEach((img) => {
          if (img.complete) {
            checkDone();
          } else {
            img.onload = checkDone;
            img.onerror = checkDone;
          }
        });
        // Safety timeout in case an image hangs
        setTimeout(executePrint, 1200);
      } else {
        setTimeout(executePrint, 250);
      }
    } catch (error) {
      console.warn('Print iframe initialization failed, falling back:', error);
      fallbackWindowPrint(htmlContent, documentTitle);
      resolve(false);
    }
  });
};

/**
 * Fallback to standard window if iframe printing is sandboxed or unavailable
 */
const fallbackWindowPrint = (htmlContent, title) => {
  const printWindow = window.open('', '_blank', 'width=1000,height=800');
  if (!printWindow) {
    alert('Pop-up was blocked. Please enable pop-ups or use Ctrl+P to print.');
    return;
  }
  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 400);
};

// ============================================================================
// COMMON CSS STYLES FOR HIGH-QUALITY PRINT OUTPUT
// ============================================================================
const getBasePrintStyles = (orientation = 'portrait') => `
  @page {
    size: ${orientation === 'landscape' ? 'landscape' : 'A4 portrait'};
    margin: 12mm 15mm;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    background: #ffffff;
    line-height: 1.4;
    margin: 0;
    padding: 0;
    font-size: 11px;
  }
  .no-print {
    display: none !important;
  }
  .header-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #0284c7;
    padding-bottom: 10px;
    margin-bottom: 14px;
  }
  .brand-logo {
    font-size: 19px;
    font-weight: 800;
    color: #0284c7;
    letter-spacing: 0.04em;
  }
  .brand-sub {
    font-size: 10px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-top: 1px;
  }
  .report-meta {
    text-align: right;
    font-size: 10px;
    color: #64748b;
    line-height: 1.35;
  }
  .section-title {
    font-size: 12px;
    font-weight: 700;
    color: #0284c7;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 14px 0 6px 0;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 3px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 12px;
  }
  th {
    background: #f1f5f9;
    color: #334155;
    font-weight: 700;
    text-align: left;
    padding: 6px 8px;
    border: 1px solid #cbd5e1;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  td {
    padding: 6px 8px;
    border: 1px solid #cbd5e1;
    vertical-align: top;
    font-size: 10.5px;
  }
  tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  tr:nth-child(even) td {
    background: #f8fafc;
  }
  .status-badge {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 4px;
    font-weight: 700;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border: 1px solid transparent;
  }
  .status-request, .status-pending { background: #fef3c7; color: #92400e; border-color: #fde68a; }
  .status-approved { background: #d1fae5; color: #065f46; border-color: #a7f3d0; }
  .status-closed { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
  .status-assigned { background: #e0f2fe; color: #075985; border-color: #bae6fd; }
  .status-in-progress { background: #e0f2fe; color: #0369a1; border-color: #bae6fd; }
  .status-completed { background: #d1fae5; color: #065f46; border-color: #a7f3d0; }
  
  .attachment-preview {
    max-width: 140px;
    max-height: 90px;
    object-fit: contain;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    margin-top: 4px;
    display: block;
  }
  .footer-note {
    margin-top: 20px;
    border-top: 1px solid #e2e8f0;
    padding-top: 8px;
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: #94a3b8;
  }
`;

// ============================================================================
// 1. PRINT SINGLE TASK AUDIT REPORT & SPECIFICATION
// ============================================================================
export const printTaskAuditReport = (task, logs = [], currentUser = null) => {
  const dateFormatted = formatDateTime(new Date());

  const getStatusClass = (st) => {
    const s = (st || '').toLowerCase();
    if (s.includes('approve') || s.includes('complete')) return 'status-approved';
    if (s.includes('close')) return 'status-closed';
    if (s.includes('progress') || s.includes('active')) return 'status-in-progress';
    if (s.includes('request')) return 'status-request';
    return 'status-pending';
  };

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>US24 Task Report - ${task.task_id}</title>
      <style>
        ${getBasePrintStyles('portrait')}
        .spec-table th { width: 22%; background: #f8fafc; color: #475569; }
        .spec-table td { width: 28%; }
      </style>
    </head>
    <body>
      <div class="header-bar">
        <div>
          <div class="brand-logo">US24 SOLUTIONS</div>
          <div class="brand-sub">Healthcare Operations & Provider Credentialing</div>
        </div>
        <div class="report-meta">
          <div><strong>Task Code:</strong> <span style="font-family: monospace; font-weight: bold; color: #0284c7;">${task.task_id}</span></div>
          <div><strong>Date:</strong> ${dateFormatted}</div>
          <div><strong>Printed By:</strong> ${currentUser?.full_name || currentUser?.username || 'Staff'}</div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px;">
        <div>
          <div style="font-size: 15px; font-weight: 800; color: #0f172a;">${task.task_name || task.project_name}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Project: <strong>${task.project_name}</strong> • Insurance: <strong>${task.insurance_name}</strong></div>
        </div>
        <div style="text-align: right;">
          <span class="status-badge ${getStatusClass(task.status)}">${task.status || 'Pending'}</span>
        </div>
      </div>

      <div class="section-title">1. Task Specification & Provider Details</div>
      <table class="spec-table">
        <tr>
          <th>Project Name</th>
          <td><strong>${task.project_name || '-'}</strong></td>
          <th>Insurance / Payer</th>
          <td><strong style="color: #0284c7;">${task.insurance_name || '-'}</strong></td>
        </tr>
        <tr>
          <th>Provider Name</th>
          <td>${task.provider_name || 'N/A'}</td>
          <th>Early Start Date</th>
          <td>${formatDate(task.early_start_date, 'N/A')}</td>
        </tr>
        <tr>
          <th>Provider Effective Date</th>
          <td>${formatDate(task.provider_effective_date, 'N/A')}</td>
          <th>PTAN Identifiers</th>
          <td>
            ${task.group_ptan ? `<strong>G:</strong> ${task.group_ptan}` : ''}
            ${task.group_ptan && task.individual_ptan ? ' | ' : ''}
            ${task.individual_ptan ? `<strong>P:</strong> ${task.individual_ptan}` : ''}
            ${!task.group_ptan && !task.individual_ptan ? 'None' : ''}
          </td>
        </tr>
        <tr>
          <th>Category / Pipeline</th>
          <td>
            ${task.category === 'credentialing' ? 'Provider Credentialing' : ''}
            ${task.category === 'portal_creation' ? 'Portal Creation & Setup' : ''}
            ${task.category === 'era_eft' ? 'ERA / EFT Direct Pay' : ''}
            ${!['credentialing', 'portal_creation', 'era_eft'].includes(task.category) ? (task.category || 'General') : ''}
          </td>
          <th>Sub-Plan</th>
          <td>${task.sub_plan || 'Standard Plan'}</td>
        </tr>
        <tr>
          <th>Current Assignee</th>
          <td>👤 ${task.assignee_name || 'Unassigned'}</td>
          <th>Creation Date</th>
          <td>${formatDate(task.creation_date, '-')}</td>
        </tr>
        <tr>
          <th>MOC (Communication)</th>
          <td colspan="3">${task.follow_up_type || 'Portal'}: ${task.follow_up_value || 'None provided'}</td>
        </tr>
        <tr>
          <th>Initial Remarks</th>
          <td colspan="3">
            <div>${task.notes || 'No notes provided.'}</div>
            ${task.attachment ? `<img class="attachment-preview" src="${task.attachment}" alt="Attached Document / Proof" />` : ''}
          </td>
        </tr>
      </table>

      <div class="section-title">2. Complete Audit Timeline & Update History (${logs.length} entries)</div>
      <table>
        <thead>
          <tr>
            <th style="width: 25px;">#</th>
            <th style="width: 125px;">Timestamp</th>
            <th style="width: 120px;">Staff Member</th>
            <th style="width: 95px;">Status</th>
            <th style="width: 110px;">Reassigned</th>
            <th>Follow-up Remarks / Details</th>
          </tr>
        </thead>
        <tbody>
          ${logs.length === 0 ? `
            <tr>
              <td colspan="6" style="text-align: center; color: #64748b; padding: 12px;">No historical updates recorded for this task.</td>
            </tr>
          ` : logs.map((log, idx) => `
            <tr>
              <td style="text-align: center; font-weight: bold;">${idx + 1}</td>
              <td>${formatDate(log.created_at)}<br/>${formatTime(log.created_at)}</td>
              <td><strong>${log.updated_by_name || 'Staff Member'}</strong></td>
              <td><span class="status-badge ${getStatusClass(log.new_status || log.status)}">${log.new_status || log.status || task.status}</span></td>
              <td>${log.reassigned_to_name ? `👤 ${log.reassigned_to_name}` : '-'}</td>
              <td>
                <div>${log.remarks || 'Status updated.'}</div>
                ${log.attachment ? `<img class="attachment-preview" src="${log.attachment}" alt="Update attachment" />` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="footer-note">
        <div>US24 Solutions Portal • Medical Practice Credentialing & Operations Record</div>
        <div>Confidential & Proprietary • Page 1 of 1</div>
      </div>
    </body>
    </html>
  `;

  return printHtml(html, `US24_Task_${task.task_id}`);
};

// ============================================================================
// 2. PRINT ENROLLMENTS DIRECTORY (FILTERED LIST)
// ============================================================================
export const printEnrollmentsReport = (tasks = [], category = 'all', statusFilter = 'all', currentUser = null) => {
  const dateFormatted = formatDateTime(new Date());

  const getStatusClass = (st) => {
    const s = (st || '').toLowerCase();
    if (s.includes('approve') || s.includes('complete')) return 'status-approved';
    if (s.includes('close')) return 'status-closed';
    if (s.includes('request')) return 'status-request';
    return 'status-pending';
  };

  const totalCount = tasks.length;
  const pendingCount = tasks.filter((t) => t.status === 'Pending' || t.status === 'Request').length;
  const approvedCount = tasks.filter((t) => t.status === 'Approved').length;
  const closedCount = tasks.filter((t) => t.status === 'Panel closed').length;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>US24 Enrollments Directory Report</title>
      <style>
        ${getBasePrintStyles('landscape')}
        .metrics-banner {
          display: flex;
          gap: 12px;
          margin-bottom: 12px;
        }
        .metric-box {
          flex: 1;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 6px 10px;
          background: #f8fafc;
        }
        .metric-val { font-size: 14px; font-weight: bold; color: #0f172a; }
        .metric-lbl { font-size: 9px; text-transform: uppercase; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="header-bar">
        <div>
          <div class="brand-logo">US24 SOLUTIONS</div>
          <div class="brand-sub">Healthcare Operations • Enrollments Directory Report</div>
        </div>
        <div class="report-meta">
          <div><strong>Generated:</strong> ${dateFormatted}</div>
          <div><strong>Category:</strong> ${(category || 'All').toUpperCase()} • <strong>Filter:</strong> ${statusFilter.toUpperCase()}</div>
          <div><strong>Printed By:</strong> ${currentUser?.full_name || 'Administrator'}</div>
        </div>
      </div>

      <div class="metrics-banner">
        <div class="metric-box">
          <div class="metric-val">${totalCount}</div>
          <div class="metric-lbl">Total Tasks Listed</div>
        </div>
        <div class="metric-box">
          <div class="metric-val" style="color: #b45309;">${pendingCount}</div>
          <div class="metric-lbl">Pending Review</div>
        </div>
        <div class="metric-box">
          <div class="metric-val" style="color: #047857;">${approvedCount}</div>
          <div class="metric-lbl">Approved</div>
        </div>
        <div class="metric-box">
          <div class="metric-val" style="color: #b91c1c;">${closedCount}</div>
          <div class="metric-lbl">Panel Closed</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 75px;">Task Code</th>
            <th>Project Name</th>
            <th style="width: 90px;">Category</th>
            <th>Insurance / Payer</th>
            <th>Provider Name</th>
            <th style="width: 100px;">PTAN / Identifiers</th>
            <th style="width: 80px;">Early Start</th>
            <th style="width: 85px;">Status</th>
            <th>Assignee</th>
            <th style="width: 110px;">MOC Channel</th>
          </tr>
        </thead>
        <tbody>
          ${tasks.length === 0 ? `
            <tr>
              <td colspan="10" style="text-align: center; color: #64748b; padding: 14px;">No enrollment records match current filter criteria.</td>
            </tr>
          ` : tasks.map((t) => `
            <tr>
              <td style="font-family: monospace; font-weight: bold; color: #0369a1;">${t.task_id}</td>
              <td><strong>${t.project_name}</strong>${t.task_name ? `<br/><span style="color:#64748b; font-size: 9.5px;">${t.task_name}</span>` : ''}</td>
              <td style="font-size: 9.5px;">
                ${t.category === 'credentialing' ? 'Credentialing' : t.category === 'portal_creation' ? 'Portal Setup' : t.category === 'era_eft' ? 'ERA / EFT' : (t.category || 'General')}
              </td>
              <td><strong>${t.insurance_name}</strong></td>
              <td>${t.provider_name || '-'}</td>
              <td style="font-family: monospace; font-size: 9px;">
                ${t.group_ptan ? `G: ${t.group_ptan}` : ''}
                ${t.group_ptan && t.individual_ptan ? '<br/>' : ''}
                ${t.individual_ptan ? `P: ${t.individual_ptan}` : ''}
                ${!t.group_ptan && !t.individual_ptan ? '-' : ''}
              </td>
              <td>${formatDate(t.early_start_date, '-')}</td>
              <td><span class="status-badge ${getStatusClass(t.status)}">${t.status}</span></td>
              <td>${t.assignee_name || 'Unassigned'}</td>
              <td style="font-size: 9.5px;">${t.follow_up_type || 'Portal'}${t.follow_up_value ? `: ${t.follow_up_value}` : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="footer-note">
        <div>US24 Solutions Operational Database • Enrollments Summary</div>
        <div>Total Rows: ${tasks.length}</div>
      </div>
    </body>
    </html>
  `;

  return printHtml(html, `US24_Enrollments_${category}_${new Date().toISOString().slice(0, 10)}`);
};

// ============================================================================
// 3. PRINT STAFF WORK QUEUE REPORT
// ============================================================================
export const printStaffQueueReport = (staffUser, tasks = [], statusFilter = 'all', categoryFilter = 'all', currentUser = null) => {
  const dateFormatted = formatDateTime(new Date());

  const staffName = staffUser ? (staffUser.full_name || staffUser.username) : 'Staff Member';
  const staffRole = staffUser?.profile?.role === 'admin' ? 'Administrator' : 'Operations Specialist';
  const employeeId = staffUser?.profile?.employee_id || (staffUser?.id ? `EMP-${staffUser.id}` : 'UNASSIGNED');

  const getStatusClass = (st) => {
    const s = (st || '').toLowerCase();
    if (s.includes('approve') || s.includes('complete')) return 'status-approved';
    if (s.includes('close')) return 'status-closed';
    if (s.includes('request')) return 'status-request';
    return 'status-pending';
  };

  const total = tasks.length;
  const pending = tasks.filter((t) => t.status === 'Pending' || t.status === 'Request').length;
  const approved = tasks.filter((t) => t.status === 'Approved').length;
  const closed = tasks.filter((t) => t.status === 'Panel closed').length;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>US24 Staff Work Queue - ${staffName}</title>
      <style>
        ${getBasePrintStyles('portrait')}
        .staff-hero {
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }
        .staff-hero-name { font-size: 16px; font-weight: 800; color: #0f172a; }
        .staff-hero-sub { font-size: 10px; color: #64748b; margin-top: 2px; }
        .metrics-grid {
          display: flex;
          gap: 10px;
        }
        .metric-cell {
          text-align: center;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 6px 10px;
          min-width: 60px;
        }
        .metric-cell .num { font-size: 14px; font-weight: 800; }
        .metric-cell .lbl { font-size: 8.5px; color: #64748b; text-transform: uppercase; }
      </style>
    </head>
    <body>
      <div class="header-bar">
        <div>
          <div class="brand-logo">US24 SOLUTIONS</div>
          <div class="brand-sub">Healthcare Operations • Assigned Work Queue</div>
        </div>
        <div class="report-meta">
          <div><strong>Date:</strong> ${dateFormatted}</div>
          <div><strong>Printed By:</strong> ${currentUser?.full_name || 'Staff'}</div>
        </div>
      </div>

      <div class="staff-hero">
        <div>
          <div class="staff-hero-name">👤 ${staffName}</div>
          <div class="staff-hero-sub">ID: <strong>${employeeId}</strong> • Role: <strong>${staffRole}</strong> • Email: ${staffUser?.email || 'N/A'}</div>
        </div>
        <div class="metrics-grid">
          <div class="metric-cell">
            <div class="num">${total}</div>
            <div class="lbl">Total</div>
          </div>
          <div class="metric-cell">
            <div class="num" style="color: #b45309;">${pending}</div>
            <div class="lbl">Pending</div>
          </div>
          <div class="metric-cell">
            <div class="num" style="color: #047857;">${approved}</div>
            <div class="lbl">Approved</div>
          </div>
          <div class="metric-cell">
            <div class="num" style="color: #b91c1c;">${closed}</div>
            <div class="lbl">Closed</div>
          </div>
        </div>
      </div>

      <div class="section-title">Assigned Operational Tasks (${tasks.length} active)</div>
      <table>
        <thead>
          <tr>
            <th style="width: 75px;">Task Code</th>
            <th>Project Name</th>
            <th style="width: 120px;">Insurance / Payer</th>
            <th>Provider Name</th>
            <th style="width: 85px;">Category</th>
            <th style="width: 80px;">Status</th>
            <th style="width: 80px;">Early Start</th>
            <th style="width: 110px;">Follow-up Details</th>
          </tr>
        </thead>
        <tbody>
          ${tasks.length === 0 ? `
            <tr>
              <td colspan="8" style="text-align: center; color: #64748b; padding: 14px;">No tasks assigned to this queue matching current filters.</td>
            </tr>
          ` : tasks.map((t) => `
            <tr>
              <td style="font-family: monospace; font-weight: bold; color: #0284c7;">${t.task_id}</td>
              <td><strong>${t.project_name}</strong>${t.task_name ? `<br/><span style="color:#64748b; font-size: 9px;">${t.task_name}</span>` : ''}</td>
              <td><strong>${t.insurance_name}</strong></td>
              <td>${t.provider_name || '-'}</td>
              <td style="font-size: 9.5px;">${t.category === 'credentialing' ? 'Credentialing' : t.category === 'portal_creation' ? 'Portal Setup' : t.category === 'era_eft' ? 'ERA / EFT' : (t.category || 'General')}</td>
              <td><span class="status-badge ${getStatusClass(t.status)}">${t.status}</span></td>
              <td>${formatDate(t.early_start_date, '-')}</td>
              <td style="font-size: 9.5px;">${t.follow_up_type || 'Portal'}: ${t.follow_up_value || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="footer-note">
        <div>US24 Solutions Staff Assignment Queue • Confidential Work Document</div>
        <div>Total Queue Records: ${tasks.length}</div>
      </div>
    </body>
    </html>
  `;

  return printHtml(html, `US24_Queue_${staffName.replace(/\s+/g, '_')}`);
};

// ============================================================================
// 4. PRINT DASHBOARD EXECUTIVE SUMMARY REPORT
// ============================================================================
export const printDashboardReport = (kpis = {}, categories = {}, assignees = [], currentUser = null) => {
  const dateFormatted = formatDateTime(new Date());

  const totalTasks = kpis.total || 0;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>US24 Dashboard Operations Summary</title>
      <style>
        ${getBasePrintStyles('portrait')}
        .kpi-row {
          display: flex;
          gap: 12px;
          margin-bottom: 14px;
        }
        .kpi-card-print {
          flex: 1;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 10px;
          background: #f8fafc;
        }
        .kpi-title { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: bold; }
        .kpi-val { font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 4px; }
        .kpi-desc { font-size: 8.5px; color: #64748b; margin-top: 2px; }
        .two-col-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
      </style>
    </head>
    <body>
      <div class="header-bar">
        <div>
          <div class="brand-logo">US24 SOLUTIONS</div>
          <div class="brand-sub">Healthcare Operations • Executive Dashboard Summary</div>
        </div>
        <div class="report-meta">
          <div><strong>Generated:</strong> ${dateFormatted}</div>
          <div><strong>Printed By:</strong> ${currentUser?.full_name || currentUser?.username || 'Administrator'}</div>
        </div>
      </div>

      <div class="kpi-row">
        <div class="kpi-card-print">
          <div class="kpi-title">Total Assignments</div>
          <div class="kpi-val" style="color: #0284c7;">${kpis.total || 0}</div>
          <div class="kpi-desc">Active operations volume</div>
        </div>
        <div class="kpi-card-print">
          <div class="kpi-title">In Progress</div>
          <div class="kpi-val" style="color: #0284c7;">${kpis.in_progress || 0}</div>
          <div class="kpi-desc">Active follow-ups in queue</div>
        </div>
        <div class="kpi-card-print">
          <div class="kpi-title">Completed</div>
          <div class="kpi-val" style="color: #059669;">${kpis.completed || 0}</div>
          <div class="kpi-desc">${kpis.completion_rate || 0}% Completion Ratio</div>
        </div>
        <div class="kpi-card-print">
          <div class="kpi-title">Pending Review</div>
          <div class="kpi-val" style="color: #d97706;">${kpis.pending || 0}</div>
          <div class="kpi-desc">Awaiting payer / client docs</div>
        </div>
      </div>

      <div class="two-col-grid">
        <div>
          <div class="section-title">1. Pipeline Category Distribution</div>
          <table>
            <thead>
              <tr>
                <th>Category Pipeline</th>
                <th style="width: 60px; text-align: right;">Count</th>
                <th style="width: 70px; text-align: right;">Share</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Portal Creation & Setup</strong></td>
                <td style="text-align: right; font-weight: bold;">${categories.portal_creation || 0}</td>
                <td style="text-align: right;">${totalTasks > 0 ? Math.round(((categories.portal_creation || 0) / totalTasks) * 100) : 0}%</td>
              </tr>
              <tr>
                <td><strong>Provider Credentialing</strong></td>
                <td style="text-align: right; font-weight: bold;">${categories.credentialing || 0}</td>
                <td style="text-align: right;">${totalTasks > 0 ? Math.round(((categories.credentialing || 0) / totalTasks) * 100) : 0}%</td>
              </tr>
              <tr>
                <td><strong>ERA / EFT Direct Pay</strong></td>
                <td style="text-align: right; font-weight: bold;">${categories.era_eft || 0}</td>
                <td style="text-align: right;">${totalTasks > 0 ? Math.round(((categories.era_eft || 0) / totalTasks) * 100) : 0}%</td>
              </tr>
              <tr>
                <td><strong>General Practice Tasks</strong></td>
                <td style="text-align: right; font-weight: bold;">${categories.general || 0}</td>
                <td style="text-align: right;">${totalTasks > 0 ? Math.round(((categories.general || 0) / totalTasks) * 100) : 0}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <div class="section-title">2. Staff Assignment & Workload Capacity</div>
          <table>
            <thead>
              <tr>
                <th>Team Member</th>
                <th style="width: 50px; text-align: center;">Active</th>
                <th style="width: 50px; text-align: center;">Done</th>
                <th style="width: 50px; text-align: center;">Total</th>
                <th style="width: 80px;">Capacity</th>
              </tr>
            </thead>
            <tbody>
              ${assignees.map((emp) => {
                let cap = 'Available';
                if (emp.active >= 3) cap = 'Heavy Load';
                else if (emp.active === 2) cap = 'Balanced';
                else if (emp.active === 1) cap = 'Optimal';
                return `
                  <tr>
                    <td><strong>${emp.name}</strong><br/><span style="color: #64748b; font-size: 9px;">@${emp.username}</span></td>
                    <td style="text-align: center; font-weight: bold; color: #0284c7;">${emp.active}</td>
                    <td style="text-align: center; color: #059669;">${emp.completed}</td>
                    <td style="text-align: center; font-weight: bold;">${emp.total}</td>
                    <td><span style="font-size: 9px; font-weight: bold; text-transform: uppercase;">${cap}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="footer-note">
        <div>US24 Solutions Executive Operations Summary • Confidential</div>
        <div>Page 1 of 1</div>
      </div>
    </body>
    </html>
  `;

  return printHtml(html, `US24_Dashboard_Summary_${new Date().toISOString().slice(0, 10)}`);
};

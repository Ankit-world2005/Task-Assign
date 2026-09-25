// Follow-up schedule helpers shared by the profile dashboard and the task update page.
// Work dates and follow-up due dates are calendar dates picked by staff, so they are compared with the local date.

export const FINISHED_STATUSES = ['Completed', 'Approved', 'Panel closed'];

export const localDateString = (date = new Date()) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

export const addDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
};

// Overdue once the day after the due date arrives and the task is still not finished
export const isFollowUpOverdue = (task) =>
  Boolean(task?.follow_up_due_date) &&
  task.follow_up_due_date < localDateString() &&
  !FINISHED_STATUSES.includes(task.status);

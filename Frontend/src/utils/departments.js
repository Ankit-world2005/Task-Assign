export const DEPARTMENT_OPTIONS = [
  'Credentialing',
  'Portal Creation',
  'ERA / EFT',
  'Password Reset',
  'Portal Unblock',
  'Enrollment',
  'Payment Posting',
];

export const DEPARTMENT_CATEGORY_MAP = {
  Credentialing: ['credentialing'],
  'Portal Creation': ['portal_creation'],
  'ERA / EFT': ['era_eft'],
  'Password Reset': ['password_reset'],
  'Portal Unblock': ['portal_unblock'],
  Enrollment: ['credentialing', 'portal_creation', 'era_eft'],
  'Payment Posting': ['payment_posting'],
};

export const isAdminUser = (user) => user?.profile?.role === 'admin';

export const parseDepartments = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => DEPARTMENT_OPTIONS.includes(item));

/** Category keys a user may access (`null` for unrestricted admins). */
export const getAllowedTaskCategories = (user) => {
  if (isAdminUser(user)) return null;
  const allowed = new Set();
  for (const dept of parseDepartments(user?.profile?.department)) {
    for (const cat of DEPARTMENT_CATEGORY_MAP[dept]) allowed.add(cat);
  }
  return Array.from(allowed);
};

export const canAccessCategory = (user, category) => {
  const allowed = getAllowedTaskCategories(user);
  if (allowed === null) return true;
  return allowed.includes(String(category || '').trim().toLowerCase());
};

export const canAccessTab = (user, tabId) => {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  const departments = parseDepartments(user?.profile?.department);
  if (tabId === 'enrollment') return departments.includes('Enrollment');
  if (tabId === 'payment-posting') return departments.includes('Payment Posting');
  if (
    tabId === 'users' ||
    tabId === 'task-credentialing' ||
    tabId === 'task-portal-creation' ||
    tabId === 'task-era-eft' ||
    tabId === 'task-password-reset' ||
    tabId === 'task-portal-unblock'
  ) {
    return false;
  }
  return true;
};


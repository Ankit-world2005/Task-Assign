import axios from 'axios';

// Base API configuration with relative paths (proxied by Vite to Backend :8001)
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

export const api = {
  // Authentication
  login: async (username, password) => {
    const res = await apiClient.post('/auth/login/', { username, password });
    return res.data;
  },

  verifyOtp: async (username, otp) => {
    const res = await apiClient.post('/auth/verify-otp/', { username, otp });
    return res.data;
  },

  getMe: async () => {
    const res = await apiClient.get('/auth/me/');
    return res.data;
  },

  logout: async () => {
    const res = await apiClient.post('/auth/logout/');
    return res.data;
  },

  getUsers: async () => {
    const res = await apiClient.get('/auth/users/');
    return res.data;
  },

  // User Management (Admin Only)
  createUser: async (userData) => {
    const res = await apiClient.post('/auth/users/create/', userData);
    return res.data;
  },

  toggleUserAccess: async (userId) => {
    const res = await apiClient.post(`/auth/users/${userId}/toggle-access/`);
    return res.data;
  },

  updateUser: async (userId, userData) => {
    const res = await apiClient.post(`/auth/users/${userId}/update/`, userData);
    return res.data;
  },

  resetUserPassword: async (userId, newPassword) => {
    const res = await apiClient.post(`/auth/users/${userId}/reset-password/`, { password: newPassword });
    return res.data;
  },

  deleteUser: async (userId) => {
    const res = await apiClient.post(`/auth/users/${userId}/delete/`);
    return res.data;
  },

  // Task Operations
  getTasks: async (params = {}) => {
    const res = await apiClient.get('/tasks/', { params });
    return res.data;
  },

  getTaskDetail: async (id) => {
    const res = await apiClient.get(`/tasks/${id}/`);
    return res.data;
  },

  getNextTaskId: async () => {
    const res = await apiClient.get('/tasks/next-id/');
    return res.data;
  },

  createTask: async (taskData) => {
    const res = await apiClient.post('/tasks/', taskData);
    return res.data;
  },

  updateTask: async (id, taskData) => {
    const res = await apiClient.patch(`/tasks/${id}/`, taskData);
    return res.data;
  },

  addTaskLog: async (id, logData) => {
    const res = await apiClient.post(`/tasks/${id}/add-log/`, logData);
    return res.data;
  },

  // Analytics & Stats
  getStats: async () => {
    const res = await apiClient.get('/stats/');
    return res.data;
  },

  // Profile Dashboard (user's personal task stats)
  getProfileDashboard: async () => {
    const res = await apiClient.get('/profile/dashboard/');
    return res.data;
  },

  // Import Operations (Excel / Spreadsheet)
  importExcel: async (file, category) => {
    const formData = new FormData();
    formData.append('file', file);
    if (category) formData.append('category', category);
    const res = await apiClient.post('/import-excel/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      params: category ? { category } : {},
    });
    return res.data;
  },

  importCsv: async (file, category) => api.importExcel(file, category),
};

export default api;

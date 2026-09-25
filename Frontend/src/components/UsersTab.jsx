import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export const UsersTab = () => {
  const { currentUser, usersList, reloadUsers } = useAuth();

  const [users, setUsers] = useState(usersList || []);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all'); // 'all' | 'admin' | 'employee'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'revoked'
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', text: '' }

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [passwordModalUser, setPasswordModalUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  // Create User Form State
  const initialCreateState = {
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    role: 'employee',
    employee_id: '',
    phone: '',
    department: 'Operations & Enrollment',
    is_active: true,
    avatar_color: '#2563eb',
  };
  const [createForm, setCreateForm] = useState(initialCreateState);
  const [actionLoading, setActionLoading] = useState(false);

  // Sync users from context or fetch on mount
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(data);
      if (reloadUsers) reloadUsers();
    } catch (err) {
      console.error('Failed to load users:', err);
      showFeedback('error', 'Failed to load user records from server.');
    } finally {
      setLoading(false);
    }
  };

  const showFeedback = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => {
      setFeedback(null);
    }, 4500);
  };

  // 1. Toggle Login Access (Grant / Revoke)
  const handleToggleAccess = async (user) => {
    if (currentUser?.id === user.id) {
      showFeedback('error', 'Action blocked: You cannot revoke your own administrator login access.');
      return;
    }

    const actionText = user.is_active ? 'REVOKE login access for' : 'GRANT login access to';
    const confirmMsg = `Are you sure you want to ${actionText} "${user.full_name || user.username}"?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setActionLoading(true);
      const res = await api.toggleUserAccess(user.id);
      showFeedback('success', res.message || `Access ${res.is_active ? 'granted' : 'revoked'} successfully.`);
      fetchUsers();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to update user login access.';
      showFeedback('error', msg);
    } finally {
      setActionLoading(false);
    }
  };

  // 2. Create User Submit
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.username.trim() || !createForm.email.trim() || !createForm.password.trim()) {
      showFeedback('error', 'Username, email, and initial password are required.');
      return;
    }

    try {
      setActionLoading(true);
      const res = await api.createUser(createForm);
      showFeedback('success', `User account "${res.user?.username}" created successfully.`);
      setIsCreateModalOpen(false);
      setCreateForm(initialCreateState);
      fetchUsers();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to create user account.';
      showFeedback('error', msg);
    } finally {
      setActionLoading(false);
    }
  };

  // 3. Edit User Submit
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      setActionLoading(true);
      await api.updateUser(editingUser.id, {
        first_name: editingUser.first_name,
        last_name: editingUser.last_name,
        email: editingUser.email,
        role: editingUser.profile?.role || 'employee',
        employee_id: editingUser.profile?.employee_id || '',
        phone: editingUser.profile?.phone || '',
        department: editingUser.profile?.department || 'Operations & Enrollment',
        avatar_color: editingUser.profile?.avatar_color || '#2563eb',
        is_active: editingUser.is_active,
      });
      showFeedback('success', `User profile "${editingUser.username}" updated successfully.`);
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to update user profile.';
      showFeedback('error', msg);
    } finally {
      setActionLoading(false);
    }
  };

  // 4. Reset Password Submit
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 4) {
      showFeedback('error', 'New password must be at least 4 characters long.');
      return;
    }

    try {
      setActionLoading(true);
      await api.resetUserPassword(passwordModalUser.id, newPassword);
      showFeedback('success', `Password for "${passwordModalUser.username}" updated successfully.`);
      setPasswordModalUser(null);
      setNewPassword('');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to reset password.';
      showFeedback('error', msg);
    } finally {
      setActionLoading(false);
    }
  };

  // 5. Delete User
  const handleDeleteUser = async (user) => {
    if (currentUser?.id === user.id) {
      showFeedback('error', 'You cannot delete your own logged-in account.');
      return;
    }

    if (!window.confirm(`Permanently remove user "${user.full_name || user.username}" from the portal?`)) {
      return;
    }

    try {
      setActionLoading(true);
      await api.deleteUser(user.id);
      showFeedback('success', `User "${user.username}" removed.`);
      fetchUsers();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to delete user.';
      showFeedback('error', msg);
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered list
  const filteredUsers = users.filter((u) => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !q ||
      u.username?.toLowerCase().includes(q) ||
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.profile?.employee_id?.toLowerCase().includes(q) ||
      u.profile?.department?.toLowerCase().includes(q);

    const matchesRole =
      roleFilter === 'all' ||
      (roleFilter === 'admin' && u.profile?.role === 'admin') ||
      (roleFilter === 'employee' && u.profile?.role !== 'admin');

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && u.is_active) ||
      (statusFilter === 'revoked' && !u.is_active);

    return matchesSearch && matchesRole && matchesStatus;
  });

  // Calculate KPIs
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.is_active).length;
  const revokedUsers = users.filter((u) => !u.is_active).length;
  const adminUsers = users.filter((u) => u.profile?.role === 'admin').length;

  return (
    <div className="users-tab-container" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Banner & Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.25rem', marginBottom: '2rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ fontSize: '1.6rem' }}>👥</span>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>
              Portal User Management & Access Control
            </h1>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '6px',
              background: 'rgba(6, 72, 192, 0.15)',
              color: '#0648c0',
              border: '1px solid rgba(6, 72, 192, 0.3)',
              letterSpacing: '0.05em'
            }}>
              ADMIN PRIVILEGE ONLY
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0, maxWidth: '780px' }}>
            Manage staff login credentials, grant or revoke portal access in real time, assign administrative roles, and inspect user activity logs.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={fetchUsers}
            disabled={loading}
            title="Reload user list"
            style={{ padding: '0.65rem 1rem', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>🔄</span> Refresh
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setIsCreateModalOpen(true)}
            style={{ padding: '0.65rem 1.25rem', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
          >
            <span style={{ fontSize: '1.1rem' }}>+</span> Create User Access
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`feedback-banner ${feedback.type}`}
          style={{
            padding: '12px 18px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: feedback.type === 'success' ? 'rgba(22, 163, 74, 0.15)' : 'rgba(201, 25, 46, 0.18)',
            border: feedback.type === 'success' ? '1px solid rgba(22, 163, 74, 0.4)' : '1px solid rgba(201, 25, 46, 0.4)',
            color: feedback.type === 'success' ? '#15803d' : '#c9192e',
            fontSize: '0.92rem',
            animation: 'fadeIn 0.2s ease-in-out'
          }}
        >
          <span>{feedback.type === 'success' ? '✅' : '⚠️'}</span>
          <div style={{ flex: 1, fontWeight: 500 }}>{feedback.text}</div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* KPI Metric Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', borderLeft: '4px solid #0648c0' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Total Registered Users
          </div>
          <div style={{ fontSize: '2rem', fontFamily: 'var(--serif)', fontWeight: 400, color: 'var(--ink)', marginTop: '6px' }}>
            {totalUsers}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {adminUsers} Admins • {totalUsers - adminUsers} Staff Members
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', borderLeft: '4px solid #16a34a' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Active Login Access
          </div>
          <div style={{ fontSize: '2rem', fontFamily: 'var(--serif)', fontWeight: 400, color: '#16a34a', marginTop: '6px' }}>
            {activeUsers}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Can sign in & operate tasks
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', borderLeft: '4px solid #c9192e' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Access Revoked (Blocked)
          </div>
          <div style={{ fontSize: '2rem', fontFamily: 'var(--serif)', fontWeight: 400, color: '#c9192e', marginTop: '6px' }}>
            {revokedUsers}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Login blocked by Administrator
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', borderLeft: '4px solid #7c3aed' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Security Model
          </div>
          <div style={{ fontSize: '1.2rem', fontFamily: 'var(--serif)', fontWeight: 400, color: '#7e22ce', marginTop: '10px' }}>
            Two-Step 2FA / OTP
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Quick switch disabled
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', flex: 1, minWidth: '320px' }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              🔍
            </span>
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '36px', height: '42px', width: '100%' }}
              placeholder="Search by name, username, email, employee ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Role Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Role:</label>
            <select
              className="form-select"
              style={{ height: '42px', minWidth: '130px' }}
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="all">All Roles</option>
              <option value="admin">Administrators</option>
              <option value="employee">Staff Members</option>
            </select>
          </div>

          {/* Access Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Access:</label>
            <select
              className="form-select"
              style={{ height: '42px', minWidth: '150px' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active (Allowed)</option>
              <option value="revoked">Revoked (Blocked)</option>
            </select>
          </div>
        </div>

        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Showing <strong>{filteredUsers.length}</strong> of {users.length} users
        </div>
      </div>

      {/* Users Data Table */}
      <div className="glass-panel" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="app-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border-glass)' }}>
                <th style={{ fontFamily: 'var(--mono)', padding: '14px 18px', textAlign: 'left', fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>User Details</th>
                <th style={{ fontFamily: 'var(--mono)', padding: '14px 18px', textAlign: 'left', fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contact Info</th>
                <th style={{ fontFamily: 'var(--mono)', padding: '14px 18px', textAlign: 'left', fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Department</th>
                <th style={{ fontFamily: 'var(--mono)', padding: '14px 18px', textAlign: 'left', fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Portal Role</th>
                <th style={{ fontFamily: 'var(--mono)', padding: '14px 18px', textAlign: 'left', fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Login Access Status</th>
                <th style={{ fontFamily: 'var(--mono)', padding: '14px 18px', textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Access Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '8px' }}>👤</div>
                    <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--ink)' }}>No users match the search filters.</div>
                    <div style={{ fontSize: '0.84rem', marginTop: '4px' }}>Try adjusting your search terms or filters.</div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isSelf = currentUser?.id === u.id;
                  const isAdmin = u.profile?.role === 'admin';
                  const avatarLetter = u.first_name ? u.first_name[0] : (u.username ? u.username[0].toUpperCase() : 'U');

                  return (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: '1px solid rgba(11, 13, 16, 0.05)',
                        background: !u.is_active ? 'rgba(201, 25, 46, 0.03)' : 'transparent',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      {/* User Column */}
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div
                            style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              color: '#fff',
                              fontSize: '0.95rem',
                              backgroundColor: u.profile?.avatar_color || '#2563eb',
                              boxShadow: '0 1px 2px rgba(11, 13, 16, 0.15)',
                              flexShrink: 0
                            }}
                          >
                            {avatarLetter}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {u.full_name || u.username}
                              {isSelf && (
                                <span style={{
                                  fontSize: '0.65rem',
                                  background: 'rgba(6, 72, 192, 0.2)',
                                  color: '#0648c0',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  fontWeight: 700
                                }}>
                                  YOU
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '2px', display: 'flex', gap: '8px' }}>
                              <span>@{u.username}</span>
                              <span>•</span>
                              <span>{u.profile?.employee_id || 'ID Pending'}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contact Column */}
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ fontSize: '0.86rem', color: '#0b0d10' }}>{u.email}</div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                          {u.profile?.phone || 'No phone set'}
                        </div>
                      </td>

                      {/* Department Column */}
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          fontSize: '0.8rem',
                          color: '#555b63',
                          background: 'rgba(11, 13, 16, 0.04)',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          border: '1px solid rgba(11, 13, 16, 0.08)'
                        }}>
                          {u.profile?.department || 'Operations'}
                        </span>
                      </td>

                      {/* Role Column */}
                      <td style={{ padding: '14px 18px' }}>
                        {isAdmin ? (
                          <span style={{
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            padding: '3px 10px',
                            borderRadius: '999px',
                            background: 'linear-gradient(135deg, rgba(217, 119, 6, 0.2), rgba(234, 88, 12, 0.2))',
                            color: '#b45309',
                            border: '1px solid rgba(217, 119, 6, 0.4)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            whiteSpace: 'nowrap'
                          }}>
                            👑 Administrator
                          </span>
                        ) : (
                          <span style={{
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            padding: '3px 10px',
                            borderRadius: '999px',
                            background: 'rgba(6, 72, 192, 0.1)',
                            color: '#0369a1',
                            border: '1px solid rgba(6, 72, 192, 0.25)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            whiteSpace: 'nowrap'
                          }}>
                            👤 Staff Member
                          </span>
                        )}
                      </td>

                      {/* Access Status Column */}
                      <td style={{ padding: '14px 18px' }}>
                        {u.is_active ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(22, 163, 74, 0.12)', border: '1px solid rgba(22, 163, 74, 0.3)', padding: '4px 10px', borderRadius: '999px', color: '#15803d', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#16a34a', display: 'inline-block' }} />
                            Access Active
                          </div>
                        ) : (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(201, 25, 46, 0.12)', border: '1px solid rgba(201, 25, 46, 0.35)', padding: '4px 10px', borderRadius: '999px', color: '#c9192e', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#c9192e', display: 'inline-block' }} />
                            Access Revoked
                          </div>
                        )}
                      </td>

                      {/* Actions Column */}
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                          {/* Toggle Access Button */}
                          <button
                            type="button"
                            onClick={() => handleToggleAccess(u)}
                            disabled={isSelf || actionLoading}
                            title={isSelf ? 'You cannot revoke your own administrator access' : (u.is_active ? 'Revoke login access' : 'Grant login access')}
                            style={{
                              padding: '5px 12px',
                              borderRadius: '6px',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              cursor: isSelf ? 'not-allowed' : 'pointer',
                              opacity: isSelf ? 0.45 : 1,
                              background: u.is_active ? 'rgba(201, 25, 46, 0.12)' : 'rgba(22, 163, 74, 0.15)',
                              border: u.is_active ? '1px solid rgba(201, 25, 46, 0.35)' : '1px solid rgba(22, 163, 74, 0.4)',
                              color: u.is_active ? '#c9192e' : '#15803d',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {u.is_active ? '🚫 Revoke Access' : '✓ Grant Access'}
                          </button>

                          {/* Edit Details */}
                          <button
                            type="button"
                            onClick={() => setEditingUser(JSON.parse(JSON.stringify(u)))}
                            disabled={actionLoading}
                            title="Edit user details"
                            style={{
                              padding: '5px 10px',
                              borderRadius: '6px',
                              fontSize: '0.78rem',
                              fontWeight: 500,
                              background: 'rgba(11, 13, 16, 0.05)',
                              border: '1px solid var(--border-glass)',
                              color: 'var(--text-light)',
                              cursor: 'pointer'
                            }}
                          >
                            ✏️ Edit
                          </button>

                          {/* Reset Password */}
                          <button
                            type="button"
                            onClick={() => {
                              setPasswordModalUser(u);
                              setNewPassword('');
                            }}
                            disabled={actionLoading}
                            title="Reset password"
                            style={{
                              padding: '5px 10px',
                              borderRadius: '6px',
                              fontSize: '0.78rem',
                              fontWeight: 500,
                              background: 'rgba(11, 13, 16, 0.05)',
                              border: '1px solid var(--border-glass)',
                              color: 'var(--text-light)',
                              cursor: 'pointer'
                            }}
                          >
                            🔑 Pass
                          </button>

                          {/* Delete User */}
                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u)}
                              disabled={actionLoading}
                              title="Delete user account"
                              style={{
                                padding: '5px 8px',
                                borderRadius: '6px',
                                fontSize: '0.78rem',
                                background: 'rgba(201, 25, 46, 0.08)',
                                border: '1px solid rgba(201, 25, 46, 0.25)',
                                color: '#c9192e',
                                cursor: 'pointer'
                              }}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= MODAL: CREATE USER ACCESS ================= */}
      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div
            className="glass-panel"
            style={{
              maxWidth: '600px',
              width: '100%',
              padding: '2rem',
              border: '1px solid var(--border-glass-bright)',
              position: 'relative',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '1.35rem', fontFamily: 'var(--serif)', fontWeight: 400, color: 'var(--ink)', margin: 0 }}>
                  Create New Portal User Access
                </h2>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px', margin: 0 }}>
                  Provision portal login credentials, employee profile, and operational permissions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.3rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">First Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Rahul"
                    value={createForm.first_name}
                    onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Sharma"
                    value={createForm.last_name}
                    onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Username / Login ID *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. rahul.sharma"
                    required
                    value={createForm.username}
                    onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Initial Password *</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Min 4 characters"
                    required
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Email Address (for OTP) *</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="name@us24solutions.com"
                    required
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Portal Role *</label>
                  <select
                    className="form-select"
                    value={createForm.role}
                    onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                  >
                    <option value="employee">Staff Member</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Employee ID</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. US24-EMP08"
                    value={createForm.employee_id}
                    onChange={(e) => setCreateForm({ ...createForm, employee_id: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. +1 (800) 240-0108"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">Department</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Operations & Enrollment"
                  value={createForm.department}
                  onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })}
                />
              </div>

              {/* Login Access Granted Checkbox */}
              <div style={{
                background: 'rgba(11, 13, 16, 0.04)',
                border: '1px solid var(--border-glass)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <input
                  type="checkbox"
                  id="create-is-active"
                  checked={createForm.is_active}
                  onChange={(e) => setCreateForm({ ...createForm, is_active: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#0648c0' }}
                />
                <label htmlFor="create-is-active" style={{ cursor: 'pointer', fontSize: '0.86rem', color: '#0b0d10' }}>
                  <strong>Grant immediate login access to portal</strong>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    If unchecked, this user will be registered in revoked status and blocked until enabled.
                  </div>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Creating User...' : 'Create User & Access →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: EDIT USER ================= */}
      {editingUser && (
        <div className="modal-overlay" onClick={() => setEditingUser(null)}>
          <div
            className="glass-panel"
            style={{
              maxWidth: '560px',
              width: '100%',
              padding: '2rem',
              border: '1px solid var(--border-glass-bright)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '1.3rem', fontFamily: 'var(--serif)', fontWeight: 400, color: 'var(--ink)', margin: 0 }}>
                  Edit User Profile: @{editingUser.username}
                </h2>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px', margin: 0 }}>
                  Update user information and access controls.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.3rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">First Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editingUser.first_name || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, first_name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editingUser.last_name || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, last_name: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    required
                    value={editingUser.email || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Portal Role</label>
                  <select
                    className="form-select"
                    value={editingUser.profile?.role || 'employee'}
                    disabled={currentUser?.id === editingUser.id}
                    onChange={(e) =>
                      setEditingUser({
                        ...editingUser,
                        profile: { ...(editingUser.profile || {}), role: e.target.value },
                      })
                    }
                  >
                    <option value="employee">Staff Member</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Employee ID</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editingUser.profile?.employee_id || ''}
                    onChange={(e) =>
                      setEditingUser({
                        ...editingUser,
                        profile: { ...(editingUser.profile || {}), employee_id: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editingUser.profile?.phone || ''}
                    onChange={(e) =>
                      setEditingUser({
                        ...editingUser,
                        profile: { ...(editingUser.profile || {}), phone: e.target.value },
                      })
                    }
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">Department</label>
                <input
                  type="text"
                  className="form-input"
                  value={editingUser.profile?.department || ''}
                  onChange={(e) =>
                    setEditingUser({
                      ...editingUser,
                      profile: { ...(editingUser.profile || {}), department: e.target.value },
                    })
                  }
                />
              </div>

              {/* Login Access Status Toggle */}
              <div style={{
                background: 'rgba(11, 13, 16, 0.04)',
                border: '1px solid var(--border-glass)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <input
                  type="checkbox"
                  id="edit-is-active"
                  checked={editingUser.is_active}
                  disabled={currentUser?.id === editingUser.id}
                  onChange={(e) => setEditingUser({ ...editingUser, is_active: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: currentUser?.id === editingUser.id ? 'not-allowed' : 'pointer', accentColor: '#16a34a' }}
                />
                <label htmlFor="edit-is-active" style={{ cursor: 'pointer', fontSize: '0.86rem', color: '#0b0d10' }}>
                  <strong>Portal Login Access: {editingUser.is_active ? 'Active (Allowed)' : 'Revoked (Blocked)'}</strong>
                  {currentUser?.id === editingUser.id && (
                    <div style={{ fontSize: '0.74rem', color: '#d97706' }}>
                      (You cannot revoke your own administrator account)
                    </div>
                  )}
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingUser(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: RESET PASSWORD ================= */}
      {passwordModalUser && (
        <div className="modal-overlay" onClick={() => setPasswordModalUser(null)}>
          <div
            className="glass-panel"
            style={{
              maxWidth: '440px',
              width: '100%',
              padding: '2rem',
              border: '1px solid var(--border-glass-bright)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--serif)', fontWeight: 400, color: 'var(--ink)', margin: 0 }}>
                  Reset Login Password
                </h2>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px', margin: 0 }}>
                  Assign a new password for <strong>{passwordModalUser.full_name || passwordModalUser.username}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPasswordModalUser(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.3rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit}>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Enter at least 4 characters"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPasswordModalUser(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Updating...' : 'Set New Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersTab;

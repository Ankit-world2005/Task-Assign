import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Load active user and user list on mount
  const refreshUser = async () => {
    try {
      setIsLoading(true);
      const meData = await api.getMe();
      if (meData && meData.authenticated && meData.user) {
        setCurrentUser(meData.user);
        try {
          localStorage.setItem('us24_auth_user', JSON.stringify(meData.user));
        } catch (e) {}
        try {
          const users = await api.getUsers();
          setUsersList(users);
        } catch (e) {
          // Users list might only be available to authenticated staff
        }
      } else {
        setCurrentUser(null);
        try {
          localStorage.removeItem('us24_auth_user');
        } catch (e) {}
      }
    } catch (err) {
      if (err?.response?.status === 401) {
        // Expected unauthenticated state when no active session exists
        setCurrentUser(null);
      } else {
        console.error('Failed to fetch auth session:', err);
        setCurrentUser(null);
      }
      try {
        localStorage.removeItem('us24_auth_user');
      } catch (e) {}
    } finally {
      setIsLoading(false);
    }
  };

  const reloadUsers = async () => {
    try {
      const users = await api.getUsers();
      setUsersList(users);
      return users;
    } catch (e) {
      console.warn('Failed to reload users list:', e);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const loginStepOne = async (username, password) => {
    setAuthError(null);
    try {
      const data = await api.login(username, password);
      return data;
    } catch (err) {
      const msg = err.response?.data?.detail || 'Login failed. Please check credentials.';
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const verifyOtp = async (username, otp) => {
    setAuthError(null);
    try {
      const data = await api.verifyOtp(username, otp);
      if (data.user) {
        setCurrentUser(data.user);
        try {
          localStorage.setItem('us24_auth_user', JSON.stringify(data.user));
        } catch (e) {}
        try {
          const users = await api.getUsers();
          setUsersList(users);
        } catch (e) {}
      }
      return data;
    } catch (err) {
      const msg = err.response?.data?.detail || 'Invalid verification code.';
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.warn('Logout warning:', err);
    }
    setCurrentUser(null);
    setUsersList([]);
    try {
      localStorage.removeItem('us24_auth_user');
    } catch (e) {}
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        usersList,
        isLoading,
        authError,
        loginStepOne,
        verifyOtp,
        logout,
        refreshUser,
        reloadUsers,
      }}
    >
      {children}
    </AuthContext.Provider>
  );

};

export const useAuth = () => useContext(AuthContext);

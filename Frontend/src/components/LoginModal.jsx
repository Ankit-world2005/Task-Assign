import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const LoginModal = () => {
  const { isLoginModalOpen, setIsLoginModalOpen, loginStepOne, verifyOtp, usersList } = useAuth();

  const [step, setStep] = useState(1); // 1 = credentials, 2 = OTP
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [serverOtp, setServerOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [phoneInfo, setPhoneInfo] = useState('');

  if (!isLoginModalOpen) return null;

  const handleCredentialSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await loginStepOne(username, password);
      setServerOtp(res.otp);
      setPhoneInfo(res.phone || '+1 (800) US24-PORTAL');
      setStep(2);
    } catch (err) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await verifyOtp(username, otp);
      // Successfully authenticated
      setStep(1);
      setOtp('');
    } catch (err) {
      setError(err.message || 'Verification failed. Please check OTP code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => setIsLoginModalOpen(false)}>
      <div
        className="glass-panel"
        style={{
          maxWidth: '460px',
          width: '100%',
          padding: '2rem',
          border: '1px solid var(--border-glass-bright)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={() => setIsLoginModalOpen(false)}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '1.25rem',
            cursor: 'pointer',
          }}
        >
          ✕
        </button>

        {/* US24 Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div
            className="brand-logo-badge"
            style={{ width: '54px', height: '54px', margin: '0 auto 12px auto', fontSize: '1.4rem' }}
          >
            US24
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff' }}>
            US24 SOLUTIONS PORTAL
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {step === 1 ? 'Secure Employee & Admin Authentication' : 'Two-Step OTP Verification'}
          </p>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
            }}
          >
            {error}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleCredentialSubmit}>

            <div className="form-group">
              <label className="form-label">Username / Employee ID</label>
              <input
                type="text"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="e.g. admin or US24-EMP01"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}
              disabled={loading}
            >
              {loading ? 'Generating OTP...' : 'Continue to OTP Verification →'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit}>
            <div
              style={{
                background: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '1.25rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#93c5fd' }}>
                A 6-digit OTP code has been dispatched to:
              </div>
              <div style={{ fontWeight: 600, color: '#38bdf8', fontSize: '0.9rem', marginTop: '2px' }}>
                {phoneInfo}
              </div>
              {serverOtp && (
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '0.82rem',
                    color: '#a7f3d0',
                    background: 'rgba(16, 185, 129, 0.15)',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                  onClick={() => setOtp(serverOtp)}
                  title="Click to auto-fill"
                >
                  ⚡ Demo OTP: <strong>{serverOtp}</strong> (Click to auto-fill)
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Enter 6-Digit OTP Code</label>
              <input
                type="text"
                className="form-input"
                style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.3em', fontWeight: 700 }}
                maxLength="6"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="000000"
                autoFocus
                required
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}
              disabled={loading}
            >
              {loading ? 'Verifying...' : 'Verify & Access Portal ✓'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                onClick={() => setStep(1)}
              >
                ← Back
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.75rem', color: 'var(--brand-cyan-light)' }}
                onClick={() => setOtp(serverOtp || '123456')}
              >
                Auto-Fill Code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default LoginModal;

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

export const LoginPage = () => {
  const { loginStepOne, verifyOtp } = useAuth();

  const [step, setStep] = useState(1); // 1 = credentials, 2 = OTP verification
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // OTP State: 6 individual digit boxes
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const digitInputRefs = useRef([]);

  // Server response metadata
  const [serverData, setServerData] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Resend cooldown countdown effect
  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Focus first OTP input when transitioning to Step 2
  useEffect(() => {
    if (step === 2 && digitInputRefs.current[0]) {
      setTimeout(() => {
        digitInputRefs.current[0]?.focus();
      }, 150);
    }
  }, [step]);

  // Step 1: Submit Credentials & Dispatch OTP Email
  const handleCredentialSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter both your email address and password.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await loginStepOne(email.trim(), password.trim());
      setServerData(res);
      setStep(2);
      setResendCooldown(60); // 60s cooldown for resend
      setOtpDigits(['', '', '', '', '', '']);
    } catch (err) {
      setError(err.message || 'Invalid credentials. Please verify your email and password.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Handle 6-Digit OTP Box Changes
  const handleDigitChange = (index, value) => {
    // Only accept numeric single digit
    const cleanValue = value.replace(/[^0-9]/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = cleanValue;
    setOtpDigits(newDigits);
    setError('');

    // Automatically focus next input box if a digit was entered
    if (cleanValue && index < 5) {
      digitInputRefs.current[index + 1]?.focus();
    }

    // If all 6 digits entered, auto-trigger verification
    const fullOtp = newDigits.join('');
    if (fullOtp.length === 6 && !newDigits.includes('')) {
      handleOtpVerification(fullOtp);
    }
  };

  // Handle Backspace navigation across digit boxes
  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      digitInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      digitInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      digitInputRefs.current[index + 1]?.focus();
    }
  };

  // Handle Pasting full 6-digit OTP into any box
  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim().replace(/[^0-9]/g, '');
    if (!pastedData) return;

    const digits = pastedData.slice(0, 6).split('');
    const newDigits = [...otpDigits];
    digits.forEach((d, i) => {
      newDigits[i] = d;
    });
    setOtpDigits(newDigits);

    // Focus appropriate box
    const nextEmptyIndex = newDigits.findIndex((d) => !d);
    if (nextEmptyIndex !== -1) {
      digitInputRefs.current[nextEmptyIndex]?.focus();
    } else {
      digitInputRefs.current[5]?.focus();
      handleOtpVerification(newDigits.join(''));
    }
  };

  // Step 2: Verify OTP
  const handleOtpVerification = async (explicitCode = null) => {
    const code = explicitCode || otpDigits.join('');
    if (code.length !== 6) {
      setError('Please enter the complete 6-digit OTP code.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await verifyOtp(email.trim(), code);
      // AuthContext will update currentUser and App.jsx will transition to Dashboard view
    } catch (err) {
      setError(err.message || 'Invalid or expired OTP code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Quick autofill of OTP helper for testing
  const handleDevOtpAutofill = (code) => {
    if (!code) return;
    const digits = code.slice(0, 6).split('');
    setOtpDigits(digits);
    handleOtpVerification(code);
  };

  return (
    <div className="login-viewport-wrapper">
      {/* Dynamic Background Glow Elements */}
      <div className="login-ambient-orb orb-1" />
      <div className="login-ambient-orb orb-2" />
      <div className="login-ambient-orb orb-3" />

      <div className="login-card-container">
        {/* Portal Branding Top Header */}
        <div className="login-header">
          <div className="login-brand-badge">
            <span className="brand-pill">US24</span>
            <span className="brand-dot" />
            <span className="brand-portal-name">HEALTHCARE OPERATIONS</span>
          </div>

          <h1 className="login-title">
            {step === 1 ? 'Portal Administrator Sign In' : 'Two-Step Verification'}
          </h1>
          <p className="login-subtitle">
            {step === 1
              ? 'Provider Credentialing, Operations & Task Workflow Platform'
              : `A 6-digit one-time passcode was dispatched to ${email}`}
          </p>

          {/* 2-Step Progress Indicator */}
          <div className="login-step-tracker">
            <div className={`step-node ${step >= 1 ? 'active' : ''}`}>
              <span className="step-num">{step > 1 ? '✓' : '1'}</span>
              <span className="step-text">Credentials</span>
            </div>
            <div className={`step-connector ${step === 2 ? 'active' : ''}`} />
            <div className={`step-node ${step === 2 ? 'active' : ''}`}>
              <span className="step-num">2</span>
              <span className="step-text">Gmail OTP</span>
            </div>
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="login-error-banner animate-fade-in">
            <div className="error-icon">⚠️</div>
            <div className="error-text">{error}</div>
          </div>
        )}

        {/* STEP 1: CREDENTIALS FORM */}
        {step === 1 && (
          <form onSubmit={handleCredentialSubmit} className="login-form">
            {/* Email / Username Field */}
            <div className="login-form-group">
              <label className="login-field-label">Email or Username</label>
              <div className="login-input-wrapper">
                <span className="input-prefix-icon">📧</span>
                <input
                  type="text"
                  className="login-text-input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="login-form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="login-field-label">Password</label>
                <button
                  type="button"
                  className="login-ghost-link"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? 'Hide' : 'Show'} Password
                </button>
              </div>
              <div className="login-input-wrapper">
                <span className="input-prefix-icon">🔒</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="login-text-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            {/* Submit Action */}
            <button
              type="submit"
              className="login-primary-btn"
              disabled={loading}
            >
              {loading ? (
                <span className="btn-loading-flex">
                  <span className="login-spinner" /> Validating & Dispatching OTP...
                </span>
              ) : (
                <span>Continue to Two-Step Verification ➜</span>
              )}
            </button>

            {/* Security Compliance Footer */}
            <div className="login-security-notice">
              <div className="security-item">
                <span className="sec-icon">🛡️</span> HIPAA & SOC-2 Encrypted
              </div>
              <div className="security-item">
                <span className="sec-icon">⚡</span> 2-Step OTP Protected
              </div>
            </div>
          </form>
        )}

        {/* STEP 2: 6-DIGIT OTP VERIFICATION FORM */}
        {step === 2 && (
          <div className="login-otp-step animate-fade-in">
            {/* Email Dispatch Notice */}
            <div className="otp-dispatch-banner">
              <div className="banner-icon">📩</div>
              <div className="banner-details">
                <div className="banner-title">
                  {serverData?.email_sent ? 'Email Dispatched to Gmail' : 'Security OTP Generated'}
                </div>
                <div className="banner-sub">
                  Code sent to <strong>{serverData?.email || email}</strong>. Check your inbox or spam folder.
                </div>
              </div>
            </div>

            {/* Dev Fallback Helper Chip */}
            {serverData?.otp && (
              <div className="dev-otp-helper-card">
                <div className="dev-otp-info">
                  <span className="dev-tag">Developer / Local Test Code:</span>
                  <span className="dev-code-val">{serverData.otp}</span>
                </div>
                <button
                  type="button"
                  className="dev-fill-btn"
                  onClick={() => handleDevOtpAutofill(serverData.otp)}
                >
                  ⚡ Auto-Fill & Verify
                </button>
              </div>
            )}

            {/* 6 Individual Digit Inputs */}
            <div className="otp-boxes-wrapper" onPaste={handlePaste}>
              {otpDigits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => (digitInputRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  className={`otp-box-digit ${digit ? 'filled' : ''}`}
                  value={digit}
                  onChange={(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  autoComplete="one-time-code"
                />
              ))}
            </div>

            {/* Verify Action Button */}
            <button
              type="button"
              className="login-primary-btn"
              onClick={() => handleOtpVerification()}
              disabled={loading || otpDigits.join('').length !== 6}
            >
              {loading ? (
                <span className="btn-loading-flex">
                  <span className="login-spinner" /> Verifying OTP & Loading Dashboard...
                </span>
              ) : (
                <span>Verify & Launch Dashboard ✓</span>
              )}
            </button>

            {/* Resend OTP & Return Options */}
            <div className="otp-actions-footer">
              <button
                type="button"
                className="otp-resend-btn"
                disabled={resendCooldown > 0 || loading}
                onClick={handleCredentialSubmit}
              >
                {resendCooldown > 0
                  ? `Resend Code in ${resendCooldown}s`
                  : 'Resend Verification Code'}
              </button>

              <button
                type="button"
                className="otp-back-link"
                onClick={() => {
                  setStep(1);
                  setError('');
                  setOtpDigits(['', '', '', '', '', '']);
                }}
              >
                ← Back to Credentials
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Branding */}
      <div className="login-footer-copy">
        US24 Solutions Inc. • Healthcare Credentialing Operations Management
      </div>
    </div>
  );
};

export default LoginPage;

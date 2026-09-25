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
    <div className="page login-page">
      {/* Top navigation bar */}
      <nav className="nav">
        <div className="nav-inner">
          <span className="logo">
            <span className="logo-mark">
              <span>U<span className="orange">S</span>24</span>
            </span>
            <span className="wordmark">
              <span className="wordmark-name">U<span className="orange">S</span>24 SOLUTIONS</span>
              <span className="tagline">Innovative Technology Driven</span>
            </span>
          </span>
          <div className="nav-right">
            <span className="nav-link hide-sm">Employee Portal</span>
          </div>
        </div>
      </nav>

      <main className="main">
        {/* Intro */}
        <section className="intro">
          <span className="eyebrow">
            <span className="dot" aria-hidden="true" />
            Internal access · Employees only
          </span>
          <h1 className="headline">
            Your workspace,{' '}
            <span className="mark">
              signed <span className="orange">in.</span>
            </span>
          </h1>
          <p className="lede">
            Sign in with your company email to reach internal tools, resources and your team dashboard.
          </p>
          <div className="facts">
            <div className="fact">
              <div className="k">Access</div>
              <div className="v">Role-based</div>
            </div>
            <div className="fact">
              <div className="k">Sign-in</div>
              <div className="v">2-step OTP</div>
            </div>
            <div className="fact">
              <div className="k">Account</div>
              <div className="v">Work email</div>
            </div>
          </div>
        </section>

        {/* Sign-in card */}
        <div className="card">
          <div className="card-head">
            <span className="card-head-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Employee account
            </span>
            <span className="secure">Secure</span>
          </div>

          <div className="card-body">
            <h2>{step === 1 ? 'Sign in' : 'Two-Step Verification'}</h2>
            <p className="sub">
              {step === 1
                ? 'Enter your company email and password.'
                : `A 6-digit one-time passcode was dispatched to ${email}`}
            </p>

            {/* 2-Step Progress Indicator */}
            <div className="step-tracker">
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

            {/* Global Error Banner */}
            {error && (
              <div className="alert" role="alert">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* STEP 1: CREDENTIALS FORM */}
            {step === 1 && (
              <form onSubmit={handleCredentialSubmit}>
                {/* Email / Username Field */}
                <div className="field">
                  <label htmlFor="login-page-email">Email or Username</label>
                  <div className="input-wrap">
                    <svg className="lead" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-10 6L2 7" />
                    </svg>
                    <input
                      id="login-page-email"
                      type="text"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="username"
                      required
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div className="field">
                  <label htmlFor="login-page-password">Password</label>
                  <div className="input-wrap">
                    <svg className="lead" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <input
                      id="login-page-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      className="eye"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Submit Action */}
                <button type="submit" className="btn" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="spinner" />
                      <span>Validating & Dispatching OTP...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign in</span>
                      <svg className="arrow" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* STEP 2: 6-DIGIT OTP VERIFICATION FORM */}
            {step === 2 && (
              <div className="animate-fade-in">
                {/* Email Dispatch Notice */}
                <div className="otp-notice">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-10 6L2 7" />
                  </svg>
                  <div>
                    <div className="otp-notice-title">
                      {serverData?.email_sent ? 'Email Dispatched to Gmail' : 'Security OTP Generated'}
                    </div>
                    <div className="otp-notice-sub">
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
                      aria-label={`Digit ${index + 1}`}
                    />
                  ))}
                </div>

                {/* Verify Action Button */}
                <button
                  type="button"
                  className="btn"
                  onClick={() => handleOtpVerification()}
                  disabled={loading || otpDigits.join('').length !== 6}
                >
                  {loading ? (
                    <>
                      <span className="spinner" />
                      <span>Verifying OTP & Loading Dashboard...</span>
                    </>
                  ) : (
                    <>
                      <span>Verify & Launch Dashboard</span>
                      <svg className="arrow" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </>
                  )}
                </button>

                {/* Resend OTP & Return Options */}
                <div className="otp-actions-footer">
                  <button
                    type="button"
                    className="link"
                    disabled={resendCooldown > 0 || loading}
                    onClick={handleCredentialSubmit}
                  >
                    {resendCooldown > 0
                      ? `Resend Code in ${resendCooldown}s`
                      : 'Resend Verification Code'}
                  </button>

                  <button
                    type="button"
                    className="link muted"
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

          <div className="card-foot">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Authorized US24 employees only. Activity may be monitored.
          </div>
        </div>
      </main>

      {/* Footer Branding */}
      <footer className="footer">
        <div className="footer-inner">
          <span>© {new Date().getFullYear()} US24 Solutions</span>
          <span>Need access? Contact your administrator</span>
        </div>
      </footer>
    </div>
  );
};

export default LoginPage;

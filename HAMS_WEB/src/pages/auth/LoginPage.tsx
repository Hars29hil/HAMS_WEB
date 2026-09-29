import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, BadgeIcon, ShieldAlert, AlertTriangle, Smartphone, RefreshCw, Lock, UserCheck, X, ExternalLink, HelpCircle, ShieldOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import apiClient, { getOrCreateDeviceUuid } from '../../services/apiClient';
import { HamsCard } from '../../components/HamsCard';
import { HamsButton } from '../../components/HamsButton';
import './LoginPage.css';

interface BlockedInfo {
  isBlocked: boolean;
  code?: string;
  message: string;
  primaryUser?: string;
  attemptedUser?: string;
  ipAddress?: string;
  boundIp?: string;
  blockedAt?: string;
}

const isBluefyBrowser = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = (navigator.userAgent || navigator.vendor || '').toLowerCase();
  const isBluefyUa = ua.includes('bluefy');
  const hasBluefyObject = Boolean((window as any).bluefy);
  return isBluefyUa || hasBluefyObject;
};

export const LoginPage: React.FC = () => {
  const [studentId, setStudentId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [showBluefyModal, setShowBluefyModal] = useState(false);
  
  // Persistent Blocked Device State
  const [blockedInfo, setBlockedInfo] = useState<BlockedInfo | null>(() => {
    try {
      const saved = localStorage.getItem('hams_device_blocked_info');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const navigate = useNavigate();
  const { login } = useAuth();

  // Check server on initial mount to see if admin unblocked this device in the meantime
  useEffect(() => {
    checkServerDeviceStatus(false);
  }, []);

  const checkServerDeviceStatus = async (showFeedback = true) => {
    const deviceUuid = getOrCreateDeviceUuid();
    if (showFeedback) setIsCheckingStatus(true);
    setStatusMessage('');

    try {
      const res = await apiClient.get(`/auth/device-status?device_uuid=${deviceUuid}`);
      if (res.data.success) {
        if (!res.data.is_blocked) {
          // Admin has cleared the binding or authorized this device!
          localStorage.removeItem('hams_device_blocked_info');
          setBlockedInfo(null);
          if (showFeedback) {
            setStatusMessage('✅ Your device has been unblocked by the Admin! You can now log in.');
          }
        } else if (res.data.log) {
          const updatedBlock: BlockedInfo = {
            isBlocked: true,
            code: res.data.log.code,
            message: res.data.log.message,
            primaryUser: res.data.log.primary_user,
            attemptedUser: res.data.log.attempted_user,
            ipAddress: res.data.log.ip_address,
            blockedAt: new Date().toISOString()
          };
          localStorage.setItem('hams_device_blocked_info', JSON.stringify(updatedBlock));
          setBlockedInfo(updatedBlock);
          if (showFeedback) {
            setStatusMessage('⚠️ Still Blocked: Please contact the Hostel Admin Office to reset.');
          }
        }
      }
    } catch (err) {
      if (showFeedback) {
        setStatusMessage('⚠️ Unable to verify status. Please check your internet connection.');
      }
    } finally {
      if (showFeedback) setIsCheckingStatus(false);
    }
  };

  // Student Name Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    studentCode: string;
    studentName: string;
    room?: string;
  } | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handlePreLoginCheck = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!studentId.trim()) {
      setError('Please enter your ID.');
      return;
    }

    // Trim and remove leading zeros so "0987" becomes "987"
    let trimmedId = studentId.trim().replace(/^0+/, '');
    if (trimmedId === '') {
      trimmedId = '0';
    }

    // Check if user is attempting to enter Admin or Floor Leader codes
    const isSpecialAdminCode = trimmedId === '172300' || trimmedId === '173200' || trimmedId.toLowerCase() === 'admin' || trimmedId === '36960';
    const isLeaderCode = /^36(\d)90$/.test(trimmedId);

    if (isSpecialAdminCode || isLeaderCode) {
      setError('Invalid code');
      return;
    }

    setIsLoading(true);
    setError('');
    setStatusMessage('');

    try {
      const res = await apiClient.get(`/auth/lookup-student?code=${encodeURIComponent(trimmedId)}`);
      if (res.data.success && res.data.student) {
        setConfirmModal({
          isOpen: true,
          studentCode: res.data.student.student_code || trimmedId,
          studentName: res.data.student.name || 'Student',
          room: res.data.student.room || ''
        });
      } else {
        setError('Invalid code');
      }
    } catch (err: any) {
      const errCode = err.response?.data?.code;
      if (errCode === 'PARENT_CONTROL_REQUIRED' || errCode === 'BLUEFY_REQUIRED') {
        setShowBluefyModal(true);
        setError(err.response?.data?.message || 'Access Restricted: You need Parent Control permission to log in via Chrome.');
      } else {
        setError(err.response?.data?.message === 'Student not found with this ID' ? 'Invalid code' : (err.response?.data?.message || 'Invalid code'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const executeConfirmedLogin = async () => {
    if (!confirmModal) return;

    setIsLoggingIn(true);
    setError('');
    setStatusMessage('');

    try {
      const deviceUuid = getOrCreateDeviceUuid();
      const response = await apiClient.post('/auth/login', {
        username: confirmModal.studentCode,
        device_uuid: deviceUuid
      });
      
      if (response.data.success) {
        const token = response.data.data.token;
        const user = response.data.data.user;
        
        if (user.role !== 'STUDENT') {
          setError('Invalid code');
          setConfirmModal(null);
          return;
        }

        // Successfully logged in -> ensure blocked state is clear
        localStorage.removeItem('hams_device_blocked_info');
        setBlockedInfo(null);
        setConfirmModal(null);

        login(token, user);
        navigate('/student');
      } else {
        setConfirmModal(null);
        setError(response.data.message === 'Invalid Bank Code' ? 'Invalid code' : (response.data.message || 'Invalid code'));
      }
    } catch (err: any) {
      setConfirmModal(null);
      const errCode = err.response?.data?.code;
      if (errCode === 'BLUEFY_REQUIRED') {
        setShowBluefyModal(true);
        setError('Access Restricted: You can only visit and login using the Bluefy Browser on iPhone. Please contact the Hostel Admin Office.');
      } else if (errCode === 'DEVICE_IP_CONFLICT' || errCode === 'ALREADY_ASSIGNED_PHONE' || err.response?.status === 403) {
        const blockData: BlockedInfo = {
          isBlocked: true,
          code: errCode || 'DEVICE_IP_CONFLICT',
          message: err.response?.data?.message || 'Security restriction triggered. Please contact the Admin.',
          primaryUser: err.response?.data?.primary_user || 'Another Student',
          attemptedUser: err.response?.data?.attempted_user || 'Student',
          ipAddress: err.response?.data?.ip_address || '',
          boundIp: err.response?.data?.bound_ip || '',
          blockedAt: new Date().toISOString()
        };

        // Persistently lock this device in localStorage
        localStorage.setItem('hams_device_blocked_info', JSON.stringify(blockData));
        setBlockedInfo(blockData);
      } else if (err.response?.data?.message) {
        const msg = err.response.data.message;
        setError(msg === 'Invalid Bank Code' ? 'Invalid code' : msg);
      } else {
        setError('Invalid code');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const isAlreadyAssigned = blockedInfo?.code === 'ALREADY_ASSIGNED_PHONE';

  return (
    <>
      <div className="login-container">
        <div className="login-wrapper">

        <div className="logo-section">
          <div className="logo-glow">
            <Fingerprint size={48} color="white" />
          </div>
          <h1 className="logo-text">HAMS</h1>
          <p className="logo-subtext">Hostel Attendance Management</p>
        </div>

        {/* IF DEVICE IS BLOCKED: NO LOGIN SCREEN IS SHOWN. ONLY THE ALERT CARD IS RENDERED. */}
        {blockedInfo ? (
          <HamsCard padding="2.2rem" className="login-card" style={{ border: '2px solid #fecaca', backgroundColor: '#ffffff', boxShadow: '0 20px 40px -15px rgba(220, 38, 38, 0.25)' }}>
            <div style={{ textAlign: 'center' }}>
              
              <div style={{
                width: '68px',
                height: '68px',
                borderRadius: '50%',
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                boxShadow: '0 8px 20px rgba(220, 38, 38, 0.2)'
              }}>
                {isAlreadyAssigned ? <Smartphone size={36} /> : <ShieldAlert size={36} />}
              </div>

              <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#991b1b', margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>
                YOU ARE BLOCKED
              </h2>

              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 18px 0', lineHeight: 1.4 }}>
                {isAlreadyAssigned 
                  ? 'Your account is bound to another phone. Multiple device logins are blocked.' 
                  : 'Multi-account login detected. This device has been locked to prevent proxy attendance.'}
              </p>

              {statusMessage && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  marginBottom: '16px',
                  backgroundColor: statusMessage.startsWith('✅') ? '#ecfdf5' : '#fef2f2',
                  color: statusMessage.startsWith('✅') ? '#065f46' : '#991b1b',
                  border: statusMessage.startsWith('✅') ? '1px solid #a7f3d0' : '1px solid #fecaca'
                }}>
                  {statusMessage}
                </div>
              )}

              <div style={{
                backgroundColor: '#fef2f2',
                border: '1.5px solid #fecaca',
                borderRadius: '14px',
                padding: '14px 16px',
                marginBottom: '20px',
                textAlign: 'left'
              }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#991b1b', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={15} color="#dc2626" /> Security Conflict Details
                </div>
                
                <div style={{ fontSize: '13px', color: '#7f1d1d', lineHeight: '1.5' }}>
                  {isAlreadyAssigned ? (
                    <div>
                      Account is already registered on phone/IP: <strong style={{ color: '#0f172a' }}>{blockedInfo.boundIp || 'Assigned Phone'}</strong>
                    </div>
                  ) : (
                    <div>
                      This device was previously registered to student: <strong style={{ color: '#0f172a' }}>{blockedInfo.primaryUser || 'Another Student'}</strong>
                    </div>
                  )}

                  {blockedInfo.ipAddress && (
                    <div style={{ marginTop: '4px', fontSize: '12px', color: '#991b1b' }}>
                      Current Network: <span style={{ fontFamily: 'monospace', backgroundColor: '#fee2e2', padding: '1px 5px', borderRadius: '4px' }}>{blockedInfo.ipAddress}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* CRITICAL NOTICE BOX */}
              <div style={{
                backgroundColor: '#eff6ff',
                border: '1.5px solid #bfdbfe',
                borderRadius: '12px',
                padding: '14px 16px',
                marginBottom: '22px',
                fontSize: '13px',
                fontWeight: 700,
                color: '#1e40af',
                lineHeight: '1.5',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                textAlign: 'left'
              }}>
                <Lock size={20} color="#2563eb" style={{ flexShrink: 0 }} />
                <div>
                  Please contact the <strong>Hostel Admin Office</strong> to authorize or reset your phone binding.
                </div>
              </div>

              {/* RE-CHECK / UNBLOCK VERIFY BUTTON */}
              <button
                type="button"
                onClick={() => checkServerDeviceStatus(true)}
                disabled={isCheckingStatus}
                style={{
                  width: '100%',
                  padding: '12px 18px',
                  backgroundColor: '#4f46e5',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: isCheckingStatus ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(79, 70, 229, 0.3)',
                  transition: 'all 0.2s ease',
                  opacity: isCheckingStatus ? 0.7 : 1
                }}
              >
                <RefreshCw size={16} style={{ animation: isCheckingStatus ? 'spin 1s linear infinite' : 'none' }} />
                <span>{isCheckingStatus ? 'Checking With Server...' : 'Check If Admin Unblocked / Retry'}</span>
              </button>

            </div>
          </HamsCard>
        ) : (
          /* REGULAR LOGIN FORM (SHOWN ONLY WHEN NOT BLOCKED) */
          <HamsCard padding="2rem" className="login-card">
            <h2 className="login-title">Secure Login</h2>
            <p className="login-subtitle">Enter your details to access your dashboard.</p>

            {error && <div className="error-message">{error}</div>}
            {statusMessage && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 700,
                marginBottom: '16px',
                backgroundColor: '#ecfdf5',
                color: '#065f46',
                border: '1px solid #a7f3d0'
              }}>
                {statusMessage}
              </div>
            )}

            {/* Non-Bluefy Notice Banner */}
            {!isBluefyBrowser() && (
              <div 
                onClick={() => setShowBluefyModal(true)}
                style={{
                  backgroundColor: '#fff1f2',
                  border: '1.5px solid #fecdd3',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  marginBottom: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <ShieldAlert size={20} color="#e11d48" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '12px', color: '#9f1239', lineHeight: 1.4, flex: 1 }}>
                  <strong>Bluefy Browser on iPhone Required.</strong> Non-Bluefy browsers are restricted. <span style={{ textDecoration: 'underline', fontWeight: 700 }}>Tap for details</span>
                </div>
              </div>
            )}

            <form onSubmit={handlePreLoginCheck} className="login-form">
              <div className="input-group">
                <label>Student ID / ID</label>
                <div className="input-wrapper">
                  <BadgeIcon size={20} className="input-icon" />
                  <input
                    type="text"
                    placeholder="Enter your ID (e.g., 1723)"
                    value={studentId}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStudentId(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              <HamsButton type="submit" label="Secure Login" isLoading={isLoading} style={{ width: '100%', marginTop: '1rem' }} />
            </form>
          </HamsCard>
        )}

      </div>
    </div>

    {/* BLUEFY BROWSER ON IPHONE RESTRICTION ALERT MODAL POPUP (MOUNTED DIRECTLY TO BODY VIA PORTAL) */}
    {showBluefyModal && typeof document !== 'undefined' && createPortal(
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
        padding: '16px',
        boxSizing: 'border-box'
      }}>
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          width: '100%',
          maxWidth: '430px',
          boxShadow: '0 25px 60px -12px rgba(225, 29, 72, 0.35)',
          overflow: 'hidden',
          border: '1.5px solid #fecdd3',
          animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          
          {/* Header */}
          <div style={{
            padding: '18px 22px',
            borderBottom: '1px solid #ffe4e6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#fff1f2'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: '#ffe4e6',
                color: '#e11d48',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(225, 29, 72, 0.2)'
              }}>
                <ShieldOff size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#881337', letterSpacing: '-0.3px' }}>
                  Access Restricted
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#be123c', fontWeight: 600 }}>
                  Bluefy (iOS) or Parent Control Required
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowBluefyModal(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#9f1239',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            <div style={{
              backgroundColor: '#fff1f2',
              border: '1.5px solid #fda4af',
              borderRadius: '16px',
              padding: '14px 16px',
              color: '#9f1239'
            }}>
              <div style={{ fontSize: '13.5px', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={16} color="#e11d48" />
                Browser Permission Required
              </div>
              <p style={{ fontSize: '12.5px', margin: 0, lineHeight: 1.5 }}>
                Chrome and desktop access is restricted to accounts with the <strong>Parent Control</strong> tag. Other students must use the <strong>Bluefy Browser on iPhone</strong> or mark attendance in the mobile app.
              </p>
            </div>

            {/* Office Visit Callout */}
            <div style={{
              backgroundColor: '#eff6ff',
              border: '1.5px solid #bfdbfe',
              borderRadius: '14px',
              padding: '14px 16px',
              fontSize: '12.5px',
              color: '#1e40af',
              lineHeight: '1.5',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px'
            }}>
              <HelpCircle size={18} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Need access?</strong> If you need Chrome access or do not have an iPhone with Bluefy, please <strong>contact the Hostel Admin Office</strong> for Parent Control authorization or attendance marking.
              </div>
            </div>

          </div>

          {/* Footer */}
          <div style={{
            padding: '14px 22px',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            gap: '12px',
            backgroundColor: '#f8fafc'
          }}>
            <button
              type="button"
              onClick={() => setShowBluefyModal(false)}
              style={{
                flex: 1,
                height: '42px',
                borderRadius: '12px',
                border: '1.5px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#475569',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Close
            </button>
            <a
              href="https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1.3,
                height: '42px',
                borderRadius: '12px',
                backgroundColor: '#4f46e5',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 700,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)'
              }}
            >
              <ExternalLink size={15} />
              <span>Get Bluefy (iOS)</span>
            </a>
          </div>

        </div>
      </div>,
      document.body
    )}

    {/* STUDENT IDENTITY CONFIRMATION MODAL POPUP (MOUNTED DIRECTLY TO BODY VIA PORTAL) */}
    {confirmModal && confirmModal.isOpen && typeof document !== 'undefined' && createPortal(
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
        padding: '16px',
        boxSizing: 'border-box'
      }}>
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          width: '100%',
          maxWidth: '430px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
          animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          
          {/* Modal Header */}
          <div style={{
            padding: '20px 22px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#f8fafc'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: '#eef2ff',
                color: '#4f46e5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 10px rgba(79, 70, 229, 0.15)'
              }}>
                <UserCheck size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                  Confirm Your Identity
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                  Verify that this is your student account
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConfirmModal(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Modal Body */}
          <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Student Highlight Card */}
            <div style={{
              background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
              border: '1.5px solid #e2e8f0',
              borderRadius: '18px',
              padding: '20px',
              textAlign: 'center'
            }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '22px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px',
                boxShadow: '0 6px 16px rgba(79, 70, 229, 0.25)'
              }}>
                {(confirmModal.studentName || '?')[0].toUpperCase()}
              </div>

              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginBottom: '8px', letterSpacing: '-0.2px', textTransform: 'uppercase' }}>
                {confirmModal.studentName}
              </div>

              <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', fontSize: '13px', fontWeight: 700, color: '#4338ca', backgroundColor: '#eef2ff', padding: '5px 14px', borderRadius: '20px', border: '1px solid #c7d2fe' }}>
                <span>ID: {confirmModal.studentCode}</span>
                {confirmModal.room && <span>• Room: {confirmModal.room}</span>}
              </div>
            </div>

            {/* Important Notice */}
            <div style={{
              fontSize: '12.5px',
              color: '#92400e',
              backgroundColor: '#fffbeb',
              padding: '12px 14px',
              borderRadius: '12px',
              border: '1px solid #fde68a',
              lineHeight: '1.5',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px'
            }}>
              <AlertTriangle size={16} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>
                If this is <strong>not your name</strong>, click <strong>Cancel</strong> and re-enter your correct Student ID.
              </span>
            </div>

          </div>

          {/* Modal Footer */}
          <div style={{
            padding: '16px 22px',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            backgroundColor: '#f8fafc'
          }}>
            <button
              type="button"
              onClick={() => {
                setConfirmModal(null);
              }}
              disabled={isLoggingIn}
              style={{
                flex: 1,
                height: '44px',
                borderRadius: '12px',
                border: '1.5px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#475569',
                fontSize: '13.5px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease'
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={executeConfirmedLogin}
              disabled={isLoggingIn}
              style={{
                flex: 1.2,
                height: '44px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
                color: '#ffffff',
                fontSize: '13.5px',
                fontWeight: 700,
                cursor: isLoggingIn ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              {isLoggingIn ? 'Logging In...' : 'Confirm & Login'}
            </button>
          </div>

        </div>
      </div>,
      document.body
    )}
  </>
  );
};


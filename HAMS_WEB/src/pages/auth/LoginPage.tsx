import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, BadgeIcon, ShieldAlert, AlertTriangle, Smartphone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import apiClient, { getOrCreateDeviceUuid } from '../../services/apiClient';
import { HamsCard } from '../../components/HamsCard';
import { HamsButton } from '../../components/HamsButton';
import './LoginPage.css';

export const LoginPage: React.FC = () => {
  const [studentId, setStudentId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [conflictModal, setConflictModal] = useState<{
    isOpen: boolean;
    code?: string;
    message: string;
    primaryUser?: string;
    ipAddress?: string;
    boundIp?: string;
  } | null>(null);

  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
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

    try {
      const deviceUuid = getOrCreateDeviceUuid();
      const response = await apiClient.post('/auth/login', {
        username: trimmedId,
        device_uuid: deviceUuid
      });
      
      if (response.data.success) {
        const token = response.data.data.token;
        const user = response.data.data.user;
        
        if (user.role !== 'STUDENT') {
          setError('Invalid code');
          return;
        }

        login(token, user);
        navigate('/student');
      } else {
        setError(response.data.message === 'Invalid Bank Code' ? 'Invalid code' : (response.data.message || 'Invalid code'));
      }
    } catch (err: any) {
      const errCode = err.response?.data?.code;
      if (errCode === 'DEVICE_IP_CONFLICT' || errCode === 'ALREADY_ASSIGNED_PHONE' || err.response?.status === 403) {
        setConflictModal({
          isOpen: true,
          code: errCode || 'DEVICE_IP_CONFLICT',
          message: err.response?.data?.message || 'Security restriction triggered. Please contact the Admin.',
          primaryUser: err.response?.data?.primary_user || 'Another student',
          ipAddress: err.response?.data?.ip_address || '',
          boundIp: err.response?.data?.bound_ip || ''
        });
      } else if (err.response?.data?.message) {
        const msg = err.response.data.message;
        setError(msg === 'Invalid Bank Code' ? 'Invalid code' : msg);
      } else {
        setError('Invalid code');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isAlreadyAssigned = conflictModal?.code === 'ALREADY_ASSIGNED_PHONE';

  return (
    <div className="login-container">
      <div className="login-wrapper">

        <div className="logo-section">
          <div className="logo-glow">
            <Fingerprint size={48} color="white" />
          </div>
          <h1 className="logo-text">HAMS</h1>
          <p className="logo-subtext">Hostel Attendance Management</p>
        </div>

        <HamsCard padding="2rem" className="login-card">
          <h2 className="login-title">Secure Login</h2>
          <p className="login-subtitle">Enter your details to access your dashboard.</p>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleLogin} className="login-form">
            <div className="input-group">
              <label>Student ID / ID</label>
              <div className="input-wrapper">
                <BadgeIcon size={20} className="input-icon" />
                <input
                  type="text"
                  placeholder="Enter your ID (e.g., 1723)"
                  value={studentId}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStudentId(e.target.value)}
                />
              </div>
            </div>

            <HamsButton type="submit" label="Secure Login" isLoading={isLoading} style={{ width: '100%', marginTop: '1rem' }} />
          </form>
        </HamsCard>

      </div>

      {/* SECURITY / PROXY CONFLICT MODAL POPUP */}
      {conflictModal?.isOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            padding: '32px 28px',
            width: '100%',
            maxWidth: '460px',
            textAlign: 'center',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            border: '2px solid #fee2e2',
            animation: 'scaleUp 0.25s ease-out'
          }}>
            {/* Header Icon */}
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '18px',
              boxShadow: '0 8px 20px rgba(220, 38, 38, 0.2)'
            }}>
              {isAlreadyAssigned ? <Smartphone size={36} /> : <ShieldAlert size={36} />}
            </div>

            <h3 style={{ margin: '0 0 10px 0', fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>
              {isAlreadyAssigned ? 'Already Phone is Assigned' : 'Phone / Device Already Assigned'}
            </h3>

            <div style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '12px',
              padding: '14px',
              margin: '16px 0',
              textAlign: 'left',
              fontSize: '13px',
              color: '#991b1b',
              lineHeight: '1.5'
            }}>
              <div style={{ fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={15} color="#dc2626" />
                {isAlreadyAssigned ? 'Account Bound to Another Phone' : 'Multi-Account Conflict Detected'}
              </div>
              
              {isAlreadyAssigned ? (
                <div>
                  Your student account is already registered on another phone/IP: <strong style={{ color: '#0f172a' }}>{conflictModal.boundIp || 'Registered Device'}</strong>.
                </div>
              ) : (
                <div>
                  This device/network was previously bound to student: <strong style={{ color: '#0f172a' }}>{conflictModal.primaryUser}</strong>.
                </div>
              )}
              
              <div style={{ marginTop: '6px', fontSize: '12px', color: '#b91c1c' }}>
                To stop proxy attendance, each student can only log in from their designated phone.
              </div>
            </div>

            <p style={{ fontSize: '14px', fontWeight: 600, color: '#334155', margin: '0 0 24px 0' }}>
              👉 <strong>First go to the Hostel Admin</strong> to remove or reset the IP binding so you can log in.
            </p>

            <button
              onClick={() => setConflictModal(null)}
              style={{
                width: '100%',
                padding: '12px 20px',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(220, 38, 38, 0.3)',
                transition: 'all 0.2s ease'
              }}
            >
              Understood / Contact Admin
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

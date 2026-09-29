import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  Unlock, 
  Trash2, 
  Globe, 
  Search, 
  RefreshCw, 
  AlertTriangle, 
  Clock, 
  UserCheck, 
  Smartphone, 
  Lock, 
  CheckCircle2, 
  XCircle, 
  Eye, 
  RotateCcw, 
  Check, 
  Phone,
  FileText,
  X
} from 'lucide-react';
import apiClient from '../../services/apiClient';
import { HamsCard } from '../../components/HamsCard';

interface SecurityLog {
  id: number;
  ip_address: string;
  device_uuid: string | null;
  primary_student_id: number;
  primary_student_code: string;
  primary_student_name: string;
  primary_room?: string;
  primary_phone?: string;
  primary_tags?: Array<{ id: number; name: string; color: string; is_system?: boolean }>;
  attempted_student_id: number;
  attempted_student_code: string;
  attempted_student_name: string;
  attempted_room?: string;
  attempted_phone?: string;
  attempted_tags?: Array<{ id: number; name: string; color: string; is_system?: boolean }>;
  session_name?: string;
  event_type: string;
  status: 'BLOCKED' | 'AUTHORIZED_BY_ADMIN' | 'RESOLVED';
  resolved_by: string | null;
  resolved_at: string | null;
  details: string | null;
  attempted_at: string;
}

interface IpBinding {
  id: number;
  ip_address: string;
  student_id: number;
  student_code: string;
  student_name: string;
  room_number?: string;
  phone_number?: string;
  tags?: Array<{ id: number; name: string; color: string; is_system?: boolean }>;
  device_uuid: string | null;
  last_login_at: string;
  is_whitelisted: boolean | number;
}

const renderTagBadges = (tags: Array<{ id: number; name: string; color: string; is_system?: boolean }> | undefined) => {
  if (!tags || tags.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
      {tags.map((t, idx) => {
        const isIphone = t.name.toLowerCase().includes('iphone');
        const isParentControl = t.name.toLowerCase().replace(/\s+/g, '').includes('parentcontrol');
        const tagColor = t.color || (isIphone ? '#0284c7' : isParentControl ? '#8b5cf6' : '#4f46e5');
        return (
          <span
            key={t.id || t.name || idx}
            style={{
              fontSize: '10.5px',
              fontWeight: 800,
              padding: '1.5px 7px',
              borderRadius: '6px',
              backgroundColor: `${tagColor}15`,
              color: tagColor,
              border: `1px solid ${tagColor}40`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              whiteSpace: 'nowrap'
            }}
          >
            {isIphone ? '📱' : isParentControl ? '🛡️' : '🏷️'} {t.name}
          </span>
        );
      })}
    </div>
  );
};

const formatISTDateTime = (dateStr: string | null | undefined) => {
  if (!dateStr) return 'N/A';
  try {
    const s = String(dateStr).trim();
    let d: Date;
    if (s.includes('T') || s.endsWith('Z') || s.includes('+')) {
      d = new Date(s);
    } else {
      const parts = s.split(/[- :]/);
      if (parts.length >= 6) {
        d = new Date(
          parseInt(parts[0], 10),
          parseInt(parts[1], 10) - 1,
          parseInt(parts[2], 10),
          parseInt(parts[3], 10),
          parseInt(parts[4], 10),
          parseInt(parts[5], 10)
        );
      } else {
        d = new Date(s);
      }
    }

    if (isNaN(d.getTime())) return String(dateStr);

    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch (e) {
    return String(dateStr);
  }
};

export const DeviceSecurityView: React.FC = () => {
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [bindings, setBindings] = useState<IpBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'logs' | 'bindings'>('logs');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<number | string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Justification Modal State
  const [justificationModal, setJustificationModal] = useState<{
    isOpen: boolean;
    log: SecurityLog;
    description: string;
  } | null>(null);
  const [submittingJustify, setSubmittingJustify] = useState(false);

  const fetchSecurityData = async (isManual = false) => {
    setLoading(true);
    try {
      let res;
      try {
        res = await apiClient.get('/admin/security/device-logs');
      } catch (e1: any) {
        if (e1.response?.status === 404) {
          res = await apiClient.get('/security/device-logs');
        } else {
          throw e1;
        }
      }

      if (res && res.data && res.data.data) {
        setLogs(res.data.data.logs || []);
        setBindings(res.data.data.bindings || []);
      }
    } catch (err: any) {
      console.warn('Security audit fetch notice:', err?.message);
      if (isManual) {
        showNotification('error', err.response?.data?.message || err.response?.data?.error || 'Unable to load security logs. Please ensure Backend ZIP is deployed and SQL tables are imported.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityData(false);
  }, []);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleOpenJustification = (log: SecurityLog) => {
    setJustificationModal({
      isOpen: true,
      log: log,
      description: ''
    });
  };

  const handleSubmitJustification = async () => {
    if (!justificationModal) return;
    setSubmittingJustify(true);
    try {
      const res = await apiClient.post('/admin/security/authorize', {
        log_id: justificationModal.log.id,
        reason: justificationModal.description.trim()
      });
      showNotification('success', res.data.message || 'Student unblocked & authorized successfully!');
      setJustificationModal(null);
      fetchSecurityData();
    } catch (err: any) {
      showNotification('error', err.response?.data?.error || err.response?.data?.message || 'Failed to authorize student');
    } finally {
      setSubmittingJustify(false);
    }
  };

  const handleUnjustify = async (log: SecurityLog) => {
    if (!window.confirm(`Revoke justification for ${log.attempted_student_name}? This will block them again.`)) {
      return;
    }
    setActionLoading(`unjustify_${log.id}`);
    try {
      const res = await apiClient.post('/admin/security/un-justify', { log_id: log.id });
      showNotification('success', res.data.message || 'Justification revoked and student blocked');
      fetchSecurityData();
    } catch (err: any) {
      showNotification('error', err.response?.data?.message || err.response?.data?.error || 'Failed to revoke justification');
    } finally {
      setActionLoading(null);
    }
  };

  const handleClearBinding = async (studentId: number, studentName: string) => {
    if (!window.confirm(`Clear IP binding for ${studentName}? They can log in from a new device/IP.`)) {
      return;
    }
    setActionLoading(`bind_${studentId}`);
    try {
      const res = await apiClient.post('/admin/security/clear-binding', { student_id: studentId });
      showNotification('success', res.data.message || 'Binding cleared successfully!');
      fetchSecurityData();
    } catch (err: any) {
      showNotification('error', err.response?.data?.error || 'Failed to clear binding');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteLog = async (logId: number) => {
    if (!window.confirm('Delete this audit log record?')) return;
    try {
      await apiClient.delete(`/admin/security/logs/${logId}`);
      showNotification('success', 'Log record deleted');
      setLogs(prev => prev.filter(l => l.id !== logId));
    } catch (err: any) {
      showNotification('error', 'Failed to delete log');
    }
  };

  const filteredLogs = logs.filter(log => {
    const q = searchQuery.toLowerCase();
    return (
      (log.attempted_student_name || '').toLowerCase().includes(q) ||
      (log.attempted_student_code || '').toLowerCase().includes(q) ||
      (log.primary_student_name || '').toLowerCase().includes(q) ||
      (log.primary_student_code || '').toLowerCase().includes(q) ||
      (log.ip_address || '').toLowerCase().includes(q) ||
      (log.attempted_room || '').toLowerCase().includes(q)
    );
  });

  const filteredBindings = bindings.filter(bind => {
    const q = searchQuery.toLowerCase();
    return (
      (bind.student_name || '').toLowerCase().includes(q) ||
      (bind.student_code || '').toLowerCase().includes(q) ||
      (bind.ip_address || '').toLowerCase().includes(q) ||
      (bind.room_number || '').toLowerCase().includes(q)
    );
  });

  const blockedCount = logs.filter(l => l.status === 'BLOCKED').length;
  const authorizedCount = logs.filter(l => l.status === 'AUTHORIZED_BY_ADMIN' || l.status === 'RESOLVED').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      
      {/* Toast Notification */}
      {notification && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '14px 20px',
          borderRadius: '12px',
          backgroundColor: notification.type === 'success' ? '#ecfdf5' : '#fef2f2',
          border: `1.5px solid ${notification.type === 'success' ? '#10b981' : '#ef4444'}`,
          color: notification.type === 'success' ? '#065f46' : '#991b1b',
          fontSize: '14px',
          fontWeight: 600,
          boxShadow: '0 8px 20px rgba(0,0,0,0.06)'
        }}>
          {notification.type === 'success' ? <CheckCircle2 size={20} color="#10b981" /> : <XCircle size={20} color="#ef4444" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header Banner */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: '16px',
        backgroundColor: '#ffffff',
        padding: '24px 28px',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 16px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 18px rgba(239, 68, 68, 0.3)'
          }}>
            <ShieldAlert size={28} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
              Multi-Account & Proxy Security Audit
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
              Detects and prevents cross-student logins from the same device/IP to stop proxy attendance.
            </p>
          </div>
        </div>

        <button
          onClick={() => fetchSecurityData(true)}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            backgroundColor: '#f8fafc',
            color: '#334155',
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          <RefreshCw size={16} />
          Refresh Audit
        </button>
      </div>

      {/* 4 Stat Metric Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px'
      }}>
        {/* Card 1: Active IP Bindings */}
        <HamsCard padding="20px" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Active IP Bindings
              </div>
              <div style={{ fontSize: '28px', fontWeight: 900, color: '#0f172a', marginTop: '6px' }}>
                {bindings.length}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                Students bound to distinct devices
              </div>
            </div>
            <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Smartphone size={24} />
            </div>
          </div>
        </HamsCard>

        {/* Card 2: Blocked Proxy Attempts */}
        <HamsCard padding="20px" style={{ backgroundColor: '#fff5f5', border: '1.5px solid #fecaca', borderRadius: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Blocked Proxy Attempts
              </div>
              <div style={{ fontSize: '28px', fontWeight: 900, color: '#dc2626', marginTop: '6px' }}>
                {blockedCount}
              </div>
              <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '2px', fontWeight: 600 }}>
                Cross-account login attempts blocked
              </div>
            </div>
            <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldAlert size={24} />
            </div>
          </div>
        </HamsCard>

        {/* Card 3: Authorized Overrides */}
        <HamsCard padding="20px" style={{ backgroundColor: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Authorized Overrides
              </div>
              <div style={{ fontSize: '28px', fontWeight: 900, color: '#16a34a', marginTop: '6px' }}>
                {authorizedCount}
              </div>
              <div style={{ fontSize: '12px', color: '#16a34a', marginTop: '2px', fontWeight: 600 }}>
                Approved by Hostel Admin
              </div>
            </div>
            <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Unlock size={24} />
            </div>
          </div>
        </HamsCard>

        {/* Card 4: Protection Status */}
        <HamsCard padding="20px" style={{ backgroundColor: '#faf5ff', border: '1.5px solid #e9d5ff', borderRadius: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#7e22ce', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Device Security
              </div>
              <div style={{ fontSize: '20px', fontWeight: 900, color: '#6b21a8', marginTop: '6px' }}>
                STRICT ENFORCEMENT
              </div>
              <div style={{ fontSize: '12px', color: '#9333ea', marginTop: '2px', fontWeight: 600 }}>
                1 Account per Physical Device
              </div>
            </div>
            <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: '#f3e8ff', color: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={24} />
            </div>
          </div>
        </HamsCard>
      </div>

      {/* Tabs & Search Controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        {/* Navigation Tabs */}
        <div style={{
          display: 'inline-flex',
          backgroundColor: '#e2e8f0',
          padding: '4px',
          borderRadius: '12px',
          gap: '4px'
        }}>
          <button
            onClick={() => setActiveTab('logs')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 18px',
              borderRadius: '9px',
              border: 'none',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: activeTab === 'logs' ? '#ffffff' : 'transparent',
              color: activeTab === 'logs' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'logs' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
            }}
          >
            <ShieldAlert size={16} color={activeTab === 'logs' ? '#ef4444' : '#64748b'} />
            Security Conflict Logs ({logs.length})
          </button>

          <button
            onClick={() => setActiveTab('bindings')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 18px',
              borderRadius: '9px',
              border: 'none',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: activeTab === 'bindings' ? '#ffffff' : 'transparent',
              color: activeTab === 'bindings' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'bindings' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
            }}
          >
            <Globe size={16} color={activeTab === 'bindings' ? '#4f46e5' : '#64748b'} />
            Active Device & IP Bindings ({bindings.length})
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
          <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search by student, ID, IP or room..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px 10px 38px',
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
              backgroundColor: '#ffffff'
            }}
          />
        </div>
      </div>

      {/* TAB CONTENT 1: CONFLICT LOGS */}
      {activeTab === 'logs' && (
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(0,0,0,0.03)'
        }}>
          {filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#ecfdf5', color: '#10b981', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <ShieldCheck size={36} />
              </div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                No Security Conflict Logs Found
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                There are no blocked multi-account or proxy attendance attempts. Everything is secure!
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <th style={{ padding: '14px 18px' }}>Previously Bound Student</th>
                    <th style={{ padding: '14px 18px' }}>Attempted Student</th>
                    <th style={{ padding: '14px 18px' }}>IP Address & Network</th>
                    <th style={{ padding: '14px 18px' }}>Timestamp & Live Session</th>
                    <th style={{ padding: '14px 18px', textAlign: 'right' }}>Admin Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map(log => {
                    const isBlocked = log.status === 'BLOCKED';
                    return (
                      <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        
                        {/* 1. Previously Bound Student (Device Owner) */}
                        <td style={{ padding: '16px 18px', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '10px',
                              backgroundColor: '#eef2ff',
                              color: '#4f46e5',
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '14px'
                            }}>
                              {(log.primary_student_name || '?')[0].toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '13px' }}>{log.primary_student_name}</div>
                              <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                                <div>
                                  ID: <span style={{ fontWeight: 700, color: '#4f46e5' }}>{log.primary_student_code}</span> | Room: {log.primary_room || 'N/A'}
                                </div>
                                {log.primary_phone && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#059669', fontWeight: 700 }}>
                                    <Phone size={11} />
                                    <span>{log.primary_phone}</span>
                                  </div>
                                )}
                              </div>
                              {renderTagBadges(log.primary_tags)}
                            </div>
                          </div>
                        </td>

                        {/* 2. Attempted Student */}
                        <td style={{ padding: '16px 18px', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '10px',
                              backgroundColor: '#fee2e2',
                              color: '#dc2626',
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '14px'
                            }}>
                              {(log.attempted_student_name || '?')[0].toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '13px' }}>{log.attempted_student_name}</div>
                              <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                                <div>
                                  ID: <span style={{ fontWeight: 700, color: '#dc2626' }}>{log.attempted_student_code}</span> | Room: {log.attempted_room || 'N/A'}
                                </div>
                                {log.attempted_phone && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#059669', fontWeight: 700 }}>
                                    <Phone size={11} />
                                    <span>{log.attempted_phone}</span>
                                  </div>
                                )}
                              </div>
                              {renderTagBadges(log.attempted_tags)}
                            </div>
                          </div>
                        </td>

                        {/* 3. IP Address */}
                        <td style={{ padding: '16px 18px', verticalAlign: 'middle' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            backgroundColor: '#f1f5f9',
                            color: '#334155',
                            padding: '5px 10px',
                            borderRadius: '6px',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            fontWeight: 700,
                            border: '1px solid #cbd5e1'
                          }}>
                            <Globe size={13} color="#64748b" />
                            {log.ip_address}
                          </span>
                        </td>

                        {/* 4. Timestamp & Live Session */}
                        <td style={{ padding: '16px 18px', verticalAlign: 'middle', color: '#64748b', fontSize: '12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600, color: '#334155' }}>
                              <Clock size={13} color="#64748b" />
                              {formatISTDateTime(log.attempted_at)}
                            </div>
                            {log.session_name && (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                width: 'fit-content',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 800,
                                backgroundColor: '#fef3c7',
                                color: '#92400e',
                                border: '1px solid #fde68a'
                              }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }}></span>
                                {log.session_name}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 5. Action Buttons */}
                        <td style={{ padding: '16px 18px', verticalAlign: 'middle', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                            {isBlocked ? (
                              <button
                                onClick={() => handleOpenJustification(log)}
                                title="Authorize student with optional justification description"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '7px 14px',
                                  backgroundColor: '#4f46e5',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '8px',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <FileText size={13} />
                                Justification
                              </button>
                            ) : (
                              <button
                                onClick={() => handleUnjustify(log)}
                                disabled={actionLoading === `unjustify_${log.id}`}
                                title="Click to revoke justification and block student again"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  padding: '6px 12px',
                                  borderRadius: '8px',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  backgroundColor: '#ecfdf5',
                                  color: '#065f46',
                                  border: '1px solid #a7f3d0',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={e => {
                                  e.currentTarget.style.backgroundColor = '#fee2e2';
                                  e.currentTarget.style.color = '#dc2626';
                                  e.currentTarget.style.borderColor = '#fca5a5';
                                }}
                                onMouseLeave={e => {
                                  e.currentTarget.style.backgroundColor = '#ecfdf5';
                                  e.currentTarget.style.color = '#065f46';
                                  e.currentTarget.style.borderColor = '#a7f3d0';
                                }}
                              >
                                <CheckCircle2 size={13} color="#059669" />
                                {actionLoading === `unjustify_${log.id}` ? 'Revoking...' : 'Justified (Click to Un-justify)'}
                              </button>
                            )}

                            <button
                              onClick={() => handleDeleteLog(log.id)}
                              title="Delete log"
                              style={{
                                padding: '6px 8px',
                                backgroundColor: '#fef2f2',
                                color: '#dc2626',
                                border: '1px solid #fecaca',
                                borderRadius: '8px',
                                cursor: 'pointer'
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 2: ACTIVE BINDINGS */}
      {activeTab === 'bindings' && (
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(0,0,0,0.03)'
        }}>
          {filteredBindings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
              <Globe size={36} color="#94a3b8" style={{ marginBottom: '12px' }} />
              <h3 style={{ margin: '0 0 6px 0', fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                No Active IP Bindings Found
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                When students log into their portal or app, their device and IP will appear here automatically.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <th style={{ padding: '14px 18px' }}>Student Details</th>
                    <th style={{ padding: '14px 18px' }}>Bound IP Address</th>
                    <th style={{ padding: '14px 18px' }}>Room / Floor</th>
                    <th style={{ padding: '14px 18px' }}>Last Active Login</th>
                    <th style={{ padding: '14px 18px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBindings.map(bind => (
                    <tr key={bind.id || bind.student_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      
                      {/* Student */}
                      <td style={{ padding: '16px 18px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            backgroundColor: '#eef2ff',
                            color: '#4338ca',
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '13px'
                          }}>
                            {(bind.student_name || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, color: '#0f172a' }}>{bind.student_name}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              ID: <span style={{ fontWeight: 700, color: '#4f46e5' }}>{bind.student_code}</span> | Tel: {bind.phone_number || 'N/A'}
                            </div>
                            {renderTagBadges(bind.tags)}
                          </div>
                        </div>
                      </td>

                      {/* Bound IP */}
                      <td style={{ padding: '16px 18px', verticalAlign: 'middle' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          backgroundColor: '#f8fafc',
                          color: '#334155',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          fontWeight: 700,
                          border: '1px solid #cbd5e1'
                        }}>
                          <Globe size={13} color="#64748b" />
                          {bind.ip_address}
                        </span>
                      </td>

                      {/* Room */}
                      <td style={{ padding: '16px 18px', verticalAlign: 'middle', fontWeight: 600, color: '#334155' }}>
                        Room: {bind.room_number || 'Unassigned'}
                      </td>

                      {/* Last Login */}
                      <td style={{ padding: '16px 18px', verticalAlign: 'middle', color: '#64748b', fontSize: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Clock size={13} />
                          {formatISTDateTime(bind.last_login_at)}
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '16px 18px', verticalAlign: 'middle', textAlign: 'right' }}>
                        <button
                          onClick={() => handleClearBinding(bind.student_id, bind.student_name)}
                          disabled={actionLoading === `bind_${bind.student_id}`}
                          title="Unbind student device so they can log in from a new IP"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '6px 12px',
                            backgroundColor: '#fef2f2',
                            color: '#dc2626',
                            border: '1px solid #fecaca',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          <RotateCcw size={13} />
                          {actionLoading === `bind_${bind.student_id}` ? 'Clearing...' : 'Clear Binding'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* JUSTIFICATION MODAL POPUP */}
      {justificationModal && justificationModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
            border: '1px solid #e2e8f0',
            animation: 'fadeIn 0.15s ease-out'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: '#eef2ff',
                  color: '#4f46e5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <FileText size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                    Student Authorization Justification
                  </h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                    Unblock student login and log admin remarks
                  </p>
                </div>
              </div>
              <button
                onClick={() => setJustificationModal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Conflict Context Summary */}
              <div style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '14px 16px',
                fontSize: '13px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ color: '#64748b', fontWeight: 600 }}>Previously Bound Student:</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: '#4f46e5' }}>
                      {justificationModal.log.primary_student_name} ({justificationModal.log.primary_student_code})
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Room: {justificationModal.log.primary_room || 'N/A'} {justificationModal.log.primary_phone ? `• Mobile: ${justificationModal.log.primary_phone}` : ''}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ color: '#64748b', fontWeight: 600 }}>Attempted Student:</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: '#dc2626' }}>
                      {justificationModal.log.attempted_student_name} ({justificationModal.log.attempted_student_code})
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Room: {justificationModal.log.attempted_room || 'N/A'} {justificationModal.log.attempted_phone ? `• Mobile: ${justificationModal.log.attempted_phone}` : ''}
                    </div>
                  </div>
                </div>

                {justificationModal.log.session_name && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>Live Session:</span>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 800,
                      backgroundColor: '#fef3c7',
                      color: '#92400e',
                      border: '1px solid #fde68a'
                    }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }}></span>
                      {justificationModal.log.session_name}
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontWeight: 600 }}>Network IP:</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#334155' }}>
                    {justificationModal.log.ip_address}
                  </span>
                </div>
              </div>

              {/* Justification Text Area (Optional) */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#334155',
                  marginBottom: '6px'
                }}>
                  Admin Justification Description <span style={{ fontWeight: 400, color: '#94a3b8' }}>(Optional)</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="Enter justification or reason for unblocking (e.g. Device shared with permission for urgent attendance, phone repaired, etc.)..."
                  value={justificationModal.description}
                  onChange={e => setJustificationModal({
                    ...justificationModal,
                    description: e.target.value
                  })}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    lineHeight: '1.5'
                  }}
                />
              </div>

              <div style={{
                fontSize: '12px',
                color: '#64748b',
                backgroundColor: '#ecfdf5',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #a7f3d0',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <CheckCircle2 size={16} color="#059669" />
                <span>Once submitted, this student will be unblocked and permitted to log in immediately.</span>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              backgroundColor: '#f8fafc'
            }}>
              <button
                type="button"
                onClick={() => setJustificationModal(null)}
                disabled={submittingJustify}
                style={{
                  padding: '9px 18px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitJustification}
                disabled={submittingJustify}
                style={{
                  padding: '9px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#4f46e5',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: submittingJustify ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {submittingJustify ? 'Authorizing...' : 'Authorize & Unblock Student'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};


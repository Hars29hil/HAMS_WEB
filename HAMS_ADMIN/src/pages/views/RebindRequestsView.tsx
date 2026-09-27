import React, { useEffect, useState } from 'react';
import { KeyRound, RefreshCw, Clock, CheckCircle } from 'lucide-react';
import apiClient from '../../services/apiClient';
import { HamsCard } from '../../components/HamsCard';

export const RebindRequestsView: React.FC = () => {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatedCodes, setGeneratedCodes] = useState<{ [id: number]: string }>({});

  useEffect(() => {
    fetchRequests(true);

    // Live auto-polling every 3 seconds
    const interval = setInterval(() => {
      fetchRequests(false);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const fetchRequests = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const res = await apiClient.get('/admin/rebind-requests');
      if (res.data.success) {
        setRequests(res.data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  const handleGenerateCode = async (reqId: number) => {
    try {
      const res = await apiClient.post(`/admin/rebind-requests/${reqId}/generate-code`);
      if (res.data.success) {
        setGeneratedCodes(prev => ({ ...prev, [reqId]: res.data.code }));
        alert(`Generated 6-digit OTP: ${res.data.code}\n\nRead this code to the student. It expires in 10 minutes.`);
        fetchRequests(false);
      }
    } catch (e: any) {
      alert('Error generating code: ' + (e.response?.data?.message || e.message));
    }
  };

  return (
    <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Device Rebind Requests</h2>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0 0' }}>
            Live incoming device change requests & 6-digit OTP issuance
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
            Live Sync
          </span>
          <button
            onClick={() => fetchRequests(true)}
            style={{ padding: '8px 14px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <HamsCard padding="24px">
        {loading ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>Loading rebind requests...</div>
        ) : requests.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
            No pending device rebind requests at this time.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '12px' }}>Student ID</th>
                <th style={{ padding: '12px' }}>Student Name</th>
                <th style={{ padding: '12px' }}>Floor</th>
                <th style={{ padding: '12px' }}>Status</th>
                <th style={{ padding: '12px' }}>Action / Code</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px', fontWeight: 700, color: '#4f46e5' }}>{r.student_code}</td>
                  <td style={{ padding: '12px', fontWeight: 600, color: '#0f172a' }}>{r.name}</td>
                  <td style={{ padding: '12px', color: '#64748b' }}>{r.floor_name || `Floor ${r.floor_id}`}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      backgroundColor: r.status === 'code_generated' ? '#ecfdf5' : '#fffbeb',
                      color: r.status === 'code_generated' ? '#166534' : '#b45309',
                    }}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    {generatedCodes[r.id] ? (
                      <span style={{ fontSize: '18px', fontWeight: 800, color: '#4f46e5', letterSpacing: '2px' }}>
                        {generatedCodes[r.id]}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleGenerateCode(r.id)}
                        style={{
                          padding: '8px 14px',
                          backgroundColor: '#4f46e5',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <KeyRound size={14} /> Generate 6-Digit OTP
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </HamsCard>
    </div>
  );
};

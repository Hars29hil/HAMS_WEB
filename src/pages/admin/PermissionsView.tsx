import React, { useState, useEffect } from 'react';
import { SmartphoneNfc, Key, X, CheckCircle2, KeyRound } from 'lucide-react';
import { HamsCard } from '../../components/HamsCard';
import apiClient from '../../services/apiClient';
import './PermissionsView.css';

interface PermissionRequest {
  request_id: number;
  student_id: string | number;
  student_name: string;
  device_id: string;
  pin_code: string | null;
}

export const PermissionsView: React.FC = () => {
  const [requests, setRequests] = useState<PermissionRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPermissions();
    const interval = setInterval(() => {
      fetchPermissions(true);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchPermissions = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await apiClient.get('/admin/permissions');
      if (response.data.success) {
        setRequests(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching permissions:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleAction = async (id: number, action: 'reject' | 'generate-pin') => {
    try {
      const response = await apiClient.post(`/admin/permissions/${id}/${action}`);
      if (response.data.success) {
        fetchPermissions(true);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to process request.');
    }
  };

  return (
    <div className="permissions-view-container">
      <div className="header-actions">
        <div className="title-area">
          <h2>Logout Requests</h2>
          <p className="subtitle">Manage student device logout permissions and PIN codes.</p>
        </div>
      </div>

      <div className="permissions-list">
        {loading ? (
          <div className="loading-screen"><div className="spinner"></div></div>
        ) : requests.length === 0 ? (
          <div className="empty-state glass">
            <CheckCircle2 size={48} className="empty-icon" />
            <p>No pending logout requests.</p>
          </div>
        ) : (
          requests.map(request => (
            <HamsCard key={request.request_id} className="permission-card" padding="1.5rem">
              <div className="permission-card-header">
                <div className="permission-icon">
                  <SmartphoneNfc size={28} />
                </div>
                
                <div className="permission-info">
                  <h4>{request.student_name || 'Unknown Student'}</h4>
                  <p className="meta">Student ID: {request.student_id}</p>
                  <p className="meta">Device: {request.device_id}</p>
                </div>
              </div>

              {request.pin_code && (
                <div className="pin-display">
                  <Key size={20} className="pin-icon" />
                  <span className="pin-text">PIN: {request.pin_code}</span>
                </div>
              )}

              <div className="permission-actions">
                <button 
                  className="btn-outline danger"
                  onClick={() => handleAction(request.request_id, 'reject')}
                >
                  <X size={16} /> Reject
                </button>
                <button 
                  className="btn-primary success"
                  onClick={() => handleAction(request.request_id, 'generate-pin')}
                >
                  <KeyRound size={16} /> 
                  {request.pin_code ? 'Regenerate PIN' : 'Generate PIN'}
                </button>
              </div>
            </HamsCard>
          ))
        )}
      </div>
    </div>
  );
};

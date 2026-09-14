import React, { useState, useEffect } from 'react';
import { Smartphone, Key, RefreshCw, CheckCircle2, Clock } from 'lucide-react';
import { HamsCard } from '../../components/HamsCard';
import apiClient from '../../services/apiClient';
import { useAuth } from '../../context/AuthContext';
import './RebindRequestsView.css';

interface RebindRequest {
  id: number;
  student_id: number;
  student_name: string;
  floor_id: number;
  status: string;
  created_at: string;
}

export const RebindRequestsView: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<RebindRequest[]>([]);
  const [loading, setLoading] = useState(true);
  
  const floors = ['ALL', 'F00', 'F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09'];
  const [selectedFloor, setSelectedFloor] = useState('ALL');
  
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);

  const role = user?.role || 'ADMIN';
  const leaderFloorId = user?.floor_id?.toString();

  useEffect(() => {
    if (role === 'LEADER' && leaderFloorId) {
      setSelectedFloor(leaderFloorId);
    }
  }, [role, leaderFloorId]);

  useEffect(() => {
    fetchRequests();
  }, [selectedFloor]);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/admin/rebind-requests', {
        params: { floor_id: selectedFloor }
      });
      if (response.data.success) {
        setRequests(response.data.data);
      }
    } catch (err) {
      console.error('Failed to load requests', err);
    } finally {
      setLoading(false);
    }
  };

  const generateCode = async (id: number) => {
    try {
      const response = await apiClient.post(`/admin/rebind-requests/${id}/generate-code`);
      if (response.data.success) {
        const code = response.data.data.code;
        setGeneratedCode(code);
        setIsCodeModalOpen(true);
        fetchRequests();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to generate code');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="rebind-requests-container">
      <div className="header-actions">
        <div className="title-area">
          <h2>Device Rebind Requests</h2>
          <p className="subtitle">Approve device changes for students by generating temporary secure codes.</p>
        </div>

        <div className="controls-area">
          {role !== 'LEADER' && (
            <select 
              className="glass-select"
              value={selectedFloor}
              onChange={(e) => setSelectedFloor(e.target.value)}
            >
              {floors.map(floor => (
                <option key={floor} value={floor}>{floor === 'ALL' ? 'All Floors' : floor}</option>
              ))}
            </select>
          )}
          
          <button className="btn-outline" onClick={fetchRequests}>
            <RefreshCw size={18} /> Refresh
          </button>
        </div>
      </div>

      <div className="requests-list">
        {loading ? (
          <div className="loading-screen"><div className="spinner"></div></div>
        ) : requests.length === 0 ? (
          <div className="empty-state glass">
            <CheckCircle2 size={48} className="empty-icon" />
            <p>No pending requests found</p>
          </div>
        ) : (
          requests.map(req => {
            const isPending = req.status === 'PENDING';
            
            return (
              <HamsCard key={req.id} className="request-card" padding="1.5rem">
                <div className={`request-icon ${isPending ? 'pending' : 'awaiting'}`}>
                  {isPending ? <Smartphone size={24} /> : <Key size={24} />}
                </div>
                
                <div className="request-info">
                  <h4>{req.student_name || 'Unknown'}</h4>
                  <p className="meta">
                    ID: {req.student_id} &bull; Floor: {req.floor_id} &bull; Requested on: {formatDate(req.created_at)}
                  </p>
                </div>

                <div className="request-action">
                  {isPending ? (
                    <button className="btn-primary" onClick={() => generateCode(req.id)}>
                      <Key size={16} /> Generate Code
                    </button>
                  ) : (
                    <div className="status-badge awaiting">
                      <Clock size={14} /> AWAITING STUDENT
                    </div>
                  )}
                </div>
              </HamsCard>
            );
          })
        )}
      </div>

      {isCodeModalOpen && generatedCode && (
        <div className="modal-overlay blur-overlay">
          <div className="code-modal glass">
            <div className="icon-wrapper modal-icon">
              <Key size={32} />
            </div>
            
            <h3>Rebind Code Generated</h3>
            <p className="modal-desc">
              Provide this code to the student.<br/>
              It will expire in exactly 10 minutes.
            </p>

            <div className="code-display">
              {generatedCode.split('').join('  ')}
            </div>

            <button className="btn-primary w-full mt-8" onClick={() => setIsCodeModalOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

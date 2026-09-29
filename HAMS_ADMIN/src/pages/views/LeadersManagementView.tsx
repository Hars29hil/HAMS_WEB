import React, { useEffect, useState } from 'react';
import { 
  UserCheck, 
  Plus, 
  Search, 
  RefreshCw, 
  Edit2, 
  Trash2, 
  ShieldCheck, 
  Key, 
  Layers, 
  Users, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  EyeOff,
  Phone,
  Check,
  MessageSquare,
  Palmtree,
  ShieldAlert,
  RotateCcw
} from 'lucide-react';
import apiClient from '../../services/apiClient';
import { HamsCard } from '../../components/HamsCard';

interface FloorDetail {
  floor_id: number;
  floor_name: string;
  student_count: number;
}

interface Leader {
  id: number;
  username: string;
  name: string;
  phone_number?: string;
  assigned_floors: number[];
  assigned_sessions?: string[];
  session_permissions?: Record<string, 'view' | 'edit'>;
  floor_details: FloorDetail[];
  session_details?: { session_key: string; session_name: string; mode: 'view' | 'edit' }[];
  total_students: number;
  is_active: boolean;
  created_at: string;
}

export const LeadersManagementView: React.FC = () => {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [availableSessions, setAvailableSessions] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFloorFilter, setSelectedFloorFilter] = useState<string>('All');

  // Create / Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLeader, setEditingLeader] = useState<Leader | null>(null);
  const [formName, setFormName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formFloors, setFormFloors] = useState<number[]>([]);
  const [formSessions, setFormSessions] = useState<string[]>(['all']);
  const [formPermissions, setFormPermissions] = useState<Record<string, 'view' | 'edit'>>({ all: 'edit' });
  const [formActive, setFormActive] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Delete Confirm Modal State
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; leader: Leader | null }>({
    isOpen: false,
    leader: null
  });
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [leadersRes, floorsRes, sessionsRes, studentsRes] = await Promise.all([
        apiClient.get('/leaders').catch(() => ({ data: { success: true, data: [] } })),
        apiClient.get('/floors').catch(() => ({ data: { success: true, data: [] } })),
        apiClient.get('/admin/sessions').catch(() => ({ data: { success: true, data: [] } })),
        apiClient.get('/students').catch(() => ({ data: { success: true, data: [] } }))
      ]);

      if (leadersRes.data.success) {
        setLeaders(leadersRes.data.data);
      }
      if (floorsRes.data.success) {
        setFloors(floorsRes.data.data);
      }
      if (sessionsRes.data.success) {
        setAvailableSessions(sessionsRes.data.data);
      }
      if (studentsRes.data.success) {
        setStudents(studentsRes.data.data || []);
      }
    } catch (err) {
      console.error('Failed to load leaders data', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const openCreateModal = () => {
    setEditingLeader(null);
    setFormName('');
    setFormUsername('');
    setFormPassword('');
    setFormPhone('');
    setFormFloors([]);
    setFormSessions(['all']);
    setFormPermissions({
      all: 'edit',
      can_access_whatsapp: false,
      can_access_leaves: false,
      can_access_security: false,
      can_reset_ip: false
    });
    setFormActive(true);
    setShowPassword(false);
    setShowNameSuggestions(false);
    setModalError('');
    setModalOpen(true);
  };

  const openEditModal = (leader: Leader) => {
    setEditingLeader(leader);
    setFormName(leader.name);
    setFormUsername(leader.username);
    setFormPassword(''); // leave blank unless changing
    setFormPhone(leader.phone_number || '');
    setFormFloors(leader.assigned_floors || []);
    setFormSessions(leader.assigned_sessions && leader.assigned_sessions.length > 0 ? leader.assigned_sessions : ['all']);
    const rawPerms = (leader.session_permissions && Object.keys(leader.session_permissions).length > 0) ? leader.session_permissions : {};
    setFormPermissions({
      all: 'edit',
      ...rawPerms,
      can_access_whatsapp: Boolean((rawPerms as any).can_access_whatsapp),
      can_access_leaves: Boolean((rawPerms as any).can_access_leaves),
      can_access_security: Boolean((rawPerms as any).can_access_security),
      can_reset_ip: Boolean((rawPerms as any).can_reset_ip),
    });
    setFormActive(leader.is_active);
    setShowPassword(false);
    setShowNameSuggestions(false);
    setModalError('');
    setModalOpen(true);
  };

  const setSessionMode = (sessionKey: string, mode: 'view' | 'edit') => {
    setFormPermissions(prev => ({
      ...prev,
      [sessionKey]: mode
    }));
  };

  const handleSelectStudentSuggestion = (student: any) => {
    setFormName(student.name || '');
    setFormUsername(student.student_code ? String(student.student_code) : '');
    setFormPhone(student.phone_number || student.assigned_mobile || '');
    if (student.floor_id !== undefined && student.floor_id !== null && !isNaN(Number(student.floor_id))) {
      setFormFloors([Number(student.floor_id)]);
    }
    setShowNameSuggestions(false);
  };

  const toggleFloorSelection = (floorId: number) => {
    setFormFloors(prev => 
      prev.includes(floorId) 
        ? prev.filter(id => id !== floorId) 
        : [...prev, floorId].sort((a, b) => a - b)
    );
  };

  const toggleSessionSelection = (sessionKey: string) => {
    if (sessionKey === 'all') {
      setFormSessions(['all']);
      return;
    }

    setFormSessions(prev => {
      const withoutAll = prev.filter(s => s !== 'all');
      if (withoutAll.includes(sessionKey)) {
        const next = withoutAll.filter(s => s !== sessionKey);
        return next.length === 0 ? ['all'] : next;
      } else {
        return [...withoutAll, sessionKey];
      }
    });
  };

  const handleSelectAllFloors = () => {
    const allFloorIds = floors.map(f => f.floor_id);
    setFormFloors(allFloorIds);
  };

  const handleClearAllFloors = () => {
    setFormFloors([]);
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
    let generated = '';
    for (let i = 0; i < 8; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormPassword(generated);
    setShowPassword(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    if (!formName.trim()) {
      setModalError('Leader full name is required');
      return;
    }
    if (!formUsername.trim()) {
      setModalError('Leader Login ID / Username is required');
      return;
    }
    if (!editingLeader && !formPassword.trim()) {
      setModalError('Password is required for new leader');
      return;
    }
    if (formFloors.length === 0) {
      setModalError('Please select at least one assigned floor for this leader');
      return;
    }

    setSubmitting(true);
    try {
      if (editingLeader) {
        // Update Leader
        const payload: any = {
          name: formName.trim(),
          username: formUsername.trim(),
          assigned_floors: formFloors,
          assigned_sessions: formSessions,
          session_permissions: formPermissions,
          phone_number: formPhone.trim() || null,
          is_active: formActive
        };
        if (formPassword.trim()) {
          payload.password = formPassword.trim();
        }

        const res = await apiClient.put(`/leaders/${editingLeader.id}`, payload);
        if (res.data.success) {
          setModalOpen(false);
          fetchData();
        } else {
          setModalError(res.data.message || 'Failed to update leader');
        }
      } else {
        // Create Leader
        const res = await apiClient.post('/leaders', {
          name: formName.trim(),
          username: formUsername.trim(),
          password: formPassword.trim(),
          assigned_floors: formFloors,
          assigned_sessions: formSessions,
          session_permissions: formPermissions,
          phone_number: formPhone.trim() || null
        });

        if (res.data.success) {
          setModalOpen(false);
          fetchData();
        } else {
          setModalError(res.data.message || 'Failed to create leader');
        }
      }
    } catch (err: any) {
      setModalError(err.response?.data?.message || 'Server error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.leader) return;
    setDeleting(true);
    try {
      const res = await apiClient.delete(`/leaders/${deleteModal.leader.id}`);
      if (res.data.success) {
        setDeleteModal({ isOpen: false, leader: null });
        fetchData();
      } else {
        alert(res.data.message || 'Failed to delete leader');
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Server error occurred while deleting leader');
    } finally {
      setDeleting(false);
    }
  };

  // Filtering
  const filteredLeaders = leaders.filter(leader => {
    const matchesSearch = 
      leader.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      leader.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (leader.phone_number && leader.phone_number.includes(searchQuery));

    const matchesFloor = 
      selectedFloorFilter === 'All' || 
      leader.assigned_floors.includes(parseInt(selectedFloorFilter, 10));

    return matchesSearch && matchesFloor;
  });

  const totalAssignedStudents = leaders.reduce((acc, l) => acc + (l.total_students || 0), 0);
  const uniqueCoveredFloors = new Set(leaders.flatMap(l => l.assigned_floors)).size;

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header & Stats Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <HamsCard padding="20px">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total User Credentials</div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', marginTop: '6px' }}>{leaders.length}</div>
            </div>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}>
              <UserCheck size={24} />
            </div>
          </div>
        </HamsCard>

        <HamsCard padding="20px">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active User Credentials</div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#10b981', marginTop: '6px' }}>
                {leaders.filter(l => l.is_active).length}
              </div>
            </div>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
              <CheckCircle2 size={24} />
            </div>
          </div>
        </HamsCard>

        <HamsCard padding="20px">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Floors Managed</div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#8b5cf6', marginTop: '6px' }}>
                {uniqueCoveredFloors} / {floors.length || 10}
              </div>
            </div>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b5cf6' }}>
              <Layers size={24} />
            </div>
          </div>
        </HamsCard>

        <HamsCard padding="20px">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Students Under Leaders</div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#0284c7', marginTop: '6px' }}>{totalAssignedStudents}</div>
            </div>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
              <Users size={24} />
            </div>
          </div>
        </HamsCard>
      </div>

      {/* Control Toolbar */}
      <HamsCard padding="16px 20px">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Search & Filter */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', flex: 1, minWidth: '280px' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '220px', maxWidth: '400px' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search user credentials by name, username ID, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 38px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  fontSize: '14px',
                  color: '#1e293b',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Floor:</span>
              <select
                value={selectedFloorFilter}
                onChange={(e) => setSelectedFloorFilter(e.target.value)}
                style={{
                  padding: '8px 14px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#334155',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="All">All Floors</option>
                {floors.map(f => (
                  <option key={`filter_fl_${f.floor_id}`} value={f.floor_id}>
                    {f.floor_name || `Floor ${f.floor_id}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={handleRefresh}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 14px',
                backgroundColor: '#f1f5f9',
                color: '#475569',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            <button
              onClick={openCreateModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
                transition: 'all 0.2s'
              }}
            >
              <Plus size={18} />
              <span>+ Create User Credential</span>
            </button>
          </div>
        </div>
      </HamsCard>

      {/* Leaders Card Grid */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
          <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#4f46e5' }} />
          <div style={{ fontSize: '16px', fontWeight: 600 }}>Loading User Credentials...</div>
        </div>
      ) : filteredLeaders.length === 0 ? (
        <HamsCard padding="48px">
          <div style={{ textAlign: 'center', color: '#64748b' }}>
            <ShieldCheck size={48} style={{ color: '#cbd5e1', margin: '0 auto 12px auto' }} />
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', margin: '0 0 6px 0' }}>
              {searchQuery ? 'No matching user credentials found' : 'No user credentials created yet'}
            </h3>
            <p style={{ fontSize: '14px', margin: '0 0 16px 0' }}>
              {searchQuery ? 'Try adjusting your search criteria or floor filter.' : 'Create user login credentials to assign floor management, live attendance monitoring, and absentee tracking.'}
            </p>
            {!searchQuery && (
              <button
                onClick={openCreateModal}
                style={{
                  padding: '10px 20px',
                  background: '#4f46e5',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                + Create First User Credential
              </button>
            )}
          </div>
        </HamsCard>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
          {filteredLeaders.map((leader) => (
            <HamsCard key={`leader_card_${leader.id}`} padding="22px">
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between', gap: '18px' }}>
                {/* Top Section */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: '18px',
                        boxShadow: '0 4px 10px rgba(79, 70, 229, 0.2)'
                      }}>
                        {leader.name ? leader.name.charAt(0).toUpperCase() : 'L'}
                      </div>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{leader.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                          <span style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            fontFamily: 'monospace',
                            backgroundColor: '#f1f5f9',
                            color: '#475569',
                            padding: '2px 8px',
                            borderRadius: '6px'
                          }}>
                            ID: {leader.username}
                          </span>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '20px',
                            backgroundColor: leader.is_active ? '#ecfdf5' : '#fef2f2',
                            color: leader.is_active ? '#059669' : '#dc2626'
                          }}>
                            {leader.is_active ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => openEditModal(leader)}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          backgroundColor: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#475569',
                          cursor: 'pointer'
                        }}
                        title="Edit Leader"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => setDeleteModal({ isOpen: true, leader })}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          backgroundColor: '#fef2f2',
                          border: '1px solid #fee2e2',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ef4444',
                          cursor: 'pointer'
                        }}
                        title="Delete Leader"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Phone & Meta */}
                  {leader.phone_number && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b', marginTop: '12px' }}>
                      <Phone size={14} style={{ color: '#94a3b8' }} />
                      <span>{leader.phone_number}</span>
                    </div>
                  )}

                  {/* Assigned Floors Chips */}
                  <div style={{ marginTop: '14px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Assigned Floors ({leader.assigned_floors.length}):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {leader.floor_details && leader.floor_details.length > 0 ? (
                        leader.floor_details.map(fd => (
                          <span
                            key={`leader_${leader.id}_fl_${fd.floor_id}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '4px 10px',
                              backgroundColor: '#eef2ff',
                              color: '#4338ca',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: 600,
                              border: '1px solid #c7d2fe'
                            }}
                          >
                            <Layers size={12} />
                            {fd.floor_name}
                            <span style={{ fontSize: '11px', color: '#6366f1', opacity: 0.85 }}>({fd.student_count}s)</span>
                          </span>
                        ))
                      ) : (
                        leader.assigned_floors.map(fid => (
                          <span
                            key={`leader_${leader.id}_fid_${fid}`}
                            style={{
                              padding: '4px 10px',
                              backgroundColor: '#eef2ff',
                              color: '#4338ca',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: 600
                            }}
                          >
                            Floor {fid}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Assigned Sessions Chips */}
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Assigned Sessions & Permissions:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {(!leader.assigned_sessions || leader.assigned_sessions.length === 0 || leader.assigned_sessions.includes('all')) ? (
                        (() => {
                          const mode = leader.session_permissions?.['all'] || 'edit';
                          const isView = mode === 'view';
                          return (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                backgroundColor: isView ? '#eff6ff' : '#f0fdf4',
                                color: isView ? '#1d4ed8' : '#15803d',
                                border: isView ? '1px solid #bfdbfe' : '1px solid #bbf7d0',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700
                              }}
                            >
                              🌟 All Sessions ({isView ? '👁️ View Only' : '✏️ Edit'})
                            </span>
                          );
                        })()
                      ) : (
                        leader.assigned_sessions.map(sKey => {
                          const sessObj = availableSessions.find(s => s.session_key === sKey);
                          const name = sessObj ? sessObj.session_name : (sKey.charAt(0).toUpperCase() + sKey.slice(1));
                          const mode = leader.session_permissions?.[sKey] || leader.session_permissions?.['all'] || 'edit';
                          const isView = mode === 'view';
                          return (
                            <span
                              key={`leader_${leader.id}_sess_${sKey}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                backgroundColor: isView ? '#eff6ff' : '#fef3c7',
                                color: isView ? '#1d4ed8' : '#b45309',
                                border: isView ? '1px solid #bfdbfe' : '1px solid #fde68a',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700
                              }}
                            >
                              🎯 {name} ({isView ? '👁️ View Only' : '✏️ Edit'})
                            </span>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Footer Info */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '12px',
                  borderTop: '1px solid #f1f5f9',
                  fontSize: '12px',
                  color: '#64748b'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Users size={14} style={{ color: '#6366f1' }} />
                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{leader.total_students}</span> total students
                  </div>
                  <div>
                    Added {leader.created_at ? new Date(leader.created_at).toLocaleDateString() : ''}
                  </div>
                </div>
              </div>
            </HamsCard>
          ))}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {modalOpen && (
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
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px 24px',
              borderBottom: '1px solid #f1f5f9'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: '#eef2ff',
                  color: '#4f46e5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <UserCheck size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                    {editingLeader ? 'Edit User Credential' : 'Create New User Credential'}
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                    {editingLeader ? 'Update user credentials and floor responsibilities' : 'Assign multiple floors and set login ID & password'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {modalError && (
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fee2e2',
                  borderRadius: '10px',
                  color: '#ef4444',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertCircle size={16} />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Full Name with Student Autocomplete Suggestions */}
              <div style={{ position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Leader Full Name <span style={{ color: '#ef4444' }}>*</span>
                  <span style={{ fontSize: '12px', fontWeight: 400, color: '#64748b', marginLeft: '6px' }}>
                    (Type student name or ID for instant auto-fill)
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma or student ID..."
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    setShowNameSuggestions(true);
                  }}
                  onFocus={() => setShowNameSuggestions(true)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  required
                />

                {/* Suggestions dropdown */}
                {showNameSuggestions && formName.trim().length > 0 && (
                  (() => {
                    const matches = students.filter(s =>
                      (s.name && s.name.toLowerCase().includes(formName.toLowerCase())) ||
                      (s.student_code && String(s.student_code).toLowerCase().includes(formName.toLowerCase()))
                    ).slice(0, 7);

                    if (matches.length === 0) return null;

                    return (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        backgroundColor: '#ffffff',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '10px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
                        marginTop: '4px',
                        maxHeight: '220px',
                        overflowY: 'auto',
                        zIndex: 1100
                      }}>
                        <div style={{ padding: '6px 12px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 700, color: '#64748b' }}>
                          💡 MATCHING ACTIVE STUDENTS (Click to Auto-fill ID, Phone & Floor):
                        </div>
                        {matches.map(s => (
                          <div
                            key={`s_sugg_${s.student_id || s.student_code}`}
                            onClick={() => handleSelectStudentSuggestion(s)}
                            style={{
                              padding: '9px 14px',
                              cursor: 'pointer',
                              borderBottom: '1px solid #f1f5f9',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              transition: 'background-color 0.15s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#eef2ff'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                          >
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                                {s.name}
                              </div>
                              <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', gap: '8px', marginTop: '2px' }}>
                                <span style={{ fontFamily: 'monospace', color: '#4f46e5', fontWeight: 600 }}>ID: {s.student_code}</span>
                                <span>• Floor {s.floor_id !== undefined ? s.floor_id : 'N/A'} {s.room_number ? `(Rm ${s.room_number})` : ''}</span>
                                {(s.phone_number || s.assigned_mobile) && (
                                  <span>• 📞 {s.phone_number || s.assigned_mobile}</span>
                                )}
                              </div>
                            </div>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#4f46e5',
                              backgroundColor: '#eef2ff',
                              padding: '3px 8px',
                              borderRadius: '6px'
                            }}>
                              Select ↵
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                )}
              </div>

              {/* Login ID / Username & Phone */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Login ID / Username <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. leader_fl_1_2"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                      fontSize: '14px',
                      fontFamily: 'monospace',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Phone Number (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 9876543210"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                    {editingLeader ? 'Change Password (leave blank to keep current)' : 'Login Password *'}
                  </label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#4f46e5',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    🎲 Generate Password
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={editingLeader ? '••••••••' : 'Enter password'}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 40px 10px 14px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    {...(!editingLeader ? { required: true } : {})}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer'
                    }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* MULTI-FLOOR SELECTION */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                    Select Assigned Floors <span style={{ color: '#ef4444' }}>*</span>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#64748b', marginLeft: '6px' }}>
                      ({formFloors.length} selected)
                    </span>
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={handleSelectAllFloors}
                      style={{
                        background: '#f1f5f9',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#475569',
                        cursor: 'pointer'
                      }}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllFloors}
                      style={{
                        background: '#f1f5f9',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#475569',
                        cursor: 'pointer'
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                  gap: '8px',
                  maxHeight: '180px',
                  overflowY: 'auto',
                  padding: '8px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px'
                }}>
                  {floors.map(f => {
                    const isSelected = formFloors.includes(f.floor_id);
                    return (
                      <div
                        key={`modal_fl_pick_${f.floor_id}`}
                        onClick={() => toggleFloorSelection(f.floor_id)}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          backgroundColor: isSelected ? '#eef2ff' : '#ffffff',
                          border: isSelected ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                          color: isSelected ? '#4338ca' : '#475569',
                          fontWeight: isSelected ? 700 : 500,
                          fontSize: '12px',
                          transition: 'all 0.15s'
                        }}
                      >
                        <span>{f.floor_name || `Floor ${f.floor_id}`}</span>
                        {isSelected && <Check size={14} style={{ color: '#4f46e5' }} />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SESSION ACCESS SELECTION */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                    Assign Allowed Sessions <span style={{ color: '#ef4444' }}>*</span>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#64748b', marginLeft: '6px' }}>
                      ({formSessions.includes('all') ? 'All Sessions' : `${formSessions.length} selected`})
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormSessions(['all'])}
                    style={{
                      background: formSessions.includes('all') ? '#dcfce7' : '#f1f5f9',
                      border: formSessions.includes('all') ? '1px solid #86efac' : '1px solid #e2e8f0',
                      borderRadius: '6px',
                      padding: '3px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: formSessions.includes('all') ? '#15803d' : '#475569',
                      cursor: 'pointer'
                    }}
                  >
                    All Sessions (Hostel-wide)
                  </button>
                </div>

                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px 0' }}>
                  Choose which sessions this user can see and access.
                </p>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                  gap: '8px',
                  maxHeight: '160px',
                  overflowY: 'auto',
                  padding: '8px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px'
                }}>
                  <div
                    onClick={() => toggleSessionSelection('all')}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: formSessions.includes('all') ? '#dcfce7' : '#ffffff',
                      border: formSessions.includes('all') ? '2px solid #16a34a' : '1px solid #e2e8f0',
                      color: formSessions.includes('all') ? '#15803d' : '#475569',
                      fontWeight: formSessions.includes('all') ? 700 : 500,
                      fontSize: '12px',
                      transition: 'all 0.15s'
                    }}
                  >
                    <span>🌟 All Sessions</span>
                    {formSessions.includes('all') && <Check size={14} style={{ color: '#16a34a' }} />}
                  </div>

                  {availableSessions.map(sess => {
                    const isSelected = !formSessions.includes('all') && formSessions.includes(sess.session_key);
                    return (
                      <div
                        key={`modal_sess_pick_${sess.session_key}`}
                        onClick={() => toggleSessionSelection(sess.session_key)}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          backgroundColor: isSelected ? '#eef2ff' : '#ffffff',
                          border: isSelected ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                          color: isSelected ? '#4338ca' : '#475569',
                          fontWeight: isSelected ? 700 : 500,
                          fontSize: '12px',
                          transition: 'all 0.15s'
                        }}
                      >
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {sess.session_name}
                        </span>
                        {isSelected && <Check size={14} style={{ color: '#4f46e5' }} />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SESSION PERMISSION MODE (VIEW ONLY VS EDIT) */}
              <div style={{
                backgroundColor: '#f8fafc',
                border: '1.5px solid #e2e8f0',
                borderRadius: '12px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                    Access Permission Mode (View Only vs. Edit) <span style={{ color: '#ef4444' }}>*</span>
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    Configure whether this leader can mark & edit attendance or strictly view records only for their assigned floors.
                  </p>
                </div>

                {formSessions.includes('all') ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px'
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                      🌟 All Sessions Access:
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => setSessionMode('all', 'edit')}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '8px',
                          border: (formPermissions['all'] || 'edit') === 'edit' ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                          backgroundColor: (formPermissions['all'] || 'edit') === 'edit' ? '#eef2ff' : '#ffffff',
                          color: (formPermissions['all'] || 'edit') === 'edit' ? '#4338ca' : '#64748b',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setSessionMode('all', 'view')}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '8px',
                          border: formPermissions['all'] === 'view' ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                          backgroundColor: formPermissions['all'] === 'view' ? '#eff6ff' : '#ffffff',
                          color: formPermissions['all'] === 'view' ? '#1d4ed8' : '#64748b',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        👁️ View Only
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {formSessions.map(sKey => {
                      const sessObj = availableSessions.find(s => s.session_key === sKey);
                      const sName = sessObj ? sessObj.session_name : (sKey.charAt(0).toUpperCase() + sKey.slice(1));
                      const curMode = formPermissions[sKey] || formPermissions['all'] || 'edit';

                      return (
                        <div
                          key={`perm_mode_${sKey}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px'
                          }}
                        >
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                            🎯 {sName}
                          </span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => setSessionMode(sKey, 'edit')}
                              style={{
                                padding: '5px 12px',
                                borderRadius: '8px',
                                border: curMode === 'edit' ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                                backgroundColor: curMode === 'edit' ? '#eef2ff' : '#ffffff',
                                color: curMode === 'edit' ? '#4338ca' : '#64748b',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              ✏️ Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setSessionMode(sKey, 'view')}
                              style={{
                                padding: '5px 12px',
                                borderRadius: '8px',
                                border: curMode === 'view' ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                                backgroundColor: curMode === 'view' ? '#eff6ff' : '#ffffff',
                                color: curMode === 'view' ? '#1d4ed8' : '#64748b',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              👁️ View Only
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SECTION ACCESS PERMISSIONS (WHATSAPP, LEAVES, PROXY SECURITY) */}
              <div style={{
                backgroundColor: '#f8fafc',
                border: '1.5px solid #e2e8f0',
                borderRadius: '12px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                    Additional Operations & Menu Permissions
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    Configure which optional management sections are visible in this leader's menu.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                  {/* WhatsApp Messaging */}
                  <div
                    onClick={() => setFormPermissions((prev: any) => ({ ...prev, can_access_whatsapp: !prev.can_access_whatsapp }))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      backgroundColor: '#ffffff',
                      border: (formPermissions as any).can_access_whatsapp ? '2px solid #22c55e' : '1px solid #e2e8f0',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <MessageSquare size={16} color={(formPermissions as any).can_access_whatsapp ? '#16a34a' : '#64748b'} />
                      <span style={{ fontSize: '12.5px', fontWeight: (formPermissions as any).can_access_whatsapp ? 700 : 600, color: (formPermissions as any).can_access_whatsapp ? '#15803d' : '#334155' }}>
                        WhatsApp Messaging
                      </span>
                    </div>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: '6px',
                      backgroundColor: (formPermissions as any).can_access_whatsapp ? '#dcfce7' : '#f1f5f9',
                      color: (formPermissions as any).can_access_whatsapp ? '#15803d' : '#64748b'
                    }}>
                      {(formPermissions as any).can_access_whatsapp ? 'Show' : 'Hidden'}
                    </span>
                  </div>

                  {/* Approved Leaves */}
                  <div
                    onClick={() => setFormPermissions((prev: any) => ({ ...prev, can_access_leaves: !prev.can_access_leaves }))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      backgroundColor: '#ffffff',
                      border: (formPermissions as any).can_access_leaves ? '2px solid #8b5cf6' : '1px solid #e2e8f0',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Palmtree size={16} color={(formPermissions as any).can_access_leaves ? '#7c3aed' : '#64748b'} />
                      <span style={{ fontSize: '12.5px', fontWeight: (formPermissions as any).can_access_leaves ? 700 : 600, color: (formPermissions as any).can_access_leaves ? '#6d28d9' : '#334155' }}>
                        Approved Leaves
                      </span>
                    </div>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: '6px',
                      backgroundColor: (formPermissions as any).can_access_leaves ? '#f3e8ff' : '#f1f5f9',
                      color: (formPermissions as any).can_access_leaves ? '#7c3aed' : '#64748b'
                    }}>
                      {(formPermissions as any).can_access_leaves ? 'Show' : 'Hidden'}
                    </span>
                  </div>

                  {/* Proxy & IP Security */}
                  <div
                    onClick={() => setFormPermissions((prev: any) => ({ ...prev, can_access_security: !prev.can_access_security }))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      backgroundColor: '#ffffff',
                      border: (formPermissions as any).can_access_security ? '2px solid #ef4444' : '1px solid #e2e8f0',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ShieldAlert size={16} color={(formPermissions as any).can_access_security ? '#dc2626' : '#64748b'} />
                      <span style={{ fontSize: '12.5px', fontWeight: (formPermissions as any).can_access_security ? 700 : 600, color: (formPermissions as any).can_access_security ? '#b91c1c' : '#334155' }}>
                        Proxy & IP Security
                      </span>
                    </div>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: '6px',
                      backgroundColor: (formPermissions as any).can_access_security ? '#fee2e2' : '#f1f5f9',
                      color: (formPermissions as any).can_access_security ? '#dc2626' : '#64748b'
                    }}>
                      {(formPermissions as any).can_access_security ? 'Show' : 'Hidden'}
                    </span>
                  </div>

                  {/* Reset Bound IP Permission */}
                  <div
                    onClick={() => setFormPermissions((prev: any) => ({ ...prev, can_reset_ip: !prev.can_reset_ip }))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      backgroundColor: '#ffffff',
                      border: (formPermissions as any).can_reset_ip ? '2px solid #6366f1' : '1px solid #e2e8f0',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <RotateCcw size={16} color={(formPermissions as any).can_reset_ip ? '#4f46e5' : '#64748b'} />
                      <span style={{ fontSize: '12.5px', fontWeight: (formPermissions as any).can_reset_ip ? 700 : 600, color: (formPermissions as any).can_reset_ip ? '#4338ca' : '#334155' }}>
                        Reset Bound IP
                      </span>
                    </div>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: '6px',
                      backgroundColor: (formPermissions as any).can_reset_ip ? '#e0e7ff' : '#f1f5f9',
                      color: (formPermissions as any).can_reset_ip ? '#4338ca' : '#64748b'
                    }}>
                      {(formPermissions as any).can_reset_ip ? 'Show' : 'Hidden'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Active Toggle for Edit */}
              {editingLeader && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0' }}>
                  <input
                    type="checkbox"
                    id="leaderActiveCheck"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#4f46e5' }}
                  />
                  <label htmlFor="leaderActiveCheck" style={{ fontSize: '14px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                    Leader Account Active (enable login & operations)
                  </label>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={{
                    padding: '10px 18px',
                    backgroundColor: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '10px 24px',
                    background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#ffffff',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)'
                  }}
                >
                  {submitting ? 'Saving...' : editingLeader ? 'Update Leader' : 'Create Leader'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteModal.isOpen && deleteModal.leader && (
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
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '440px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: '#fef2f2',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Trash2 size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>Delete User Credential?</h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                  {deleteModal.leader.name} (ID: {deleteModal.leader.username})
                </p>
              </div>
            </div>

            <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.5, margin: '0 0 20px 0' }}>
              Are you sure you want to delete this user credential account? They will no longer be able to log in or manage their assigned floors ({deleteModal.leader.assigned_floors.join(', ')}).
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteModal({ isOpen: false, leader: null })}
                style={{
                  padding: '9px 16px',
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  padding: '9px 20px',
                  backgroundColor: '#ef4444',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#ffffff',
                  cursor: deleting ? 'not-allowed' : 'pointer'
                }}
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

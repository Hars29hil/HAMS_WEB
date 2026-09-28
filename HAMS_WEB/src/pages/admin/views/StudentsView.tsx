import React, { useEffect, useState } from 'react';
import { Search, UserPlus, RefreshCw, ChevronDown, CheckCircle2, AlertCircle, Phone, Edit2, Trash2, Info, X, RotateCcw } from 'lucide-react';
import axios from 'axios';
import apiClient from '../../../services/apiClient';
import { useAuth } from '../../../context/AuthContext';
import { HamsCard } from '../../../components/HamsCard';
import { HamsButton } from '../../../components/HamsButton';
import './StudentsView.css';

export const StudentsView: React.FC = () => {
  const { user } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFloor, setSelectedFloor] = useState<string>('All');
  const [assignmentFilter, setAssignmentFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('name-asc');
  const [mobileModal, setMobileModal] = useState<{ isOpen: boolean, studentId: string, currentMobile: string } | null>(null);
  
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addBankCode, setAddBankCode] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);

  const [assignModal, setAssignModal] = useState<{isOpen: boolean, studentId: string, currentFloor: string, currentRoom: string} | null>(null);
  const [detailsModal, setDetailsModal] = useState<any | null>(null);

  const userRole = user?.role || 'ADMIN';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [studentsRes, floorsRes] = await Promise.all([
        apiClient.get('/students'),
        apiClient.get('/floors')
      ]);
      if (studentsRes.data.success) setStudents(studentsRes.data.data);
      if (floorsRes.data.success) setFloors(floorsRes.data.data);
    } catch (err) {
      console.error('Failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  };

  const syncStudents = async () => {
    setLoading(true);
    try {
      await apiClient.post('/students/sync');
      alert('Synced successfully');
      fetchData();
    } catch (err) {
      alert('Failed to sync');
      setLoading(false);
    }
  };

  const deleteStudent = async (studentId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this student?')) return;
    try {
      await apiClient.delete(`/students/${studentId}`);
      alert('Student deleted successfully');
      fetchData();
    } catch (err) {
      alert('Failed to delete student');
    }
  };

  const resetStudentIp = async (studentId: string, studentName: string) => {
    if (!window.confirm(`Reset IP & device binding for "${studentName}"? This will allow the student to log in from a new IP/device.`)) return;
    try {
      await apiClient.post(`/api/students/${studentId}/reset-ip`);
      alert(`IP binding for ${studentName} successfully reset!`);
      fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to reset IP binding');
    }
  };

  const assignMobile = async (studentId: string, mobile: string) => {
    try {
      await apiClient.put(`/students/${studentId}/mobile`, {
        assigned_mobile: mobile || null
      });
      alert('Mobile number saved successfully!');
      fetchData();
    } catch (err) {
      alert('Error saving mobile number');
    }
  };

  const handleAddStudent = async () => {
    if (!addBankCode.trim()) return;
    setAddingStudent(true);
    try {
      const res = await axios.get(`https://api.avdvvn.org/public/getStudentBasicDetails?bankCode=${addBankCode.trim()}`, {
        headers: { 'x-hsh-auth-token': 'aF92Kx7QmN4Lp8Vz' }
      });
      if (res.data?.success && res.data.data?.length > 0) {
        const studentData = res.data.data[0];
        await apiClient.post('/students', {
          student_code: studentData.bankCode,
          name: studentData.firstName,
          phone_number: studentData.mobileNumber,
        });
        alert('Student added successfully!');
        setAddModalOpen(false);
        setAddBankCode('');
        fetchData();
      } else {
        alert('Student not found in the external database.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to add student. Ensure Student ID is correct.');
    } finally {
      setAddingStudent(false);
    }
  };

  const handleAssignFloor = async () => {
    if (!assignModal) return;
    try {
      await apiClient.put(`/students/${assignModal.studentId}/room`, {
        floor_id: assignModal.currentFloor || null,
        room_number: assignModal.currentRoom || null
      });
      alert('Assigned successfully!');
      fetchData();
      setAssignModal(null);
    } catch (err) {
      console.error(err);
      alert('Failed to assign floor/room.');
    }
  };

  const showStudentDetails = async (studentOrCode: any) => {
    const studentCode = typeof studentOrCode === 'object' && studentOrCode !== null
      ? (studentOrCode.student_code || studentOrCode.id || studentOrCode.student_id)
      : studentOrCode;

    try {
      const res = await apiClient.get(`/students/details/${studentCode}`);
      if (res.data?.success && res.data.data) {
        setDetailsModal(res.data.data);
        return;
      }
    } catch (err) {
      console.warn('Backend details API fallback to memory:', err);
    }

    // Fallback directly to student object from state if API is slow or offline
    const matched = typeof studentOrCode === 'object' && studentOrCode !== null 
      ? studentOrCode 
      : students.find(s => s.student_code === studentCode || String(s.id) === String(studentCode) || String(s.student_id) === String(studentCode));

    if (matched) {
      const nameParts = (matched.name || '').trim().split(' ');
      setDetailsModal({
        bankCode: matched.student_code || studentCode,
        name: matched.name,
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        group: 'Hostel Student',
        dateOfBirth: 'N/A',
        mobileNumber: matched.assigned_mobile || matched.phone_number || 'N/A',
        phone: matched.phone_number || 'N/A',
        parentPhone: matched.parent_phone || matched.father_phone || 'N/A',
        room: matched.room_number || 'Not Assigned',
        floor_name: matched.floor_id ? `Floor ${matched.floor_id}` : 'Unassigned',
        tags: matched.tags || []
      });
      return;
    }

    alert('Student details not found');
  };

  const filteredStudents = students.filter(s => {
    const nameMatch = (s.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const idMatch = String(s.student_code || '').toLowerCase().includes(searchQuery.toLowerCase());
    const roomMatch = String(s.room_number || '').toLowerCase().includes(searchQuery.toLowerCase());
    const isAssigned = s.floor_id != null && s.floor_id !== '';
    
    let assignMatch = true;
    if (assignmentFilter === 'Assigned') assignMatch = isAssigned;
    if (assignmentFilter === 'Unassigned') assignMatch = !isAssigned;

    let floorMatch = true;
    if (selectedFloor !== 'All') {
      floorMatch = String(s.floor_id) === selectedFloor;
    }

    return (nameMatch || idMatch || roomMatch) && assignMatch && floorMatch;
  }).sort((a, b) => {
    if (sortBy === 'name-asc') {
      return (a.name || '').localeCompare(b.name || '');
    }
    if (sortBy === 'name-desc') {
      return (b.name || '').localeCompare(a.name || '');
    }
    if (sortBy === 'room-asc') {
      const roomA = a.room_number ? String(a.room_number).trim() : '';
      const roomB = b.room_number ? String(b.room_number).trim() : '';
      if (!roomA && !roomB) return 0;
      if (!roomA) return 1;
      if (!roomB) return -1;
      const numA = parseInt(roomA.replace(/\D/g, ''), 10);
      const numB = parseInt(roomB.replace(/\D/g, ''), 10);
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
        return numA - numB;
      }
      return roomA.localeCompare(roomB, undefined, { numeric: true });
    }
    if (sortBy === 'room-desc') {
      const roomA = a.room_number ? String(a.room_number).trim() : '';
      const roomB = b.room_number ? String(b.room_number).trim() : '';
      if (!roomA && !roomB) return 0;
      if (!roomA) return 1;
      if (!roomB) return -1;
      const numA = parseInt(roomA.replace(/\D/g, ''), 10);
      const numB = parseInt(roomB.replace(/\D/g, ''), 10);
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
        return numB - numA;
      }
      return roomB.localeCompare(roomA, undefined, { numeric: true });
    }
    if (sortBy === 'id-asc') {
      const numA = parseInt(String(a.student_code || '').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(String(b.student_code || '').replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    }
    if (sortBy === 'id-desc') {
      const numA = parseInt(String(a.student_code || '').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(String(b.student_code || '').replace(/\D/g, ''), 10) || 0;
      return numB - numA;
    }
    return 0;
  });

  // Helper to calculate single tag tint or multi-tag mixed gradient styles
  const getStudentCardTagStyles = (tags: any[]) => {
    if (!tags || tags.length === 0) {
      return {
        cardStyle: {
          backgroundColor: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          transition: 'all 0.25s ease',
        },
        avatarStyle: {
          backgroundColor: '#e0e7ff',
          color: '#4338ca',
        }
      };
    }

    const tagColors = tags.map((t: any) => t.color || '#4f46e5');

    if (tagColors.length === 1) {
      const c = tagColors[0];
      return {
        cardStyle: {
          background: `linear-gradient(135deg, ${c}15 0%, var(--color-bg-elevated) 80%)`,
          border: `1.5px solid ${c}55`,
          boxShadow: `0 4px 14px ${c}18`,
          transition: 'all 0.25s ease',
        },
        avatarStyle: {
          backgroundColor: `${c}22`,
          color: c,
          border: `1.5px solid ${c}60`,
        }
      };
    }

    if (tagColors.length === 2) {
      const [c1, c2] = tagColors;
      return {
        cardStyle: {
          background: `linear-gradient(135deg, ${c1}18 0%, ${c2}18 100%)`,
          border: `1.5px solid ${c1}50`,
          boxShadow: `0 4px 16px ${c1}15, 0 2px 8px ${c2}15`,
          transition: 'all 0.25s ease',
        },
        avatarStyle: {
          background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
          color: '#ffffff',
          boxShadow: `0 2px 8px ${c1}40`,
        }
      };
    }

    // 3 or more tags -> mixed tri-color gradient
    const [c1, c2, c3] = tagColors;
    return {
      cardStyle: {
        background: `linear-gradient(135deg, ${c1}18 0%, ${c2}15 50%, ${c3 || c1}18 100%)`,
        border: `1.5px solid ${c1}50`,
        boxShadow: `0 4px 16px ${c1}15, 0 2px 8px ${c3 || c2}15`,
        transition: 'all 0.25s ease',
      },
      avatarStyle: {
        background: `linear-gradient(135deg, ${c1} 0%, ${c2} 50%, ${c3 || c1} 100%)`,
        color: '#ffffff',
        boxShadow: `0 2px 8px ${c1}40`,
      }
    };
  };

  return (
    <div className="students-view-container">
      <div className="students-view-header">
        <div>
          <h2>Student Directory</h2>
          <p>Manage {filteredStudents.length} students, assign floors, and sync from central database.</p>
        </div>
        <div className="header-actions">
          <HamsButton label="Add Student" icon={UserPlus} onClick={() => setAddModalOpen(true)} />
        </div>
      </div>

      <div className="filters-row">
        <div className="search-box">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search students by name..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {userRole !== 'LEADER' && (
          <>
            <div className="select-wrapper">
              <select value={selectedFloor} onChange={e => setSelectedFloor(e.target.value)}>
                <option value="All">All Floors</option>
                {floors.map(f => (
                  <option key={f.floor_id} value={String(f.floor_id)}>{f.name}</option>
                ))}
              </select>
              <ChevronDown size={16} className="select-icon" />
            </div>

            <div className="select-wrapper">
              <select value={assignmentFilter} onChange={e => setAssignmentFilter(e.target.value)}>
                <option value="All">All Students</option>
                <option value="Assigned">Assigned Only</option>
                <option value="Unassigned">Unassigned Only</option>
              </select>
              <ChevronDown size={16} className="select-icon" />
            </div>

            <div className="select-wrapper">
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="name-asc">Sort: Name (A to Z)</option>
                <option value="name-desc">Sort: Name (Z to A)</option>
                <option value="room-asc">Sort: Room (Low to High)</option>
                <option value="room-desc">Sort: Room (High to Low)</option>
                <option value="id-asc">Sort: Student ID (Asc)</option>
                <option value="id-desc">Sort: Student ID (Desc)</option>
              </select>
              <ChevronDown size={16} className="select-icon" />
            </div>
          </>
        )}

        <button className="sync-btn" onClick={syncStudents}>
          <RefreshCw size={18} />
          Sync Database
        </button>
      </div>

      {loading ? (
        <div className="loading-state">Loading students...</div>
      ) : (
        <div className="students-list">
          {filteredStudents.map(student => {
            const isAssigned = student.floor_id != null;
            const { cardStyle, avatarStyle } = getStudentCardTagStyles(student.tags || []);
            return (
              <HamsCard key={student.student_id} className="student-card" padding="20px" style={cardStyle}>
                <div className="student-card-content">
                  <div className="student-avatar" style={avatarStyle}>
                    {(student.name || '?')[0].toUpperCase()}
                  </div>
                  <div className="student-info">
                    <h4>{student.name}</h4>
                    <p>ID: {student.student_code || 'Unknown'}</p>
                    <p>Mobile: {student.assigned_mobile || student.phone_number || 'Unassigned'}</p>
                    <p>Parent: {student.parent_phone || student.father_phone || student.mother_phone || 'None'}</p>
                  </div>
                  
                  <div className={`status-badge ${isAssigned ? 'assigned' : 'unassigned'}`}>
                    {isAssigned ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    {isAssigned ? `Floor ${student.floor_id}` : 'Unassigned'}
                  </div>

                  <div className="student-actions">
                    <button className="action-btn" onClick={() => {
                      setMobileModal({ isOpen: true, studentId: student.student_id, currentMobile: student.assigned_mobile || '' });
                    }}>
                      <Phone size={16} /> Assign Mobile
                    </button>
                    {userRole !== 'LEADER' && (
                      <>
                        <button className="action-btn" onClick={() => setAssignModal({isOpen: true, studentId: student.student_id, currentFloor: String(student.floor_id || ''), currentRoom: student.room_number || ''})}>
                          <Edit2 size={16} /> Assign
                        </button>
                        <button className="action-btn" onClick={() => showStudentDetails(student)}>
                          <Info size={16} /> Details
                        </button>
                        <button className="action-btn" title="Reset IP binding" onClick={() => resetStudentIp(student.student_id, student.name)}>
                          <RotateCcw size={16} /> Reset IP
                        </button>
                        <button className="action-btn delete" onClick={() => deleteStudent(student.student_id)}>
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </HamsCard>
            );
          })}
        </div>
      )}

      {mobileModal?.isOpen && (
        <div className="custom-modal-overlay">
          <div className="custom-modal">
            <h3>Assign Mobile Number</h3>
            <p>Enter the mobile number for this student.</p>
            <input 
              type="text" 
              value={mobileModal.currentMobile}
              onChange={(e) => setMobileModal({ ...mobileModal, currentMobile: e.target.value })}
              placeholder="e.g. 9876543210"
              autoFocus
            />
            <div className="custom-modal-actions">
              <button className="btn-cancel" onClick={() => setMobileModal(null)}>Cancel</button>
              <button className="btn-save" onClick={() => {
                assignMobile(mobileModal.studentId, mobileModal.currentMobile);
                setMobileModal(null);
              }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {addModalOpen && (
        <div className="custom-modal-overlay">
          <div className="custom-modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>Add Student</h3>
              <X size={20} style={{ cursor: 'pointer' }} onClick={() => setAddModalOpen(false)} />
            </div>
            <p>Enter the student's ID to fetch and add them to the system.</p>
            <input 
              type="text" 
              value={addBankCode}
              onChange={(e) => setAddBankCode(e.target.value)}
              placeholder="e.g. 12345"
              autoFocus
            />
            <div className="custom-modal-actions">
              <button className="btn-cancel" onClick={() => setAddModalOpen(false)}>Cancel</button>
              <button className="btn-save" onClick={handleAddStudent} disabled={addingStudent}>
                {addingStudent ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {assignModal?.isOpen && (
        <div className="custom-modal-overlay">
          <div className="custom-modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>Assign Floor & Room</h3>
              <X size={20} style={{ cursor: 'pointer' }} onClick={() => setAssignModal(null)} />
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: 'var(--color-text-muted)' }}>Floor</label>
              <select 
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-elevated)', color: 'var(--color-text)' }}
                value={assignModal.currentFloor} 
                onChange={e => setAssignModal({...assignModal, currentFloor: e.target.value})}
              >
                <option value="">Select Floor</option>
                {floors.map(f => (
                  <option key={f.floor_id} value={String(f.floor_id)}>{f.name}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: 'var(--color-text-muted)' }}>Room Number</label>
              <input 
                type="text" 
                value={assignModal.currentRoom}
                onChange={e => setAssignModal({...assignModal, currentRoom: e.target.value})}
                placeholder="e.g. 101"
              />
            </div>
            <div className="custom-modal-actions">
              <button className="btn-cancel" onClick={() => setAssignModal(null)}>Cancel</button>
              <button className="btn-save" onClick={handleAssignFloor}>Save</button>
            </div>
          </div>
        </div>
      )}

      {detailsModal && (
        <div className="custom-modal-overlay">
          <div className="custom-modal" style={{ maxWidth: '440px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>Student Profile</h3>
              <X size={20} style={{ cursor: 'pointer' }} onClick={() => setDetailsModal(null)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px', fontSize: '14px', color: '#334155' }}>
              <strong>Name:</strong> <span>{detailsModal.name || `${detailsModal.firstName || ''} ${detailsModal.lastName || ''}`.trim()}</span>
              <strong>ID / Code:</strong> <span style={{ color: '#4f46e5', fontWeight: 700 }}>{detailsModal.bankCode}</span>
              <strong>Room:</strong> <span>{detailsModal.room || detailsModal.room_number || 'Not Assigned'}</span>
              <strong>Floor:</strong> <span>{detailsModal.floor_name || (detailsModal.floor_id ? `Floor ${detailsModal.floor_id}` : 'Unassigned')}</span>
              <strong>Mobile:</strong> <span>{detailsModal.mobileNumber || detailsModal.phone || 'N/A'}</span>
              {detailsModal.parentPhone && detailsModal.parentPhone !== 'N/A' && (
                <>
                  <strong>Parent Phone:</strong> <span>{detailsModal.parentPhone}</span>
                </>
              )}
              <strong>Group:</strong> <span>{detailsModal.group || 'Hostel Student'}</span>
              {detailsModal.dateOfBirth && detailsModal.dateOfBirth !== 'N/A' && (
                <>
                  <strong>DOB:</strong> <span>{detailsModal.dateOfBirth}</span>
                </>
              )}
              {detailsModal.emailId && detailsModal.emailId !== 'N/A' && (
                <>
                  <strong>Email:</strong> <span>{detailsModal.emailId}</span>
                </>
              )}
              {detailsModal.city && detailsModal.city !== 'N/A' && (
                <>
                  <strong>City:</strong> <span>{detailsModal.city}</span>
                </>
              )}
            </div>
            {detailsModal.tags && detailsModal.tags.length > 0 && (
              <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                <strong style={{ fontSize: '13px', color: '#64748b', display: 'block', marginBottom: '6px' }}>Assigned Tags:</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {detailsModal.tags.map((t: any) => (
                    <span key={t.id || t.name} style={{ backgroundColor: `${t.color || '#4f46e5'}15`, color: t.color || '#4f46e5', border: `1px solid ${t.color || '#4f46e5'}40`, borderRadius: '6px', padding: '2px 8px', fontSize: '12px', fontWeight: 700 }}>
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

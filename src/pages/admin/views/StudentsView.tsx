import React, { useEffect, useState } from 'react';
import { Search, UserPlus, RefreshCw, ChevronDown, CheckCircle2, AlertCircle, Phone, Edit2, Trash2, Info, X } from 'lucide-react';
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
      alert('Failed to add student. Ensure bank code is correct.');
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

  const showStudentDetails = async (bankCode: string) => {
    try {
      const res = await axios.get(`https://api.avdvvn.org/public/getStudentBasicDetails?bankCode=${bankCode}`, {
        headers: { 'x-hsh-auth-token': 'aF92Kx7QmN4Lp8Vz' }
      });
      if (res.data?.success && res.data.data?.length > 0) {
        setDetailsModal(res.data.data[0]);
      } else {
        alert('Details not found');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to load student details');
    }
  };

  const filteredStudents = students.filter(s => {
    const nameMatch = (s.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const isAssigned = s.floor_id != null && s.floor_id !== '';
    
    let assignMatch = true;
    if (assignmentFilter === 'Assigned') assignMatch = isAssigned;
    if (assignmentFilter === 'Unassigned') assignMatch = !isAssigned;

    let floorMatch = true;
    if (selectedFloor !== 'All') {
      floorMatch = String(s.floor_id) === selectedFloor;
    }

    return nameMatch && assignMatch && floorMatch;
  });

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
            return (
              <HamsCard key={student.student_id} className="student-card" padding="20px">
                <div className="student-card-content">
                  <div className="student-avatar">
                    {(student.name || '?')[0].toUpperCase()}
                  </div>
                  <div className="student-info">
                    <h4>{student.name}</h4>
                    <p>Bank Code: {student.student_code || 'Unknown'}</p>
                    <p>Mobile: {student.assigned_mobile || 'Unassigned'}</p>
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
                        <button className="action-btn" onClick={() => showStudentDetails(student.student_code)}>
                          <Info size={16} /> Details
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
            <p>Enter the student's Bank Code to fetch and add them to the system.</p>
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
          <div className="custom-modal" style={{ maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>Student Details</h3>
              <X size={20} style={{ cursor: 'pointer' }} onClick={() => setDetailsModal(null)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px', fontSize: '14px' }}>
              <strong>Name:</strong> <span>{detailsModal.firstName} {detailsModal.lastName}</span>
              <strong>Bank Code:</strong> <span>{detailsModal.bankCode}</span>
              <strong>Group:</strong> <span>{detailsModal.group}</span>
              <strong>DOB:</strong> <span>{detailsModal.dateOfBirth}</span>
              <strong>Mobile:</strong> <span>{detailsModal.mobileNumber}</span>
              <strong>Email:</strong> <span>{detailsModal.emailId}</span>
              <strong>City:</strong> <span>{detailsModal.city}</span>
              <strong>State:</strong> <span>{detailsModal.state}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

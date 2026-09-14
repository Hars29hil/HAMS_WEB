import React, { useState, useEffect } from 'react';
import { Search, UserPlus, RefreshCw, Trash2, Edit2, Phone, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { HamsCard } from '../../components/HamsCard';
import apiClient from '../../services/apiClient';
import { useAuth } from '../../context/AuthContext';
import './StudentsView.css';
import axios from 'axios';

interface Student {
  student_id: number;
  name: string;
  student_code: string;
  floor_id: number | null;
  assigned_mobile: string | null;
  room_number?: string;
}

interface Floor {
  floor_id: number;
  name: string;
}

export const StudentsView: React.FC = () => {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFloorFilter, setSelectedFloorFilter] = useState<string>('All');
  const [assignmentFilter, setAssignmentFilter] = useState<string>('All'); // 'All', 'Assigned', 'Unassigned'
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals state
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<string>('');
  const [mobileInput, setMobileInput] = useState('');
  
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentCode, setNewStudentCode] = useState('');
  const [newStudentFloor, setNewStudentFloor] = useState('');

  const [studentDetails, setStudentDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const role = user?.role || 'ADMIN';
  const leaderFloorId = user?.floor_id?.toString();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [studentsRes, floorsRes] = await Promise.all([
        apiClient.get(`/students?_t=${Date.now()}`),
        apiClient.get('/floors')
      ]);
      
      if (studentsRes.data.success) setStudents(studentsRes.data.data);
      if (floorsRes.data.success) setFloors(floorsRes.data.data);
    } catch (err: any) {
      setError('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      const res = await apiClient.post('/students/sync');
      if (res.data.success) {
        alert(res.data.message || 'Synced successfully');
        fetchData();
      }
    } catch (err: any) {
      alert('Failed to sync: ' + err.message);
    }
  };

  const handleAssignFloor = async () => {
    if (!selectedStudent) return;
    try {
      await apiClient.put(`/students/${selectedStudent.student_id}/room`, {
        floor_id: selectedFloorId ? parseInt(selectedFloorId) : null,
        room_id: null
      });
      setIsAssignModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Failed to assign floor');
    }
  };

  const handleAssignMobile = async () => {
    if (!selectedStudent) return;
    try {
      await apiClient.put(`/students/${selectedStudent.student_id}/mobile`, {
        assigned_mobile: mobileInput || null
      });
      setIsMobileModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Failed to assign mobile');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to permanently delete this student?')) return;
    try {
      await apiClient.delete(`/students/${id}`);
      fetchData();
    } catch (err: any) {
      alert('Failed to delete student');
    }
  };

  const handleAddStudent = async () => {
    if (!newStudentName || !newStudentCode || !newStudentFloor) {
      alert('Name, Bank Code, and Floor are required.');
      return;
    }
    try {
      await apiClient.post('/students', {
        name: newStudentName,
        student_code: newStudentCode,
        floor_id: parseInt(newStudentFloor)
      });
      setIsAddModalOpen(false);
      setNewStudentName('');
      setNewStudentCode('');
      setNewStudentFloor('');
      fetchData();
    } catch (err: any) {
      alert('Error adding student');
    }
  };

  const showStudentDetails = async (student: Student) => {
    setSelectedStudent(student);
    setIsDetailsModalOpen(true);
    setLoadingDetails(true);
    setStudentDetails(null);
    try {
      const res = await axios.get('https://api.avdvvn.org/public/getStudentBasicDetails', {
        headers: { 'x-hsh-auth-token': 'aF92Kx7QmN4Lp8Vz' }
      });
      if (res.data && res.data.data) {
        const sBankCode = student.student_code.replace(/^0+/, '');
        const match = res.data.data.find((s: any) => String(s.bankCode).replace(/^0+/, '') === sBankCode);
        if (match) {
          setStudentDetails(match);
        }
      }
    } catch (err) {
      console.error('Error fetching student API details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const filteredStudents = students.filter(s => {
    const nameMatch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    const isAssigned = s.floor_id !== null;
    let assignmentMatch = true;
    if (assignmentFilter === 'Assigned') assignmentMatch = isAssigned;
    if (assignmentFilter === 'Unassigned') assignmentMatch = !isAssigned;

    let floorMatch = true;
    if (role === 'LEADER' && leaderFloorId) {
      floorMatch = s.floor_id?.toString() === leaderFloorId;
    } else if (selectedFloorFilter !== 'All') {
      floorMatch = s.floor_id?.toString() === selectedFloorFilter;
    }

    return nameMatch && assignmentMatch && floorMatch;
  });

  if (loading && students.length === 0) {
    return <div className="loading-screen"><div className="spinner"></div></div>;
  }

  return (
    <div className="students-container">
      <div className="header-actions">
        <div className="title-area">
          <h2>Student Directory</h2>
          <p className="subtitle">Manage {filteredStudents.length} students, assign floors, and sync from central database.</p>
        </div>
        <button className="btn-primary" onClick={() => {
          if (role === 'LEADER' && leaderFloorId) setNewStudentFloor(leaderFloorId);
          setIsAddModalOpen(true);
        }}>
          <UserPlus size={18} /> Add Student
        </button>
      </div>

      <div className="filters-bar glass">
        <div className="search-input">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search students by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {role !== 'LEADER' && (
          <select 
            value={selectedFloorFilter} 
            onChange={(e) => setSelectedFloorFilter(e.target.value)}
            className="filter-select"
          >
            <option value="All">All Floors</option>
            {floors.map(f => (
              <option key={f.floor_id} value={f.floor_id.toString()}>{f.name}</option>
            ))}
          </select>
        )}

        {role !== 'LEADER' && (
          <select 
            value={assignmentFilter} 
            onChange={(e) => setAssignmentFilter(e.target.value)}
            className="filter-select"
          >
            <option value="All">All Students</option>
            <option value="Assigned">Assigned Only</option>
            <option value="Unassigned">Unassigned Only</option>
          </select>
        )}

        <button className="btn-outline ml-auto" onClick={handleSync}>
          <RefreshCw size={18} /> Sync Database
        </button>
      </div>

      <div className="students-list">
        {filteredStudents.map(student => (
          <HamsCard key={student.student_id} className="student-row" padding="1.5rem">
            <div className="student-info" onClick={() => showStudentDetails(student)}>
              <div className="student-avatar">
                {student.name.charAt(0).toUpperCase()}
              </div>
              <div className="student-details-preview">
                <h4>{student.name}</h4>
                <span className="meta">Bank Code: {student.student_code}</span>
                <span className="meta">Mobile: {student.assigned_mobile || 'Unassigned'}</span>
              </div>
            </div>

            <div className="student-status">
              {student.floor_id ? (
                <div className="badge success">
                  <CheckCircle size={14} /> Floor {student.floor_id}
                </div>
              ) : (
                <div className="badge warning">
                  <AlertCircle size={14} /> Unassigned
                </div>
              )}
            </div>

            <div className="student-actions">
              <button className="action-btn" onClick={(e) => {
                e.stopPropagation();
                setSelectedStudent(student);
                setMobileInput(student.assigned_mobile || '');
                setIsMobileModalOpen(true);
              }}>
                <Phone size={16} /> Assign Mobile
              </button>
              
              {role !== 'LEADER' && (
                <>
                  <button className="action-btn" onClick={(e) => {
                    e.stopPropagation();
                    setSelectedStudent(student);
                    setSelectedFloorId(student.floor_id?.toString() || '');
                    setIsAssignModalOpen(true);
                  }}>
                    <Edit2 size={16} /> Assign
                  </button>
                  <button className="action-btn danger" onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(student.student_id);
                  }}>
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          </HamsCard>
        ))}
      </div>

      {/* Assign Floor Modal */}
      {isAssignModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content glass">
            <h3>Assign Floor</h3>
            <p>Student: {selectedStudent?.name}</p>
            <div className="form-group mt-4">
              <label>Select Floor</label>
              <select 
                value={selectedFloorId} 
                onChange={e => setSelectedFloorId(e.target.value)}
                className="glass-input w-full"
              >
                <option value="">Unassigned</option>
                {floors.map(f => (
                  <option key={f.floor_id} value={f.floor_id.toString()}>{f.name}</option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setIsAssignModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleAssignFloor}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Mobile Modal */}
      {isMobileModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content glass">
            <h3>Assign Mobile</h3>
            <p>Student: {selectedStudent?.name}</p>
            <div className="form-group mt-4">
              <label>Mobile Number</label>
              <input 
                type="text" 
                value={mobileInput}
                onChange={e => setMobileInput(e.target.value)}
                placeholder="Enter 10 digit number"
                className="glass-input w-full"
              />
            </div>
            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setIsMobileModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleAssignMobile}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {isAddModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content glass">
            <h3>Add Student manually</h3>
            <div className="form-group mt-4">
              <label>Name</label>
              <input type="text" value={newStudentName} onChange={e => setNewStudentName(e.target.value)} className="glass-input w-full" />
            </div>
            <div className="form-group mt-4">
              <label>Bank Code</label>
              <input type="text" value={newStudentCode} onChange={e => setNewStudentCode(e.target.value)} className="glass-input w-full" />
            </div>
            <div className="form-group mt-4">
              <label>Floor</label>
              <select value={newStudentFloor} onChange={e => setNewStudentFloor(e.target.value)} className="glass-input w-full" disabled={role === 'LEADER'}>
                <option value="">Select Floor</option>
                {floors.map(f => (
                  <option key={f.floor_id} value={f.floor_id.toString()}>{f.name}</option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setIsAddModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleAddStudent}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Student Details Modal */}
      {isDetailsModalOpen && (
        <div className="modal-overlay" onClick={() => setIsDetailsModalOpen(false)}>
          <div className="modal-content glass" onClick={e => e.stopPropagation()}>
            <h3>{selectedStudent?.name || 'Student Details'}</h3>
            <div className="details-grid mt-4">
              <div className="detail-row">
                <span className="label">Bank Code:</span>
                <span className="value">{selectedStudent?.student_code}</span>
              </div>
              <div className="detail-row">
                <span className="label">Room Number:</span>
                <span className="value">{selectedStudent?.room_number || 'Not Assigned'}</span>
              </div>
              <div className="detail-row">
                <span className="label">Floor Assigned:</span>
                <span className="value">{selectedStudent?.floor_id || 'Unassigned'}</span>
              </div>
              <div className="detail-row">
                <span className="label">App Mobile:</span>
                <span className="value">{selectedStudent?.assigned_mobile || 'Unassigned'}</span>
              </div>
            </div>
            
            <h4 className="mt-6 mb-2 border-b border-[var(--color-border)] pb-2">API Details</h4>
            {loadingDetails ? (
              <div className="p-4 text-center text-sm text-[var(--color-text-muted)]">Loading details from central API...</div>
            ) : studentDetails ? (
              <div className="details-grid">
                <div className="detail-row">
                  <span className="label">Group:</span>
                  <span className="value">{studentDetails.groupName}</span>
                </div>
                <div className="detail-row">
                  <span className="label">DOB:</span>
                  <span className="value">{studentDetails.dob}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Email:</span>
                  <span className="value">{studentDetails.email}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Phone:</span>
                  <span className="value">{studentDetails.phone}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Aadhar:</span>
                  <span className="value">{studentDetails.aadhar}</span>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-sm text-[var(--color-text-muted)]">No additional details found in API</div>
            )}
            
            <div className="modal-actions mt-6">
              <button className="btn-outline w-full" onClick={() => setIsDetailsModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

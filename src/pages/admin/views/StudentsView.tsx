import React, { useEffect, useState } from 'react';
import { Search, UserPlus, RefreshCw, ChevronDown, CheckCircle2, AlertCircle, Phone, Edit2, Trash2 } from 'lucide-react';
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
          <HamsButton label="Add Student" icon={UserPlus} onClick={() => alert('Add Student Modal TBD')} />
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
                      const m = window.prompt("Enter mobile number:", student.assigned_mobile || '');
                      if (m !== null) assignMobile(student.student_id, m);
                    }}>
                      <Phone size={16} /> Assign Mobile
                    </button>
                    {userRole !== 'LEADER' && (
                      <>
                        <button className="action-btn" onClick={() => alert('Assign Floor Modal TBD')}>
                          <Edit2 size={16} /> Assign
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
    </div>
  );
};

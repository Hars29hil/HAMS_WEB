import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, UserCheck, XCircle } from 'lucide-react';
import { HamsCard } from '../../components/HamsCard';
import apiClient from '../../services/apiClient';
import './ManualAttendanceView.css';

interface Session {
  session_key: string;
  session_name: string;
}

interface FetchedStudent {
  bankCode: string | number;
  firstName: string;
  lastName: string;
  room: string;
  groupName: string;
}

export const ManualAttendanceView: React.FC = () => {
  const [bankCode, setBankCode] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  
  const [fetchedStudent, setFetchedStudent] = useState<FetchedStudent | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [fetchingStudent, setFetchingStudent] = useState(false);
  
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const res = await apiClient.get('/students/sessions');
      if (res.data.success) {
        setSessions(res.data.data);
        if (res.data.data.length > 0) {
          setSelectedSession(res.data.data[0].session_key);
        }
      }
    } catch (err) {
      console.error('Failed to load sessions', err);
    }
  };

  const fetchStudent = async () => {
    if (!bankCode.trim()) {
      setError('Please enter a bank code');
      return;
    }
    setError('');
    setSuccessMsg('');
    setFetchingStudent(true);
    setFetchedStudent(null);

    try {
      const res = await axios.get('https://api.avdvvn.org/public/getStudentBasicDetails', {
        headers: { 'x-hsh-auth-token': 'aF92Kx7QmN4Lp8Vz' }
      });
      
      if (res.data && res.data.data) {
        const students = res.data.data as FetchedStudent[];
        const searchCode = bankCode.trim();
        const match = students.find(s => 
          String(s.bankCode) === searchCode || 
          String(s.bankCode).padStart(5, '0') === searchCode.padStart(5, '0')
        );

        if (match) {
          setFetchedStudent(match);
        } else {
          setError('Student not found with this bank code');
        }
      }
    } catch (err) {
      setError('Error fetching student details');
    } finally {
      setFetchingStudent(false);
    }
  };

  const markAttendance = async () => {
    const code = fetchedStudent ? String(fetchedStudent.bankCode) : bankCode.trim();
    if (!code) {
      setError('Please enter a bank code');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const data = {
        bank_code: code,
        student_name: fetchedStudent ? `${fetchedStudent.firstName || ''} ${fetchedStudent.lastName || ''}`.trim() : '',
        room: fetchedStudent ? String(fetchedStudent.room || '') : '',
        session_key: selectedSession
      };

      const res = await apiClient.post('/attendance/manual-mark', data);

      if (res.data.success) {
        setSuccessMsg(res.data.message || 'Attendance marked successfully');
        setBankCode('');
        setFetchedStudent(null);
      } else {
        setError(res.data.message || 'Failed to mark attendance');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Error marking attendance');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (!fetchedStudent) {
        fetchStudent();
      } else {
        markAttendance();
      }
    }
  };

  return (
    <div className="manual-attendance-container">
      <header className="page-header">
        <h2>Manual Attendance</h2>
        <p className="subtitle">Mark attendance manually for a specific student.</p>
      </header>

      {error && <div className="alert error">{error}</div>}
      {successMsg && <div className="alert success">{successMsg}</div>}

      <div className="manual-content">
        <HamsCard padding="2.5rem" className="manual-card mx-auto max-w-lg">
          <div className="form-group">
            <label>Select Session</label>
            <select 
              value={selectedSession} 
              onChange={e => setSelectedSession(e.target.value)}
              className="glass-input w-full"
            >
              {sessions.map(s => (
                <option key={s.session_key} value={s.session_key}>{s.session_name}</option>
              ))}
            </select>
          </div>

          <div className="form-group mt-6">
            <label>Bank Code (e.g., 36001)</label>
            <div className="search-input-wrapper">
              <input 
                type="text" 
                value={bankCode}
                onChange={e => {
                  setBankCode(e.target.value);
                  if (fetchedStudent) setFetchedStudent(null);
                }}
                onKeyDown={handleKeyPress}
                className="glass-input w-full pl-12"
                placeholder="Enter bank code..."
              />
              <Search className="search-icon" size={20} />
            </div>
          </div>

          {fetchedStudent && (
            <div className="student-preview-card glass mt-6">
              <div className="student-header">
                <div className="avatar">
                  {fetchedStudent.firstName.charAt(0)}{fetchedStudent.lastName.charAt(0)}
                </div>
                <div className="info">
                  <h3>{fetchedStudent.firstName} {fetchedStudent.lastName}</h3>
                  <p>Bank Code: {fetchedStudent.bankCode}</p>
                </div>
              </div>
              <div className="student-details grid grid-cols-2 gap-4 mt-4">
                <div>
                  <span className="label">Room</span>
                  <span className="value">{fetchedStudent.room || 'N/A'}</span>
                </div>
                <div>
                  <span className="label">Group</span>
                  <span className="value">{fetchedStudent.groupName || 'N/A'}</span>
                </div>
              </div>
            </div>
          )}

          <div className="action-buttons mt-8">
            <button 
              className={`btn-primary w-full ${fetchedStudent ? 'success' : ''}`}
              onClick={fetchedStudent ? markAttendance : fetchStudent}
              disabled={fetchingStudent || loading}
            >
              {fetchingStudent || loading ? 'Processing...' : (
                fetchedStudent ? (
                  <><UserCheck size={20} /> Mark Present</>
                ) : (
                  <><Search size={20} /> Fetch Details</>
                )
              )}
            </button>
          </div>

          {fetchedStudent && (
            <button 
              className="btn-text small text-center w-full mt-4 flex items-center justify-center gap-2 text-[var(--color-text-muted)] hover:text-white"
              onClick={() => {
                setFetchedStudent(null);
                setBankCode('');
              }}
            >
              <XCircle size={16} /> Clear and Search Again
            </button>
          )}
        </HamsCard>
      </div>
    </div>
  );
};

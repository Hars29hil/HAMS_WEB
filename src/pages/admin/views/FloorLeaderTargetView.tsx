import React, { useEffect, useState } from 'react';
import { Save, Users } from 'lucide-react';
import apiClient from '../../../services/apiClient';
import { HamsCard } from '../../../components/HamsCard';
import './FloorLeaderTargetView.css';

interface FloorLeaderTargetViewProps {
  sessionType: string;
}

export const FloorLeaderTargetView: React.FC<FloorLeaderTargetViewProps> = ({ sessionType }) => {
  const [loading, setLoading] = useState(true);
  const [targetType, setTargetType] = useState('ALL');
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, [sessionType]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const leaderFloorId = localStorage.getItem('leader_floor_id');
      if (!leaderFloorId) {
        alert('You do not have a floor assigned.');
        return;
      }

      const studentsRes = await apiClient.get('/students');
      if (studentsRes.data.success) {
        const allStudents = studentsRes.data.data;
        const floorStudents = allStudents.filter((s: any) => String(s.floor_id) === leaderFloorId);
        setStudents(floorStudents);
      }

      const targetRes = await apiClient.get(`/students/floor-targets?session_key=${sessionType.toLowerCase()}&floor_id=${leaderFloorId}`);
      if (targetRes.data.success) {
        const data = targetRes.data.data;
        setTargetType(data.target_type || 'ALL');
        const savedIds = data.student_ids || [];
        setSelectedStudentIds(new Set(savedIds.map(String)));
      }
    } catch (err) {
      console.error('Failed to fetch targets', err);
    } finally {
      setLoading(false);
    }
  };

  const saveTargets = async () => {
    setSaving(true);
    try {
      const leaderFloorId = localStorage.getItem('leader_floor_id');
      await apiClient.post('/students/floor-targets', {
        session_key: sessionType.toLowerCase(),
        floor_id: leaderFloorId,
        target_type: targetType,
        student_ids: Array.from(selectedStudentIds),
      });
      alert('Targets saved successfully');
    } catch (err) {
      alert('Failed to save targets');
    } finally {
      setSaving(false);
    }
  };

  const handleCheckboxChange = (bankCode: string, checked: boolean) => {
    setSelectedStudentIds(prev => {
      const newSet = new Set(prev);
      if (checked) newSet.add(bankCode);
      else newSet.delete(bankCode);
      return newSet;
    });
  };

  if (loading) {
    return <div className="loading-state">Loading target settings...</div>;
  }

  return (
    <div className="target-view-container">
      <div className="target-header">
        <h2>Manage Targets for {sessionType}</h2>
        <p>Select which students should see this schedule on their dashboard.</p>
      </div>

      <HamsCard padding="24px" className="target-config-card">
        <div className="segmented-control">
          <button 
            className={`segment-btn ${targetType === 'ALL' ? 'active' : ''}`}
            onClick={() => setTargetType('ALL')}
          >
            All Students on Floor
          </button>
          <button 
            className={`segment-btn ${targetType === 'SELECTED' ? 'active' : ''}`}
            onClick={() => setTargetType('SELECTED')}
          >
            Selected Students Only
          </button>
        </div>

        <button className="save-btn" onClick={saveTargets} disabled={saving}>
          <Save size={18} /> {saving ? 'Saving...' : 'Save Targets'}
        </button>
      </HamsCard>

      {targetType === 'ALL' ? (
        <div className="empty-state">
          <Users size={64} className="empty-icon" />
          <p>This session is currently available to ALL students on your floor.</p>
        </div>
      ) : (
        <div className="student-checkbox-list">
          {students.map(student => {
            const bankCode = String(student.student_code);
            const isSelected = selectedStudentIds.has(bankCode);

            return (
              <HamsCard key={bankCode} padding="16px" className="student-checkbox-card">
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={isSelected}
                    onChange={(e) => handleCheckboxChange(bankCode, e.target.checked)}
                  />
                  <div className="student-info">
                    <h4>{student.name || 'Unknown'}</h4>
                    <span>Bank Code: {bankCode}</span>
                  </div>
                </label>
              </HamsCard>
            );
          })}
        </div>
      )}
    </div>
  );
};

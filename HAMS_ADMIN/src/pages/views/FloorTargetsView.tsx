import React, { useEffect, useState } from 'react';
import { Target, Save, CheckSquare, XSquare, Search } from 'lucide-react';
import apiClient from '../../services/apiClient';
import { HamsCard } from '../../components/HamsCard';

export const FloorTargetsView: React.FC = () => {
  const [floors, setFloors] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedFloor, setSelectedFloor] = useState<string>('0');
  const [selectedSession, setSelectedSession] = useState<string>('night');
  const [targetType, setTargetType] = useState<'ALL' | 'SELECTED'>('ALL');
  
  const [floorStudents, setFloorStudents] = useState<any[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedFloor && selectedSession) {
      fetchFloorData();
    }
  }, [selectedFloor, selectedSession]);

  const fetchInitialData = async () => {
    try {
      const [fRes, sRes] = await Promise.all([
        apiClient.get('/floors'),
        apiClient.get('/admin/sessions')
      ]);
      if (fRes.data.success && fRes.data.data.length > 0) {
        setFloors(fRes.data.data);
        setSelectedFloor(String(fRes.data.data[0].floor_id));
      }
      if (sRes.data.success && sRes.data.data.length > 0) {
        setSessions(sRes.data.data);
        setSelectedSession(sRes.data.data[0].session_key);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchFloorData = async () => {
    setLoading(true);
    try {
      const [stuRes, targetRes] = await Promise.all([
        apiClient.get(`/students?floor_id=${selectedFloor}`),
        apiClient.get(`/admin/floor-targets?floor_id=${selectedFloor}&session_key=${selectedSession}`)
      ]);
      if (stuRes.data.success) {
        setFloorStudents(stuRes.data.data);
      }
      if (targetRes.data.success && targetRes.data.data) {
        setTargetType(targetRes.data.data.target_type || 'ALL');
        const ids = targetRes.data.data.student_ids || [];
        setSelectedStudentIds(new Set(ids));
      } else {
        setTargetType('ALL');
        setSelectedStudentIds(new Set());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.post('/admin/floor-targets', {
        floor_id: parseInt(selectedFloor),
        session_key: selectedSession,
        target_type: targetType,
        student_ids: Array.from(selectedStudentIds)
      });
      alert('Floor target configuration saved!');
    } catch (e) {
      alert('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleCheckboxChange = (id: string, checked: boolean) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const filteredStudents = floorStudents.filter(s => {
    const nameMatch = (s.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const idMatch = String(s.student_code || '').toLowerCase().includes(searchQuery.toLowerCase());
    return nameMatch || idMatch;
  });

  return (
    <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Floor Leader Targets</h2>
        <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0 0' }}>
          Assign which students a floor leader is responsible for per session
        </p>
      </div>

      <HamsCard padding="24px">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>SELECT FLOOR</label>
            <select value={selectedFloor} onChange={e => setSelectedFloor(e.target.value)} style={{ width: '100%' }}>
              {floors.map(f => (
                <option key={f.floor_id} value={String(f.floor_id)}>{f.floor_name || f.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>SELECT SESSION</label>
            <select value={selectedSession} onChange={e => setSelectedSession(e.target.value)} style={{ width: '100%' }}>
              {sessions.map(s => (
                <option key={s.session_key} value={s.session_key}>{s.session_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>TARGET SCOPE</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setTargetType('ALL')}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: targetType === 'ALL' ? '1.5px solid #4f46e5' : '1px solid #cbd5e1',
                  backgroundColor: targetType === 'ALL' ? '#eef2ff' : '#ffffff',
                  color: targetType === 'ALL' ? '#4f46e5' : '#475569',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                All Floor Students
              </button>
              <button
                onClick={() => setTargetType('SELECTED')}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: targetType === 'SELECTED' ? '1.5px solid #4f46e5' : '1px solid #cbd5e1',
                  backgroundColor: targetType === 'SELECTED' ? '#eef2ff' : '#ffffff',
                  color: targetType === 'SELECTED' ? '#4f46e5' : '#475569',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Custom Selection
              </button>
            </div>
          </div>
        </div>

        {targetType === 'SELECTED' && (
          <div style={{ marginTop: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ position: 'relative', width: '280px' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Search students..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '100%', paddingLeft: '34px', fontSize: '13px' }}
                />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#4f46e5' }}>
                {selectedStudentIds.size} student(s) selected
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
              {filteredStudents.map(s => {
                const sCode = String(s.student_code);
                const isSelected = selectedStudentIds.has(sCode);
                return (
                  <div
                    key={sCode}
                    onClick={() => handleCheckboxChange(sCode, !isSelected)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: isSelected ? '1.5px solid #4f46e5' : '1px solid #cbd5e1',
                      backgroundColor: isSelected ? '#eef2ff' : '#ffffff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                    />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{s.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>ID: {sCode}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '12px 24px',
              backgroundColor: '#4f46e5',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
            }}
          >
            <Save size={16} /> {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </HamsCard>
    </div>
  );
};

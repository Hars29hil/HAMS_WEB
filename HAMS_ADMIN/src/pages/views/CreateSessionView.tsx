import React, { useState } from 'react';
import { Moon, Sun, Users, Code, Book, Coffee, Activity, Calendar, Bell, Flame, Sparkles, Smartphone, PlusCircle } from 'lucide-react';
import apiClient from '../../services/apiClient';
import { HamsCard } from '../../components/HamsCard';

const ICONS = [
  { name: 'moon', icon: Moon, label: 'Night' },
  { name: 'sun', icon: Sun, label: 'Morning' },
  { name: 'users', icon: Users, label: 'Sabha' },
  { name: 'bell', icon: Bell, label: 'Aarti / Bell' },
  { name: 'flame', icon: Flame, label: 'Aarti / Deep' },
  { name: 'code', icon: Code, label: 'Coding' },
  { name: 'book', icon: Book, label: 'Study' },
  { name: 'coffee', icon: Coffee, label: 'Break' },
  { name: 'activity', icon: Activity, label: 'Sports' },
  { name: 'calendar', icon: Calendar, label: 'Event' },
  { name: 'smartphone', icon: Smartphone, label: 'Mobile' },
  { name: 'sparkles', icon: Sparkles, label: 'Special' },
];

export const CreateSessionView: React.FC<{ onAdded?: () => void }> = ({ onAdded }) => {
  const [sessionName, setSessionName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('moon');
  const [isForAllStudents, setIsForAllStudents] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionName.trim()) return;

    setLoading(true);
    try {
      const res = await apiClient.post('/admin/sessions', {
        session_name: sessionName.trim(),
        icon_name: selectedIcon,
        is_for_all_students: isForAllStudents
      });

      if (res.data.success) {
        alert('New attendance session created successfully!');
        setSessionName('');
        setIsForAllStudents(true);
        if (onAdded) onAdded();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '680px' }}>
      <div>
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Add New Attendance Session</h2>
        <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0 0' }}>
          Create custom sessions (e.g., Sabha, Morning, Aarti, Coding, Sports)
        </p>
      </div>

      <HamsCard padding="32px">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
              SESSION NAME
            </label>
            <input
              type="text"
              value={sessionName}
              onChange={e => setSessionName(e.target.value)}
              placeholder="e.g. Sabha Attendance, Coding Session"
              required
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '12px' }}>
              CHOOSE ICON
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              {ICONS.map(item => {
                const IconComp = item.icon;
                const isSelected = selectedIcon === item.name;
                return (
                  <div
                    key={item.name}
                    onClick={() => setSelectedIcon(item.name)}
                    style={{
                      padding: '16px 12px',
                      borderRadius: '12px',
                      border: isSelected ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                      backgroundColor: isSelected ? '#eef2ff' : '#ffffff',
                      color: isSelected ? '#4f46e5' : '#475569',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <IconComp size={24} />
                    <span style={{ fontSize: '12px', fontWeight: 700 }}>{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* All Students Checkbox / Toggle */}
          <div style={{
            padding: '16px',
            backgroundColor: isForAllStudents ? '#f8fafc' : '#fffbeb',
            border: isForAllStudents ? '1px solid #e2e8f0' : '1px solid #fde68a',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '14px',
            cursor: 'pointer'
          }} onClick={() => setIsForAllStudents(!isForAllStudents)}>
            <input
              type="checkbox"
              id="is_for_all_students"
              checked={isForAllStudents}
              onChange={(e) => setIsForAllStudents(e.target.checked)}
              style={{
                width: '20px',
                height: '20px',
                accentColor: '#4f46e5',
                cursor: 'pointer',
                marginTop: '2px'
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <div style={{ flex: 1 }}>
              <label
                htmlFor="is_for_all_students"
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: isForAllStudents ? '#1e293b' : '#92400e',
                  cursor: 'pointer',
                  display: 'block'
                }}
              >
                {isForAllStudents ? 'Mandatory for All Students (Hostel-wide)' : 'Selective / Assigned Students Only'}
              </label>
              <p style={{ fontSize: '12px', color: isForAllStudents ? '#64748b' : '#b45309', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                {isForAllStudents
                  ? 'Every student in the hostel is expected to attend this session. Live records and absentee messages will track all students.'
                  : 'Only specifically assigned students will be required to attend. Floor leaders and admins can assign students to this session, and absentee WhatsApp messages will go ONLY to assigned students.'}
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !sessionName.trim()}
            style={{
              padding: '14px',
              backgroundColor: '#4f46e5',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 700,
              fontSize: '15px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.3)',
            }}
          >
            <PlusCircle size={18} /> {loading ? 'Creating...' : 'Create Session'}
          </button>
        </form>
      </HamsCard>
    </div>
  );
};

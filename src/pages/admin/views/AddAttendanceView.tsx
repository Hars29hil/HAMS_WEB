import React, { useState } from 'react';
import { Moon, Sun, Users, Code, Book, Coffee, Activity, Calendar } from 'lucide-react';
import apiClient from '../../../services/apiClient';
import { HamsCard } from '../../../components/HamsCard';
import './AddAttendanceView.css';

const ICONS = [
  { name: 'moon', icon: Moon, label: 'Night' },
  { name: 'sun', icon: Sun, label: 'Morning' },
  { name: 'users', icon: Users, label: 'Group' },
  { name: 'code', icon: Code, label: 'Coding' },
  { name: 'book', icon: Book, label: 'Study' },
  { name: 'coffee', icon: Coffee, label: 'Break' },
  { name: 'activity', icon: Activity, label: 'Activity' },
  { name: 'calendar', icon: Calendar, label: 'Event' },
];

export const AddAttendanceView: React.FC<{ onAdded?: () => void }> = ({ onAdded }) => {
  const [sessionName, setSessionName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('moon');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionName.trim()) return;

    setLoading(true);
    try {
      const res = await apiClient.post('/admin/sessions', {
        session_name: sessionName.trim(),
        icon_name: selectedIcon,
      });

      if (res.data.success) {
        alert('Attendance session added successfully');
        setSessionName('');
        if (onAdded) onAdded();
      }
    } catch (err) {
      alert('Error adding session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-attendance-container">
      <div className="add-attendance-header">
        <h2>Add New Attendance Session</h2>
        <p>Create a new dynamic session for students to mark attendance.</p>
      </div>

      <HamsCard padding="32px" className="add-session-card">
        <form onSubmit={handleSubmit} className="add-session-form">
          
          <div className="form-group">
            <label>Session Label (e.g., Coding)</label>
            <input 
              type="text" 
              value={sessionName} 
              onChange={e => setSessionName(e.target.value)} 
              placeholder="Enter session name..."
              required 
            />
          </div>

          <div className="form-group">
            <label>Select Icon</label>
            <div className="icon-grid">
              {ICONS.map(item => {
                const IconComp = item.icon;
                const isSelected = selectedIcon === item.name;
                return (
                  <div 
                    key={item.name} 
                    className={`icon-option ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedIcon(item.name)}
                  >
                    <IconComp size={24} />
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <button type="submit" className="submit-btn" disabled={loading || !sessionName.trim()}>
            {loading ? 'Adding...' : 'Add Session'}
          </button>
        </form>
      </HamsCard>
    </div>
  );
};

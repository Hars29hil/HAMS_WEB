import React, { useEffect, useState } from 'react';
import { LogOut, LayoutDashboard, Users, BarChart3, Clock, UserPlus, FileSpreadsheet, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../services/apiClient';
import { Sidebar, SidebarItem } from '../../components/layout/Sidebar';
import { DashboardView } from './views/DashboardView';
import { StudentsView } from './views/StudentsView';
import { StudentAttendanceView } from './views/StudentAttendanceView';
import { LiveAttendanceView } from './views/LiveAttendanceView';
import { AddAttendanceView } from './views/AddAttendanceView';

export const AdminDashboard: React.FC = () => {
  const { logout } = useAuth();
  const [activeView, setActiveView] = useState('dashboard');
  const [dynamicSessions, setDynamicSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const response = await apiClient.get('/students/sessions');
      if (response.data.success) {
        setDynamicSessions(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching sessions', err);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (name: string) => {
    switch (name) {
      case 'users': return Users;
      case 'activity': return BarChart3;
      default: return Clock;
    }
  };

  const getSidebarItems = (): SidebarItem[] => {
    let items: SidebarItem[] = [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'students', label: 'Student Management', icon: Users },
      { id: 'attendance_history', label: 'Student Attendance', icon: FileSpreadsheet },
    ];

    dynamicSessions.forEach(session => {
      items.push({
        id: `session_${session.session_key}`,
        label: session.session_name,
        icon: getIcon(session.icon_name),
      });
    });

    items.push({ id: 'add_attendance', label: '+ Add Attendance', icon: UserPlus });
    items.push({ id: 'settings', label: 'Settings', icon: Settings });

    return items;
  };

  if (loading) {
    return <div className="loading-screen"><div className="spinner"></div></div>;
  }

  const renderActiveView = () => {
    if (activeView === 'dashboard') return <DashboardView />;
    if (activeView === 'students') return <StudentsView />;
    if (activeView === 'attendance_history') return <StudentAttendanceView />;
    if (activeView === 'add_attendance') return <AddAttendanceView onAdded={fetchSessions} />;
    if (activeView.startsWith('session_')) {
      const sessionKey = activeView.replace('session_', '');
      const session = dynamicSessions.find(s => s.session_key === sessionKey);
      return <LiveAttendanceView sessionKey={sessionKey} sessionName={session?.session_name || 'Session'} onChanged={fetchSessions} />;
    }
    return <div style={{ padding: '24px' }}><h3>Work in Progress: {activeView}</h3></div>;
  };

  const currentItem = getSidebarItems().find(item => item.id === activeView);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Sidebar 
        items={getSidebarItems()} 
        activeId={activeView} 
        onSelect={setActiveView} 
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'var(--color-bg)' }}>
        <header className="glass" style={{ padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, zIndex: 5 }}>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>{currentItem?.label || 'Admin'}</h2>
          <button className="logout-btn" onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)', cursor: 'pointer' }}>
            <LogOut size={16} />
            Logout
          </button>
        </header>
        {renderActiveView()}
      </div>
    </div>
  );
};

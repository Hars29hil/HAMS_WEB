import React, { useState, useEffect } from 'react';
import { LogOut, Users, Bell, Clock, BarChart3 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Sidebar, SidebarItem } from '../../components/layout/Sidebar';
import { StudentsView } from '../admin/views/StudentsView';
import { FloorLeaderTargetView } from '../admin/views/FloorLeaderTargetView';
import apiClient from '../../services/apiClient';

export const LeaderDashboard: React.FC = () => {
  const { logout } = useAuth();
  const [activeView, setActiveView] = useState('students');
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
      { id: 'students', label: 'My Floor Students', icon: Users },
    ];

    dynamicSessions.forEach(session => {
      items.push({
        id: `session_${session.session_key}`,
        label: session.session_name,
        icon: getIcon(session.icon_name),
      });
    });

    items.push({ id: 'notifications', label: 'Notifications', icon: Bell });
    return items;
  };

  if (loading) {
    return <div className="loading-screen"><div className="spinner"></div></div>;
  }

  const renderActiveView = () => {
    if (activeView === 'students') return <StudentsView />;
    if (activeView.startsWith('session_')) {
      const sessionKey = activeView.replace('session_', '');
      return <FloorLeaderTargetView sessionType={sessionKey.toUpperCase()} />;
    }
    return <div style={{ padding: '24px' }}><h3>Work in Progress: {activeView}</h3></div>;
  };

  const currentItem = getSidebarItems().find(item => item.id === activeView);

  return (
    <div className="admin-layout">
      <Sidebar 
        items={getSidebarItems()} 
        activeId={activeView} 
        onSelect={setActiveView} 
      />
      <div className="main-content">
        <header className="top-header" style={{ padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg)' }}>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>{currentItem?.label || 'Dashboard'}</h2>
          <button className="logout-btn" onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)', cursor: 'pointer' }}>
            <LogOut size={16} /> Logout
          </button>
        </header>
        {renderActiveView()}
      </div>
    </div>
  );
};

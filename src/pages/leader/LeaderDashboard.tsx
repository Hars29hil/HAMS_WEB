import React, { useEffect, useState } from 'react';
import { LogOut, Users, Settings, Target } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../services/apiClient';
import { Sidebar, SidebarItem } from '../../components/layout/Sidebar';
import { DashboardView } from '../admin/views/DashboardView';
import { StudentsView } from '../admin/views/StudentsView';
import { FloorLeaderTargetView } from '../admin/views/FloorLeaderTargetView';

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

  const getSidebarItems = (): SidebarItem[] => {
    let items: SidebarItem[] = [
      { id: 'students', label: 'My Floor Students', icon: Users },
    ];

    dynamicSessions.forEach(session => {
      items.push({
        id: `target_${session.session_key}`,
        label: session.session_name,
        icon: Target,
      });
    });

    items.push({ id: 'settings', label: 'Settings', icon: Settings });

    return items;
  };

  if (loading) {
    return <div className="loading-screen"><div className="spinner"></div></div>;
  }

  const renderActiveView = () => {
    if (activeView === 'students') return <StudentsView />;
    if (activeView.startsWith('target_')) {
      const sessionKey = activeView.replace('target_', '');
      return <FloorLeaderTargetView sessionType={sessionKey} />;
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
        <header style={{ padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg)' }}>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>{currentItem?.label || 'Floor Leader'}</h2>
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

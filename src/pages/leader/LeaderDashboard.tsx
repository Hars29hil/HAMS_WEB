import React, { useState } from 'react';
import { LogOut, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Sidebar, SidebarItem } from '../../components/layout/Sidebar';
import { StudentsView } from '../admin/views/StudentsView';

export const LeaderDashboard: React.FC = () => {
  const { logout } = useAuth();
  const [activeView, setActiveView] = useState('students');

  const getSidebarItems = (): SidebarItem[] => {
    return [
      { id: 'students', label: 'My Floor Students', icon: Users },
    ];
  };

  const renderActiveView = () => {
    if (activeView === 'students') return <StudentsView />;
    return <div style={{ padding: '24px' }}><h3>Work in Progress: {activeView}</h3></div>;
  };

  return (
    <div className="admin-layout">
      <Sidebar 
        items={getSidebarItems()} 
        activeId={activeView} 
        onSelect={setActiveView} 
      />
      <div className="main-content">
        <header className="top-header">
          <h2>Dashboard</h2>
          <button className="logout-btn" onClick={logout}>
            <LogOut size={18} /> Logout
          </button>
        </header>
        {renderActiveView()}
      </div>
    </div>
  );
};

import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  UserCheck, 
  ClipboardList, 
  Key, 
  Map, 
  Cpu, 
  Shield, 
  Target,
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './Sidebar.css';

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, toggleSidebar }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const role = user?.role || '';
  const basePath = role === 'ADMIN' ? '/admin' : '/leader';

  const menuItems = [
    { name: 'Dashboard', icon: <LayoutDashboard size={20} />, path: `${basePath}/dashboard`, roles: ['ADMIN', 'LEADER'] },
    { name: 'Live Attendance', icon: <UserCheck size={20} />, path: `${basePath}/live-attendance`, roles: ['ADMIN', 'LEADER'] },
    { name: 'Manual Mark', icon: <ClipboardList size={20} />, path: `${basePath}/manual-attendance`, roles: ['ADMIN', 'LEADER'] },
    { name: 'Students', icon: <Users size={20} />, path: `${basePath}/students`, roles: ['ADMIN', 'LEADER'] },
    { name: 'Rebind Requests', icon: <Key size={20} />, path: `${basePath}/rebind-requests`, roles: ['ADMIN', 'LEADER'] },
    
    // Leader Only
    { name: 'Floor Targets', icon: <Target size={20} />, path: `${basePath}/targets`, roles: ['LEADER'] },
    
    // Admin Only
    { name: 'Floors', icon: <Map size={20} />, path: `${basePath}/floors`, roles: ['ADMIN'] },
    { name: 'ESP32 Devices', icon: <Cpu size={20} />, path: `${basePath}/esp32`, roles: ['ADMIN'] },
    { name: 'Permissions', icon: <Shield size={20} />, path: `${basePath}/permissions`, roles: ['ADMIN'] },
  ];

  const filteredItems = menuItems.filter(item => item.roles.includes(role));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && <div className="sidebar-overlay" onClick={toggleSidebar}></div>}
      
      <aside className={`sidebar glass ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-container">
            <div className="logo-icon">H</div>
            <h2>HAMS</h2>
          </div>
          <button className="mobile-close" onClick={toggleSidebar}>
            <X size={24} />
          </button>
        </div>

        <div className="sidebar-user">
          <div className="user-avatar">{user?.name?.charAt(0) || role.charAt(0)}</div>
          <div className="user-info">
            <div className="user-name">{user?.name || role}</div>
            <div className="user-role">{role}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {filteredItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => {
                if (window.innerWidth <= 768) toggleSidebar();
              }}
            >
              <div className="nav-icon">{item.icon}</div>
              <span>{item.name}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item logout" onClick={handleLogout}>
            <div className="nav-icon"><LogOut size={20} /></div>
            <span>Log Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};

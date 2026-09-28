import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CalendarClock, 
  PlusCircle, 
  FileSpreadsheet, 
  Users, 
  MessageSquare, 
  LogOut,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  Palmtree
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './AdminSidebar.css';

interface AdminSidebarProps {
  isOpen: boolean;
  onCloseMobile: () => void;
  sessions?: Array<{ session_key: string; session_name: string }>;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  isOpen,
  onCloseMobile,
  sessions = [],
}) => {
  const { admin, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const userRole = admin?.role || 'ADMIN';
  const pathname = location.pathname;

  const handleNavClick = (path: string) => {
    navigate(path);
    if (window.innerWidth <= 900) {
      onCloseMobile();
    }
  };

  const isDashboard = pathname === '/' || pathname === '/dashboard';
  const isAttendance = pathname === '/attendance';
  const isStudents = pathname === '/students';
  const isLeaders = pathname === '/leaders';
  const isMessages = pathname === '/messages';
  const isAddSession = pathname === '/session_add' || pathname === '/add_session';

  return (
    <aside className={`admin-sidebar ${isOpen ? 'open' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="brand-icon-wrap">
          <ShieldCheck size={26} />
        </div>
        <div className="brand-info">
          <h2>HAMS Portal</h2>
          <span>Admin Control</span>
        </div>
      </div>

      {/* Navigation List */}
      <div className="sidebar-nav">
        <div className="nav-section-title">Main Operations</div>

        <button
          className={`nav-item-btn ${isDashboard ? 'active' : ''}`}
          onClick={() => handleNavClick('/')}
        >
          <LayoutDashboard size={18} className="nav-icon" />
          <span>Dashboard Overview</span>
        </button>

        <button
          className={`nav-item-btn ${isAttendance ? 'active' : ''}`}
          onClick={() => handleNavClick('/attendance')}
        >
          <FileSpreadsheet size={18} className="nav-icon" />
          <span>Attendance Records</span>
        </button>

        <button
          className={`nav-item-btn ${isStudents ? 'active' : ''}`}
          onClick={() => handleNavClick('/students')}
        >
          <Users size={18} className="nav-icon" />
          <span>Students Directory</span>
        </button>

        {userRole !== 'LEADER' && (
          <button
            className={`nav-item-btn ${isLeaders ? 'active' : ''}`}
            onClick={() => handleNavClick('/leaders')}
          >
            <UserCheck size={18} className="nav-icon" />
            <span>Floor Leaders</span>
          </button>
        )}

        <button
          className={`nav-item-btn ${isMessages ? 'active' : ''}`}
          onClick={() => handleNavClick('/messages')}
        >
          <MessageSquare size={18} className="nav-icon" />
          <span>WhatsApp Messaging</span>
        </button>

        <button
          className={`nav-item-btn ${pathname === '/leaves' ? 'active' : ''}`}
          onClick={() => handleNavClick('/leaves')}
        >
          <Palmtree size={18} className="nav-icon" style={{ color: '#8b5cf6' }} />
          <span>Approved Leaves</span>
        </button>

        <button
          className={`nav-item-btn ${pathname === '/security' ? 'active' : ''}`}
          onClick={() => handleNavClick('/security')}
        >
          <ShieldAlert size={18} className="nav-icon text-red-400" />
          <span>Proxy & IP Security</span>
        </button>

        {userRole !== 'LEADER' && (
          <>
            <div className="nav-section-title">Live Sessions</div>

            {sessions.filter(s => Boolean(s.session_key)).map((s) => (
              <button
                key={`sess_nav_${s.session_key}`}
                className={`nav-item-btn ${pathname === `/session/${s.session_key}` ? 'active' : ''}`}
                onClick={() => handleNavClick(`/session/${s.session_key}`)}
              >
                <CalendarClock size={18} className="nav-icon" />
                <span>{s.session_name}</span>
              </button>
            ))}

            <button
              className={`nav-item-btn ${isAddSession ? 'active' : ''}`}
              onClick={() => handleNavClick('/session_add')}
            >
              <PlusCircle size={18} className="nav-icon" />
              <span>+ Add New Session</span>
            </button>
          </>
        )}
      </div>

      {/* Footer User Info */}
      <div className="sidebar-footer">
        <div className="admin-profile">
          <div className="admin-avatar">
            {(admin?.name || 'A')[0].toUpperCase()}
          </div>
          <div>
            <div className="admin-name">{admin?.name || 'Administrator'}</div>
            <div className="admin-role">{userRole}</div>
          </div>
        </div>
        <button className="logout-icon-btn" onClick={logout} title="Log Out">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
};

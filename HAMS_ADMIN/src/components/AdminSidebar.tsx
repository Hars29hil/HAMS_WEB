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
  Palmtree, 
  Key,
  KeyRound,
  X 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { renderSessionIcon } from '../utils/sessionIcons';
import './AdminSidebar.css';

interface AdminSidebarProps {
  isOpen: boolean;
  onCloseMobile: () => void;
  sessions?: Array<{ session_key: string; session_name: string; icon_name?: string }>;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  isOpen,
  onCloseMobile,
  sessions = [],
}) => {
  const { admin, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const userRole = admin?.role || 'ADMIN';
  let permissions: any = admin?.session_permissions || {};
  if (typeof permissions === 'string') {
    try {
      permissions = JSON.parse(permissions);
    } catch (e) {
      permissions = {};
    }
  }

  // Show sections if admin OR if leader is explicitly granted permission
  const isLeader = userRole === 'LEADER' || userRole === 'floor_leader';
  const canShowWhatsApp = !isLeader || permissions?.can_access_whatsapp === true || permissions?.can_access_whatsapp === 'true' || permissions?.can_access_whatsapp === 1 || permissions?.can_access_whatsapp === '1';
  const canShowLeaves = !isLeader || permissions?.can_access_leaves === true || permissions?.can_access_leaves === 'true' || permissions?.can_access_leaves === 1 || permissions?.can_access_leaves === '1';
  const canShowSecurity = !isLeader || permissions?.can_access_security === true || permissions?.can_access_security === 'true' || permissions?.can_access_security === 1 || permissions?.can_access_security === '1';

  // Filter sessions assigned to leader
  let assignedSessions: string[] = admin?.assigned_sessions || ['all'];
  if (typeof assignedSessions === 'string') {
    try {
      assignedSessions = JSON.parse(assignedSessions);
    } catch (e) {
      assignedSessions = ['all'];
    }
  }
  if (!Array.isArray(assignedSessions)) {
    assignedSessions = ['all'];
  }

  const assignedLower = assignedSessions.map(s => String(s).toLowerCase().trim());
  const hasAllSessions = !isLeader || assignedLower.includes('all');

  const visibleSessions = sessions.filter(s => {
    if (!s.session_key) return false;
    if (hasAllSessions) return true;
    return assignedLower.includes(s.session_key.toLowerCase().trim());
  });

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
  const isStrings = pathname === '/strings' || pathname === '/floor-strings' || pathname === '/generate-string';
  const isMessages = pathname === '/messages';
  const isAddSession = pathname === '/session_add' || pathname === '/add_session';

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      <div 
        className={`sidebar-backdrop ${isOpen ? 'open' : ''}`} 
        onClick={onCloseMobile} 
        aria-hidden="true"
      />

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
          <button 
            className="sidebar-close-btn" 
            onClick={onCloseMobile} 
            title="Close navigation"
          >
            <X size={20} />
          </button>
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
            <Key size={18} className="nav-icon" />
            <span>User Credentials</span>
          </button>
        )}

        <button
          className={`nav-item-btn ${isStrings ? 'active' : ''}`}
          onClick={() => handleNavClick('/strings')}
        >
          <KeyRound size={18} className="nav-icon" style={{ color: '#6366f1' }} />
          <span>Generate String</span>
        </button>

        {canShowWhatsApp && (
          <button
            className={`nav-item-btn ${isMessages ? 'active' : ''}`}
            onClick={() => handleNavClick('/messages')}
          >
            <MessageSquare size={18} className="nav-icon" />
            <span>WhatsApp Messaging</span>
          </button>
        )}

        {canShowLeaves && (
          <button
            className={`nav-item-btn ${pathname === '/leaves' ? 'active' : ''}`}
            onClick={() => handleNavClick('/leaves')}
          >
            <Palmtree size={18} className="nav-icon" style={{ color: '#8b5cf6' }} />
            <span>Approved Leaves</span>
          </button>
        )}

        {canShowSecurity && (
          <button
            className={`nav-item-btn ${pathname === '/security' ? 'active' : ''}`}
            onClick={() => handleNavClick('/security')}
          >
            <ShieldAlert size={18} className="nav-icon text-red-400" />
            <span>Proxy & IP Security</span>
          </button>
        )}

        {visibleSessions.length > 0 && (
          <>
            <div className="nav-section-title">Live Sessions</div>

            {visibleSessions.map((s) => (
              <button
                key={`sess_nav_${s.session_key}`}
                className={`nav-item-btn ${pathname === `/session/${s.session_key}` ? 'active' : ''}`}
                onClick={() => handleNavClick(`/session/${s.session_key}`)}
              >
                {renderSessionIcon(s.icon_name, s.session_key, 18, 'nav-icon')}
                <span>{s.session_name}</span>
              </button>
            ))}

            {!isLeader && (
              <button
                className={`nav-item-btn ${isAddSession ? 'active' : ''}`}
                onClick={() => handleNavClick('/session_add')}
              >
                <PlusCircle size={18} className="nav-icon" />
                <span>+ Add New Session</span>
              </button>
            )}
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
    </>
  );
};

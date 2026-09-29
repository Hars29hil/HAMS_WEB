import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate, useParams, Navigate } from 'react-router-dom';
import apiClient from '../services/apiClient';
import { AdminSidebar } from '../components/AdminSidebar';
import { AdminHeader } from '../components/AdminHeader';
import { DashboardOverview } from './views/DashboardOverview';
import { AttendanceReportsView } from './views/AttendanceReportsView';
import { StudentsManagementView } from './views/StudentsManagementView';
import { LeadersManagementView } from './views/LeadersManagementView';
import { WhatsAppMessagingView } from './views/WhatsAppMessagingView';
import { LiveAttendanceManager } from './views/LiveAttendanceManager';
import { CreateSessionView } from './views/CreateSessionView';
import { DeviceSecurityView } from './views/DeviceSecurityView';
import { LeavesManagementView } from './views/LeavesManagementView';

const SessionViewWrapper: React.FC<{ onSessionDeleted: () => void }> = ({ onSessionDeleted }) => {
  const { sessionKey } = useParams<{ sessionKey: string }>();
  if (!sessionKey) return <Navigate to="/" replace />;
  return <LiveAttendanceManager sessionKey={sessionKey} onSessionDeleted={onSessionDeleted} />;
};

export const AdminLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(() => {
      fetchSessions();
    }, 4000);
    return () => clearInterval(interval);
  }, [location.pathname]);

  const fetchSessions = async () => {
    try {
      const res = await apiClient.get('/admin/sessions');
      if (res.data.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
        setSessions(res.data.data);
      } else {
        const altRes = await apiClient.get('/attendance/schedule-data');
        if (Array.isArray(altRes.data) && altRes.data.length > 0) {
          setSessions(altRes.data);
        }
      }
    } catch (e) {
      console.error('Failed to load sidebar sessions:', e);
    }
  };

  const getHeaderInfo = () => {
    const p = location.pathname;
    if (p === '/' || p === '/dashboard') {
      return { title: 'Dashboard Overview', subtitle: "Live attendance statistics & hostel operations" };
    }
    if (p === '/attendance') {
      return { title: 'Attendance Records', subtitle: 'Detailed reports, filters, and CSV export' };
    }
    if (p === '/students') {
      return { title: 'Student Management', subtitle: 'Manage active students, floor & room assignments' };
    }
    if (p === '/leaders') {
      return { title: 'User Credentials Management', subtitle: 'Create, assign multiple floors, and manage user login credentials' };
    }
    if (p === '/messages') {
      return { title: 'WhatsApp Automation', subtitle: 'Broadcast real-time attendance alerts to students' };
    }
    if (p === '/security') {
      return { title: 'Proxy & Multi-Account Security Audit', subtitle: 'Detect and resolve cross-student logins from same IP / Device' };
    }
    if (p === '/leaves') {
      return { title: 'Approved Leave Management', subtitle: 'Sync and track college approved leaves and auto-excused attendance' };
    }
    if (p === '/session_add' || p === '/add_session') {
      return { title: 'Create Session', subtitle: 'Add a new dynamic attendance schedule' };
    }
    if (p.startsWith('/session/')) {
      const key = p.replace('/session/', '');
      const s = sessions.find(item => item.session_key === key);
      return { title: `${s?.session_name || 'Session'} Control`, subtitle: 'Configure live timings and review attendance' };
    }
    return { title: 'Admin Control Center' };
  };

  const headerInfo = getHeaderInfo();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100vw', backgroundColor: '#f8fafc' }}>
      {/* Sidebar */}
      <AdminSidebar
        isOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        sessions={sessions}
      />

      {/* Main Container */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto' }}>
        <AdminHeader
          title={headerInfo.title}
          subtitle={headerInfo.subtitle}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />
        <div className="admin-view-content-wrapper">
          <Routes>
            <Route path="/" element={<DashboardOverview />} />
            <Route path="/dashboard" element={<DashboardOverview />} />
            <Route path="/attendance" element={<AttendanceReportsView />} />
            <Route path="/students" element={<StudentsManagementView />} />
            <Route path="/leaders" element={<LeadersManagementView />} />
            <Route path="/messages" element={<WhatsAppMessagingView />} />
            <Route path="/leaves" element={<LeavesManagementView />} />
            <Route path="/security" element={<DeviceSecurityView />} />
            <Route path="/session_add" element={<CreateSessionView onAdded={() => { fetchSessions(); navigate('/'); }} />} />
            <Route path="/add_session" element={<CreateSessionView onAdded={() => { fetchSessions(); navigate('/'); }} />} />
            <Route path="/session/:sessionKey" element={<SessionViewWrapper onSessionDeleted={() => { fetchSessions(); navigate('/'); }} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
};

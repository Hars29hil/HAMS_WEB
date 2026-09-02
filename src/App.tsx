import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { LoginPage } from './pages/auth/LoginPage';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { AdminDashboard } from './pages/admin/AdminDashboard';

// Route Protectors
const StudentRoute = ({ children }: { children: React.ReactNode }) => {
  const { token, user } = useAuth();
  if (!token || user?.role !== 'STUDENT') return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { token, user } = useAuth();
  if (!token || (user?.role !== 'ADMIN' && user?.role !== 'LEADER')) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

function App() {
  const { token, user } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/" 
          element={
            token ? (
              user?.role === 'STUDENT' ? <Navigate to="/student" replace /> : <Navigate to="/admin" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          } 
        />
        
        <Route path="/login" element={!token ? <LoginPage /> : <Navigate to="/" replace />} />
        
        <Route 
          path="/student/*" 
          element={
            <StudentRoute>
              <StudentDashboard />
            </StudentRoute>
          } 
        />
        
        <Route 
          path="/admin/*" 
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          } 
        />

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

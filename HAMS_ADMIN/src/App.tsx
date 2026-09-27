import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminLayout } from './pages/AdminLayout';

const ProtectedAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { admin, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', color: '#64748b' }}>
        Authenticating session...
      </div>
    );
  }

  if (!admin) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const PublicAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { admin, loading } = useAuth();

  if (loading) return null;
  if (admin) return <Navigate to="/" replace />;

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicAdminRoute>
                <AdminLoginPage />
              </PublicAdminRoute>
            }
          />
          <Route
            path="/*"
            element={
              <ProtectedAdminRoute>
                <AdminLayout />
              </ProtectedAdminRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { DashboardHome } from '../shared/DashboardHome';
import { LiveAttendanceView } from '../shared/LiveAttendanceView';
import { ManualAttendanceView } from '../shared/ManualAttendanceView';
import { StudentsView } from '../shared/StudentsView';
import { StudentAttendanceView } from '../shared/StudentAttendanceView';
import { RebindRequestsView } from '../shared/RebindRequestsView';
import { FloorsView } from './FloorsView';
import { Esp32ManagementView } from './Esp32ManagementView';
import { PermissionsView } from './PermissionsView';
// Import other views as they are created

export const AdminDashboard: React.FC = () => {
  return (
    <DashboardLayout>
      <Routes>
        <Route path="/" element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardHome />} />
        <Route path="live-attendance" element={<LiveAttendanceView />} />
        <Route path="manual-attendance" element={<ManualAttendanceView />} />
        <Route path="students" element={<StudentsView />} />
        <Route path="student-attendance" element={<StudentAttendanceView />} />
        <Route path="rebind-requests" element={<RebindRequestsView />} />
        <Route path="floors" element={<FloorsView />} />
        <Route path="esp32" element={<Esp32ManagementView />} />
        <Route path="permissions" element={<PermissionsView />} />
        {/*
        */}
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </DashboardLayout>
  );
};

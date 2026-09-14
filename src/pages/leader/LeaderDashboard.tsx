import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { DashboardHome } from '../shared/DashboardHome';
import { LiveAttendanceView } from '../shared/LiveAttendanceView';
import { ManualAttendanceView } from '../shared/ManualAttendanceView';
import { StudentsView } from '../shared/StudentsView';
import { RebindRequestsView } from '../shared/RebindRequestsView';
// Import other views as they are created

export const LeaderDashboard: React.FC = () => {
  return (
    <DashboardLayout>
      <Routes>
        <Route path="/" element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardHome />} />
        <Route path="live-attendance" element={<LiveAttendanceView />} />
        <Route path="manual-attendance" element={<ManualAttendanceView />} />
        <Route path="students" element={<StudentsView />} />
        <Route path="rebind-requests" element={<RebindRequestsView />} />
        {/*
        <Route path="targets" element={<FloorLeaderTargetView />} />
        */}
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </DashboardLayout>
  );
};

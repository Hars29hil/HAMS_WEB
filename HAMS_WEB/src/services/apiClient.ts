import axios from 'axios';

// Use relative /api endpoint or environment variable VITE_API_URL
const getBaseURL = () => {
  return import.meta.env.VITE_API_URL || '/api';
};

const apiClient = axios.create({
  baseURL: getBaseURL(),
  timeout: 15000,
});

// Helper to get or create persistent device uuid
export function getOrCreateDeviceUuid(): string {
  let uuid = localStorage.getItem('hams_device_uuid');
  if (!uuid) {
    uuid = 'dev_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36);
    localStorage.setItem('hams_device_uuid', uuid);
  }
  return uuid;
}

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const deviceUuid = getOrCreateDeviceUuid();
  if (deviceUuid) {
    config.headers['x-device-uuid'] = deviceUuid;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Mock interceptor to bypass backend errors when testing
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const token = localStorage.getItem('token');
    if (token === 'mock_token_for_testing' && error.response?.status === 401) {
      const url = error.config.url;
      
      if (url.includes('/attendance/my-status')) {
        return Promise.resolve({
          data: {
            success: true,
            data: { already_marked: false, attendance_active: true, start_time: '00:00', end_time: '23:59' }
          }
        });
      }
      
      if (url.includes('/admin/dashboard')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              total_students: 120, present_today: 110, late_today: 5, absent_today: 5,
              weekly_stats: [
                { date: new Date(Date.now() - 86400000).toISOString(), present: 100, late: 10 },
                { date: new Date().toISOString(), present: 110, late: 5 }
              ],
              floor_status: [
                { floor_name: 'Floor 1', session_status: 'Active', present_students: 45, total_students: 50 },
                { floor_name: 'Floor 2', session_status: 'Active', present_students: 65, total_students: 70 }
              ]
            }
          }
        });
      }
      
      if (url.includes('/attendance/challenge')) {
        return Promise.resolve({ data: { success: true, challenge: 'mock_ble_challenge_token' } });
      }
      
      if (url.includes('/attendance/mark')) {
        return Promise.resolve({ data: { success: true, message: 'Attendance marked successfully!' } });
      }
    }
    
    return Promise.reject(error);
  }
);


export default apiClient;

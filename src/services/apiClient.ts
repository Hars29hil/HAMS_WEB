import axios from 'axios';

// Fallback to localhost if no environment variable is provided
const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

const apiClient = axios.create({
  baseURL,
  timeout: 10000,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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

import React, { useEffect, useState } from 'react';
import { 
  Search, 
  UserPlus, 
  RefreshCw, 
  ChevronDown, 
  CheckCircle2, 
  AlertCircle, 
  Phone, 
  Edit2, 
  Trash2, 
  Info, 
  X, 
  Users, 
  Tag, 
  Plus, 
  Sparkles, 
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Activity,
  Calendar,
  Clock,
  UserCheck,
  Eye,
  EyeOff,
  Check,
  RotateCcw
} from 'lucide-react';
import axios from 'axios';
import apiClient from '../../services/apiClient';
import { useAuth } from '../../context/AuthContext';
import { HamsCard } from '../../components/HamsCard';

export const StudentsManagementView: React.FC = () => {
  const { admin } = useAuth();
  const isLeader = (admin?.role || '').toUpperCase() === 'LEADER' || (admin?.role || '').toLowerCase() === 'floor_leader';
  let permissions: any = admin?.session_permissions || {};
  if (typeof permissions === 'string') {
    try { permissions = JSON.parse(permissions); } catch (e) { permissions = {}; }
  }
  const canResetIp = !isLeader || permissions?.can_reset_ip === true || permissions?.can_reset_ip === 'true' || permissions?.can_reset_ip === 1 || permissions?.can_reset_ip === '1';

  const [students, setStudents] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<any[]>([]);
  const [availableSessions, setAvailableSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFloor, setSelectedFloor] = useState<string>('All');
  const [assignmentFilter, setAssignmentFilter] = useState<string>('All');
  const [defaultFilter, setDefaultFilter] = useState<string>('All');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('name-asc');
  
  const [mobileModal, setMobileModal] = useState<{ isOpen: boolean, studentId: string, currentMobile: string } | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addStudentId, setAddStudentId] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);

  const [assignModal, setAssignModal] = useState<{isOpen: boolean, studentId: string, currentFloor: string, currentRoom: string} | null>(null);
  const [detailsModal, setDetailsModal] = useState<any | null>(null);

  // Floor Leader Modal triggered on Student Double Click
  const [leaderModalOpen, setLeaderModalOpen] = useState(false);
  const [leaderFormName, setLeaderFormName] = useState('');
  const [leaderFormUsername, setLeaderFormUsername] = useState('');
  const [leaderFormPhone, setLeaderFormPhone] = useState('');
  const [leaderFormPassword, setLeaderFormPassword] = useState('');
  const [leaderFormFloors, setLeaderFormFloors] = useState<number[]>([]);
  const [leaderFormSessions, setLeaderFormSessions] = useState<string[]>(['all']);
  const [leaderShowPassword, setLeaderShowPassword] = useState(false);
  const [leaderSubmitting, setLeaderSubmitting] = useState(false);
  const [leaderModalError, setLeaderModalError] = useState('');

  // Tag Management States
  const [studentTagModal, setStudentTagModal] = useState<{
    isOpen: boolean;
    student: any;
    studentTags: any[];
    systemTag?: any;
    aiAnalysis?: any;
    loading?: boolean;
    error?: string;
  } | null>(null);

  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [manageTagsModal, setManageTagsModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#4f46e5');
  const [newTagDesc, setNewTagDesc] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);

  const tagColorPalette = [
    '#4f46e5', // Indigo
    '#10b981', // Emerald
    '#ef4444', // Rose / Red
    '#f59e0b', // Amber
    '#8b5cf6', // Purple
    '#0284c7', // Sky Blue
    '#0d9488', // Teal
    '#d97706', // Orange
    '#ec4899', // Pink
    '#475569'  // Slate
  ];

  const userRole = admin?.role || 'ADMIN';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [studentsRes, floorsRes, tagsRes, sessionsRes] = await Promise.all([
        apiClient.get('/students'),
        apiClient.get('/floors'),
        apiClient.get('/tags').catch(() => ({ data: { success: true, data: [] } })),
        apiClient.get('/admin/sessions').catch(() => ({ data: { success: true, data: [] } }))
      ]);
      if (studentsRes.data.success) setStudents(studentsRes.data.data);
      if (floorsRes.data.success) setFloors(floorsRes.data.data);
      if (tagsRes.data.success) setAllTags(tagsRes.data.data);
      if (sessionsRes.data?.success) setAvailableSessions(sessionsRes.data.data);
    } catch (err) {
      console.error('Failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  };

  const generateRandomLeaderPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 8; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setLeaderFormPassword(pwd);
  };

  const handleStudentDoubleClick = (student: any) => {
    const cleanCode = String(student.student_code || '').trim();
    setLeaderFormName(student.name || '');
    setLeaderFormUsername(cleanCode || `leader_${student.student_id || student.id}`);
    setLeaderFormPhone(student.assigned_mobile || student.phone_number || '');
    
    // Auto-generate password
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 8; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setLeaderFormPassword(pwd);

    // Auto-select student's assigned floor
    if (student.floor_id != null && !isNaN(parseInt(String(student.floor_id), 10))) {
      setLeaderFormFloors([parseInt(String(student.floor_id), 10)]);
    } else {
      setLeaderFormFloors([]);
    }

    setLeaderFormSessions(['all']);
    setLeaderModalError('');
    setLeaderModalOpen(true);
  };

  const handleCreateLeaderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (leaderFormFloors.length === 0) {
      setLeaderModalError('Please select at least one assigned floor');
      return;
    }
    if (!leaderFormPassword.trim()) {
      setLeaderModalError('Password is required');
      return;
    }

    setLeaderSubmitting(true);
    setLeaderModalError('');
    try {
      const res = await apiClient.post('/leaders', {
        name: leaderFormName.trim(),
        username: leaderFormUsername.trim(),
        phone_number: leaderFormPhone.trim() || null,
        password: leaderFormPassword,
        assigned_floors: leaderFormFloors,
        assigned_sessions: leaderFormSessions
      });

      if (res.data.success) {
        alert(`User Credential account for "${leaderFormName}" created successfully!\n\nUsername: ${leaderFormUsername}\nPassword: ${leaderFormPassword}`);
        setLeaderModalOpen(false);
      } else {
        setLeaderModalError(res.data.message || 'Failed to create user credential');
      }
    } catch (err: any) {
      setLeaderModalError(err.response?.data?.message || 'Error creating user credential');
    } finally {
      setLeaderSubmitting(false);
    }
  };

  const handleTriggerAiTagAnalysis = async () => {
    if (!window.confirm('Run Gemini AI Tag Analysis on the last 20 days of attendance data? This will use Google Gemini AI to analyze consistency, lateness, and absences, automatically updating student tags.')) return;

    setAiAnalyzing(true);
    try {
      const res = await apiClient.post('/tags/ai-analyze', {
        floor_id: selectedFloor !== 'All' ? selectedFloor : null
      });
      if (res.data.success) {
        alert(`✅ ${res.data.message}`);
        fetchData();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to run Gemini AI analysis');
    } finally {
      setAiAnalyzing(false);
    }
  };

  const toggleDefaultAttendance = async (studentId: string, currentVal: boolean) => {
    try {
      const res = await apiClient.put(`/students/${studentId}/default-attendance`, {
        is_default_present: !currentVal
      });
      if (res.data.success) {
        setStudents(prev => prev.map(s => {
          const sId = s.student_id || s.id;
          if (String(sId) === String(studentId)) {
            return { ...s, is_default_present: !currentVal };
          }
          return s;
        }));
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update default attendance');
    }
  };

  // --- STUDENT TAG ASSIGNMENT HANDLERS ---
  const openStudentTagModal = async (student: any) => {
    const sId = student.student_id || student.id;
    setStudentTagModal({
      isOpen: true,
      student,
      studentTags: student.tags || [],
      loading: true
    });

    try {
      const res = await apiClient.get(`/tags/student/${sId}`);
      if (res.data.success) {
        setStudentTagModal({
          isOpen: true,
          student,
          studentTags: res.data.data.assigned_tags || [],
          systemTag: res.data.data.system_tag,
          aiAnalysis: res.data.data.ai_analysis,
          loading: false
        });
      }
    } catch (err) {
      setStudentTagModal(prev => prev ? { ...prev, loading: false } : null);
    }
  };

  const handleAssignTagToStudent = async (tag: any) => {
    if (!studentTagModal) return;
    const studentId = studentTagModal.student.student_id || studentTagModal.student.id;

    if (studentTagModal.studentTags.length >= 3) {
      setStudentTagModal({
        ...studentTagModal,
        error: 'Maximum 3 manual tags can be assigned per student.'
      });
      return;
    }

    try {
      const res = await apiClient.post(`/tags/student/${studentId}`, { tag_id: tag.id });
      if (res.data.success) {
        const updatedTags = [...studentTagModal.studentTags, tag];
        setStudentTagModal({
          ...studentTagModal,
          studentTags: updatedTags,
          error: undefined
        });

        // Update in global students list
        setStudents(prev => prev.map(s => {
          const id = s.student_id || s.id;
          if (String(id) === String(studentId)) {
            return { ...s, tags: updatedTags };
          }
          return s;
        }));
      }
    } catch (err: any) {
      setStudentTagModal({
        ...studentTagModal,
        error: err.response?.data?.message || 'Failed to assign tag'
      });
    }
  };

  const handleRemoveTagFromStudent = async (tagId: number) => {
    if (!studentTagModal) return;
    const studentId = studentTagModal.student.student_id || studentTagModal.student.id;

    try {
      const res = await apiClient.delete(`/tags/student/${studentId}/${tagId}`);
      if (res.data.success) {
        const updatedTags = studentTagModal.studentTags.filter(t => t.id !== tagId && t.tag_id !== tagId);
        setStudentTagModal({
          ...studentTagModal,
          studentTags: updatedTags,
          error: undefined
        });

        setStudents(prev => prev.map(s => {
          const id = s.student_id || s.id;
          if (String(id) === String(studentId)) {
            return { ...s, tags: updatedTags };
          }
          return s;
        }));
      }
    } catch (err: any) {
      setStudentTagModal({
        ...studentTagModal,
        error: err.response?.data?.message || 'Failed to remove tag'
      });
    }
  };

  // --- GLOBAL TAG CRUD HANDLERS ---
  const handleCreateCustomTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;

    setCreatingTag(true);
    try {
      const res = await apiClient.post('/tags', {
        name: newTagName.trim(),
        color: newTagColor,
        description: newTagDesc.trim() || undefined
      });

      if (res.data.success) {
        setAllTags(prev => [...prev, res.data.data]);
        setNewTagName('');
        setNewTagDesc('');
        alert('Tag created successfully!');
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to create tag');
    } finally {
      setCreatingTag(false);
    }
  };

  const handleDeleteCustomTag = async (tagId: number, isSystem: boolean) => {
    if (isSystem) {
      alert('System default tags cannot be deleted.');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this tag? It will be removed from all assigned students.')) return;

    try {
      const res = await apiClient.delete(`/tags/${tagId}`);
      if (res.data.success) {
        setAllTags(prev => prev.filter(t => t.id !== tagId));
        setStudents(prev => prev.map(s => ({
          ...s,
          tags: (s.tags || []).filter((t: any) => t.id !== tagId && t.tag_id !== tagId)
        })));
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete tag');
    }
  };

  const syncStudents = async () => {
    setLoading(true);
    try {
      await apiClient.post('/students/sync');
      alert('Synced students from central database successfully!');
      fetchData();
    } catch (err) {
      alert('Failed to sync students');
      setLoading(false);
    }
  };

  const deleteStudent = async (studentId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this student?')) return;
    try {
      await apiClient.delete(`/students/${studentId}`);
      alert('Student deleted successfully');
      fetchData();
    } catch (err) {
      alert('Failed to delete student');
    }
  };

  const assignMobile = async (studentId: string, mobile: string) => {
    try {
      await apiClient.put(`/students/${studentId}/mobile`, {
        assigned_mobile: mobile || null
      });
      alert('Mobile number saved successfully!');
      fetchData();
    } catch (err) {
      alert('Error saving mobile number');
    }
  };

  const handleAddStudent = async () => {
    if (!addStudentId.trim()) return;
    setAddingStudent(true);
    try {
      const res = await axios.get(`https://api.avdvvn.org/public/getStudentBasicDetails?bankCode=${addStudentId.trim()}`, {
        headers: { 'x-hsh-auth-token': 'aF92Kx7QmN4Lp8Vz' }
      });
      if (res.data?.success && res.data.data?.length > 0) {
        const studentData = res.data.data[0];
        await apiClient.post('/students', {
          student_code: studentData.bankCode,
          name: studentData.firstName,
          phone_number: studentData.mobileNumber,
        });
        alert('Student added successfully!');
        setAddModalOpen(false);
        setAddStudentId('');
        fetchData();
      } else {
        alert('Student not found in the external database.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to add student. Ensure Student ID is correct.');
    } finally {
      setAddingStudent(false);
    }
  };

  const handleAssignFloor = async () => {
    if (!assignModal) return;
    try {
      await apiClient.put(`/students/${assignModal.studentId}/room`, {
        floor_id: assignModal.currentFloor || null,
        room_number: assignModal.currentRoom || null
      });
      alert('Assigned successfully!');
      fetchData();
      setAssignModal(null);
    } catch (err) {
      console.error(err);
      alert('Failed to assign floor/room.');
    }
  };

  const resetStudentIp = async (studentId: string, studentName: string) => {
    if (!window.confirm(`Reset IP & device binding for "${studentName}"? This will allow the student to log in from a new IP/device.`)) return;
    try {
      const res = await apiClient.post(`/students/${studentId}/reset-ip`);
      alert(res?.data?.message || `IP binding for ${studentName} successfully reset!`);
      fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.message || err?.response?.data?.error || 'Failed to reset IP binding');
    }
  };

  const showStudentDetails = async (studentOrCode: any) => {
    const studentCode = typeof studentOrCode === 'object' && studentOrCode !== null
      ? (studentOrCode.student_code || studentOrCode.id || studentOrCode.student_id)
      : studentOrCode;

    try {
      const res = await apiClient.get(`/students/details/${studentCode}`);
      if (res.data?.success && res.data.data) {
        setDetailsModal(res.data.data);
        return;
      }
    } catch (err) {
      console.warn('Backend details API fallback to memory:', err);
    }

    // Fallback directly to student object from state if API is slow or offline
    const matched = typeof studentOrCode === 'object' && studentOrCode !== null 
      ? studentOrCode 
      : students.find(s => s.student_code === studentCode || String(s.id) === String(studentCode) || String(s.student_id) === String(studentCode));

    if (matched) {
      const nameParts = (matched.name || '').trim().split(' ');
      setDetailsModal({
        bankCode: matched.student_code || studentCode,
        name: matched.name,
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        group: 'Hostel Student',
        dateOfBirth: 'N/A',
        mobileNumber: matched.assigned_mobile || matched.phone_number || 'N/A',
        phone: matched.phone_number || 'N/A',
        parentPhone: matched.parent_phone || matched.father_phone || 'N/A',
        room: matched.room_number || 'Not Assigned',
        floor_name: matched.floor_id ? `Floor ${matched.floor_id}` : 'Unassigned',
        tags: matched.tags || []
      });
      return;
    }

    alert('Student details not found');
  };

  const filteredStudents = students.filter(s => {
    const nameMatch = (s.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const idMatch = String(s.student_code || '').toLowerCase().includes(searchQuery.toLowerCase());
    const isAssigned = s.floor_id != null && s.floor_id !== '';
    
    let assignMatch = true;
    if (assignmentFilter === 'Assigned') assignMatch = isAssigned;
    if (assignmentFilter === 'Unassigned') assignMatch = !isAssigned;

    let floorMatch = true;
    if (selectedFloor !== 'All') {
      floorMatch = String(s.floor_id) === selectedFloor;
    }

    let defaultMatch = true;
    if (defaultFilter === 'Default') defaultMatch = !!s.is_default_present;
    if (defaultFilter === 'Regular') defaultMatch = !s.is_default_present;

    let tagMatch = true;
    if (selectedTagFilter !== 'All') {
      tagMatch = (s.tags || []).some((t: any) => t.name === selectedTagFilter || String(t.id || t.tag_id) === selectedTagFilter);
    }

    return (nameMatch || idMatch || (s.room_number || '').toLowerCase().includes(searchQuery.toLowerCase())) && assignMatch && floorMatch && defaultMatch && tagMatch;
  }).sort((a, b) => {
    if (sortBy === 'name-asc') {
      return (a.name || '').localeCompare(b.name || '');
    }
    if (sortBy === 'name-desc') {
      return (b.name || '').localeCompare(a.name || '');
    }
    if (sortBy === 'room-asc') {
      const roomA = a.room_number ? String(a.room_number).trim() : '';
      const roomB = b.room_number ? String(b.room_number).trim() : '';
      if (!roomA && !roomB) return 0;
      if (!roomA) return 1;
      if (!roomB) return -1;
      const numA = parseInt(roomA.replace(/\D/g, ''), 10);
      const numB = parseInt(roomB.replace(/\D/g, ''), 10);
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
        return numA - numB;
      }
      return roomA.localeCompare(roomB, undefined, { numeric: true });
    }
    if (sortBy === 'room-desc') {
      const roomA = a.room_number ? String(a.room_number).trim() : '';
      const roomB = b.room_number ? String(b.room_number).trim() : '';
      if (!roomA && !roomB) return 0;
      if (!roomA) return 1;
      if (!roomB) return -1;
      const numA = parseInt(roomA.replace(/\D/g, ''), 10);
      const numB = parseInt(roomB.replace(/\D/g, ''), 10);
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
        return numB - numA;
      }
      return roomB.localeCompare(roomA, undefined, { numeric: true });
    }
    if (sortBy === 'id-asc') {
      const numA = parseInt(String(a.student_code || '').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(String(b.student_code || '').replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    }
    if (sortBy === 'id-desc') {
      const numA = parseInt(String(a.student_code || '').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(String(b.student_code || '').replace(/\D/g, ''), 10) || 0;
      return numB - numA;
    }
    return 0;
  });

  // Helper to calculate single tag tint or multi-tag mixed gradient styles
  const getStudentCardTagStyles = (tags: any[]) => {
    if (!tags || tags.length === 0) {
      return {
        cardStyle: {
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          transition: 'all 0.25s ease',
        },
        avatarStyle: {
          backgroundColor: '#e0e7ff',
          color: '#4338ca',
        }
      };
    }

    const tagColors = tags.map((t: any) => t.color || '#4f46e5');

    if (tagColors.length === 1) {
      const c = tagColors[0];
      return {
        cardStyle: {
          background: `linear-gradient(135deg, ${c}15 0%, #ffffff 80%)`,
          border: `1.5px solid ${c}55`,
          boxShadow: `0 4px 14px ${c}18`,
          transition: 'all 0.25s ease',
        },
        avatarStyle: {
          backgroundColor: `${c}22`,
          color: c,
          border: `1.5px solid ${c}60`,
        }
      };
    }

    if (tagColors.length === 2) {
      const [c1, c2] = tagColors;
      return {
        cardStyle: {
          background: `linear-gradient(135deg, ${c1}18 0%, ${c2}18 100%)`,
          border: `1.5px solid ${c1}50`,
          boxShadow: `0 4px 16px ${c1}15, 0 2px 8px ${c2}15`,
          transition: 'all 0.25s ease',
        },
        avatarStyle: {
          background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
          color: '#ffffff',
          boxShadow: `0 2px 8px ${c1}40`,
        }
      };
    }

    // 3 or more tags -> mixed tri-color gradient
    const [c1, c2, c3] = tagColors;
    return {
      cardStyle: {
        background: `linear-gradient(135deg, ${c1}18 0%, ${c2}15 50%, ${c3 || c1}18 100%)`,
        border: `1.5px solid ${c1}50`,
        boxShadow: `0 4px 16px ${c1}15, 0 2px 8px ${c3 || c2}15`,
        transition: 'all 0.25s ease',
      },
      avatarStyle: {
        background: `linear-gradient(135deg, ${c1} 0%, ${c2} 50%, ${c3 || c1} 100%)`,
        color: '#ffffff',
        boxShadow: `0 2px 8px ${c1}40`,
      }
    };
  };

  return (
    <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Student Directory</h2>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0 0' }}>
            Showing {filteredStudents.length} of {students.length} total students
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {userRole !== 'LEADER' && (
            <button
              onClick={handleTriggerAiTagAnalysis}
              disabled={aiAnalyzing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: aiAnalyzing ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 14px rgba(168, 85, 247, 0.35)',
                opacity: aiAnalyzing ? 0.75 : 1
              }}
              title="Analyze student attendance over the last 20 days and automatically update tags (Regular, Irregular, Late)"
            >
              <Sparkles size={16} />
              {aiAnalyzing ? 'Analyzing 20-Day Data...' : '⚡ Auto-Tag with Gemini AI'}
            </button>
          )}

          {userRole !== 'LEADER' && (
            <button
              onClick={() => setManageTagsModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                backgroundColor: '#ffffff',
                color: '#4f46e5',
                border: '1px solid #c7d2fe',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Tag size={16} /> Manage Tags
            </button>
          )}

          {admin?.role !== 'LEADER' && (
            <>
              <button
                onClick={() => setAddModalOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  backgroundColor: '#4f46e5',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
                }}
              >
                <UserPlus size={18} /> Add Student
              </button>

              <button
                onClick={syncStudents}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={16} /> Sync Central DB
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter Row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: '300px' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search by Name or Student ID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', paddingLeft: '38px' }}
          />
        </div>

        {userRole !== 'LEADER' && (
          <>
            <select value={selectedFloor} onChange={e => setSelectedFloor(e.target.value)}>
              <option value="All">All Floors</option>
              {floors.map(f => (
                <option key={f.floor_id} value={String(f.floor_id)}>{f.floor_name || f.name}</option>
              ))}
            </select>

            <select value={assignmentFilter} onChange={e => setAssignmentFilter(e.target.value)}>
              <option value="All">All Students</option>
              <option value="Assigned">Assigned Only</option>
              <option value="Unassigned">Unassigned Only</option>
            </select>

            <select value={defaultFilter} onChange={e => setDefaultFilter(e.target.value)}>
              <option value="All">All Attendance Types</option>
              <option value="Default">Default Present (Auto-Mark)</option>
              <option value="Regular">Regular Attendance</option>
            </select>

            <select value={selectedTagFilter} onChange={e => setSelectedTagFilter(e.target.value)}>
              <option value="All">All Tags</option>
              {allTags.map(t => (
                <option key={t.id} value={t.name}>Tag: {t.name}</option>
              ))}
            </select>

            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ fontWeight: 600, color: '#4338ca', borderColor: '#c7d2fe', backgroundColor: '#eef2ff' }}>
              <option value="name-asc">Sort: Name (A to Z)</option>
              <option value="name-desc">Sort: Name (Z to A)</option>
              <option value="room-asc">Sort: Room (Low to High)</option>
              <option value="room-desc">Sort: Room (High to Low)</option>
              <option value="id-asc">Sort: Student ID (Asc)</option>
              <option value="id-desc">Sort: Student ID (Desc)</option>
            </select>
          </>
        )}
      </div>

      {/* Students List */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading students...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {filteredStudents.map(student => {
            const isAssigned = student.floor_id != null;
            const { cardStyle, avatarStyle } = getStudentCardTagStyles(student.tags || []);
            return (
              <HamsCard 
                key={student.student_id || student.id} 
                padding="18px" 
                style={{ ...cardStyle, cursor: 'pointer' }}
                onDoubleClick={() => showStudentDetails(student)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '16px',
                    ...avatarStyle
                  }}>
                    {(student.name || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {student.name}
                    </h4>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                      ID: <strong style={{ color: '#4f46e5' }}>{student.student_code || 'N/A'}</strong>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: '12px',
                      backgroundColor: isAssigned ? '#ecfdf5' : '#fef2f2',
                      color: isAssigned ? '#166534' : '#991b1b',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}>
                      {isAssigned ? `Floor ${student.floor_id}` : 'Unassigned'}
                    </span>
                    {student.is_default_present ? (
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: '10px',
                        backgroundColor: '#e0e7ff',
                        color: '#4338ca',
                        border: '1px solid #c7d2fe',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}>
                        ⚡ Auto-Present
                      </span>
                    ) : null}
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                  <span>Room: <strong>{student.room_number || 'None'}</strong></span>
                  <span>Mobile: <strong>{student.assigned_mobile || student.phone_number || 'Unassigned'}</strong></span>
                  <span>Parent: <strong>{student.parent_phone || student.father_phone || student.mother_phone || 'None'}</strong></span>
                </div>

                {/* Assigned Tags List */}
                {(student.tags || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '12px' }}>
                    {(student.tags || []).map((t: any) => (
                      <span
                        key={t.id || t.tag_id}
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: `${t.color || '#4f46e5'}15`,
                          color: t.color || '#4f46e5',
                          border: `1px solid ${t.color || '#4f46e5'}35`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                      >
                        🏷️ {t.name}
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                  <button
                    onClick={() => setMobileModal({ isOpen: true, studentId: student.student_id || student.id, currentMobile: student.assigned_mobile || '' })}
                    style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 600, border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#ffffff', color: '#334155', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Phone size={13} /> Mobile
                  </button>

                  <button
                    onClick={() => openStudentTagModal(student)}
                    style={{ 
                      padding: '6px 10px', 
                      fontSize: '12px', 
                      fontWeight: 600, 
                      border: '1px solid #cbd5e1', 
                      borderRadius: '6px', 
                      backgroundColor: (student.tags || []).length > 0 ? '#eff6ff' : '#ffffff', 
                      color: (student.tags || []).length > 0 ? '#1d4ed8' : '#334155', 
                      cursor: 'pointer', 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '4px' 
                    }}
                  >
                    <Tag size={13} /> Tags ({(student.tags || []).length}/3)
                  </button>

                  {userRole !== 'LEADER' && (
                    <>
                      <button
                        onClick={() => setAssignModal({isOpen: true, studentId: student.student_id || student.id, currentFloor: String(student.floor_id || ''), currentRoom: student.room_number || ''})}
                        style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 600, border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#ffffff', color: '#334155', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Edit2 size={13} /> Room
                      </button>

                      <button
                        onClick={() => showStudentDetails(student)}
                        style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 600, border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#ffffff', color: '#334155', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Info size={13} /> Details
                      </button>

                      <button
                        onClick={() => toggleDefaultAttendance(student.student_id || student.id, !!student.is_default_present)}
                        title={student.is_default_present ? 'Disable Auto-Mark on Session Start' : 'Enable Auto-Mark on Session Start'}
                        style={{
                          padding: '6px 10px',
                          fontSize: '12px',
                          fontWeight: 700,
                          border: student.is_default_present ? '1px solid #10b981' : '1px solid #cbd5e1',
                          borderRadius: '6px',
                          backgroundColor: student.is_default_present ? '#ecfdf5' : '#ffffff',
                          color: student.is_default_present ? '#047857' : '#334155',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <CheckCircle2 size={13} color={student.is_default_present ? '#10b981' : '#64748b'} />
                        {student.is_default_present ? 'Default ON' : 'Default Att.'}
                      </button>

                      {canResetIp && (
                        <button
                          onClick={() => resetStudentIp(student.student_id || student.id, student.name)}
                          title="Reset bound IP / device address to allow login from new network"
                          style={{
                            padding: '6px 10px',
                            fontSize: '12px',
                            fontWeight: 700,
                            border: '1px solid #e0e7ff',
                            borderRadius: '6px',
                            backgroundColor: '#f5f3ff',
                            color: '#6366f1',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <RotateCcw size={13} color="#6366f1" />
                          Reset IP
                        </button>
                      )}

                      <button
                        onClick={() => deleteStudent(student.student_id || student.id)}
                        style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 600, border: '1px solid #fecaca', borderRadius: '6px', backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer', marginLeft: 'auto' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </HamsCard>
            );
          })}
        </div>
      )}

      {/* MODAL 1: STUDENT TAG ASSIGNMENT MODAL (MAX 3 MANUAL TAGS) */}
      {studentTagModal?.isOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110 }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                  Manage Student Tags
                </h3>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                  {studentTagModal.student.name} ({studentTagModal.student.student_code}) • Floor {studentTagModal.student.floor_id || 'N/A'}
                </p>
              </div>
              <button onClick={() => setStudentTagModal(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {studentTagModal.error && (
              <div style={{ padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', fontSize: '13px', fontWeight: 600, marginBottom: '14px' }}>
                ⚠️ {studentTagModal.error}
              </div>
            )}

            {/* Dynamic System Behavioral Tag */}
            {studentTagModal.systemTag && (
              <div style={{ padding: '12px 14px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                  🤖 System Behavioral Status (Auto-Calculated)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    padding: '3px 10px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 800,
                    backgroundColor: `${studentTagModal.systemTag.color}20`,
                    color: studentTagModal.systemTag.color,
                    border: `1px solid ${studentTagModal.systemTag.color}50`
                  }}>
                    {studentTagModal.systemTag.name}
                  </span>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    {studentTagModal.systemTag.description}
                  </span>
                </div>
              </div>
            )}

            {/* Gemini AI Analysis Findings (Last 20 Days) */}
            {studentTagModal.aiAnalysis && (
              <div style={{ padding: '12px 14px', backgroundColor: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '10px', marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase' }}>
                    <Sparkles size={13} /> Gemini AI Attendance Audit (20 Days)
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#8b5cf6', backgroundColor: '#ede9fe', padding: '2px 8px', borderRadius: '6px' }}>
                    {studentTagModal.aiAnalysis.assigned_tag}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#334155', fontWeight: 600, lineHeight: 1.4 }}>
                  {studentTagModal.aiAnalysis.reason}
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px' }}>
                  Analyzed on: {new Date(studentTagModal.aiAnalysis.analyzed_at).toLocaleString()}
                </div>
              </div>
            )}

            {/* Currently Assigned Manual Tags */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                  Assigned Tags ({studentTagModal.studentTags.length} / 3 Maximum):
                </label>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Visible to Admin & Leader only</span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', minHeight: '38px', padding: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                {studentTagModal.studentTags.length === 0 ? (
                  <span style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' }}>No manual tags assigned yet.</span>
                ) : (
                  studentTagModal.studentTags.map(tag => (
                    <span
                      key={tag.id || tag.tag_id}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        backgroundColor: `${tag.color || '#4f46e5'}20`,
                        color: tag.color || '#4f46e5',
                        border: `1px solid ${tag.color || '#4f46e5'}50`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      🏷️ {tag.name}
                      <button
                        type="button"
                        onClick={() => handleRemoveTagFromStudent(tag.id || tag.tag_id)}
                        style={{ background: 'none', border: 'none', color: tag.color || '#4f46e5', cursor: 'pointer', padding: 0, display: 'inline-flex' }}
                        title="Remove Tag"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Available Tags to Add */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                Add a Tag:
              </label>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '140px', overflowY: 'auto', padding: '4px' }}>
                {allTags.map(tag => {
                  const alreadyHas = studentTagModal.studentTags.some(t => (t.id || t.tag_id) === tag.id);
                  const isLimitReached = studentTagModal.studentTags.length >= 3;

                  return (
                    <button
                      key={tag.id}
                      type="button"
                      disabled={alreadyHas || isLimitReached}
                      onClick={() => handleAssignTagToStudent(tag)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        backgroundColor: alreadyHas ? '#f1f5f9' : `${tag.color}15`,
                        color: alreadyHas ? '#94a3b8' : tag.color,
                        border: `1px solid ${alreadyHas ? '#e2e8f0' : `${tag.color}40`}`,
                        cursor: (alreadyHas || isLimitReached) ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      {alreadyHas ? '✓ ' : '+ '} {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
              {userRole !== 'LEADER' && (
                <button
                  type="button"
                  onClick={() => { setStudentTagModal(null); setManageTagsModal(true); }}
                  style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  + Create New Custom Tag
                </button>
              )}
              <button
                type="button"
                onClick={() => setStudentTagModal(null)}
                style={{ padding: '8px 18px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', color: '#475569', marginLeft: 'auto' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: MANAGE GLOBAL TAGS MODAL (ADMIN ONLY) */}
      {manageTagsModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110 }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                  Tag Management & Creator
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                  Create custom tags to label students (visible to Admin & Leaders).
                </p>
              </div>
              <button onClick={() => setManageTagsModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {/* Create Tag Form */}
            <form onSubmit={handleCreateCustomTag} style={{ padding: '16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '10px' }}>
                + Create New Custom Tag
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  TAG NAME <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  placeholder="e.g. Sports Team, Library Duty, High Risk..."
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  TAG COLOR
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {tagColorPalette.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewTagColor(color)}
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        backgroundColor: color,
                        border: newTagColor === color ? '3px solid #0f172a' : '2px solid #ffffff',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        cursor: 'pointer'
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  DESCRIPTION (OPTIONAL)
                </label>
                <input
                  type="text"
                  value={newTagDesc}
                  onChange={e => setNewTagDesc(e.target.value)}
                  placeholder="Short note about what this tag indicates..."
                  style={{ width: '100%' }}
                />
              </div>

              <button
                type="submit"
                disabled={creatingTag || !newTagName.trim()}
                style={{
                  padding: '8px 18px',
                  backgroundColor: '#4f46e5',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: creatingTag ? 'not-allowed' : 'pointer'
                }}
              >
                {creatingTag ? 'Creating...' : 'Create Tag'}
              </button>
            </form>

            {/* Existing Tags Table */}
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '10px' }}>
                Existing Tags ({allTags.length})
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {allTags.map(tag => (
                  <div
                    key={tag.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 700,
                          backgroundColor: `${tag.color}20`,
                          color: tag.color,
                          border: `1px solid ${tag.color}50`
                        }}
                      >
                        🏷️ {tag.name}
                      </span>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        {tag.is_system ? '(Default System Tag)' : (tag.description || 'Custom tag')}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
                        {tag.student_count || 0} students
                      </span>
                      {!tag.is_system && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomTag(tag.id, !!tag.is_system)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                          title="Delete Tag"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setManageTagsModal(false)}
                style={{ padding: '8px 18px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', color: '#475569' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {addModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Add Student</h3>
              <X size={20} style={{ cursor: 'pointer', color: '#64748b' }} onClick={() => setAddModalOpen(false)} />
            </div>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
              Enter the student's ID to fetch and add them to the attendance database.
            </p>
            <input
              type="text"
              value={addStudentId}
              onChange={e => setAddStudentId(e.target.value)}
              placeholder="e.g. 1723"
              autoFocus
              style={{ width: '100%', marginBottom: '20px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setAddModalOpen(false)} style={{ padding: '10px 16px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleAddStudent} disabled={addingStudent} style={{ padding: '10px 18px', backgroundColor: '#4f46e5', color: '#ffffff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>
                {addingStudent ? 'Adding...' : 'Add Student'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Modal */}
      {mobileModal?.isOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 800 }}>Assign Mobile Number</h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>Enter the student's phone number for WhatsApp reminders.</p>
            <input
              type="text"
              value={mobileModal.currentMobile}
              onChange={e => setMobileModal({ ...mobileModal, currentMobile: e.target.value })}
              placeholder="e.g. 9876543210"
              autoFocus
              style={{ width: '100%', marginBottom: '20px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setMobileModal(null)} style={{ padding: '10px 16px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={() => { assignMobile(mobileModal.studentId, mobileModal.currentMobile); setMobileModal(null); }} style={{ padding: '10px 18px', backgroundColor: '#4f46e5', color: '#ffffff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Floor & Room Modal */}
      {assignModal?.isOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 800 }}>Assign Floor & Room</h3>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>FLOOR</label>
              <select
                value={assignModal.currentFloor}
                onChange={e => setAssignModal({ ...assignModal, currentFloor: e.target.value })}
                style={{ width: '100%' }}
              >
                <option value="">Select Floor</option>
                {floors.map(f => (
                  <option key={f.floor_id} value={String(f.floor_id)}>{f.floor_name || f.name}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>ROOM NUMBER</label>
              <input
                type="text"
                value={assignModal.currentRoom}
                onChange={e => setAssignModal({ ...assignModal, currentRoom: e.target.value })}
                placeholder="e.g. 101"
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setAssignModal(null)} style={{ padding: '10px 16px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleAssignFloor} style={{ padding: '10px 18px', backgroundColor: '#4f46e5', color: '#ffffff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {detailsModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '620px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px 24px',
              borderBottom: '1px solid #f1f5f9',
              position: 'sticky',
              top: 0,
              backgroundColor: '#ffffff',
              zIndex: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  backgroundColor: '#eef2ff',
                  color: '#4f46e5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  fontWeight: 800
                }}>
                  {(detailsModal.name || detailsModal.firstName || '?')[0]?.toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                    {detailsModal.name || `${detailsModal.firstName || ''} ${detailsModal.lastName || ''}`.trim()}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#4f46e5', backgroundColor: '#eef2ff', padding: '2px 8px', borderRadius: '6px' }}>
                      ID: {detailsModal.bankCode}
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      {detailsModal.floor_name || (detailsModal.floor_id ? `Floor ${detailsModal.floor_id}` : 'Unassigned')} • Room {detailsModal.room || detailsModal.room_number || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setDetailsModal(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Basic Contact & Profile Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: '12px',
                padding: '14px',
                backgroundColor: '#f8fafc',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                fontSize: '13px'
              }}>
                <div>
                  <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, display: 'block' }}>MOBILE NUMBER</span>
                  <strong style={{ color: '#0f172a' }}>{detailsModal.mobileNumber || detailsModal.phone || 'N/A'}</strong>
                </div>
                {detailsModal.parentPhone && detailsModal.parentPhone !== 'N/A' && (
                  <div>
                    <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, display: 'block' }}>PARENT PHONE</span>
                    <strong style={{ color: '#0f172a' }}>{detailsModal.parentPhone}</strong>
                  </div>
                )}
                <div>
                  <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, display: 'block' }}>STUDENT GROUP</span>
                  <strong style={{ color: '#0f172a' }}>{detailsModal.group || 'Hostel Student'}</strong>
                </div>
                {detailsModal.emailId && detailsModal.emailId !== 'N/A' && (
                  <div>
                    <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, display: 'block' }}>EMAIL</span>
                    <strong style={{ color: '#0f172a' }}>{detailsModal.emailId}</strong>
                  </div>
                )}
                {detailsModal.city && detailsModal.city !== 'N/A' && (
                  <div>
                    <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, display: 'block' }}>CITY / STATE</span>
                    <strong style={{ color: '#0f172a' }}>{detailsModal.city}</strong>
                  </div>
                )}
                <div>
                  <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, display: 'block' }}>AUTO-ATTENDANCE</span>
                  <strong style={{ color: detailsModal.is_default_present ? '#059669' : '#64748b' }}>
                    {detailsModal.is_default_present ? '✅ Default Present ON' : 'Standard (Manual/Scan)'}
                  </strong>
                </div>
              </div>

              {/* SECTION 1: SESSION-WISE ATTENDANCE PERCENTAGES */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px', backgroundColor: '#ffffff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={16} color="#4f46e5" />
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                      Session Attendance Breakdown
                    </h4>
                  </div>
                  {detailsModal.overall_stats && (
                    <span style={{
                      fontSize: '12px',
                      fontWeight: 800,
                      padding: '3px 10px',
                      borderRadius: '12px',
                      backgroundColor: (detailsModal.overall_stats.percentage || 0) >= 75 ? '#ecfdf5' : (detailsModal.overall_stats.percentage || 0) >= 40 ? '#fffbeb' : '#fef2f2',
                      color: (detailsModal.overall_stats.percentage || 0) >= 75 ? '#059669' : (detailsModal.overall_stats.percentage || 0) >= 40 ? '#d97706' : '#dc2626'
                    }}>
                      Overall: {detailsModal.overall_stats.percentage || 0}% ({detailsModal.overall_stats.total_attended || 0}/{detailsModal.overall_stats.total_held || 0})
                    </span>
                  )}
                </div>

                {/* Session Percentages Grid */}
                {(!detailsModal.session_stats || detailsModal.session_stats.length === 0) ? (
                  <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                    No session attendance records available yet.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
                    {detailsModal.session_stats.map((sess: any) => {
                      const perc = sess.percentage || 0;
                      const isGood = perc >= 75;
                      const isMed = perc >= 40 && perc < 75;
                      const color = isGood ? '#10b981' : isMed ? '#f59e0b' : '#ef4444';
                      const bg = isGood ? '#ecfdf5' : isMed ? '#fffbeb' : '#fef2f2';

                      return (
                        <div
                          key={sess.session_key}
                          style={{
                            padding: '10px 12px',
                            backgroundColor: '#f8fafc',
                            borderRadius: '10px',
                            border: '1px solid #e2e8f0',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>
                              {sess.session_name}
                            </span>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 800,
                              color: color,
                              backgroundColor: bg,
                              padding: '2px 6px',
                              borderRadius: '6px'
                            }}>
                              {perc}%
                            </span>
                          </div>

                          {/* Progress Bar */}
                          <div style={{ width: '100%', height: '5px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${Math.min(100, Math.max(0, perc))}%`,
                                height: '100%',
                                backgroundColor: color,
                                borderRadius: '3px',
                                transition: 'width 0.3s ease'
                              }}
                            />
                          </div>

                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            Attended: <strong>{sess.attended}</strong> / {sess.held} held
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SECTION 2: SECURITY & BROKEN RULES AUDIT LOG */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px', backgroundColor: '#ffffff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <ShieldAlert size={16} color="#dc2626" />
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                    Security, Mistakes & Rule Infraction Logs
                  </h4>
                </div>

                {/* Device & IP Security Logs */}
                {((detailsModal.security_logs && detailsModal.security_logs.length > 0) ||
                  (detailsModal.ai_audit_logs && detailsModal.ai_audit_logs.length > 0) ||
                  (detailsModal.absent_records && detailsModal.absent_records.length > 0)) ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto', paddingRight: '4px' }}>
                    {/* Device IP Conflicts */}
                    {(detailsModal.security_logs || []).map((log: any) => (
                      <div
                        key={log.id}
                        style={{
                          padding: '10px 12px',
                          backgroundColor: '#fef2f2',
                          border: '1px solid #fecaca',
                          borderRadius: '10px',
                          fontSize: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 800, color: '#991b1b', textTransform: 'uppercase', fontSize: '11px' }}>
                            🚨 {log.event_type || 'SECURITY CONFLICT'}
                          </span>
                          <span style={{ fontSize: '10px', fontWeight: 700, color: '#dc2626', backgroundColor: '#fee2e2', padding: '2px 6px', borderRadius: '4px' }}>
                            {log.status || 'BLOCKED'} • {new Date(log.attempted_at).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ color: '#451a03', fontWeight: 600, lineHeight: 1.4 }}>
                          {log.details || `Cross-account login attempt detected with IP ${log.ip_address}`}
                        </div>
                        <div style={{ fontSize: '11px', color: '#7f1d1d', marginTop: '4px' }}>
                          IP: <code>{log.ip_address}</code> {log.device_uuid ? `• Device: ${log.device_uuid.slice(0, 16)}...` : ''}
                        </div>
                      </div>
                    ))}

                    {/* AI Behavioral Findings */}
                    {(detailsModal.ai_audit_logs || []).map((ai: any) => (
                      <div
                        key={ai.id}
                        style={{
                          padding: '10px 12px',
                          backgroundColor: '#fffbeb',
                          border: '1px solid #fde68a',
                          borderRadius: '10px',
                          fontSize: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 800, color: '#92400e', fontSize: '11px' }}>
                            🤖 AI BEHAVIORAL AUDIT: {ai.assigned_tag}
                          </span>
                          <span style={{ fontSize: '10px', color: '#b45309' }}>
                            {new Date(ai.analyzed_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div style={{ color: '#78350f', fontWeight: 600 }}>
                          {ai.reason}
                        </div>
                      </div>
                    ))}

                    {/* Recorded Absences */}
                    {(detailsModal.absent_records || []).map((abs: any) => (
                      <div
                        key={abs.id}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          fontSize: '12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 700, color: '#334155' }}>Absence on {abs.session_date}:</span>{' '}
                          <span style={{ color: '#64748b' }}>{abs.reason || 'Unexcused Absence'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    padding: '14px',
                    backgroundColor: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    color: '#065f46',
                    fontSize: '12px',
                    fontWeight: 600
                  }}>
                    <ShieldCheck size={18} color="#059669" />
                    <span>Clean Security Record: No device conflicts, unauthorized login attempts, or rule infractions logged for this student.</span>
                  </div>
                )}
              </div>

              {/* SECTION 3: DEVICE & IP BINDING */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 14px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px'
              }}>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', textTransform: 'uppercase' }}>
                    Bound Network IP
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                    {detailsModal.bound_ip || 'No IP Bound (Free to Login)'}
                  </span>
                </div>
                {canResetIp && (
                  <button
                    type="button"
                    onClick={() => resetStudentIp(detailsModal.student_id || detailsModal.id || detailsModal.bankCode, detailsModal.name || detailsModal.firstName)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      borderRadius: '8px',
                      border: '1px solid #c7d2fe',
                      backgroundColor: '#eef2ff',
                      color: '#4f46e5',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <RotateCcw size={12} /> Reset Bound IP
                  </button>
                )}
              </div>

              {/* SECTION 4: ASSIGNED TAGS */}
              {detailsModal.tags && detailsModal.tags.length > 0 && (
                <div>
                  <strong style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Assigned Tags:
                  </strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {detailsModal.tags.map((t: any) => (
                      <span
                        key={t.id || t.name}
                        style={{
                          backgroundColor: `${t.color || '#4f46e5'}15`,
                          color: t.color || '#4f46e5',
                          border: `1px solid ${t.color || '#4f46e5'}40`,
                          borderRadius: '6px',
                          padding: '3px 10px',
                          fontSize: '12px',
                          fontWeight: 700
                        }}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Double-Click: Create New Floor Leader Modal */}
      {leaderModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 150,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '560px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px 24px',
              borderBottom: '1px solid #f1f5f9'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: '#eef2ff',
                  color: '#4f46e5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <UserCheck size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                    Create User Credential
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                    Assign multiple floors and set login ID & password
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLeaderModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: '6px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleCreateLeaderSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {leaderModalError && (
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fee2e2',
                  borderRadius: '10px',
                  color: '#ef4444',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertCircle size={16} />
                  <span>{leaderModalError}</span>
                </div>
              )}

              {/* Full Name */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Leader Full Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={leaderFormName}
                  onChange={(e) => setLeaderFormName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>

              {/* Login ID / Username & Phone */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Login ID / Username <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. leader_fl_1_2"
                    value={leaderFormUsername}
                    onChange={(e) => setLeaderFormUsername(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                      fontSize: '14px',
                      fontFamily: 'monospace',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Phone Number (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 9876543210"
                    value={leaderFormPhone}
                    onChange={(e) => setLeaderFormPhone(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                    Login Password <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <button
                    type="button"
                    onClick={generateRandomLeaderPassword}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#4f46e5',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    🎲 Generate Password
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={leaderShowPassword ? 'text' : 'password'}
                    placeholder="Enter password"
                    value={leaderFormPassword}
                    onChange={(e) => setLeaderFormPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '11px 40px 11px 14px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setLeaderShowPassword(!leaderShowPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer'
                    }}
                  >
                    {leaderShowPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* MULTI-FLOOR SELECTION */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                    Select Assigned Floors <span style={{ color: '#ef4444' }}>*</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginLeft: '6px' }}>
                      ({leaderFormFloors.length} selected)
                    </span>
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setLeaderFormFloors([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])}
                      style={{
                        background: '#f1f5f9',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#475569',
                        cursor: 'pointer'
                      }}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeaderFormFloors([])}
                      style={{
                        background: '#f1f5f9',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#475569',
                        cursor: 'pointer'
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '8px',
                  padding: '12px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px'
                }}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(fl => {
                    const isSelected = leaderFormFloors.includes(fl);
                    return (
                      <button
                        key={fl}
                        type="button"
                        onClick={() => {
                          setLeaderFormFloors(prev => 
                            prev.includes(fl) ? prev.filter(f => f !== fl) : [...prev, fl].sort((a, b) => a - b)
                          );
                        }}
                        style={{
                          padding: '10px 8px',
                          borderRadius: '8px',
                          border: isSelected ? '1.5px solid #6366f1' : '1px solid #cbd5e1',
                          backgroundColor: isSelected ? '#eef2ff' : '#ffffff',
                          color: isSelected ? '#4338ca' : '#475569',
                          fontWeight: isSelected ? 800 : 600,
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {isSelected && <Check size={14} color="#4f46e5" />}
                        Floor {fl}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SESSIONS ASSIGNMENT */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                    Assign Allowed Sessions <span style={{ color: '#ef4444' }}>*</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginLeft: '6px' }}>
                      ({leaderFormSessions.includes('all') ? 'All Sessions' : `${leaderFormSessions.length} specific`})
                    </span>
                  </label>
                  {leaderFormSessions.includes('all') && (
                    <span style={{
                      padding: '2px 8px',
                      backgroundColor: '#ecfdf5',
                      border: '1px solid #a7f3d0',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#059669'
                    }}>
                      All Sessions (Full Access)
                    </span>
                  )}
                </div>

                <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
                  Choose which sessions this leader can see, manage live attendance for, and target students.
                </p>

                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  padding: '12px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px'
                }}>
                  {/* Option 1: All Sessions */}
                  <button
                    type="button"
                    onClick={() => setLeaderFormSessions(['all'])}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: leaderFormSessions.includes('all') ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                      backgroundColor: leaderFormSessions.includes('all') ? '#ecfdf5' : '#ffffff',
                      color: leaderFormSessions.includes('all') ? '#047857' : '#475569',
                      fontWeight: leaderFormSessions.includes('all') ? 800 : 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    🌟 All Sessions
                    {leaderFormSessions.includes('all') && <Check size={14} color="#059669" />}
                  </button>

                  {/* Dynamic Sessions */}
                  {availableSessions.map((ses: any) => {
                    const isSelected = !leaderFormSessions.includes('all') && leaderFormSessions.includes(ses.session_key);
                    return (
                      <button
                        key={ses.session_key}
                        type="button"
                        onClick={() => {
                          setLeaderFormSessions(prev => {
                            let updated = prev.filter(s => s !== 'all');
                            if (updated.includes(ses.session_key)) {
                              updated = updated.filter(s => s !== ses.session_key);
                            } else {
                              updated.push(ses.session_key);
                            }
                            return updated.length === 0 ? ['all'] : updated;
                          });
                        }}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '8px',
                          border: isSelected ? '1.5px solid #6366f1' : '1px solid #cbd5e1',
                          backgroundColor: isSelected ? '#eef2ff' : '#ffffff',
                          color: isSelected ? '#4338ca' : '#475569',
                          fontWeight: isSelected ? 800 : 600,
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        {ses.session_name}
                        {isSelected && <Check size={14} color="#4f46e5" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Modal Actions */}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
                marginTop: '10px',
                paddingTop: '16px',
                borderTop: '1px solid #f1f5f9'
              }}>
                <button
                  type="button"
                  onClick={() => setLeaderModalOpen(false)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={leaderSubmitting}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: leaderSubmitting ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <UserCheck size={16} />
                  {leaderSubmitting ? 'Creating...' : 'Create User Credential'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

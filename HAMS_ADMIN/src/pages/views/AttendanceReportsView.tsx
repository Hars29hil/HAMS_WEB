import React, { useEffect, useState } from 'react';
import { Download, Filter, ChevronDown, ChevronUp, Search, FileSpreadsheet } from 'lucide-react';
import axios from 'axios';
import apiClient from '../../services/apiClient';
import { HamsCard } from '../../components/HamsCard';

export const AttendanceReportsView: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [allGroups, setAllGroups] = useState<string[]>([]);
  const [reportData, setReportData] = useState<any>({});
  
  const [allTypes, setAllTypes] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name-asc');

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => {
      fetchData(false);
    }, 4000);

    return () => clearInterval(interval);
  }, [timeFilter]);

  const fetchData = async (isInitial = false) => {
    if (isInitial && allStudents.length === 0) setLoading(true);
    try {
      const [sessionRes, reportRes] = await Promise.all([
        allTypes.length === 0 ? apiClient.get('/admin/sessions') : Promise.resolve({ data: { success: false } }),
        apiClient.get(`/admin/reports?time_filter=${timeFilter}`)
      ]);

      let availableSessionTypes = allTypes;
      if (sessionRes.data?.success && Array.isArray(sessionRes.data.data)) {
        const types = sessionRes.data.data.map((s: any) => s.session_key);
        if (types.length > 0) {
          availableSessionTypes = types;
          setAllTypes(types);
          if (selectedTypes.length === 0) setSelectedTypes(types);
        }
      }

      if (reportRes.data?.success) {
        setReportData(reportRes.data);
        const totalsKeys = Object.keys(reportRes.data.totals || {});
        if (availableSessionTypes.length === 0 && totalsKeys.length > 0) {
          setAllTypes(totalsKeys);
          if (selectedTypes.length === 0) setSelectedTypes(totalsKeys);
        }

        if (reportRes.data.students && Array.isArray(reportRes.data.students)) {
          setAllStudents(reportRes.data.students);
          const groups = new Set<string>();
          reportRes.data.students.forEach((s: any) => {
            const grp = (s.group || s.groupName || '').trim();
            if (grp) groups.add(grp);
          });
          setAllGroups(Array.from(groups).sort());
        }
      }
    } catch (err) {
      console.error('Failed to load reports', err);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  const getFilteredData = () => {
    if (!reportData) return [];

    let filteredList: any[] = [];
    const totals = reportData.totals || {};
    const totalsKeys = Object.keys(totals);
    const activeTypes = selectedTypes.length > 0 
      ? selectedTypes 
      : (allTypes.length > 0 ? allTypes : (totalsKeys.length > 0 ? totalsKeys : ['night']));

    let totalPossible = 0;
    activeTypes.forEach(type => {
      totalPossible += (totals[type] || 0);
    });

    const studentsToProcess = (reportData.students && Array.isArray(reportData.students) && reportData.students.length > 0) 
      ? reportData.students 
      : allStudents;

    studentsToProcess.forEach(student => {
      const studentGroup = (student.group || student.groupName || '').trim();
      if (selectedGroups.length > 0 && studentGroup && !selectedGroups.includes(studentGroup)) {
        return;
      }

      const studentIdStr = String(student.bankCode || student.student_code || student.id || '');
      const cleanCode = studentIdStr.replace(/^0+/, '');

      let roomNo = student.room_number || student.room;
      let floorId = student.floor_id !== undefined && student.floor_id !== null ? student.floor_id : student.floor;
      
      if ((floorId === undefined || floorId === null || floorId === '') && roomNo && !isNaN(parseInt(roomNo, 10))) {
        const rNum = parseInt(roomNo, 10);
        if (rNum >= 100) {
          floorId = Math.floor(rNum / 100);
        }
      }

      const floorName = student.floor_name || (floorId !== undefined && floorId !== null && floorId !== '' ? (floorId === 0 ? 'Ground Floor' : `Floor ${floorId}`) : null);

      const nameMatch = (student.name || `${student.firstName || ''} ${student.lastName || ''}`).toLowerCase().includes(searchQuery.toLowerCase());
      const idMatch = studentIdStr.toLowerCase().includes(searchQuery.toLowerCase());
      const roomMatch = String(roomNo || '').toLowerCase().includes(searchQuery.toLowerCase());
      const floorMatch = String(floorName || '').toLowerCase().includes(searchQuery.toLowerCase());
      if (searchQuery && !nameMatch && !idMatch && !roomMatch && !floorMatch) return;

      let studentRecords = reportData.studentRecords || {};
      let record = studentRecords[studentIdStr] || studentRecords[cleanCode];
      
      let leaveRecords = reportData.leaveRecords || {};
      let studentLeave = leaveRecords[studentIdStr] || leaveRecords[cleanCode] || {};

      let attended = 0;
      let totalLeaves = 0;
      if (record) {
        activeTypes.forEach(type => {
          attended += (record[type] || 0);
        });
      }
      activeTypes.forEach(type => {
        totalLeaves += (studentLeave[type] || 0);
      });
      
      const lateRecords = reportData.lateRecords || {};
      let lateCount = lateRecords[studentIdStr] || lateRecords[cleanCode] || 0;

      if (statusFilter === 'present' && attended === 0) return;
      if (statusFilter === 'absent' && attended > 0) return;
      if (statusFilter === 'late' && lateCount === 0) return;

      const effectiveTotal = Math.max(0, totalPossible - totalLeaves);
      const percentage = effectiveTotal > 0 
        ? (attended / effectiveTotal) * 100 
        : (totalPossible > 0 && totalLeaves >= totalPossible ? 100 : 0);

      let breakdown: any = {};
      activeTypes.forEach(type => {
        const tAtt = record ? (record[type] || 0) : 0;
        const tTot = totals[type] || 0;
        const tLeaves = studentLeave[type] || 0;
        const tEffective = Math.max(0, tTot - tLeaves);
        const tPerc = tEffective > 0 ? (tAtt / tEffective) * 100 : (tTot > 0 && tLeaves >= tTot ? 100 : 0);
        breakdown[type] = { attended: tAtt, total: tTot, leaves: tLeaves, effectiveTotal: tEffective, percentage: tPerc };
      });

      filteredList.push({
        studentId: studentIdStr,
        name: student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unknown',
        group: studentGroup,
        roomNo: roomNo || null,
        floorId: floorId !== undefined && floorId !== null ? floorId : null,
        floorName: floorName || null,
        tags: student.tags || [],
        attended,
        leaves: totalLeaves,
        effectiveTotal,
        total: totalPossible,
        percentage,
        breakdown
      });
    });

    filteredList.sort((a, b) => {
      if (sortBy === 'name-asc') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'name-desc') {
        return (b.name || '').localeCompare(a.name || '');
      }
      if (sortBy === 'room-asc') {
        const roomA = a.roomNo ? String(a.roomNo).trim() : '';
        const roomB = b.roomNo ? String(b.roomNo).trim() : '';
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
        const roomA = a.roomNo ? String(a.roomNo).trim() : '';
        const roomB = b.roomNo ? String(b.roomNo).trim() : '';
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
      if (sortBy === 'percentage-desc') {
        return b.percentage - a.percentage;
      }
      if (sortBy === 'percentage-asc') {
        return a.percentage - b.percentage;
      }
      if (sortBy === 'id-asc') {
        const numA = parseInt(String(a.studentId || '').replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(String(b.studentId || '').replace(/\D/g, ''), 10) || 0;
        return numA - numB;
      }
      if (sortBy === 'id-desc') {
        const numA = parseInt(String(a.studentId || '').replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(String(b.studentId || '').replace(/\D/g, ''), 10) || 0;
        return numB - numA;
      }
      return 0;
    });
    return filteredList;
  };

  const exportToCsv = () => {
    const data = getFilteredData();
    if (data.length === 0) return;

    let csv = 'Student ID,Name,Floor,Room,Group,Attended,Leaves,Effective Days,Total Days,Percentage\n';
    data.forEach(item => {
      csv += `${item.studentId},"${item.name}","${item.floorName}","${item.roomNo}","${item.group}",${item.attended},${item.leaves},${item.effectiveTotal},${item.total},${item.percentage.toFixed(1)}%\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'attendance_report.csv';
    a.click();
  };

  const filteredData = getFilteredData();

  return (
    <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Attendance Records & Reports</h2>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0 0' }}>
            Comprehensive real-time attendance tracking and breakdown
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              fontWeight: 600,
              cursor: 'pointer',
              color: '#334155',
            }}
          >
            <Filter size={16} /> Filters
          </button>
          <button
            onClick={exportToCsv}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 18px',
              backgroundColor: '#4f46e5',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 700,
              color: '#ffffff',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
            }}
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* Filter Card */}
      {showFilters && (
        <HamsCard padding="20px">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
            <div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>TIMEFRAME</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                {['all', 'today'].map(t => (
                  <button
                    key={t}
                    onClick={() => setTimeFilter(t)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '16px',
                      border: timeFilter === t ? '1px solid #4f46e5' : '1px solid #cbd5e1',
                      backgroundColor: timeFilter === t ? '#4f46e5' : '#ffffff',
                      color: timeFilter === t ? '#ffffff' : '#475569',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>STATUS</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                {['all', 'present', 'absent', 'late'].map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '16px',
                      border: statusFilter === s ? '1px solid #4f46e5' : '1px solid #cbd5e1',
                      backgroundColor: statusFilter === s ? '#4f46e5' : '#ffffff',
                      color: statusFilter === s ? '#ffffff' : '#475569',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </HamsCard>
      )}

      {/* Search Input & Dynamic Total Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '380px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search by Student Name, ID, Room, Floor..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: '38px' }}
            />
          </div>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{
              padding: '9px 14px',
              borderRadius: '10px',
              border: '1px solid #c7d2fe',
              backgroundColor: '#eef2ff',
              color: '#4338ca',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            <option value="name-asc">Sort: Name (A to Z)</option>
            <option value="name-desc">Sort: Name (Z to A)</option>
            <option value="room-asc">Sort: Room (Low to High)</option>
            <option value="room-desc">Sort: Room (High to Low)</option>
            <option value="percentage-desc">Sort: Attendance % (High to Low)</option>
            <option value="percentage-asc">Sort: Attendance % (Low to High)</option>
            <option value="id-asc">Sort: Student ID (Asc)</option>
            <option value="id-desc">Sort: Student ID (Desc)</option>
          </select>
        </div>

        <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>
          Showing <span style={{ color: '#4f46e5', fontWeight: 800 }}>{filteredData.length}</span> of {allStudents.length} total students
        </div>
      </div>

      {/* Records List */}
      {loading && allStudents.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading records...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredData.map(item => {
            const isExpanded = expandedId === item.studentId;
            const isGood = item.percentage >= 75;

            return (
              <HamsCard key={item.studentId} padding="0">
                <div
                  onClick={() => setExpandedId(isExpanded ? null : item.studentId)}
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span style={{
                      backgroundColor: '#eef2ff',
                      color: '#4f46e5',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 800,
                    }}>
                      {item.studentId}
                    </span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{item.name}</h4>
                        
                        {/* Student Tags */}
                        {item.tags && item.tags.length > 0 ? (
                          item.tags.map((tag: any) => (
                            <span
                              key={tag.id || tag.tag_id || tag.name}
                              style={{
                                padding: '3px 9px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                fontWeight: 800,
                                backgroundColor: tag.name === 'Regular' ? '#ecfdf5' : tag.name === 'Late' || tag.name === 'Defaulter' ? '#fef2f2' : '#fffbeb',
                                color: tag.color || (tag.name === 'Regular' ? '#059669' : tag.name === 'Late' || tag.name === 'Defaulter' ? '#dc2626' : '#d97706'),
                                border: `1.5px solid ${tag.color || (tag.name === 'Regular' ? '#10b981' : '#f59e0b')}40`,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                              }}
                            >
                              🏷️ {tag.name}
                            </span>
                          ))
                        ) : (
                          <span
                            style={{
                              padding: '3px 9px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 800,
                              backgroundColor: item.percentage >= 75 ? '#ecfdf5' : item.percentage > 0 ? '#fffbeb' : '#fef2f2',
                              color: item.percentage >= 75 ? '#059669' : item.percentage > 0 ? '#d97706' : '#dc2626',
                              border: `1.5px solid ${item.percentage >= 75 ? '#10b981' : item.percentage > 0 ? '#f59e0b' : '#ef4444'}40`,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                            }}
                          >
                            🏷️ {item.percentage >= 75 ? 'Regular' : item.percentage > 0 ? 'Irregular' : 'Defaulter'}
                          </span>
                        )}

                        {/* Approved Leaves Badge */}
                        {item.leaves > 0 && (
                          <span
                            style={{
                              padding: '3px 9px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 800,
                              backgroundColor: '#eff6ff',
                              color: '#2563eb',
                              border: '1.5px solid #bfdbfe',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              boxShadow: '0 1px 2px rgba(37,99,235,0.08)'
                            }}
                            title={`${item.leaves} approved leave session(s) deducted from ${item.total} total sessions`}
                          >
                            🌴 {item.leaves} {item.leaves === 1 ? 'Leave' : 'Leaves'}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                        {item.roomNo ? (
                          <span style={{
                            padding: '2px 8px',
                            backgroundColor: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            borderRadius: '5px',
                            fontSize: '11px',
                            fontWeight: 800,
                            color: '#1d4ed8'
                          }}>
                            🚪 Room {item.roomNo}
                          </span>
                        ) : (
                          <span style={{
                            padding: '2px 8px',
                            backgroundColor: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '5px',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: '#94a3b8'
                          }}>
                            No Room
                          </span>
                        )}

                        {item.floorName ? (
                          <span style={{
                            padding: '2px 8px',
                            backgroundColor: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '5px',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#475569'
                          }}>
                            🏢 {item.floorName}
                          </span>
                        ) : (
                          <span style={{
                            padding: '2px 8px',
                            backgroundColor: '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '5px',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: '#b91c1c'
                          }}>
                            Unassigned Floor
                          </span>
                        )}

                        <span style={{ fontSize: '12px', color: '#64748b' }}>{item.group || 'General'}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '16px', fontWeight: 800, color: isGood ? '#10b981' : '#ef4444' }}>
                        {item.percentage.toFixed(1)}%
                      </span>
                      <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                        {item.attended} / {item.effectiveTotal} attended
                      </div>
                      {item.leaves > 0 && (
                        <div style={{ fontSize: '11px', color: '#3b82f6', fontWeight: 600, marginTop: '2px' }}>
                          ({item.leaves} leave{item.leaves > 1 ? 's' : ''} deducted)
                        </div>
                      )}
                    </div>
                    {isExpanded ? <ChevronUp size={20} color="#64748b" /> : <ChevronDown size={20} color="#64748b" />}
                  </div>
                </div>

                {/* Expanded Session Breakdown */}
                {isExpanded && (
                  <div style={{ padding: '16px 20px', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    {Object.keys(item.breakdown).map(type => {
                      const detail = item.breakdown[type];
                      const dGood = detail.percentage >= 75;
                      return (
                        <div key={type} style={{ padding: '10px 14px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block' }}>{type}</span>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: dGood ? '#10b981' : '#ef4444' }}>
                            {detail.attended} / {detail.effectiveTotal} ({detail.percentage.toFixed(1)}%)
                          </span>
                          {detail.leaves > 0 && (
                            <span style={{ fontSize: '11px', color: '#2563eb', display: 'block', marginTop: '3px', fontWeight: 600 }}>
                              🌴 {detail.leaves} on leave • {detail.total} total
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </HamsCard>
            );
          })}
        </div>
      )}

    </div>
  );
};

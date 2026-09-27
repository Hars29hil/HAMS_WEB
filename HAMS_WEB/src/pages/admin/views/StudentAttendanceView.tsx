import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  Download, 
  ChevronDown, 
  ChevronUp, 
  Filter,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';
import apiClient from '../../../services/apiClient';
import { HamsCard } from '../../../components/HamsCard';
import './StudentAttendanceView.css';

export const StudentAttendanceView: React.FC = () => {
  const [reportData, setReportData] = useState<any>(null);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [allTypes, setAllTypes] = useState<string[]>([]);
  const [allGroups, setAllGroups] = useState<string[]>([]);
  
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name-asc');
  const [loading, setLoading] = useState(true);

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
      console.error('Failed to load data', err);
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

      const bankCodeStr = String(student.bankCode || student.student_code || student.id || '');
      const cleanCode = bankCodeStr.replace(/^0+/, '');

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
      const bankMatch = bankCodeStr.toLowerCase().includes(searchQuery.toLowerCase());
      const roomMatch = String(roomNo || '').toLowerCase().includes(searchQuery.toLowerCase());
      const floorMatch = String(floorName || '').toLowerCase().includes(searchQuery.toLowerCase());
      if (searchQuery && !nameMatch && !bankMatch && !roomMatch && !floorMatch) return;

      let studentRecords = reportData.studentRecords || {};
      let record = studentRecords[bankCodeStr] || studentRecords[cleanCode];
      
      let attended = 0;
      if (record) {
        activeTypes.forEach(type => {
          attended += (record[type] || 0);
        });
      }
      
      const lateRecords = reportData.lateRecords || {};
      let lateCount = lateRecords[bankCodeStr] || lateRecords[cleanCode] || 0;

      if (statusFilter === 'present' && attended === 0) return;
      if (statusFilter === 'absent' && attended > 0) return;
      if (statusFilter === 'late' && lateCount === 0) return;

      const percentage = totalPossible > 0 ? (attended / totalPossible) * 100 : 0;
      let breakdown: any = {};
      activeTypes.forEach(type => {
        const tAtt = record ? (record[type] || 0) : 0;
        const tTot = totals[type] || 0;
        const tPerc = tTot > 0 ? (tAtt / tTot) * 100 : 0;
        breakdown[type] = { attended: tAtt, total: tTot, percentage: tPerc };
      });

      filteredList.push({
        bankCode: bankCodeStr,
        name: student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unknown',
        group: studentGroup,
        roomNo: roomNo || null,
        floorId: floorId !== undefined && floorId !== null ? floorId : null,
        floorName: floorName || null,
        tags: student.tags || [],
        attended,
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
        const numA = parseInt(String(a.bankCode || '').replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(String(b.bankCode || '').replace(/\D/g, ''), 10) || 0;
        return numA - numB;
      }
      if (sortBy === 'id-desc') {
        const numA = parseInt(String(a.bankCode || '').replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(String(b.bankCode || '').replace(/\D/g, ''), 10) || 0;
        return numB - numA;
      }
      return 0;
    });
    return filteredList;
  };

  const exportToCsv = () => {
    const data = getFilteredData();
    if (data.length === 0) return;

    let csv = 'Bank Code,Name,Floor,Room,Group,Attended,Total,Percentage\n';
    data.forEach(item => {
      csv += `${item.bankCode},"${item.name}","${item.floorName || ''}","${item.roomNo || ''}","${item.group}",${item.attended},${item.total},${item.percentage.toFixed(1)}%\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_report_${timeFilter}.csv`;
    a.click();
  };

  const toggleType = (type: string) => {
    setSelectedTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const toggleGroup = (group: string) => {
    setSelectedGroups(prev => 
      prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
    );
  };

  const filteredData = getFilteredData();

  return (
    <div className="student-attendance-container">
      {/* Header */}
      <div className="view-header">
        <div>
          <h2>Attendance Records & Reports</h2>
          <p>Comprehensive real-time attendance tracking and breakdown</p>
        </div>
        <div className="header-actions">
          <button className="btn-filter" onClick={() => setShowFilters(!showFilters)}>
            <Filter size={16} /> Filters
          </button>
          <button className="btn-export" onClick={exportToCsv}>
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* Top Filter Chips */}
      <HamsCard className="top-filter-card">
        <div className="filter-row">
          <div className="filter-group">
            <span className="filter-label">TIMEFRAME</span>
            <div className="chip-group">
              {['all', 'today'].map(t => (
                <button 
                  key={t}
                  className={`time-chip ${timeFilter === t ? 'active' : ''}`}
                  onClick={() => setTimeFilter(t)}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-label">STATUS</span>
            <div className="chip-group">
              {['all', 'present', 'absent', 'late'].map(s => (
                <button 
                  key={s}
                  className={`time-chip ${statusFilter === s ? 'active' : ''}`}
                  onClick={() => setStatusFilter(s)}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </HamsCard>

      {/* Advanced Filters Dropdown */}
      {showFilters && (
        <HamsCard className="advanced-filters-card">
          <div className="advanced-filter-section">
            <span className="section-title">Filter by Attendance Type:</span>
            <div className="chip-group">
              {allTypes.map(type => (
                <div 
                  key={type} 
                  className={`filter-chip ${selectedTypes.includes(type) ? 'active' : ''}`}
                  onClick={() => toggleType(type)}
                >
                  {type.toUpperCase()}
                </div>
              ))}
            </div>
          </div>

          <div className="advanced-filter-section">
            <span className="section-title">Filter by Group:</span>
            <div className="chip-group">
              {allGroups.map(group => (
                <div 
                  key={group} 
                  className={`filter-chip ${selectedGroups.includes(group) ? 'active' : ''}`}
                  onClick={() => toggleGroup(group)}
                >
                  {group}
                </div>
              ))}
            </div>
          </div>
        </HamsCard>
      )}

      {/* Search Bar and Dynamic Counter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, flexWrap: 'wrap' }}>
          <div className="search-bar" style={{ flex: 1, maxWidth: '380px' }}>
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Search by Student Name, ID, Room, Floor..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="select-wrapper">
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="name-asc">Sort: Name (A to Z)</option>
              <option value="name-desc">Sort: Name (Z to A)</option>
              <option value="room-asc">Sort: Room (Low to High)</option>
              <option value="room-desc">Sort: Room (High to Low)</option>
              <option value="percentage-desc">Sort: Attendance % (High to Low)</option>
              <option value="percentage-asc">Sort: Attendance % (Low to High)</option>
              <option value="id-asc">Sort: Student ID (Asc)</option>
              <option value="id-desc">Sort: Student ID (Desc)</option>
            </select>
            <ChevronDown size={16} className="select-icon" />
          </div>
        </div>

        <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>
          Showing <span style={{ color: '#4f46e5', fontWeight: 800 }}>{filteredData.length}</span> of {allStudents.length} total students
        </div>
      </div>

      {loading && allStudents.length === 0 ? (
        <div className="loading-state">Loading data...</div>
      ) : (
        <div className="attendance-list">
          {filteredData.map(item => {
            const isExpanded = expandedId === item.bankCode;
            const isGood = item.percentage >= 75;

            return (
              <HamsCard key={item.bankCode} padding="0" className="attendance-row-card">
                <div className="attendance-row-header" onClick={() => setExpandedId(isExpanded ? null : item.bankCode)}>
                  <div className="row-info" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <span className="bank-code-badge">{item.bankCode}</span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>{item.name}</h4>
                        
                        {/* Tags */}
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
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
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

                        <span className="group-badge">{item.group || 'General'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="row-stats">
                    <div className="stats-text">
                      <span className="percentage" style={{ color: isGood ? '#22c55e' : '#ef4444' }}>
                        {item.percentage.toFixed(1)}%
                      </span>
                      <span className="count">{item.attended} / {item.total}</span>
                    </div>
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="attendance-row-details">
                    {Object.keys(item.breakdown).map(type => {
                      const detail = item.breakdown[type];
                      const dGood = detail.percentage >= 75;
                      return (
                        <div key={type} className="breakdown-item">
                          <span className="type-name">{type.toUpperCase()}</span>
                          <span className="type-stat" style={{ color: dGood ? '#22c55e' : '#ef4444' }}>
                            {detail.attended} / {detail.total} ({detail.percentage.toFixed(1)}%)
                          </span>
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

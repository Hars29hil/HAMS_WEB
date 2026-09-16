import React, { useEffect, useState } from 'react';
import { Download, Filter, ChevronDown, ChevronUp, Search } from 'lucide-react';
import axios from 'axios';
import apiClient from '../../../services/apiClient';
import { HamsCard } from '../../../components/HamsCard';
import './StudentAttendanceView.css';

export const StudentAttendanceView: React.FC = () => {
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

  useEffect(() => {
    fetchData();
  }, [timeFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Students from external API
      if (allStudents.length === 0) {
        const studentRes = await axios.get('https://api.avdvvn.org/public/getStudentBasicDetails', {
          headers: { 'x-hsh-auth-token': 'aF92Kx7QmN4Lp8Vz' }
        });
        let groups = new Set<string>();
        if (studentRes.data?.data) {
          setAllStudents(studentRes.data.data);
          studentRes.data.data.forEach((s: any) => {
            if (s.group) groups.add(s.group.trim());
          });
          setAllGroups(Array.from(groups).sort());
        }
      }

      // 2. Fetch Sessions
      if (allTypes.length === 0) {
        const sessionRes = await apiClient.get('/admin/sessions');
        if (sessionRes.data?.success) {
          const types = sessionRes.data.data.map((s: any) => s.session_key);
          setAllTypes(types);
          setSelectedTypes(types);
        }
      }

      // 3. Fetch Reports
      const reportRes = await apiClient.get(`/admin/reports?time_filter=${timeFilter}`);
      if (reportRes.data?.success) {
        setReportData(reportRes.data);
      }
    } catch (err) {
      console.error('Failed to load data', err);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredData = () => {
    if (!reportData || !reportData.totals) return [];

    let filteredList: any[] = [];
    let totalPossible = 0;
    selectedTypes.forEach(type => {
      totalPossible += (reportData.totals[type] || 0);
    });

    allStudents.forEach(student => {
      const studentGroup = (student.group || '').trim();
      if (selectedGroups.length > 0 && !selectedGroups.includes(studentGroup)) {
        return;
      }

      const bankCodeStr = String(student.bankCode || '');
      
      const nameMatch = (student.firstName || '').toLowerCase().includes(searchQuery.toLowerCase());
      const bankMatch = bankCodeStr.toLowerCase().includes(searchQuery.toLowerCase());
      if (searchQuery && !nameMatch && !bankMatch) return;

      let studentRecords = reportData.studentRecords || {};
      let record = studentRecords[bankCodeStr];
      
      if (!record) {
        const stripped = bankCodeStr.replace(/^0+/, '');
        for (let k in studentRecords) {
          if (k.replace(/^0+/, '') === stripped) {
            record = studentRecords[k];
            break;
          }
        }
      }

      let attended = 0;
      if (record) {
        selectedTypes.forEach(type => {
          attended += (record[type] || 0);
        });
      }
      
      let lateCount = 0;
      const lateRecords = reportData.lateRecords || {};
      let lateRecord = lateRecords[bankCodeStr];
      if (!lateRecord) {
        const stripped = bankCodeStr.replace(/^0+/, '');
        for (let k in lateRecords) {
          if (k.replace(/^0+/, '') === stripped) {
            lateRecord = lateRecords[k];
            break;
          }
        }
      }
      lateCount = lateRecord || 0;

      if (statusFilter === 'present' && attended === 0) return;
      if (statusFilter === 'absent' && attended > 0) return;
      if (statusFilter === 'late' && lateCount === 0) return;

      const percentage = totalPossible > 0 ? (attended / totalPossible) * 100 : 0;
      let breakdown: any = {};
      selectedTypes.forEach(type => {
        const tAtt = record ? (record[type] || 0) : 0;
        const tTot = reportData.totals[type] || 0;
        const tPerc = tTot > 0 ? (tAtt / tTot) * 100 : 0;
        breakdown[type] = { attended: tAtt, total: tTot, percentage: tPerc };
      });

      filteredList.push({
        bankCode: bankCodeStr,
        name: student.firstName || 'Unknown',
        group: studentGroup,
        attended,
        total: totalPossible,
        percentage,
        breakdown
      });
    });

    filteredList.sort((a, b) => b.percentage - a.percentage);
    return filteredList;
  };

  const exportToCsv = () => {
    const data = getFilteredData();
    if (data.length === 0) return;

    let csv = 'Bank Code,Name,Group,Attended,Total,Percentage\n';
    data.forEach(item => {
      csv += `${item.bankCode},"${item.name}","${item.group}",${item.attended},${item.total},${item.percentage.toFixed(1)}%\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'attendance_report.csv';
    a.click();
  };

  const toggleType = (type: string) => {
    setSelectedTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const toggleGroup = (group: string) => {
    setSelectedGroups(prev => prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]);
  };

  const filteredData = getFilteredData();

  return (
    <div className="attendance-view-container">
      <div className="attendance-header">
        <div>
          <h2>Student Attendance</h2>
          <p>Overall attendance records and reports.</p>
        </div>
        <div className="header-actions">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search Name/Code..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="action-btn" onClick={() => setShowFilters(!showFilters)}>
            <Filter size={18} /> Filters
          </button>
          <button className="action-btn" onClick={exportToCsv}>
            <Download size={18} /> Export CSV
          </button>
        </div>
      </div>

      {showFilters && (
        <HamsCard padding="20px" className="filters-card">
          <h4>Time Filter</h4>
          <div className="chip-list">
            {['all', 'today'].map(t => (
              <div 
                key={t}
                className={`filter-chip ${timeFilter === t ? 'active' : ''}`}
                onClick={() => setTimeFilter(t)}
              >
                {t.toUpperCase()}
              </div>
            ))}
          </div>
          
          <h4 style={{ marginTop: '20px' }}>Status Filter</h4>
          <div className="chip-list">
            {['all', 'present', 'absent', 'late'].map(s => (
              <div 
                key={s}
                className={`filter-chip ${statusFilter === s ? 'active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s.toUpperCase()}
              </div>
            ))}
          </div>

          <h4 style={{ marginTop: '20px' }}>Session Types</h4>
          <div className="chip-list">
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
          
          <h4 style={{ marginTop: '20px' }}>Groups</h4>
          <div className="chip-list">
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
        </HamsCard>
      )}

      {loading ? (
        <div className="loading-state">Loading data...</div>
      ) : (
        <div className="attendance-list">
          {filteredData.map(item => {
            const isExpanded = expandedId === item.bankCode;
            const isGood = item.percentage >= 75;

            return (
              <HamsCard key={item.bankCode} padding="0" className="attendance-row-card">
                <div className="attendance-row-header" onClick={() => setExpandedId(isExpanded ? null : item.bankCode)}>
                  <div className="row-info">
                    <h4>{item.name}</h4>
                    <span className="bank-code-badge">{item.bankCode}</span>
                    <span className="group-badge">{item.group || 'No Group'}</span>
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

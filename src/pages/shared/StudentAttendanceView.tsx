import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Download, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { HamsCard } from '../../components/HamsCard';
import apiClient from '../../services/apiClient';
import './StudentAttendanceView.css';

interface FetchedStudent {
  bankCode: string | number;
  firstName: string;
  lastName: string;
  group?: string;
  room?: string;
}

interface Session {
  session_key: string;
}

interface ReportData {
  totals: Record<string, number>;
  studentRecords: Record<string, Record<string, number>>;
}

export const StudentAttendanceView: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [allStudents, setAllStudents] = useState<FetchedStudent[]>([]);
  const [allGroups, setAllGroups] = useState<string[]>([]);
  const [allTypes, setAllTypes] = useState<string[]>([]);
  
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  
  const [reportData, setReportData] = useState<ReportData | null>(null);
  
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [studentRes, sessionRes, reportRes] = await Promise.all([
        axios.get('https://api.avdvvn.org/public/getStudentBasicDetails', {
          headers: { 'x-hsh-auth-token': 'aF92Kx7QmN4Lp8Vz' }
        }),
        apiClient.get('/admin/sessions'),
        apiClient.get('/admin/reports')
      ]);

      if (studentRes.data?.data) {
        setAllStudents(studentRes.data.data);
        const groups = new Set<string>();
        studentRes.data.data.forEach((s: any) => {
          if (s.group && s.group.trim()) {
            groups.add(s.group.trim());
          }
        });
        setAllGroups(Array.from(groups).sort());
      }

      if (sessionRes.data?.success) {
        const types = sessionRes.data.data.map((s: any) => String(s.session_key));
        setAllTypes(types);
        setSelectedTypes(types);
      }

      if (reportRes.data?.success) {
        setReportData(reportRes.data);
      }

    } catch (error) {
      console.error('Failed to load attendance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    if (!reportData || !reportData.totals) return [];

    let totalPossible = 0;
    for (const type of selectedTypes) {
      totalPossible += (reportData.totals[type] || 0);
    }

    const result = [];

    for (const student of allStudents) {
      const studentGroup = (student.group || '').trim();
      
      if (selectedGroups.length > 0 && !selectedGroups.includes(studentGroup)) {
        continue;
      }

      const bankCodeStr = String(student.bankCode || '');
      
      let record = reportData.studentRecords[bankCodeStr];
      if (!record) {
        const stripped = bankCodeStr.replace(/^0+/, '');
        const keys = Object.keys(reportData.studentRecords);
        for (const k of keys) {
          if (k.replace(/^0+/, '') === stripped) {
            record = reportData.studentRecords[k];
            break;
          }
        }
      }

      let attended = 0;
      if (record) {
        for (const type of selectedTypes) {
          attended += (record[type] || 0);
        }
      }

      const percentage = totalPossible > 0 ? (attended / totalPossible) * 100 : 0;
      
      const breakdown: Record<string, any> = {};
      for (const type of selectedTypes) {
        const tAtt = record ? (record[type] || 0) : 0;
        const tTot = reportData.totals[type] || 0;
        const tPerc = tTot > 0 ? (tAtt / tTot) * 100 : 0;
        breakdown[type] = {
          attended: tAtt,
          total: tTot,
          percentage: tPerc
        };
      }

      result.push({
        bankCode: bankCodeStr,
        name: student.firstName || 'Unknown',
        lastName: student.lastName || '',
        group: studentGroup,
        attended,
        total: totalPossible,
        percentage,
        breakdown
      });
    }

    result.sort((a, b) => b.percentage - a.percentage);
    return result;
  }, [allStudents, reportData, selectedTypes, selectedGroups]);

  const toggleRow = (bankCode: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [bankCode]: !prev[bankCode]
    }));
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

  const exportToCsv = () => {
    if (filteredData.length === 0) return;

    const escapeCsv = (val: any) => {
      let s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        s = s.replace(/"/g, '""');
        return `"${s}"`;
      }
      return s;
    };

    let csvContent = 'Bank Code,Name,Group,Attended,Total,Percentage\n';

    filteredData.forEach(item => {
      const row = [
        escapeCsv(item.bankCode),
        escapeCsv(`${item.name} ${item.lastName}`.trim()),
        escapeCsv(item.group),
        item.attended,
        item.total,
        `${item.percentage.toFixed(1)}%`
      ];
      csvContent += row.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'attendance_report.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return <div className="loading-screen"><div className="spinner"></div></div>;
  }

  return (
    <div className="attendance-report-container">
      <div className="header-actions">
        <div className="title-area">
          <h2>Student Attendance</h2>
          <p className="subtitle">View and export detailed attendance reports for all students.</p>
        </div>
        <div className="action-buttons">
          <button className="btn-outline" onClick={() => setIsFilterModalOpen(true)}>
            <Filter size={18} /> Filters
          </button>
          <button className="btn-primary" onClick={exportToCsv}>
            <Download size={18} /> Export CSV
          </button>
        </div>
      </div>

      <div className="report-list">
        {filteredData.length === 0 ? (
          <div className="empty-state glass">
            <p>No attendance records match your filters.</p>
          </div>
        ) : (
          filteredData.map(item => (
            <HamsCard key={item.bankCode} className="report-row">
              <div 
                className="report-header" 
                onClick={() => toggleRow(item.bankCode)}
              >
                <div className="student-main-info">
                  <div className="name-and-code">
                    <h4>{item.name} {item.lastName}</h4>
                    <span className="code-badge">{item.bankCode}</span>
                  </div>
                  <span className="group-label">{item.group || 'No Group'}</span>
                </div>
                
                <div className="attendance-stats">
                  <div className="stat-text">
                    <span className={`percentage ${item.percentage >= 75 ? 'good' : 'bad'}`}>
                      {item.percentage.toFixed(1)}%
                    </span>
                    <span className="fraction">
                      {item.attended} / {item.total}
                    </span>
                  </div>
                  <button className="expand-btn">
                    {expandedRows[item.bankCode] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                </div>
              </div>

              {expandedRows[item.bankCode] && (
                <div className="report-details">
                  {Object.entries(item.breakdown).map(([type, data]: [string, any]) => (
                    <div className="breakdown-row" key={type}>
                      <span className="type-name">{type.toUpperCase()}</span>
                      <span className={`type-stats ${data.percentage >= 75 ? 'good' : 'bad'}`}>
                        {data.attended} / {data.total} ({data.percentage.toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </HamsCard>
          ))
        )}
      </div>

      {isFilterModalOpen && (
        <div className="modal-overlay" onClick={() => setIsFilterModalOpen(false)}>
          <div className="modal-content glass filters-modal" onClick={e => e.stopPropagation()}>
            <h3>Filters</h3>
            
            <div className="filter-section mt-4">
              <h4>Session Types</h4>
              <div className="chips-container">
                {allTypes.map(type => (
                  <button 
                    key={type}
                    className={`chip ${selectedTypes.includes(type) ? 'selected' : ''}`}
                    onClick={() => toggleType(type)}
                  >
                    {type.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-section mt-6">
              <h4>Groups</h4>
              <div className="checkbox-list">
                {allGroups.map(group => (
                  <label key={group} className="checkbox-item">
                    <input 
                      type="checkbox" 
                      checked={selectedGroups.includes(group)}
                      onChange={() => toggleGroup(group)}
                    />
                    <span className="checkbox-label">{group}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="modal-actions mt-6">
              <button className="btn-primary w-full" onClick={() => setIsFilterModalOpen(false)}>Apply Filters</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

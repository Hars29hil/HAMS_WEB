import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, LogOut, Search, Filter, CheckSquare, XSquare, Send, CheckCircle2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import apiClient from '../../../services/apiClient';
import { HamsCard } from '../../../components/HamsCard';
import './MessageView.css';

export const MessageView: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [waStatus, setWaStatus] = useState('disconnected');
  const [waQr, setWaQr] = useState<string | null>(null);
  const [waPairingCode, setWaPairingCode] = useState<string | null>(null);
  const pollingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [allFloors, setAllFloors] = useState<any[]>([]);
  const [allTypes, setAllTypes] = useState<string[]>([]);
  const [reportData, setReportData] = useState<any>({});
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFloorId, setSelectedFloorId] = useState<number | null>(null);
  
  const [timeFilter, setTimeFilter] = useState('all'); // 'today' or 'all' or 'YYYY-MM-DD'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'present', 'absent', 'late'
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  
  const [filteredStudents, setFilteredStudents] = useState<any[]>([]);
  const [selectedBankCodes, setSelectedBankCodes] = useState<Set<string>>(new Set());

  const [messageText, setMessageText] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);

  useEffect(() => {
    fetchData();
    startPolling();
    return () => {
      if (pollingTimer.current) clearInterval(pollingTimer.current);
    };
  }, []);

  const startPolling = () => {
    pollingTimer.current = setInterval(() => {
      checkWaStatus();
    }, 3000);
  };

  const checkWaStatus = async () => {
    try {
      const res = await apiClient.get('/whatsapp/status');
      if (res.data.success) {
        const data = res.data.data;
        setWaStatus(data.status);
        setWaQr(data.qr);
        if (data.status !== 'pairing') {
          setWaPairingCode(null);
        }
      }
    } catch (e) {
      console.error('Error polling WA status:', e);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [studentsRes, floorsRes, sessionsRes, reportsRes] = await Promise.all([
        apiClient.get('/students'),
        apiClient.get('/floors'),
        apiClient.get('/admin/sessions'),
        apiClient.get(`/admin/reports?time_filter=${timeFilter}`),
      ]);

      if (studentsRes.data.success) setAllStudents(studentsRes.data.data);
      if (floorsRes.data.success) setAllFloors(floorsRes.data.data);
      
      if (sessionsRes.data.success) {
        const types = sessionsRes.data.data.map((s: any) => s.session_key.toString());
        setAllTypes(types);
        if (selectedTypes.length === 0) {
          setSelectedTypes(types);
        }
      }
      
      if (reportsRes.data.success) setReportData(reportsRes.data);

    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    applyFilters();
  }, [allStudents, reportData, searchQuery, selectedFloorId, statusFilter, selectedTypes]);

  const applyFilters = () => {
    if (!reportData || !reportData.totals) {
      setFilteredStudents([]);
      return;
    }

    let totalPossible = 0;
    for (let type of selectedTypes) {
      totalPossible += (reportData.totals[type] || 0);
    }

    const temp = [];

    for (let student of allStudents) {
      const bankCodeStr = String(student.student_code || '');
      const nameStr = String(student.name || '').toLowerCase();
      const floorId = parseInt(student.floor_id) || 0;
      const roomNumber = String(student.room_number || 'N/A');
      const phoneStr = String(student.phone_number || bankCodeStr);

      if (searchQuery) {
        if (!nameStr.includes(searchQuery) && !bankCodeStr.includes(searchQuery) && !roomNumber.includes(searchQuery)) {
          continue;
        }
      }

      if (selectedFloorId !== null && floorId !== selectedFloorId) {
        continue;
      }

      const studentRecords = reportData.studentRecords || {};
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
        for (let type of selectedTypes) {
          attended += (record[type] || 0);
        }
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

      if (statusFilter === 'present' && attended === 0) continue;
      if (statusFilter === 'absent' && attended > 0) continue;
      if (statusFilter === 'late' && lateCount === 0) continue;

      const percentage = totalPossible > 0 ? (attended / totalPossible) * 100 : 0.0;

      const sessionPercentages: Record<string, number> = {};
      for (let type of allTypes) {
        const tAtt = record ? (record[type] || 0) : 0;
        const tTot = reportData.totals[type] || 0;
        sessionPercentages[type] = tTot > 0 ? (tAtt / tTot) * 100 : 0.0;
      }

      temp.push({
        bankCode: bankCodeStr,
        name: student.name || 'Unknown',
        roomNumber: roomNumber,
        phone: phoneStr,
        overallPercentage: percentage,
        sessionPercentages: sessionPercentages,
      });
    }

    setFilteredStudents(temp);
  };

  const insertPlaceholder = (tag: string) => {
    setMessageText(prev => prev + tag);
  };

  const buildMessageForStudent = (student: any, template: string) => {
    let msg = template;
    msg = msg.replace(/{name}/g, student.name);
    msg = msg.replace(/{room number}/g, student.roomNumber);
    msg = msg.replace(/{phone number}/g, student.phone);
    msg = msg.replace(/{attendance percentage}/g, `${student.overallPercentage.toFixed(1)}%`);
    
    Object.keys(student.sessionPercentages).forEach((key) => {
      msg = msg.replace(new RegExp(`{${key} attendance percentage}`, 'g'), `${student.sessionPercentages[key].toFixed(1)}%`);
    });
    
    return msg;
  };

  const sendMessages = async () => {
    if (waStatus !== 'open') {
      alert('WhatsApp is not connected!');
      return;
    }
    if (selectedBankCodes.size === 0) {
      alert('No students selected.');
      return;
    }
    if (!messageText.trim()) {
      alert('Message cannot be empty.');
      return;
    }

    setLoading(true);
    try {
      const messages = [];
      for (let s of filteredStudents) {
        if (selectedBankCodes.has(s.bankCode)) {
          const msg = buildMessageForStudent(s, messageText);
          messages.push({
            phone: s.phone,
            text: msg,
          });
        }
      }

      const res = await apiClient.post('/whatsapp/send', { messages }, { timeout: 1800000 });
      if (res.data.success) {
        alert(res.data.message);
      } else {
        alert(`Failed: ${res.data.message}`);
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckboxChange = (bankCode: string, checked: boolean) => {
    setSelectedBankCodes(prev => {
      const newSet = new Set(prev);
      if (checked) newSet.add(bankCode);
      else newSet.delete(bankCode);
      return newSet;
    });
  };

  const handleSelectAllFiltered = () => {
    const newSet = new Set(selectedBankCodes);
    filteredStudents.forEach(s => newSet.add(s.bankCode));
    setSelectedBankCodes(newSet);
  };

  const handleClearSelection = () => {
    setSelectedBankCodes(new Set());
  };

  if (loading && !reportData.totals) {
    return <div className="loading-screen"><div className="spinner"></div></div>;
  }

  return (
    <div className="message-view-container">
      <div className="message-header">
        <h2>WhatsApp Messaging</h2>
        <p>Send customized WhatsApp messages to students based on attendance.</p>
      </div>

      <HamsCard className="connection-card" padding="24px">
        <div className={`status-row ${waStatus}`}>
          <MessageCircle color={waStatus === 'open' ? 'var(--color-success)' : 'var(--color-text-muted)'} size={24} />
          <span>WhatsApp Connection Status: {waStatus.toUpperCase()}</span>
          {waStatus === 'open' && (
            <button className="disconnect-btn" onClick={async () => {
              await apiClient.post('/whatsapp/disconnect');
              checkWaStatus();
            }}>
              <LogOut size={16} /> Disconnect
            </button>
          )}
        </div>

        {waStatus === 'disconnected' && (
          <div>
            <button className="connect-btn" onClick={async () => {
              await apiClient.post('/whatsapp/connect');
              checkWaStatus();
            }}>
              Connect WhatsApp
            </button>
          </div>
        )}

        {waStatus === 'connecting' && (
          <div className="status-row">
            <div className="spinner" style={{width: 20, height: 20}}></div>
            <span>Initializing connection...</span>
          </div>
        )}

        {waStatus === 'qr' && waQr && (
          <div className="qr-section">
            <div className="qr-box">
              <span style={{ fontWeight: 600 }}>Scan QR Code with WhatsApp</span>
              <div className="qr-code-wrapper">
                <QRCodeSVG value={waQr} size={200} />
              </div>
            </div>
            <div className="pairing-box">
              <span style={{ fontWeight: 600 }}>OR Connect via Pairing Code</span>
              <p>Enter your phone number (with country code, e.g. 919876543210):</p>
              <div className="pairing-input-row">
                <input 
                  type="text" 
                  value={phoneNumber} 
                  onChange={(e) => setPhoneNumber(e.target.value)} 
                  placeholder="Phone Number" 
                />
                <button className="get-code-btn" onClick={async () => {
                  if (!phoneNumber.trim()) return;
                  try {
                    const res = await apiClient.post('/whatsapp/pair', { phone: phoneNumber.trim() });
                    if (res.data.success) {
                      setWaPairingCode(res.data.code);
                    } else {
                      alert(res.data.message);
                    }
                  } catch (e: any) {
                    alert('Error: ' + e.message);
                  }
                }}>
                  Get Code
                </button>
              </div>
            </div>
          </div>
        )}

        {waStatus === 'pairing' && waPairingCode && (
          <div className="pairing-code-display">
            <span>Enter this pairing code on your phone:</span>
            <div className="code">{waPairingCode}</div>
            <span style={{ color: 'var(--color-text-muted)' }}>Waiting for approval...</span>
          </div>
        )}

        {waStatus === 'open' && (
          <div className="success-banner">
            <CheckCircle2 size={24} />
            <span>WhatsApp is connected and ready to send messages.</span>
          </div>
        )}
      </HamsCard>

      <HamsCard className="composer-card" padding="24px">
        <h3 className="card-title">Compose Message</h3>
        <div className="chip-container">
          <button className="placeholder-chip" onClick={() => insertPlaceholder('{name}')}>{"{name}"}</button>
          <button className="placeholder-chip" onClick={() => insertPlaceholder('{room number}')}>{"{room number}"}</button>
          <button className="placeholder-chip" onClick={() => insertPlaceholder('{phone number}')}>{"{phone number}"}</button>
          <button className="placeholder-chip" onClick={() => insertPlaceholder('{attendance percentage}')}>{"{attendance percentage}"}</button>
          {allTypes.map(type => (
            <button key={type} className="placeholder-chip" onClick={() => insertPlaceholder(`{${type} attendance percentage}`)}>
              {`{${type} attendance percentage}`}
            </button>
          ))}
        </div>
        <textarea 
          className="message-textarea" 
          value={messageText} 
          onChange={(e) => setMessageText(e.target.value)} 
          placeholder="Type your message here... Use the chips above to insert dynamic fields."
        ></textarea>
        <button className="send-messages-btn" onClick={sendMessages}>
          <Send size={18} /> Send Messages
        </button>
      </HamsCard>

      <HamsCard className="audience-card" padding="24px">
        <h3 className="card-title">Audience Selection</h3>
        <div className="filter-row">
          <div className="filter-input">
            <Search size={18} color="var(--color-text-muted)" />
            <input 
              type="text" 
              placeholder="Search Name/Bank Code/Room" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value.toLowerCase())}
            />
          </div>
          <select 
            className="filter-select"
            value={selectedFloorId === null ? '' : selectedFloorId}
            onChange={(e) => setSelectedFloorId(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">All Floors</option>
            {allFloors.map(f => (
              <option key={f.floor_id} value={f.floor_id}>{f.name || `Floor ${f.floor_id}`}</option>
            ))}
          </select>
          <button className="action-btn" onClick={() => setShowFilterModal(true)}>
            <Filter size={18} /> Advanced Filters
          </button>
          <button className="action-btn" onClick={handleSelectAllFiltered}>
            <CheckSquare size={18} /> Select All Filtered
          </button>
          <button className="action-btn" onClick={handleClearSelection}>
            <XSquare size={18} /> Clear Selection
          </button>
          <span className="selected-count">{selectedBankCodes.size} Selected</span>
        </div>

        <div className="students-table-wrapper">
          <table className="students-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th>Bank Code</th>
                <th>Name</th>
                <th>Room</th>
                <th>Phone</th>
                <th>Overall Att.</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map(s => {
                const isSelected = selectedBankCodes.has(s.bankCode);
                return (
                  <tr key={s.bankCode} className={isSelected ? 'selected' : ''}>
                    <td>
                      <input 
                        type="checkbox" 
                        checked={isSelected} 
                        onChange={(e) => handleCheckboxChange(s.bankCode, e.target.checked)} 
                      />
                    </td>
                    <td>{s.bankCode}</td>
                    <td>{s.name}</td>
                    <td>{s.roomNumber}</td>
                    <td><a href={`tel:${s.phone}`} style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>{s.phone}</a></td>
                    <td>{s.overallPercentage.toFixed(1)}%</td>
                  </tr>
                );
              })}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
                    No students found matching the criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </HamsCard>

      {showFilterModal && (
        <div className="filter-modal-overlay">
          <div className="filter-modal">
            <div className="filter-modal-header">
              <h3>Filters</h3>
              <button className="filter-close-btn" onClick={() => setShowFilterModal(false)}>
                <XSquare size={24} />
              </button>
            </div>
            
            <div className="filter-section">
              <h4>Time Filter</h4>
              <div className="chip-container">
                <button 
                  className={`filter-chip ${timeFilter === 'all' ? 'selected' : ''}`}
                  onClick={() => { setTimeFilter('all'); fetchData(); }}
                >All Time</button>
                <button 
                  className={`filter-chip ${timeFilter === 'today' ? 'selected' : ''}`}
                  onClick={() => { setTimeFilter('today'); fetchData(); }}
                >Today</button>
              </div>
            </div>

            <div className="filter-section">
              <h4>Status Filter</h4>
              <div className="chip-container">
                <button 
                  className={`filter-chip ${statusFilter === 'all' ? 'selected' : ''}`}
                  onClick={() => setStatusFilter('all')}
                >All</button>
                <button 
                  className={`filter-chip ${statusFilter === 'present' ? 'selected' : ''}`}
                  onClick={() => setStatusFilter('present')}
                >Present</button>
                <button 
                  className={`filter-chip ${statusFilter === 'absent' ? 'selected' : ''}`}
                  onClick={() => setStatusFilter('absent')}
                >Absent</button>
                <button 
                  className={`filter-chip ${statusFilter === 'late' ? 'selected' : ''}`}
                  onClick={() => setStatusFilter('late')}
                >Late</button>
              </div>
            </div>

            <div className="filter-section">
              <h4>Session Types</h4>
              <div className="chip-container">
                {allTypes.map(type => (
                  <button 
                    key={type}
                    className={`filter-chip ${selectedTypes.includes(type) ? 'selected' : ''}`}
                    onClick={() => {
                      if (selectedTypes.includes(type)) {
                        setSelectedTypes(prev => prev.filter(t => t !== type));
                      } else {
                        setSelectedTypes(prev => [...prev, type]);
                      }
                    }}
                  >{type.toUpperCase()}</button>
                ))}
              </div>
            </div>

            <button className="done-btn" onClick={() => setShowFilterModal(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
};

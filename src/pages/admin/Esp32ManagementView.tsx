import React, { useState, useEffect } from 'react';
import { Server, Bluetooth, BluetoothSearching, RefreshCw, Unlink, Link as LinkIcon, Cpu } from 'lucide-react';
import { HamsCard } from '../../components/HamsCard';
import apiClient from '../../services/apiClient';
import './Esp32ManagementView.css';

interface FloorStatus {
  floor_id: number;
  floor_name: string;
  device_name: string | null;
  is_online: boolean;
}

interface ScanResult {
  name: string;
  id: string;
}

export const Esp32ManagementView: React.FC = () => {
  const [floors, setFloors] = useState<FloorStatus[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [selectedFloor, setSelectedFloor] = useState<number>(1);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/admin/esp32/status');
      if (response.data.success) {
        setFloors(response.data.data);
      }
    } catch (err) {
      console.error('Failed to load status', err);
    } finally {
      setLoading(false);
    }
  };

  const startScan = async () => {
    if (!navigator.bluetooth) {
      alert('Web Bluetooth API is not supported in this browser.');
      return;
    }

    setIsScanning(true);
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: []
      });
      
      if (device && device.name) {
        if (device.name.startsWith('ESP') || device.name.startsWith('Hostel')) {
          setScanResults(prev => {
            if (!prev.find(d => d.id === device.id)) {
              return [...prev, { name: device.name!, id: device.id }];
            }
            return prev;
          });
        } else {
          alert('Device selected is not a recognized ESP32/Hostel gateway.');
        }
      }
    } catch (error) {
      console.log('Bluetooth scan cancelled or failed', error);
    } finally {
      setIsScanning(false);
    }
  };

  const assignDevice = async () => {
    try {
      const response = await apiClient.post('/admin/esp32/assign', {
        device_name: selectedDevice,
        floor_id: selectedFloor
      });
      if (response.data.success) {
        setIsAssignModalOpen(false);
        fetchStatus();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to assign device');
    }
  };

  const unassignDevice = async (floorId: number, deviceName: string) => {
    if (!window.confirm(`Are you sure you want to unassign ${deviceName}?`)) return;
    
    try {
      const response = await apiClient.post('/admin/esp32/unassign', {
        floor_id: floorId
      });
      if (response.data.success) {
        fetchStatus();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to unassign device');
    }
  };

  return (
    <div className="esp32-management-container">
      <div className="header-actions">
        <div className="title-area">
          <h2>ESP-32 Gateway Management</h2>
          <p className="subtitle">Assign BLE gateways to floors and monitor their online status.</p>
        </div>
        <button className="btn-outline" onClick={fetchStatus}>
          <RefreshCw size={18} /> Refresh Status
        </button>
      </div>

      <div className="section-header">
        <Server size={24} className="text-accent" />
        <h3>Assigned Floor Gateways</h3>
      </div>

      <div className="floors-list">
        {loading ? (
          <div className="loading-screen"><div className="spinner"></div></div>
        ) : floors.length === 0 ? (
          <div className="empty-state glass">
            <p>No floors configured. Please check the backend.</p>
          </div>
        ) : (
          floors.map(floor => {
            const isOnline = floor.is_online;
            const deviceName = floor.device_name || 'Not Assigned';
            
            return (
              <HamsCard key={floor.floor_id} className="floor-row">
                <div className="floor-badge">
                  {floor.floor_name.replace('Floor ', '')}
                </div>
                
                <div className="floor-info">
                  <h4>{floor.floor_name}</h4>
                  <p className="meta">Device: {deviceName}</p>
                </div>

                <div className={`status-badge ${isOnline ? 'online' : 'offline'}`}>
                  <div className="status-dot"></div>
                  {isOnline ? 'ONLINE' : 'OFFLINE'}
                </div>

                <div className="floor-actions">
                  {floor.device_name ? (
                    <button 
                      className="btn-icon danger" 
                      title="Unassign Device"
                      onClick={() => unassignDevice(floor.floor_id, floor.device_name!)}
                    >
                      <Unlink size={20} />
                    </button>
                  ) : (
                    <div className="action-placeholder"></div>
                  )}
                </div>
              </HamsCard>
            );
          })
        )}
      </div>

      <div className="section-header mt-8">
        <div className="section-title">
          <Bluetooth size={24} className="text-accent" />
          <h3>Nearby BLE Devices</h3>
        </div>
        <button className="btn-primary" onClick={startScan} disabled={isScanning}>
          {isScanning ? <RefreshCw size={18} className="spin" /> : <Bluetooth size={18} />}
          {isScanning ? 'Scanning...' : 'Scan Nearby'}
        </button>
      </div>

      <div className="scan-list">
        {scanResults.length === 0 ? (
          <div className="empty-state glass">
            <BluetoothSearching size={48} className="empty-icon" />
            <p>No nearby ESP-32 devices found.</p>
            <span className="meta">Click "Scan Nearby" to search for broadcasting gateways.</span>
          </div>
        ) : (
          scanResults.map((result, index) => {
            const isAssigned = floors.some(f => f.device_name === result.name);
            
            return (
              <HamsCard key={index} className="scan-row">
                <div className="scan-icon">
                  <Cpu size={24} />
                </div>
                
                <div className="scan-info">
                  <h4>{result.name}</h4>
                  <p className="meta">ID: {result.id}</p>
                </div>

                <div className="scan-action">
                  {isAssigned ? (
                    <span className="badge-assigned">Already Assigned</span>
                  ) : (
                    <button 
                      className="btn-primary"
                      onClick={() => {
                        setSelectedDevice(result.name);
                        setIsAssignModalOpen(true);
                      }}
                    >
                      <LinkIcon size={16} /> Assign
                    </button>
                  )}
                </div>
              </HamsCard>
            );
          })
        )}
      </div>

      {isAssignModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content glass">
            <h3>Assign ESP-32</h3>
            <p className="meta mt-2">Device: {selectedDevice}</p>
            
            <div className="form-group mt-6">
              <label>Select Floor:</label>
              <select 
                className="glass-select w-full mt-2"
                value={selectedFloor}
                onChange={e => setSelectedFloor(Number(e.target.value))}
              >
                {Array.from({ length: 10 }).map((_, i) => (
                  <option key={i} value={i}>Floor F0{i}</option>
                ))}
              </select>
            </div>
            
            <div className="modal-actions mt-8">
              <button className="btn-outline" onClick={() => setIsAssignModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={assignDevice}>Assign</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { Radio, RefreshCw, Edit2, CheckCircle2, XCircle } from 'lucide-react';
import apiClient from '../../services/apiClient';
import { HamsCard } from '../../components/HamsCard';

export const BeaconStatusView: React.FC = () => {
  const [beacons, setBeacons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ floor_id: number; device_name: string } | null>(null);

  useEffect(() => {
    fetchBeacons(true);

    // Live auto-polling every 3 seconds
    const interval = setInterval(() => {
      fetchBeacons(false);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const fetchBeacons = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const res = await apiClient.get('/admin/esp32/status');
      if (res.data.success) {
        setBeacons(res.data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  const handleSaveName = async () => {
    if (!editModal) return;
    try {
      await apiClient.post('/admin/esp32/assign', {
        floor_id: editModal.floor_id,
        device_name: editModal.device_name
      });
      alert('Beacon device name updated!');
      setEditModal(null);
      fetchBeacons(false);
    } catch (e) {
      alert('Failed to update device name');
    }
  };

  return (
    <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: 0 }}>ESP32 Floor Beacons</h2>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0 0' }}>
            Live status and heartbeat of hardware BLE beacons on each floor
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
            Live Heartbeats
          </span>
          <button
            onClick={() => fetchBeacons(true)}
            style={{ padding: '8px 14px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {beacons.map(b => (
          <HamsCard key={b.floor_id} padding="20px">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ padding: '8px', backgroundColor: '#e0e7ff', borderRadius: '10px', color: '#4338ca' }}>
                  <Radio size={20} />
                </div>
                <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{b.floor_name}</h4>
              </div>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 700,
                backgroundColor: b.is_online ? '#ecfdf5' : '#fef2f2',
                color: b.is_online ? '#166534' : '#991b1b',
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: b.is_online ? '#10b981' : '#ef4444' }}></span>
                {b.is_online ? 'Online' : 'Offline'}
              </span>
            </div>

            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
              <div>BLE Device: <strong>{b.device_name || 'Hostel_Floor_Beacon'}</strong></div>
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#94a3b8' }}>
                Last Seen: {b.last_seen ? new Date(b.last_seen).toLocaleTimeString() : 'Never'}
              </div>
            </div>

            <button
              onClick={() => setEditModal({ floor_id: b.floor_id, device_name: b.device_name || 'Hostel_Floor_Beacon' })}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                color: '#334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Edit2 size={13} /> Edit Beacon Name
            </button>
          </HamsCard>
        ))}
      </div>

      {editModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px' }}>
            <h3 style={{ margin: '0 0 14px 0', fontSize: '18px', fontWeight: 800 }}>Edit Beacon Device Name</h3>
            <input
              type="text"
              value={editModal.device_name}
              onChange={e => setEditModal({ ...editModal, device_name: e.target.value })}
              placeholder="e.g. Hostel_Floor_Beacon"
              style={{ width: '100%', marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setEditModal(null)} style={{ padding: '8px 14px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSaveName} style={{ padding: '8px 16px', backgroundColor: '#4f46e5', color: '#ffffff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

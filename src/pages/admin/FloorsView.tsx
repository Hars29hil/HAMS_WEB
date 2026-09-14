import React, { useState, useEffect } from 'react';
import { Layers, Plus, Trash2 } from 'lucide-react';
import { HamsCard } from '../../components/HamsCard';
import apiClient from '../../services/apiClient';
import './FloorsView.css';

interface Floor {
  floor_id: string;
  name: string;
}

export const FloorsView: React.FC = () => {
  const [floors, setFloors] = useState<Floor[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newFloorId, setNewFloorId] = useState('');
  const [newFloorName, setNewFloorName] = useState('');

  useEffect(() => {
    fetchFloors();
  }, []);

  const fetchFloors = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/floors');
      if (response.data.success) {
        setFloors(response.data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch floors', err);
    } finally {
      setLoading(false);
    }
  };

  const addFloor = async () => {
    if (!newFloorId || !newFloorName) {
      alert('Please fill all fields');
      return;
    }
    
    try {
      const response = await apiClient.post('/floors', {
        floor_id: newFloorId.trim(),
        name: newFloorName.trim()
      });
      if (response.data.success) {
        setIsAddModalOpen(false);
        setNewFloorId('');
        setNewFloorName('');
        fetchFloors();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to add floor');
    }
  };

  const deleteFloor = async (floorId: string) => {
    if (!window.confirm(`Are you sure you want to delete floor ${floorId}?`)) return;
    
    try {
      const response = await apiClient.delete(`/floors/${floorId}`);
      if (response.data.success) {
        fetchFloors();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete floor');
    }
  };

  return (
    <div className="floors-view-container">
      <div className="header-actions">
        <div className="title-area">
          <h2>Manage Floors</h2>
          <p className="subtitle">Configure and manage building floors and zones.</p>
        </div>
        <button className="btn-primary" onClick={() => setIsAddModalOpen(true)}>
          <Plus size={18} /> Add Floor
        </button>
      </div>

      <div className="floors-list">
        {loading ? (
          <div className="loading-screen"><div className="spinner"></div></div>
        ) : floors.length === 0 ? (
          <div className="empty-state glass">
            <p>No floors configured yet.</p>
          </div>
        ) : (
          floors.map(floor => (
            <HamsCard key={floor.floor_id} className="floor-card" padding="1.5rem">
              <div className="floor-icon-wrapper">
                <Layers size={24} />
              </div>
              <div className="floor-info">
                <h4>{floor.name}</h4>
                <p className="meta">ID: {floor.floor_id}</p>
              </div>
              <div className="floor-actions">
                <button className="btn-icon danger" onClick={() => deleteFloor(floor.floor_id)}>
                  <Trash2 size={20} />
                </button>
              </div>
            </HamsCard>
          ))
        )}
      </div>

      {isAddModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content glass">
            <h3>Add New Floor</h3>
            <div className="form-group mt-4">
              <label>Floor ID (e.g. F01)</label>
              <input 
                type="text" 
                value={newFloorId}
                onChange={e => setNewFloorId(e.target.value)}
                className="glass-input w-full"
                placeholder="F01"
              />
            </div>
            <div className="form-group mt-4">
              <label>Floor Name (e.g. 1st Floor Boys)</label>
              <input 
                type="text" 
                value={newFloorName}
                onChange={e => setNewFloorName(e.target.value)}
                className="glass-input w-full"
                placeholder="1st Floor Boys"
              />
            </div>
            <div className="modal-actions mt-8">
              <button className="btn-outline" onClick={() => setIsAddModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={addFloor}>Add Floor</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

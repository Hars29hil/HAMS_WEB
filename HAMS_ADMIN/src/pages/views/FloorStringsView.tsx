import React, { useEffect, useState, useMemo } from 'react';
import { 
  KeyRound, 
  RefreshCw, 
  Sparkles, 
  Copy, 
  Check, 
  Trash2, 
  Edit3, 
  Search, 
  ShieldCheck, 
  Layers, 
  Radio, 
  Code, 
  ExternalLink,
  Eye,
  EyeOff,
  AlertCircle
} from 'lucide-react';
import apiClient from '../../services/apiClient';
import { HamsCard } from '../../components/HamsCard';

interface FloorStringItem {
  floor_id: number;
  floor_name: string;
  string_value: string | null;
  updated_at: string | null;
  has_string: boolean;
  device_name?: string | null;
  last_seen?: string | null;
}

export const FloorStringsView: React.FC = () => {
  const [floors, setFloors] = useState<FloorStringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedFloorId, setCopiedFloorId] = useState<number | null>(null);
  const [copiedApiUrl, setCopiedApiUrl] = useState(false);
  const [revealedFloors, setRevealedFloors] = useState<{ [key: number]: boolean }>({});
  
  // Custom String Modal
  const [customModal, setCustomModal] = useState<{ floor_id: number; floor_name: string; custom_string: string } | null>(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [actionLoadingFloorId, setActionLoadingFloorId] = useState<number | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Live API Response Preview
  const [showApiPreview, setShowApiPreview] = useState(false);

  useEffect(() => {
    fetchFloorStrings(true);
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const fetchFloorStrings = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const res = await apiClient.get('/floors/strings');
      if (res.data.success && Array.isArray(res.data.data)) {
        setFloors(res.data.data);
      }
    } catch (e: any) {
      console.error('Failed to fetch floor strings:', e);
      showToast('error', e.response?.data?.message || 'Failed to load floor strings');
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  const handleGenerateString = async (floorId: number) => {
    setActionLoadingFloorId(floorId);
    try {
      const res = await apiClient.post('/floors/generate-string', { floor_id: floorId });
      if (res.data.success) {
        showToast('success', res.data.message || 'String generated successfully');
        // Automatically reveal generated string
        setRevealedFloors(prev => ({ ...prev, [floorId]: true }));
        await fetchFloorStrings(false);
      }
    } catch (e: any) {
      showToast('error', e.response?.data?.message || 'Failed to generate string');
    } finally {
      setActionLoadingFloorId(null);
    }
  };

  const handleSaveCustomString = async () => {
    if (!customModal) return;
    const finalVal = customModal.custom_string.trim();
    if (!finalVal) {
      showToast('error', 'Please enter a valid string or token');
      return;
    }

    setActionLoadingFloorId(customModal.floor_id);
    try {
      const res = await apiClient.post('/floors/generate-string', {
        floor_id: customModal.floor_id,
        custom_string: finalVal
      });
      if (res.data.success) {
        showToast('success', `Custom string saved for ${customModal.floor_name}`);
        setRevealedFloors(prev => ({ ...prev, [customModal.floor_id]: true }));
        setCustomModal(null);
        await fetchFloorStrings(false);
      }
    } catch (e: any) {
      showToast('error', e.response?.data?.message || 'Failed to save custom string');
    } finally {
      setActionLoadingFloorId(null);
    }
  };

  const handleGenerateAll = async () => {
    if (!window.confirm('Generate fresh unique strings for ALL floors? This will replace existing floor strings.')) {
      return;
    }
    setIsGeneratingAll(true);
    try {
      const res = await apiClient.post('/floors/generate-all-strings', {});
      if (res.data.success) {
        showToast('success', res.data.message || 'Generated strings for all floors');
        // Reveal all
        const allRevealed: { [key: number]: boolean } = {};
        floors.forEach(f => { allRevealed[f.floor_id] = true; });
        setRevealedFloors(allRevealed);
        await fetchFloorStrings(false);
      }
    } catch (e: any) {
      showToast('error', e.response?.data?.message || 'Failed to generate strings for all floors');
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const handleClearString = async (floorId: number, floorName: string) => {
    if (!window.confirm(`Are you sure you want to clear the string for ${floorName}?`)) {
      return;
    }
    setActionLoadingFloorId(floorId);
    try {
      const res = await apiClient.delete(`/floors/${floorId}/string`);
      if (res.data.success) {
        showToast('success', res.data.message || `String cleared for ${floorName}`);
        await fetchFloorStrings(false);
      }
    } catch (e: any) {
      showToast('error', e.response?.data?.message || 'Failed to clear string');
    } finally {
      setActionLoadingFloorId(null);
    }
  };

  const copyToClipboard = (text: string, floorId: number) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedFloorId(floorId);
    showToast('success', `Copied string: ${text}`);
    setTimeout(() => {
      setCopiedFloorId(null);
    }, 2000);
  };

  const apiEndpointUrl = `${window.location.origin}/api/floors/strings`;

  const copyApiUrl = () => {
    navigator.clipboard.writeText(apiEndpointUrl);
    setCopiedApiUrl(true);
    showToast('success', 'API URL copied to clipboard');
    setTimeout(() => setCopiedApiUrl(false), 2000);
  };

  const toggleReveal = (floorId: number) => {
    setRevealedFloors(prev => ({
      ...prev,
      [floorId]: !prev[floorId]
    }));
  };

  const filteredFloors = useMemo(() => {
    if (!searchQuery.trim()) return floors;
    const q = searchQuery.toLowerCase().trim();
    return floors.filter(f => 
      f.floor_name?.toLowerCase().includes(q) ||
      String(f.floor_id).includes(q) ||
      (f.string_value && f.string_value.toLowerCase().includes(q)) ||
      (f.device_name && f.device_name.toLowerCase().includes(q))
    );
  }, [floors, searchQuery]);

  const activeCount = floors.filter(f => f.has_string).length;

  return (
    <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1400px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      
      {/* Toast Alert */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 9999,
          padding: '12px 20px',
          borderRadius: '10px',
          backgroundColor: notification.type === 'success' ? '#065f46' : '#991b1b',
          color: '#ffffff',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontWeight: 600,
          fontSize: '14px',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          {notification.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header Banner */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        backgroundColor: '#ffffff',
        padding: '24px',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.35)'
          }}>
            <KeyRound size={26} />
          </div>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
              Floor Security String Generator
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>
              Generate and manage floor-wise unique security strings (1 string per floor limit enforced)
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => fetchFloorStrings(true)}
            disabled={loading}
            style={{
              padding: '10px 16px',
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
              color: '#334155',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            onClick={handleGenerateAll}
            disabled={isGeneratingAll || loading || floors.length === 0}
            style={{
              padding: '10px 18px',
              backgroundColor: '#4f46e5',
              border: 'none',
              borderRadius: '10px',
              cursor: isGeneratingAll ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: '13px',
              color: '#ffffff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)',
              opacity: isGeneratingAll ? 0.7 : 1
            }}
          >
            <Sparkles size={16} />
            {isGeneratingAll ? 'Generating...' : 'Generate All Floor Strings'}
          </button>
        </div>
      </div>

      {/* Overview Stat Cards & API Info */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        
        {/* Total Floors Card */}
        <HamsCard padding="20px">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total Floors
              </span>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                {floors.length}
              </div>
            </div>
            <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Layers size={22} />
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '12px' }}>
            Configured floors in hostel database
          </div>
        </HamsCard>

        {/* Active Strings Card */}
        <HamsCard padding="20px">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Active Strings
              </span>
              <div style={{ fontSize: '28px', fontWeight: 800, color: activeCount === floors.length && floors.length > 0 ? '#059669' : '#d97706', marginTop: '4px' }}>
                {activeCount} <span style={{ fontSize: '16px', fontWeight: 500, color: '#94a3b8' }}>/ {floors.length}</span>
              </div>
            </div>
            <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={22} />
            </div>
          </div>
          <div style={{ fontSize: '12px', color: activeCount === floors.length && floors.length > 0 ? '#059669' : '#d97706', marginTop: '12px', fontWeight: 600 }}>
            {activeCount === floors.length && floors.length > 0 ? '✓ All floors have security strings' : `⚠️ ${floors.length - activeCount} floors missing string`}
          </div>
        </HamsCard>

        {/* API Endpoint Quick Access Card */}
        <HamsCard padding="20px">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Fetch API Endpoint
              </span>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginTop: '6px', fontFamily: 'monospace', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '6px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                GET /api/floors/strings
              </div>
            </div>
            <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Code size={22} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button
              onClick={copyApiUrl}
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                color: '#334155'
              }}
            >
              {copiedApiUrl ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
              {copiedApiUrl ? 'Copied URL!' : 'Copy API URL'}
            </button>
            <button
              onClick={() => setShowApiPreview(!showApiPreview)}
              style={{
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: showApiPreview ? '#4f46e5' : '#f8fafc',
                color: showApiPreview ? '#ffffff' : '#4f46e5',
                border: '1px solid #c7d2fe',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px'
              }}
            >
              <ExternalLink size={12} />
              {showApiPreview ? 'Hide JSON' : 'Test API'}
            </button>
          </div>
        </HamsCard>

      </div>

      {/* Live API JSON Viewer (Collapsible) */}
      {showApiPreview && (
        <div style={{
          backgroundColor: '#0f172a',
          color: '#38bdf8',
          borderRadius: '12px',
          padding: '20px',
          fontFamily: 'monospace',
          fontSize: '13px',
          overflowX: 'auto',
          border: '1px solid #334155',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
            <span style={{ color: '#94a3b8', fontWeight: 600 }}>API Response Preview (GET /api/floors/strings)</span>
            <span style={{ color: '#4ade80', fontSize: '11px', fontWeight: 700 }}>200 OK</span>
          </div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#e2e8f0' }}>
            {JSON.stringify({
              success: true,
              count: floors.length,
              active_strings_count: activeCount,
              data: floors.map(f => ({
                floor_id: f.floor_id,
                floor_name: f.floor_name,
                string_value: f.string_value,
                updated_at: f.updated_at,
                has_string: f.has_string
              }))
            }, null, 2)}
          </pre>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        flexWrap: 'wrap'
      }}>
        <div style={{
          position: 'relative',
          flex: 1,
          minWidth: '260px'
        }}>
          <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search by floor name, ID or string value..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px 10px 40px',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              fontSize: '13px',
              color: '#1e293b',
              boxSizing: 'border-box'
            }}
          />
        </div>
        <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
          Showing {filteredFloors.length} of {floors.length} floors
        </div>
      </div>

      {/* Floor String Cards Grid */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#64748b', backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
          <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#6366f1' }} />
          <div>Loading floor security strings...</div>
        </div>
      ) : filteredFloors.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#64748b', backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
          <Layers size={36} style={{ margin: '0 auto 12px auto', color: '#cbd5e1' }} />
          <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#334155' }}>No floors found</h4>
          <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
            {searchQuery ? 'Try clearing your search query.' : 'No floors are configured in the system.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {filteredFloors.map((floor) => {
            const hasString = floor.has_string && floor.string_value;
            const isRevealed = Boolean(revealedFloors[floor.floor_id]);
            const isActionLoading = actionLoadingFloorId === floor.floor_id;
            const displayString = hasString 
              ? (isRevealed ? floor.string_value : '••••••••••••••••')
              : 'No string generated';

            return (
              <HamsCard key={floor.floor_id} padding="24px" className="floor-string-card">
                {/* Floor Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      backgroundColor: hasString ? '#e0e7ff' : '#f1f5f9',
                      color: hasString ? '#4338ca' : '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '15px'
                    }}>
                      F{floor.floor_id}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                        {floor.floor_name}
                      </h3>
                      <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <Radio size={12} />
                        {floor.device_name || 'ESP32 Beacon'}
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 700,
                    backgroundColor: hasString ? '#ecfdf5' : '#fffbeb',
                    color: hasString ? '#047857' : '#b45309',
                    border: `1px solid ${hasString ? '#a7f3d0' : '#fde68a'}`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: hasString ? '#10b981' : '#f59e0b' }}></span>
                    {hasString ? 'String Active' : 'Unset'}
                  </span>
                </div>

                {/* String Box */}
                <div style={{
                  backgroundColor: hasString ? '#f8fafc' : '#fdf2f8',
                  border: `1px solid ${hasString ? '#e2e8f0' : '#fbcfe8'}`,
                  borderRadius: '12px',
                  padding: '14px',
                  marginBottom: '16px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Floor Security String (1 per floor)
                    </span>
                    {hasString && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          onClick={() => toggleReveal(floor.floor_id)}
                          title={isRevealed ? "Hide string" : "Reveal string"}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#64748b',
                            padding: '2px 4px',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                        >
                          {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button
                          onClick={() => copyToClipboard(floor.string_value!, floor.floor_id)}
                          title="Copy string"
                          style={{
                            background: copiedFloorId === floor.floor_id ? '#dcfce7' : '#ffffff',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: copiedFloorId === floor.floor_id ? '#166534' : '#334155',
                            padding: '3px 8px',
                            fontSize: '11px',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          {copiedFloorId === floor.floor_id ? <Check size={12} /> : <Copy size={12} />}
                          {copiedFloorId === floor.floor_id ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div style={{
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: hasString ? '#1e293b' : '#94a3b8',
                    letterSpacing: hasString && isRevealed ? '0.04em' : 'normal',
                    wordBreak: 'break-all'
                  }}>
                    {displayString}
                  </div>

                  {floor.updated_at && (
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>
                      Updated: {new Date(floor.updated_at).toLocaleString()}
                    </div>
                  )}
                </div>

                {/* Actions Toolbar */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleGenerateString(floor.floor_id)}
                    disabled={isActionLoading}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      backgroundColor: '#4f46e5',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: isActionLoading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)'
                    }}
                  >
                    <Sparkles size={13} />
                    {hasString ? 'Regenerate' : 'Generate String'}
                  </button>

                  <button
                    onClick={() => setCustomModal({
                      floor_id: floor.floor_id,
                      floor_name: floor.floor_name,
                      custom_string: floor.string_value || ''
                    })}
                    disabled={isActionLoading}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#ffffff',
                      color: '#334155',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: isActionLoading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Set custom string"
                  >
                    <Edit3 size={13} />
                    Custom
                  </button>

                  {hasString && (
                    <button
                      onClick={() => handleClearString(floor.floor_id, floor.floor_name)}
                      disabled={isActionLoading}
                      style={{
                        padding: '8px 10px',
                        backgroundColor: '#fff1f2',
                        color: '#e11d48',
                        border: '1px solid #fecdd3',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: isActionLoading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title="Clear string"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </HamsCard>
            );
          })}
        </div>
      )}

      {/* Custom String Input Modal */}
      {customModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '28px',
            width: '100%',
            maxWidth: '460px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ padding: '10px', backgroundColor: '#e0e7ff', borderRadius: '10px', color: '#4338ca' }}>
                <KeyRound size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                  Set String for {customModal.floor_name}
                </h3>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  Floor ID: {customModal.floor_id} (Replaces existing string)
                </span>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Custom Security String / Token Value:
              </label>
              <input
                type="text"
                value={customModal.custom_string}
                onChange={(e) => setCustomModal({ ...customModal, custom_string: e.target.value })}
                placeholder="e.g. FLR1-SECURE-9982 or ABC123XYZ"
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                This string will be uniquely assigned to this floor and accessible via the floor strings API.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setCustomModal(null)}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '13px',
                  color: '#475569'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCustomString}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#4f46e5',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '13px',
                  boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
                }}
              >
                Save String
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default FloorStringsView;

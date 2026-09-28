import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ExpandableReasonTooltipProps {
  text: string;
  title?: string;
  maxLength?: number;
  badgeStyle?: boolean;
  color?: string;
  prefixBadge?: React.ReactNode;
  containerMaxWidth?: string;
}

export const ExpandableReasonTooltip: React.FC<ExpandableReasonTooltipProps> = ({
  text,
  title,
  maxLength = 45,
  badgeStyle = false,
  color,
  prefixBadge,
  containerMaxWidth
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  if (!text || !text.trim()) {
    return <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>—</span>;
  }

  const cleanText = text.trim();
  const isLeave = cleanText.toLowerCase().includes('[approved leave]') || cleanText.toLowerCase().includes('leave');
  const defaultTitle = title || (isLeave ? 'Approved Leave Application' : 'Absence Justification');
  const isLong = cleanText.length > maxLength;

  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Calculate best position
      const left = Math.max(10, Math.min(window.innerWidth - 380, rect.left));
      const top = rect.bottom + 8;
      setCoords({ top, left });
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  // Truncated preview text
  const previewText = isLong ? `${cleanText.slice(0, maxLength)}...` : cleanText;

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          cursor: isLong ? 'help' : 'default',
          position: 'relative',
          maxWidth: containerMaxWidth || '240px'
        }}
      >
        {prefixBadge}
        <span
          style={{
            fontSize: '12px',
            color: color || (isLeave ? '#047857' : '#334155'),
            fontWeight: isLeave ? 600 : 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: containerMaxWidth || '220px',
            display: 'inline-block',
            ...(badgeStyle ? {
              padding: '3px 8px',
              borderRadius: '6px',
              backgroundColor: isLeave ? '#ecfdf5' : '#f1f5f9',
              border: isLeave ? '1px solid #a7f3d0' : '1px solid #e2e8f0'
            } : {})
          }}
          title={isLong ? undefined : cleanText}
        >
          {previewText}
        </span>
      </div>

      {/* Floating Tooltip Portal */}
      {isLong && isHovered && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            zIndex: 99999,
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            borderRadius: '10px',
            padding: '12px 16px',
            maxWidth: '380px',
            minWidth: '240px',
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.3)',
            border: '1px solid #334155',
            pointerEvents: 'none',
            fontSize: '12px',
            lineHeight: 1.5,
            animation: 'hamsTooltipFadeIn 0.15s ease-out'
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '6px',
            paddingBottom: '6px',
            borderBottom: '1px solid #334155',
            fontWeight: 800,
            fontSize: '13px',
            color: '#38bdf8'
          }}>
            <span>{isLeave ? '🏖️' : '📝'}</span>
            <span>{defaultTitle}</span>
          </div>

          <div style={{
            color: '#e2e8f0',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '260px',
            overflowY: 'auto',
            fontSize: '12px'
          }}>
            {cleanText}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

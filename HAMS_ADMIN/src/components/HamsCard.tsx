import React from 'react';

interface HamsCardProps {
  children: React.ReactNode;
  padding?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export const HamsCard: React.FC<HamsCardProps> = ({
  children,
  padding = '24px',
  className = '',
  style = {},
  onClick,
  onDoubleClick,
}) => {
  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`hams-card ${className}`}
      style={{
        backgroundColor: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        padding,
        transition: 'all 0.2s ease',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

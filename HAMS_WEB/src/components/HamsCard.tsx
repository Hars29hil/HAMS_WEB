import React from 'react';
import './HamsCard.css';

interface HamsCardProps {
  children: React.ReactNode;
  className?: string;
  padding?: string;
}

export const HamsCard: React.FC<HamsCardProps> = ({ children, className = '', padding = '2rem' }) => {
  return (
    <div className={`hams-card glass ${className}`} style={{ padding }}>
      {children}
    </div>
  );
};

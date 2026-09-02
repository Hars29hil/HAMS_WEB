import React from 'react';
import './RadarAnimation.css';

interface RadarAnimationProps {
  isScanning: boolean;
  children: React.ReactNode;
}

export const RadarAnimation: React.FC<RadarAnimationProps> = ({ isScanning, children }) => {
  return (
    <div className={`radar-container ${isScanning ? 'scanning' : ''}`}>
      {isScanning && (
        <>
          <div className="radar-ring ring-1"></div>
          <div className="radar-ring ring-2"></div>
          <div className="radar-ring ring-3"></div>
        </>
      )}
      <div className="radar-content">
        {children}
      </div>
    </div>
  );
};

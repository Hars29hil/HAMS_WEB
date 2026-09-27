import React from 'react';
import './HamsButton.css';
import { Loader2 } from 'lucide-react';

interface HamsButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  isLoading?: boolean;
  icon?: React.ElementType;
}

export const HamsButton: React.FC<HamsButtonProps> = ({ label, isLoading, disabled, icon: Icon, ...props }) => {
  return (
    <button className="hams-button" disabled={isLoading || disabled} {...props}>
      {isLoading ? <Loader2 className="spinner" size={20} /> : (
        <>
          {Icon && <Icon size={18} style={{ marginRight: '8px' }} />}
          {label}
        </>
      )}
    </button>
  );
};

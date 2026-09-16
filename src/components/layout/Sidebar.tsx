import React from 'react';
import { LucideIcon, X } from 'lucide-react';
import './Sidebar.css';

export interface SidebarItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface SidebarProps {
  items: SidebarItem[];
  activeId: string;
  onSelect: (id: string) => void;
  title?: string;
  subtitle?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ items, activeId, onSelect, title = "HAMS", subtitle = "Hostel Management", isOpen = false, onClose }) => {
  return (
    <>
      {/* Mobile Overlay */}
      <div className={`sidebar-overlay ${isOpen ? 'show' : ''}`} onClick={onClose}></div>
      
      <aside className={`sidebar-container glass ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2 className="sidebar-title">{title}</h2>
          {subtitle && <p className="sidebar-subtitle">{subtitle}</p>}
          <button className="sidebar-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
      <nav className="sidebar-nav">
        {items.map(item => {
          const Icon = item.icon;
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelect(item.id)}
            >
              <Icon size={20} className="sidebar-nav-icon" />
              <span className="sidebar-nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
    </>
  );
};

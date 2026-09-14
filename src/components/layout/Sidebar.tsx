import React from 'react';
import { LucideIcon } from 'lucide-react';
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
}

export const Sidebar: React.FC<SidebarProps> = ({ items, activeId, onSelect, title = "HAMS", subtitle = "Hostel Management" }) => {
  return (
    <aside className="sidebar-container glass">
      <div className="sidebar-header">
        <h2 className="sidebar-title">{title}</h2>
        {subtitle && <p className="sidebar-subtitle">{subtitle}</p>}
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
  );
};

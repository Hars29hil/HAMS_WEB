import React from 'react';
import { 
  Moon, 
  Sun, 
  Users, 
  Code, 
  Book, 
  Coffee, 
  Activity, 
  Calendar, 
  CalendarClock, 
  Bell, 
  Flame, 
  Sparkles, 
  Smartphone, 
  Clock,
  Heart,
  Award,
  BookOpen
} from 'lucide-react';

export interface SessionIconProps {
  iconName?: string;
  sessionKey?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const renderSessionIcon = (
  iconName?: string, 
  sessionKey?: string, 
  size = 18, 
  className = 'nav-icon',
  style?: React.CSSProperties
): React.ReactElement => {
  const iconKey = String(iconName || '').toLowerCase().trim();
  const sessKey = String(sessionKey || '').toLowerCase().trim();

  // 1. Exact icon_name matching
  switch (iconKey) {
    case 'moon':
    case 'night':
      return <Moon size={size} className={className} style={style} />;
    case 'sun':
    case 'morning':
      return <Sun size={size} className={className} style={style} />;
    case 'users':
    case 'sabha':
    case 'assembly':
      return <Users size={size} className={className} style={style} />;
    case 'code':
    case 'coding':
      return <Code size={size} className={className} style={style} />;
    case 'book':
    case 'study':
      return <Book size={size} className={className} style={style} />;
    case 'bookopen':
      return <BookOpen size={size} className={className} style={style} />;
    case 'coffee':
    case 'break':
      return <Coffee size={size} className={className} style={style} />;
    case 'activity':
    case 'sports':
      return <Activity size={size} className={className} style={style} />;
    case 'calendar':
    case 'event':
      return <Calendar size={size} className={className} style={style} />;
    case 'bell':
      return <Bell size={size} className={className} style={style} />;
    case 'flame':
    case 'aarti':
    case 'arti':
    case 'puja':
      return <Flame size={size} className={className} style={style} />;
    case 'smartphone':
      return <Smartphone size={size} className={className} style={style} />;
    case 'sparkles':
      return <Sparkles size={size} className={className} style={style} />;
    case 'clock':
      return <Clock size={size} className={className} style={style} />;
    case 'heart':
      return <Heart size={size} className={className} style={style} />;
    case 'award':
      return <Award size={size} className={className} style={style} />;
  }

  // 2. Semantic fallback matching by session_key or name
  if (sessKey.includes('arti') || sessKey.includes('aarti')) {
    return <Bell size={size} className={className} style={style} />;
  }
  if (sessKey.includes('sabha') || sessKey.includes('weekly') || sessKey.includes('assembly')) {
    return <Users size={size} className={className} style={style} />;
  }
  if (sessKey.includes('morning')) {
    return <Sun size={size} className={className} style={style} />;
  }
  if (sessKey.includes('night')) {
    return <Moon size={size} className={className} style={style} />;
  }
  if (sessKey.includes('code') || sessKey.includes('coding')) {
    return <Code size={size} className={className} style={style} />;
  }
  if (sessKey.includes('study') || sessKey.includes('exam')) {
    return <Book size={size} className={className} style={style} />;
  }
  if (sessKey.includes('break') || sessKey.includes('tea')) {
    return <Coffee size={size} className={className} style={style} />;
  }
  if (sessKey.includes('sport') || sessKey.includes('game') || sessKey.includes('gym')) {
    return <Activity size={size} className={className} style={style} />;
  }

  // 3. Default fallback
  return <CalendarClock size={size} className={className} style={style} />;
};

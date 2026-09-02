import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, BadgeIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../services/apiClient';
import { HamsCard } from '../../components/HamsCard';
import { HamsButton } from '../../components/HamsButton';
import './LoginPage.css';

export const LoginPage: React.FC = () => {
  const [bankCode, setBankCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankCode.trim()) {
      setError('Please enter your Bank Code.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await apiClient.post('/auth/login', {
        username: bankCode,
        sim_numbers: [] // Web cannot read SIM cards
      });

      if (response.data.success) {
        const { token, user } = response.data.data;
        login(token, user);

        if (user.role === 'STUDENT') {
          navigate('/student');
        } else {
          navigate('/admin');
        }
      } else {
        setError(response.data.message || 'Login failed.');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-wrapper">
        
        <div className="logo-section">
          <div className="logo-glow">
            <Fingerprint size={48} color="white" />
          </div>
          <h1 className="logo-text">HAMS</h1>
          <p className="logo-subtext">Hostel Attendance Management</p>
        </div>

        <HamsCard padding="2rem" className="login-card">
          <h2 className="login-title">Secure Login</h2>
          <p className="login-subtitle">Enter your details to access your dashboard.</p>
          
          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleLogin} className="login-form">
            <div className="input-group">
              <label>Bank Code</label>
              <div className="input-wrapper">
                <BadgeIcon size={20} className="input-icon" />
                <input
                  type="text"
                  placeholder="Enter your Bank Code (e.g., 01723)"
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                />
              </div>
            </div>
            
            <HamsButton type="submit" label="Secure Login" isLoading={isLoading} style={{ width: '100%', marginTop: '1rem' }} />
          </form>
        </HamsCard>

      </div>
    </div>
  );
};

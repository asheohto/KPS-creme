import React, { useState, useEffect } from 'react';
import ChatOverlay from './ChatOverlay';
import Timer from './Timer';
import YouTubeMusicPlayer from './YouTubeMusicPlayer';
import Login from './Login';
import Notepad from './Notepad';

function App() {
  const [user, setUser] = useState(null);
  const [timerVolume, setTimerVolume] = useState(50);
  const [ytVolume, setYtVolume] = useState(50);

  useEffect(() => {
    // Check for a saved login token on startup and restore the session if present
    const token = localStorage.getItem('vpm_token');
    const savedUser = localStorage.getItem('vpm_user');
    if (token && savedUser) {
      setUser(savedUser);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('vpm_token');
    localStorage.removeItem('vpm_user');
    setUser(null);
  };

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #242424 100%)',
      padding: '40px 20px',
      fontFamily: '"Inter", sans-serif',
      position: 'relative',
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '100px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '32px',
        }}>
          <h1 style={{
            fontSize: '32px',
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '-0.5px',
            margin: 0,
          }}>
            Kinda Private Studying
          </h1>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              Goober: <strong style={{ color: 'var(--accent)' }}>{user}</strong>
            </span>
            <button 
              onClick={handleLogout}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              LOGOUT
            </button>
          </div>
        </div>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr', /* Reduced from 320px */
          gap: '16px', /* Reduced from 24px */
          marginBottom: '24px',
        }}>
          <Timer volume={timerVolume} />
          <Notepad currentUser={user} />
        </div>
        
        <div style={{ marginTop: '24px' }}>
          <YouTubeMusicPlayer volume={ytVolume} />
        </div>
      </div>

      <ChatOverlay currentUser={user} />

      {/* VOLUME MIXER — controls volume for the timer alarm and music player independently */}
      <div style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        zIndex: 1000,
        boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
      }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Volume Mixer
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '16px' }}>Timer</span>
          <input 
            type="range" min="0" max="100" 
            value={timerVolume} 
            onChange={(e) => setTimerVolume(Number(e.target.value))}
            title="Timer Volume"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '16px' }}>Moosik</span>
          <input 
            type="range" min="0" max="100" 
            value={ytVolume} 
            onChange={(e) => setYtVolume(Number(e.target.value))}
            title="Music Volume"
          />
        </div>
      </div>
    </div>
  );
}

export default App;
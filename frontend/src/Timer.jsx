import React, { useState, useEffect, useRef } from 'react';

const defaultMins = [25, 5, 15];
const labels = ['Pomodoro', 'Short Break', 'Long Break'];

// currentUser is used to store timer state per-user in localStorage
function Timer({ volume, currentUser }) {
  // Storage keys are tied to the logged-in user so timer settings don't bleed between accounts
  const CACHE_KEY_MODE = `nova_timer_mode_${currentUser}`;
  const CACHE_KEY_MINS = `nova_timer_mins_${currentUser}`;
  const CACHE_KEY_SECS = `nova_timer_seconds_${currentUser}`;

  // Load the last used timer mode (Pomodoro / Short Break / Long Break)
  const [mode, setMode] = useState(() => {
    if (!currentUser) return 0;
    const saved = localStorage.getItem(CACHE_KEY_MODE);
    return saved !== null ? parseInt(saved, 10) : 0;
  });
  
  // Load custom minute values for each mode (user can edit these)
  const [customMins, setCustomMins] = useState(() => {
    if (!currentUser) return [...defaultMins];
    const saved = localStorage.getItem(CACHE_KEY_MINS);
    return saved ? JSON.parse(saved) : [...defaultMins];
  });
  
  // Load the remaining seconds from last session
  const [seconds, setSeconds] = useState(() => {
    if (!currentUser) return defaultMins[0] * 60;
    const saved = localStorage.getItem(CACHE_KEY_SECS);
    return saved !== null ? parseInt(saved, 10) : defaultMins[0] * 60;
  });

  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(false); // Whether the user is editing the minutes value
  const [editVal, setEditVal] = useState('');
  
  // Alarm sound that plays when the timer hits zero
  const audioRef = useRef(new Audio('https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg'));

  // Save timer state to localStorage whenever it changes
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(CACHE_KEY_MODE, mode.toString());
      localStorage.setItem(CACHE_KEY_MINS, JSON.stringify(customMins));
      localStorage.setItem(CACHE_KEY_SECS, seconds.toString());
    }
  }, [mode, customMins, seconds, currentUser, CACHE_KEY_MODE, CACHE_KEY_MINS, CACHE_KEY_SECS]);

  // Keep the alarm volume in sync with the mixer slider
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  // Switch between Pomodoro / Short Break / Long Break
  const changeMode = (newMode) => {
    setMode(newMode);
    setSeconds(customMins[newMode] * 60);
    setRunning(false);
    setEditing(false);
  };

  // The main countdown — ticks every second while running
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSeconds(s => {
        if (s === 1) {
          // Timer finished — play the alarm and stop
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(e => console.warn("Audio blocked by browser.", e));
          setRunning(false);
          return 0;
        }
        return s > 0 ? s - 1 : 0;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  // Format seconds as MM:SS for display
  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const toggleTimer = () => setRunning(!running);
  
  const resetTimer = () => {
    setRunning(false);
    setSeconds(customMins[mode] * 60);
  };

  // Save the new minute value after the user edits it
  const saveEdit = () => {
    const val = parseInt(editVal, 10);
    if (!isNaN(val) && val > 0) {
      const newMins = [...customMins];
      newMins[mode] = val;
      setCustomMins(newMins);
      setSeconds(val * 60);
    }
    setEditing(false);
  };

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '20px',
    }}>
      {/* Mode selector: Pomodoro / Short Break / Long Break */}
      <div style={{ display: 'flex', gap: '8px', background: 'var(--surface)', padding: '6px', borderRadius: '6px', border: '1px solid var(--border)' }}>
        {labels.map((label, i) => (
          <button
            key={i}
            onClick={() => changeMode(i)}
            style={{
              background: mode === i ? 'var(--accent)' : 'transparent',
              color: mode === i ? '#131313' : 'var(--text-muted)',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Time display / edit area */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '16px' }}>
        {editing ? (
          // Edit mode: shows a number input so the user can set custom minutes
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              autoFocus
              type="number"
              defaultValue={customMins[mode]}
              onChange={e => setEditVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveEdit()}
              style={{
                fontSize: '48px',
                fontWeight: 800,
                color: 'var(--text)',
                background: 'var(--surface)',
                border: '1px solid var(--accent)',
                borderRadius: '8px',
                width: '120px',
                textAlign: 'center',
                padding: '10px',
                outline: 'none',
                fontFamily: 'Inter, sans-serif'
              }}
            />
            <button 
              onClick={saveEdit} 
              style={{ 
                background: 'var(--accent)', 
                color: '#131313', 
                border: 'none', 
                padding: '12px 16px', 
                borderRadius: '6px', 
                fontWeight: 700, 
                cursor: 'pointer' 
              }}
            >
              OK
            </button>
          </div>
        ) : (
          <>
            {/* Normal display: big countdown clock */}
            <div 
              style={{ 
                fontSize: '64px', 
                fontWeight: 800, 
                color: 'var(--text)', 
                fontVariantNumeric: 'tabular-nums', 
                letterSpacing: '-2px' 
              }}
            >
              {fmt(seconds)}
            </div>
            <button 
              onClick={() => { 
                setEditVal(customMins[mode].toString()); 
                setEditing(true); 
                setRunning(false); 
              }}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.05em',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--surface)';
                e.currentTarget.style.color = 'var(--text)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              EDIT
            </button>
          </>
        )}
      </div>

      {/* Start/Pause and Reset buttons */}
      <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
        <button
          onClick={toggleTimer}
          style={{
            flex: 2,
            background: running ? 'var(--surface)' : 'var(--accent)',
            color: running ? 'var(--text)' : '#131313',
            border: running ? '1px solid var(--border)' : 'none',
            padding: '12px',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {running ? 'PAUSE' : 'START'}
        </button>
        <button
          onClick={resetTimer}
          style={{
            flex: 1,
            background: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            padding: '12px',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          RESET
        </button>
      </div>
    </div>
  );
}

export default Timer;

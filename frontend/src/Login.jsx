import React from 'react';
import { io } from 'socket.io-client';

// Establish the connection to your local backend on port 3001
const socket = io('https://kinda-private-studying-v2.onrender.com');

function Login({ onLogin }) {
  const [isLogin, setIsLogin] = React.useState(true);
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    socket.on('auth_error', (msg) => {
      setError(msg);
      setLoading(false);
    });

    socket.on('login_success', (data) => {
      localStorage.setItem('vpm_user', data.username);
      localStorage.setItem('vpm_token', data.token);
      setLoading(false);
      onLogin(data.username);
    });

    return () => {
      socket.off('auth_error');
      socket.off('login_success');
    };
  }, [onLogin]);

  const submit = () => {
    if (!username.trim() || !password) return;
    setError('');
    setLoading(true);
    socket.emit(isLogin ? 'login' : 'signup', { username: username.trim(), password });
  };

  const toggle = () => {
    setIsLogin(p => !p);
    setError('');
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: '10px', padding: '36px 32px', width: '340px',
        display: 'flex', flexDirection: 'column', gap: '0px',
      }}>
        {/* Title */}
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--accent)', marginBottom: '4px' }}>
            nova work thingy
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {isLogin ? 'Login to continue' : 'Create an account'}
          </p>
        </div>

        {/* Error */}
        <div style={{ minHeight: '20px', marginBottom: '12px', textAlign: 'center' }}>
          {error && <span style={{ fontSize: '12px', color: '#ed4245' }}>{error}</span>}
        </div>

        {/* Inputs */}
        <input
          placeholder="Username"
          maxLength={32}
          value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={{
            padding: '11px 14px', borderRadius: '6px', marginBottom: '10px',
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', fontSize: '14px', fontFamily: 'Inter, sans-serif',
            outline: 'none', width: '100%',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--accent)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
        <input
          type="password"
          placeholder="Password"
          maxLength={128}
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={{
            padding: '11px 14px', borderRadius: '6px', marginBottom: '20px',
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', fontSize: '14px', fontFamily: 'Inter, sans-serif',
            outline: 'none', width: '100%',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--accent)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />

        {/* Submit */}
        <button
          onClick={submit}
          disabled={loading}
          style={{
            padding: '11px', background: 'var(--accent)', border: 'none',
            borderRadius: '6px', color: '#131313', fontWeight: 700,
            fontSize: '13px', fontFamily: 'Inter, sans-serif',
            letterSpacing: '0.08em', opacity: loading ? 0.7 : 1,
            transition: 'opacity 0.15s', marginBottom: '14px',
          }}
        >{loading ? '...' : 'SUBMIT'}</button>

        {/* Toggle */}
        <span
          onClick={toggle}
          style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', cursor: 'pointer' }}
          onMouseOver={e => e.target.style.color = 'var(--accent)'}
          onMouseOut={e => e.target.style.color = 'var(--text-muted)'}
        >
          {isLogin ? "Need an account? Sign up" : "Have an account? Login"}
        </span>
      </div>
    </div>
  );
}

export default Login;
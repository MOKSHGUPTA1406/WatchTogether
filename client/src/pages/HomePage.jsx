import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Users, Sparkles, Tv, ShieldCheck, RefreshCw, Loader2 } from 'lucide-react';
import { wakeServer } from '../lib/wakeServer';

export default function HomePage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(
    localStorage.getItem('wt_display_name') || ''
  );
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Server wake state
  const [isWaking, setIsWaking] = useState(false);
  const [wakeStatus, setWakeStatus] = useState('');
  const [pendingTargetCode, setPendingTargetCode] = useState(null);

  const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const proceedToRoom = async (code, name) => {
    setErrorMsg('');
    setIsWaking(true);
    setPendingTargetCode(code);
    setWakeStatus('Checking server connection...');

    try {
      await wakeServer(serverUrl, ({ elapsedSeconds, message }) => {
        setWakeStatus(`⚡ Waking up server on Render (${elapsedSeconds}s)... Render cold-starts take ~30-50s when idle.`);
      }, 60);

      setIsWaking(false);
      localStorage.setItem('wt_display_name', name);
      navigate(`/room/${code}?name=${encodeURIComponent(name)}`);
    } catch (err) {
      console.error('[WakeServer Error]', err);
      setIsWaking(false);
      setErrorMsg(err.message || 'Failed to connect to server after 60s timeout.');
    }
  };

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setErrorMsg('Please enter your name');
      return;
    }
    const newCode = generateRoomCode();
    proceedToRoom(newCode, displayName.trim());
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setErrorMsg('Please enter your name');
      return;
    }
    if (!roomCodeInput.trim()) {
      setErrorMsg('Please enter a room code');
      return;
    }
    const cleanCode = roomCodeInput.trim().toUpperCase();
    proceedToRoom(cleanCode, displayName.trim());
  };

  const handleRetry = () => {
    if (pendingTargetCode && displayName.trim()) {
      proceedToRoom(pendingTargetCode, displayName.trim());
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem 1rem',
      position: 'relative'
    }}>
      {/* Background Glow Deco */}
      <div style={{
        position: 'absolute',
        top: '20%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '500px',
        height: '300px',
        background: 'radial-gradient(circle, var(--primary-glow) 0%, transparent 70%)',
        filter: 'blur(60px)',
        zIndex: 0,
        pointerEvents: 'none'
      }} />

      {/* Main Content Container */}
      <div style={{
        maxWidth: '520px',
        width: '100%',
        position: 'relative',
        zIndex: 1
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.4rem 1rem',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            color: '#a5b4fc',
            fontSize: '0.85rem',
            fontWeight: 600,
            marginBottom: '1.2rem'
          }}>
            <Sparkles size={16} /> Real-Time Synchronized Streaming
          </div>

          <h1 style={{
            fontSize: '2.8rem',
            fontWeight: 800,
            lineHeight: 1.1,
            marginBottom: '0.8rem'
          }}>
            Watch <span className="gradient-text">Together</span>
          </h1>

          <p style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.5 }}>
            Synchronized watch party platform for friends. Watch YouTube, local video files, or share live tabs in real-time.
          </p>
        </div>

        {/* Server Waking Up Progress Modal / Overlay */}
        {isWaking && (
          <div className="glass-panel" style={{
            padding: '1.5rem',
            marginBottom: '1.5rem',
            textAlign: 'center',
            borderColor: 'rgba(99, 102, 241, 0.4)',
            background: 'rgba(99, 102, 241, 0.12)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '0.6rem' }}>
              <Loader2 size={24} className="spin" color="var(--primary)" />
              <span style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>
                Connecting to WatchTogether Server
              </span>
            </div>
            <p style={{ fontSize: '0.88rem', color: '#c7d2fe', lineHeight: 1.4 }}>
              {wakeStatus}
            </p>
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } .spin { animation: spin 1s linear infinite; }`}</style>
          </div>
        )}

        {/* User Details & Room Forms */}
        {!isWaking && (
          <div className="glass-panel" style={{ padding: '2rem' }}>
            {/* Display Name Field */}
            <div style={{ marginBottom: '1.8rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                marginBottom: '0.5rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Your Display Name
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Enter your name (e.g. Alex)"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setErrorMsg('');
                }}
              />
            </div>

            {/* Form Option 1: Create New Room */}
            <form onSubmit={handleCreateRoom} style={{ marginBottom: '1.8rem' }}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.85rem' }}
              >
                <Play size={18} /> Create New Watch Party
              </button>
            </form>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              margin: '1.5rem 0',
              gap: '1rem'
            }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                or join existing
              </span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
            </div>

            {/* Form Option 2: Join Room Code */}
            <form onSubmit={handleJoinRoom} style={{ display: 'flex', gap: '0.6rem' }}>
              <input
                type="text"
                className="input-field"
                placeholder="Enter 6-character Room Code"
                value={roomCodeInput}
                onChange={(e) => {
                  setRoomCodeInput(e.target.value.toUpperCase());
                  setErrorMsg('');
                }}
                maxLength={6}
                style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}
              />
              <button type="submit" className="btn btn-secondary" style={{ whiteSpace: 'nowrap' }}>
                <Users size={18} /> Join Party
              </button>
            </form>

            {/* Error Banner with Optional Retry */}
            {errorMsg && (
              <div style={{
                marginTop: '1.2rem',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.8rem'
              }}>
                <span>{errorMsg}</span>
                {pendingTargetCode && (
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="btn btn-secondary"
                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                  >
                    <RefreshCw size={14} /> Retry
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer info */}
        <div style={{
          marginTop: '2rem',
          textAlign: 'center',
          display: 'flex',
          justifyContent: 'center',
          gap: '1.5rem',
          color: 'var(--text-dim)',
          fontSize: '0.8rem'
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <Tv size={14} /> YouTube & HLS Files
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShieldCheck size={14} /> 60 FPS WebRTC Tab Share
          </span>
        </div>
      </div>
    </div>
  );
}

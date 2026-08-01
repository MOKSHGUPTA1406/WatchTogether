import React from 'react';
import { Mic, MicOff, Volume2, VolumeX, PhoneCall, PhoneOff, Radio } from 'lucide-react';

export default function VoicePanel({
  isVoiceConnected,
  isMuted,
  isDeafened,
  inVoiceMembers,
  joinVoice,
  leaveVoice,
  toggleMute,
  toggleDeafen,
  members
}) {
  const activeVoiceCount = inVoiceMembers.length + (isVoiceConnected ? 1 : 0);

  return (
    <div className="glass-panel" style={{
      padding: '0.8rem 1.2rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          background: isVoiceConnected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)',
          border: isVoiceConnected ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isVoiceConnected ? '#34d399' : 'var(--text-muted)'
        }}>
          <Radio size={18} />
        </div>

        <div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span>Voice Party</span>
            {isVoiceConnected && (
              <span style={{ fontSize: '0.75rem', color: '#34d399', background: 'rgba(16, 185, 129, 0.15)', padding: '0.15rem 0.5rem', borderRadius: '99px' }}>
                Connected ({activeVoiceCount})
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
            {isVoiceConnected ? 'WebRTC Mesh voice chat active' : 'Click Join Voice to talk with friends'}
          </div>
        </div>
      </div>

      {/* Voice Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {isVoiceConnected ? (
          <>
            {/* Mic Toggle */}
            <button
              onClick={toggleMute}
              className="btn btn-secondary"
              style={{
                padding: '0.45rem 0.75rem',
                background: isMuted ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                color: isMuted ? '#fca5a5' : '#fff',
                borderColor: isMuted ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.1)'
              }}
              title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            >
              {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
            </button>

            {/* Deafen Toggle */}
            <button
              onClick={toggleDeafen}
              className="btn btn-secondary"
              style={{
                padding: '0.45rem 0.75rem',
                background: isDeafened ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                color: isDeafened ? '#fbbf24' : '#fff',
                borderColor: isDeafened ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255, 255, 255, 0.1)'
              }}
              title={isDeafened ? 'Undeafen Audio' : 'Deafen Audio'}
            >
              {isDeafened ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>

            {/* Leave Voice */}
            <button
              onClick={leaveVoice}
              className="btn btn-secondary"
              style={{
                padding: '0.45rem 0.9rem',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#fca5a5',
                borderColor: 'rgba(239, 68, 68, 0.3)'
              }}
            >
              <PhoneOff size={16} /> Disconnect
            </button>
          </>
        ) : (
          <button
            onClick={joinVoice}
            className="btn btn-primary"
            style={{
              padding: '0.45rem 1rem',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
            }}
          >
            <PhoneCall size={16} /> Join Voice
          </button>
        )}
      </div>
    </div>
  );
}

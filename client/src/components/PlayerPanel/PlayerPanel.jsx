import React, { useRef, useEffect } from 'react';
import YouTubePlayer from './YouTubePlayer';
import HlsPlayer from './HlsPlayer';
import { useSyncClock } from '../../hooks/useSyncClock';
import { Tv, Radio, Monitor } from 'lucide-react';

function WebRtcPlayer({ stream, isHost }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      video.play().catch((err) => {
        console.warn('[WebRtcPlayer Autoplay catch]', err);
      });
    }
  }, [stream]);

  if (!stream) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid rgba(255,255,255,0.15)',
          borderTopColor: 'var(--primary)',
          borderRadius: '50%',
          animation: 'spin 0.9s linear infinite',
          marginBottom: '1rem'
        }} />
        <span style={{ fontWeight: 600, color: '#fff' }}>Connecting WebRTC 60 FPS screen stream...</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.3rem' }}>
          Establishing peer-to-peer connection
        </span>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      controls
      muted={isHost} // Mute host local video element to avoid audio feedback echo
      style={{
        width: '100%',
        height: '100%',
        maxHeight: '100%',
        objectFit: 'contain',
        background: '#000'
      }}
    />
  );
}

export default function PlayerPanel({
  roomState,
  isHost,
  play,
  pause,
  seek,
  localScreenStream,
  remoteScreenStream
}) {
  const playerRef = useRef(null);

  // Attach background drift correction clock (for YouTube & HLS files)
  useSyncClock(roomState, playerRef, isHost);

  const handlePlay = (currentTime) => {
    if (isHost && roomState?.sourceType !== 'capture') play(currentTime);
  };

  const handlePause = (currentTime) => {
    if (isHost && roomState?.sourceType !== 'capture') pause(currentTime);
  };

  const handleSeek = (currentTime) => {
    if (isHost && roomState?.sourceType !== 'capture') seek(currentTime);
  };

  const sourceType = roomState?.sourceType || 'none';
  const activeScreenStream = isHost ? localScreenStream : remoteScreenStream;

  return (
    <div className="glass-panel" style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
      background: '#000',
      borderRadius: 'var(--radius-md)'
    }}>
      {/* WebRTC Live Screen Share Banner (PiP Overlay) */}
      {sourceType === 'capture' && (
        <div style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          zIndex: 20,
          background: 'rgba(9, 12, 20, 0.85)',
          border: '1px solid rgba(236, 72, 153, 0.5)',
          color: '#f472b6',
          padding: '0.4rem 0.85rem',
          borderRadius: '12px',
          fontSize: '0.78rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(10px)'
        }}>
          <Radio size={14} /> ⚡ WebRTC Live HD — 0 Latency
        </div>
      )}


      {sourceType === 'youtube' && roomState?.sourceUrl ? (
        <YouTubePlayer
          ref={playerRef}
          sourceUrl={roomState.sourceUrl}
          roomState={roomState}
          isHost={isHost}
          onPlay={handlePlay}
          onPause={handlePause}
          onSeek={handleSeek}
        />
      ) : sourceType === 'file' && roomState?.sourceUrl ? (
        <HlsPlayer
          ref={playerRef}
          sourceUrl={roomState.sourceUrl}
          roomState={roomState}
          isHost={isHost}
          onPlay={handlePlay}
          onPause={handlePause}
          onSeek={handleSeek}
        />
      ) : sourceType === 'capture' ? (
        <WebRtcPlayer stream={activeScreenStream} isHost={isHost} />
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          textAlign: 'center',
          background: 'radial-gradient(circle, rgba(18, 24, 38, 0.9) 0%, rgba(9, 12, 20, 0.95) 100%)'
        }}>
          <div style={{
            width: '70px',
            height: '70px',
            borderRadius: '50%',
            background: 'rgba(99, 102, 241, 0.15)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.2rem',
            color: 'var(--primary)'
          }}>
            <Tv size={32} />
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            No Media Loaded
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '420px' }}>
            {isHost
              ? 'Paste a YouTube video link, upload a file, or share a live tab in the Host Controls bar above.'
              : 'Waiting for the room host to select a video to watch.'}
          </p>
        </div>
      )}
    </div>
  );
}

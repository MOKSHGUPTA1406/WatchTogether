import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import Hls from 'hls.js';

const HlsPlayer = forwardRef(function HlsPlayer(
  { sourceUrl, roomState, isHost, onPlay, onPause, onSeek },
  ref
) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const lastProgrammaticActionTs = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fullStreamUrl = sourceUrl
    ? (sourceUrl.startsWith('http')
        ? sourceUrl
        : `${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}${sourceUrl}`)
    : null;

  // Imperative handle exposed to useSyncClock
  useImperativeHandle(ref, () => ({
    getCurrentTime: () => {
      return videoRef.current ? videoRef.current.currentTime : 0;
    },
    seekTo: (seconds) => {
      if (videoRef.current) {
        lastProgrammaticActionTs.current = Date.now();
        videoRef.current.currentTime = seconds;
      }
    },
    play: () => {
      if (videoRef.current && videoRef.current.paused) {
        lastProgrammaticActionTs.current = Date.now();
        videoRef.current.play().catch((err) => {
          console.warn('[HlsPlayer] Autoplay prevented:', err);
        });
      }
    },
    pause: () => {
      if (videoRef.current && !videoRef.current.paused) {
        lastProgrammaticActionTs.current = Date.now();
        videoRef.current.pause();
      }
    }
  }), []);

  // Initialize Hls.js instance or native HLS
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !fullStreamUrl) {
      setIsLoading(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 3,
        maxBufferLength: 3,

        backBufferLength: 10,
        manifestLoadingMaxRetry: 10,
        manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 10,
        fragLoadingMaxRetry: 10
      });
      hlsRef.current = hls;


      hls.loadSource(fullStreamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        if (video) {
          video.play().catch(() => {
            // Fallback for browser autoplay policies
            video.muted = true;
            video.play().catch((err) => console.warn('[Autoplay policy]', err));
          });
        }
      });


      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('[Hls Network Warning] Retrying manifest load...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('[Hls Media Warning] Recovering media error...');
              hls.recoverMediaError();
              break;
            default:
              console.error('[Hls Fatal Error]', data);
              setError('HLS Stream error. Transcoding may still be starting...');
              break;
          }
        }
      });

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Safari HLS
      video.src = fullStreamUrl;
      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false);
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [fullStreamUrl]);

  // Auto-resume & resync live HLS stream when returning to this browser tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && videoRef.current) {
        console.log('[HlsPlayer] Tab returned to foreground. Resyncing stream...');
        if (hlsRef.current) {
          hlsRef.current.startLoad();
          // Jump to live edge for capture streams
          if (roomState?.sourceType === 'capture' && videoRef.current.duration && !isNaN(videoRef.current.duration)) {
            videoRef.current.currentTime = Math.max(0, videoRef.current.duration - 0.5);
          }
        }
        videoRef.current.play().catch((err) => {
          console.warn('[HlsPlayer] Auto-resume play catch:', err);
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [roomState?.sourceType]);


  // Host playback event listeners
  const handlePlayEvent = () => {
    if (!isHost) return;
    if (Date.now() - lastProgrammaticActionTs.current < 400) return;
    const currTime = videoRef.current ? videoRef.current.currentTime : 0;
    onPlay(currTime);
  };

  const handlePauseEvent = () => {
    if (!isHost) return;
    if (Date.now() - lastProgrammaticActionTs.current < 400) return;
    const currTime = videoRef.current ? videoRef.current.currentTime : 0;
    onPause(currTime);
  };

  const handleSeekEvent = () => {
    if (!isHost) return;
    if (Date.now() - lastProgrammaticActionTs.current < 400) return;
    const currTime = videoRef.current ? videoRef.current.currentTime : 0;
    onSeek(currTime);
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      position: 'relative',
      background: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {(!fullStreamUrl || isLoading) && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2,
          color: 'var(--text-muted)',
          fontSize: '0.95rem'
        }}>
          <div style={{
            width: '42px',
            height: '42px',
            border: '3px solid rgba(255,255,255,0.15)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            animation: 'spin 0.9s linear infinite',
            marginBottom: '1rem'
          }} />
          <span style={{ fontWeight: 600, color: '#fff' }}>
            {!fullStreamUrl ? 'Transcoding local video stream...' : 'Buffering HLS video stream...'}
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.3rem' }}>
            Stream will load automatically when ready
          </span>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {error && (
        <div style={{
          position: 'absolute',
          top: '1rem',
          left: '1rem',
          right: '1rem',
          padding: '0.6rem 1rem',
          background: 'rgba(239, 68, 68, 0.2)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: 'var(--radius-md)',
          color: '#fca5a5',
          fontSize: '0.85rem',
          zIndex: 3
        }}>
          {error}
        </div>
      )}

      <video
        ref={videoRef}
        controls
        style={{
          width: '100%',
          height: '100%',
          maxHeight: '100%',
          objectFit: 'contain'
        }}
        onPlay={handlePlayEvent}
        onPause={handlePauseEvent}
        onSeeked={handleSeekEvent}
      />
    </div>
  );
});

export default HlsPlayer;

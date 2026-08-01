import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';

// Extract YouTube Video ID from various link formats
export function extractYouTubeId(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : url;
}

// Global promise guard for YouTube IFrame API script loading
let ytApiPromise = null;
function loadYouTubeApi() {
  if (window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      const existingScript = document.getElementById('youtube-iframe-api');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      }
      const previousCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (previousCallback) previousCallback();
        resolve(window.YT);
      };
    });
  }
  return ytApiPromise;
}

const YouTubePlayer = forwardRef(function YouTubePlayer(
  { sourceUrl, roomState, isHost, onPlay, onPause, onSeek },
  ref
) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const lastProgrammaticActionTs = useRef(0);
  const videoId = extractYouTubeId(sourceUrl);

  // Imperative handle exposed to useSyncClock and parent controls
  useImperativeHandle(ref, () => ({
    getCurrentTime: () => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        return playerRef.current.getCurrentTime() || 0;
      }
      return 0;
    },
    seekTo: (seconds) => {
      if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
        lastProgrammaticActionTs.current = Date.now();
        playerRef.current.seekTo(seconds, true);
      }
    },
    play: () => {
      if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
        lastProgrammaticActionTs.current = Date.now();
        playerRef.current.playVideo();
      }
    },
    pause: () => {
      if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
        lastProgrammaticActionTs.current = Date.now();
        playerRef.current.pauseVideo();
      }
    }
  }), []);

  // Initialize YT Player instance
  useEffect(() => {
    if (!videoId) return;
    let isSubscribed = true;

    loadYouTubeApi().then((YT) => {
      if (!isSubscribed || !containerRef.current) return;

      // Clean up previous iframe element if exists
      containerRef.current.innerHTML = '<div id="yt-player-element"></div>';

      playerRef.current = new YT.Player('yt-player-element', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          origin: window.location.origin
        },
        events: {
          onReady: () => {
            if (isSubscribed) {
              setIsReady(true);
            }
          },
          onStateChange: (event) => {
            if (!isHost) return; // Only host emits playback events to room

            // Ignore events within 400ms of a programmatic sync action
            if (Date.now() - lastProgrammaticActionTs.current < 400) {
              return;
            }

            const currTime = playerRef.current ? playerRef.current.getCurrentTime() : 0;

            // YT.PlayerState: PLAYING (1), PAUSED (2)
            if (event.data === window.YT.PlayerState.PLAYING) {
              onPlay(currTime);
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              onPause(currTime);
            }
          }
        }
      });
    });

    return () => {
      isSubscribed = false;
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [videoId]);

  if (!videoId) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-muted)'
      }}>
        Invalid YouTube URL provided
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '360px',
        background: '#000',
        position: 'relative'
      }}
    />
  );
});

export default YouTubePlayer;

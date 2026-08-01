import { useState, useRef, useCallback } from 'react';
import { socket } from '../lib/socket';

export function useTabCapture() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState(null);
  const mediaStreamRef = useRef(null);

  const stopCapture = useCallback((roomId, stopMeshCallback = null) => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (typeof stopMeshCallback === 'function') {
      stopMeshCallback();
    }

    if (roomId) {
      socket.emit('room:setSource', {
        roomId,
        sourceType: 'none',
        sourceUrl: null
      });
    }

    setIsCapturing(false);
  }, []);

  const startCapture = useCallback(async (roomId, startMeshCallback = null) => {
    if (!roomId) return;
    setError(null);

    try {
      // Prompt user to select browser tab/window to capture with audio
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
          width: { max: 1920 },
          height: { max: 1080 },
          frameRate: { max: 60 }
        },
        audio: true
      });

      mediaStreamRef.current = stream;

      // Handle user clicking browser native "Stop sharing" bar
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          console.log('[TabCapture] User stopped screen share via browser UI');
          stopCapture(roomId, startMeshCallback);
        };
      }

      // Pass captured MediaStream to WebRTC mesh engine
      if (typeof startMeshCallback === 'function') {
        startMeshCallback(stream);
      }

      // Notify room members over socket that WebRTC screen share is live
      socket.emit('room:setSource', {
        roomId,
        sourceType: 'capture',
        sourceUrl: 'webrtc'
      });

      setIsCapturing(true);

    } catch (err) {
      console.error('[TabCapture Error]', err);
      if (err.name !== 'NotAllowedError') { // Ignore user cancellation
        setError(err.message || 'Failed to capture tab');
      }
      setIsCapturing(false);
    }
  }, [stopCapture]);

  return {
    isCapturing,
    error,
    startCapture,
    stopCapture,
    mediaStream: mediaStreamRef.current
  };
}

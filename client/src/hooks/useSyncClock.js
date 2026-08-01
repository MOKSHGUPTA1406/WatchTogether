import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook to maintain synchronized playback relative to the room leader clock.
 *
 * @param {Object} roomState - Current room state from server
 * @param {Object} playerRef - Ref pointing to player instance with { getCurrentTime, seekTo, play, pause }
 * @param {boolean} isHost - Whether this client is the room host
 */
export function useSyncClock(roomState, playerRef, isHost) {
  const lastProgrammaticActionTs = useRef(0);

  const getExpectedTime = useCallback(() => {
    if (!roomState || roomState.currentTime == null) return 0;
    const baseTime = typeof roomState.currentTime === 'number'
      ? roomState.currentTime
      : (parseFloat(roomState.currentTime) || 0);

    if (!roomState.isPlaying) return baseTime;

    const elapsedSeconds = (Date.now() - (roomState.updatedAt || Date.now())) / 1000;
    return Math.max(0, baseTime + (isNaN(elapsedSeconds) ? 0 : elapsedSeconds));
  }, [roomState]);

  const applySync = useCallback((force = false) => {
    if (!playerRef.current || !roomState) return;

    // Live capture streams follow the live HLS edge. Do NOT perform seek drift correction on capture streams!
    if (roomState.sourceType === 'capture') {
      if (playerRef.current.play) {
        playerRef.current.play();
      }
      return;
    }

    const expectedTime = Number(getExpectedTime()) || 0;

    const rawActual = playerRef.current.getCurrentTime ? playerRef.current.getCurrentTime() : 0;
    const actualTime = Number(rawActual) || 0;
    const diff = Math.abs(actualTime - expectedTime);

    // If drift is greater than 0.4 seconds or force sync
    if (diff > 0.4 || force) {
      console.log(`[SyncClock] Correcting drift. Actual: ${actualTime.toFixed(2)}s, Expected: ${expectedTime.toFixed(2)}s, Diff: ${diff.toFixed(2)}s`);
      lastProgrammaticActionTs.current = Date.now();
      if (playerRef.current.seekTo) {
        playerRef.current.seekTo(expectedTime);
      }
    }

    // Synchronize play/pause state
    if (roomState.isPlaying) {
      if (playerRef.current.play) {
        playerRef.current.play();
      }
    } else {
      if (playerRef.current.pause) {
        playerRef.current.pause();
      }
    }
  }, [roomState, getExpectedTime, playerRef]);

  // Apply sync when roomState changes
  useEffect(() => {
    applySync(true);
  }, [roomState?.updatedAt, roomState?.isPlaying, roomState?.sourceUrl]);

  // Periodic drift check every 2 seconds for all non-host clients
  useEffect(() => {
    if (isHost) return; // Host is the clock source

    const timer = setInterval(() => {
      applySync(false);
    }, 2000);

    return () => clearInterval(timer);
  }, [isHost, applySync]);

  return {
    getExpectedTime,
    applySync,
    lastProgrammaticActionTs
  };
}

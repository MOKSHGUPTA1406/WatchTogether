const fs = require('fs');
const path = require('path');
const transcoder = require('../media/transcoder');

const activeReapTimers = new Map();

/**
 * Schedule room cleanup reaper job after grace period (default 5 minutes).
 *
 * @param {string} roomId
 * @param {number} delayMs - Delay in milliseconds (default 5 min)
 */
function scheduleReap(roomId, delayMs = 5 * 60 * 1000) {
  const normalizedId = roomId.toUpperCase();
  cancelReap(normalizedId);

  console.log(`[Reaper] Scheduled room cleanup for ${normalizedId} in ${delayMs / 1000}s`);

  const timer = setTimeout(() => {
    console.log(`[Reaper] Executing room cleanup for inactive room ${normalizedId}`);

    // Kill any active ffmpeg process for this room
    transcoder.stopTranscode(normalizedId);

    // Delete temporary files directory for this room
    const roomTmpDir = path.join(__dirname, '../../tmp', normalizedId);
    if (fs.existsSync(roomTmpDir)) {
      try {
        fs.rmSync(roomTmpDir, { recursive: true, force: true });
        console.log(`[Reaper] Cleaned up temporary directory: ${roomTmpDir}`);
      } catch (err) {
        console.error(`[Reaper Error] Failed cleaning directory for ${normalizedId}:`, err);
      }
    }

    activeReapTimers.delete(normalizedId);
  }, delayMs);

  activeReapTimers.set(normalizedId, timer);
}

/**
 * Cancel pending room cleanup reaper job if a member rejoins.
 *
 * @param {string} roomId
 */
function cancelReap(roomId) {
  const normalizedId = roomId.toUpperCase();
  if (activeReapTimers.has(normalizedId)) {
    console.log(`[Reaper] Cancelled room cleanup for active room ${normalizedId}`);
    clearTimeout(activeReapTimers.get(normalizedId));
    activeReapTimers.delete(normalizedId);
  }
}

module.exports = {
  scheduleReap,
  cancelReap
};

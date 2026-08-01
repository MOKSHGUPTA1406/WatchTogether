/**
 * Utility helper to ping server health endpoints before joining/creating a room.
 * Handles Render free-tier cold-start wakeups (30-50s) with progress callbacks & retry logic.
 */
export async function wakeServer(serverUrl, onProgress = null, maxTimeoutSec = 60) {
  const baseUrl = (serverUrl || 'http://localhost:3001').replace(/\/$/, '');
  const startTime = Date.now();
  const endpoints = ['/', '/ping', '/health', '/api/status'];


  console.log(`[WakeServer] Initiating health check ping to ${baseUrl}...`);

  while (true) {
    const elapsedSec = Math.floor((Date.now() - startTime) / 1000);

    if (elapsedSec >= maxTimeoutSec) {
      throw new Error(`Server did not respond within ${maxTimeoutSec} seconds. Please click Retry.`);
    }

    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: 'GET',
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response && response.ok) {
          console.log(`[WakeServer] Endpoint ${endpoint} responded 200 OK after ${elapsedSec}s!`);
          return true;
        }
      } catch (err) {
        // Ignore fetch network errors and attempt next endpoint
      }
    }

    if (typeof onProgress === 'function') {
      onProgress({
        elapsedSeconds: elapsedSec,
        isWaking: true,
        message: `Waking up server on Render (${elapsedSec}s elapsed)...`
      });
    }

    // Wait 3 seconds before next retry loop
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

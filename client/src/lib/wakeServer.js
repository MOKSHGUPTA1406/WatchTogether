/**
 * Utility helper to ping GET /health on the server before joining/creating a room.
 * Handles Render free-tier cold-start wakeups (30-50s) with progress callbacks & retry logic.
 */
export async function wakeServer(serverUrl, onProgress = null, maxTimeoutSec = 60) {
  const baseUrl = (serverUrl || 'http://localhost:3001').replace(/\/$/, '');
  const startTime = Date.now();

  console.log(`[WakeServer] Initiating health check ping to ${baseUrl}/health...`);

  while (true) {
    const elapsedSec = Math.floor((Date.now() - startTime) / 1000);

    if (elapsedSec >= maxTimeoutSec) {
      throw new Error(`Server did not respond within ${maxTimeoutSec} seconds. Please click Retry.`);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      // Try /ping first (AdBlocker immune), then /health, then /api/status
      let response;
      try {
        response = await fetch(`${baseUrl}/ping`, { method: 'GET', signal: controller.signal });
      } catch (e1) {
        try {
          response = await fetch(`${baseUrl}/health`, { method: 'GET', signal: controller.signal });
        } catch (e2) {
          response = await fetch(`${baseUrl}/api/status`, { method: 'GET', signal: controller.signal });
        }
      }


      clearTimeout(timeoutId);

      if (response && response.ok) {
        console.log(`[WakeServer] Server responded 200 OK after ${elapsedSec}s!`);
        return true;
      }
    } catch (err) {
      console.log(`[WakeServer] Health ping attempt failed (${elapsedSec}s elapsed). Retrying...`);
    }

    if (typeof onProgress === 'function') {
      onProgress({
        elapsedSeconds: elapsedSec,
        isWaking: true,
        message: `Waking up server on Render (${elapsedSec}s elapsed)...`
      });
    }

    // Wait 3 seconds before next retry
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

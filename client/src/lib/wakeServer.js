/**
 * Utility helper to ping GET /health on the server before joining/creating a room.
 * Handles Render free-tier cold-start wakeups (30-50s) with progress callbacks & retry logic.
 */
export async function wakeServer(serverUrl, onProgress = null, maxTimeoutSec = 60) {
  const targetUrl = `${serverUrl || 'http://localhost:3001'}/api/status`;
  const startTime = Date.now();


  console.log(`[WakeServer] Initiating health check ping to ${targetUrl}...`);

  while (true) {
    const elapsedSec = Math.floor((Date.now() - startTime) / 1000);

    if (elapsedSec >= maxTimeoutSec) {
      throw new Error(`Server did not respond within ${maxTimeoutSec} seconds. Please click Retry.`);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(targetUrl, {
        method: 'GET',
        signal: controller.signal
      });


      clearTimeout(timeoutId);

      if (response.ok) {
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

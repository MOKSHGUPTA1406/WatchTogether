const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

const activeTranscodes = new Map();

/**
 * Start transcoding an input file/stream to HLS format for a specific room.
 *
 * @param {string} roomId
 * @param {string|ReadableStream} inputSource - Local file path or readable stream
 * @param {string} quality - 'data-saver' | 'normal'
 * @param {Object} io - Socket.io server instance
 */
function startTranscode(roomId, inputSource, quality = 'normal', io = null) {
  const normalizedId = roomId.toUpperCase();
  stopTranscode(normalizedId);

  const roomTmpDir = path.join(__dirname, '../../tmp', normalizedId);
  if (!fs.existsSync(roomTmpDir)) {
    fs.mkdirSync(roomTmpDir, { recursive: true });
  } else {
    // Delete old HLS files (.m3u8 and .ts segments) to prevent old stream playback
    const oldFiles = fs.readdirSync(roomTmpDir);
    for (const f of oldFiles) {
      if (f.endsWith('.m3u8') || f.endsWith('.ts')) {
        try { fs.unlinkSync(path.join(roomTmpDir, f)); } catch (e) {}
      }
    }
  }

  const manifestPath = path.join(roomTmpDir, 'stream.m3u8');


  const isLiveStream = typeof inputSource !== 'string';
  const preset = isLiveStream ? 'superfast' : 'ultrafast';

  const hlsTime = isLiveStream ? '1' : '4';
  const keyframeInterval = isLiveStream ? '15' : '48';
  const scaleFilter = quality === 'data-saver' ? 'scale=-2:480' : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';

  console.log(`[Transcoder] Starting HLS transcode for room ${normalizedId} (Live: ${isLiveStream}, Quality: ${quality})`);

  let ffmpegCommand = ffmpeg(inputSource);

  if (isLiveStream) {
    ffmpegCommand = ffmpegCommand.inputFormat('webm');
  }

  const outputOpts = [
    `-preset ${preset}`,
    `-g ${keyframeInterval}`,
    '-sc_threshold 0',
    `-hls_time ${hlsTime}`,
    '-hls_list_size 8',
    '-hls_flags delete_segments+append_list+omit_endlist+discont_start',
    `-vf ${scaleFilter}`,
    '-pix_fmt yuv420p',
    '-crf 22',
    '-maxrate 4000k',
    '-bufsize 8000k',
    '-b:a 128k'
  ];

  if (isLiveStream) {
    outputOpts.push('-tune', 'zerolatency');
    outputOpts.push('-force_key_frames', 'expr:gte(t,n_forced*1)');
    outputOpts.push('-fflags', '+nobuffer+genpts');
    outputOpts.push('-flush_packets', '1');
  }



  ffmpegCommand = ffmpegCommand
    .videoCodec('libx264')
    .audioCodec('aac')
    .outputOptions(outputOpts)
    .output(manifestPath);



  ffmpegCommand.on('start', (cmdline) => {
    console.log(`[FFmpeg Spawned] Room ${normalizedId}: ${cmdline}`);
  });

  ffmpegCommand.on('error', (err, stdout, stderr) => {
    console.error(`[FFmpeg Error] Room ${normalizedId}:`, err.message);
    if (io) {
      io.to(normalizedId).emit('room:transcodeError', {
        roomId: normalizedId,
        message: err.message
      });
    }
  });

  ffmpegCommand.on('end', () => {
    console.log(`[FFmpeg Finished] Room ${normalizedId} transcode complete.`);
  });

  // Spawn ffmpeg process
  ffmpegCommand.run();
  activeTranscodes.set(normalizedId, ffmpegCommand);

  // Poll for first manifest & segment creation to notify clients via Socket.io
  const roomStore = require('../rooms/roomStore');
  let attempts = 0;
  const pollTimer = setInterval(() => {
    attempts++;
    if (fs.existsSync(manifestPath) && fs.statSync(manifestPath).size > 0) {
      clearInterval(pollTimer);
      console.log(`[Transcoder] HLS manifest ready for room ${normalizedId}`);

      const targetSourceType = isLiveStream ? 'capture' : 'file';
      const hlsUrl = `/media/${normalizedId}/stream.m3u8?v=${Date.now()}`;
      roomStore.updateRoomSource(normalizedId, targetSourceType, hlsUrl);
      roomStore.updatePlayback(normalizedId, 0, true);

      if (io) {
        io.to(normalizedId).emit('room:sourceChanged', {
          sourceType: targetSourceType,
          sourceUrl: hlsUrl,
          currentTime: 0,
          isPlaying: true,
          updatedAt: Date.now()
        });
        io.to(normalizedId).emit('room:mediaReady', {
          roomId: normalizedId,
          hlsUrl
        });
      }

    } else if (attempts > 60) { // 30 seconds timeout
      clearInterval(pollTimer);
      console.warn(`[Transcoder] Timeout waiting for HLS manifest in room ${normalizedId}`);
    }
  }, 500);


  return manifestPath;
}

/**
 * Stop and clean up active ffmpeg process for a room.
 */
function stopTranscode(roomId) {
  const normalizedId = roomId.toUpperCase();
  if (activeTranscodes.has(normalizedId)) {
    console.log(`[Transcoder] Stopping ffmpeg process for room ${normalizedId}`);
    try {
      const proc = activeTranscodes.get(normalizedId);
      proc.kill('SIGKILL');
    } catch (e) {
      console.error(`[Transcoder] Error killing process for ${normalizedId}:`, e);
    }
    activeTranscodes.delete(normalizedId);
  }
}

module.exports = {
  startTranscode,
  stopTranscode,
  activeTranscodes
};

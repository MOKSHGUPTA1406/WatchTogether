import React, { useState } from 'react';
import { Play, Link2, Tv, Youtube, Upload, Film, Settings, Monitor, StopCircle, Radio } from 'lucide-react';
import { extractYouTubeId } from './PlayerPanel/YouTubePlayer';
import { useTabCapture } from '../hooks/useTabCapture';

export default function HostControls({
  isHost,
  roomState,
  setSource,
  roomId,
  startScreenShareMesh,
  stopScreenShareMesh
}) {
  const [activeTab, setActiveTab] = useState('youtube'); // 'youtube' | 'upload' | 'capture'
  const [urlInput, setUrlInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [quality, setQuality] = useState('normal'); // 'data-saver' | 'normal'
  const [uploadProgress, setUploadProgress] = useState(null);

  const { isCapturing, error: captureError, startCapture, stopCapture } = useTabCapture();

  const handleYouTubeSubmit = (e) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    const ytId = extractYouTubeId(urlInput.trim());
    if (ytId) {
      setSource('youtube', urlInput.trim());
      setUrlInput('');
      setErrorMsg('');
    } else {
      setErrorMsg('Please enter a valid YouTube video link');
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setErrorMsg('');
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('video', file);
    formData.append('quality', quality);

    const xhr = new XMLHttpRequest();
    const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
    xhr.open('POST', `${serverUrl}/api/rooms/${roomId}/upload`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      setUploadProgress(null);
      if (xhr.status === 200) {
        console.log('[Upload Complete]', xhr.responseText);
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          setErrorMsg(res.error || 'Upload failed');
        } catch (err) {
          setErrorMsg('Upload failed');
        }
      }
    };

    xhr.onerror = () => {
      setUploadProgress(null);
      setErrorMsg('Network error during file upload');
    };

    xhr.send(formData);
  };

  const handlePreset = (presetUrl) => {
    setSource('youtube', presetUrl);
    setErrorMsg('');
  };

  if (!isHost) {
    return (
      <div className="glass-panel" style={{
        padding: '0.75rem 1.2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.88rem' }}>
          <Tv size={18} color="var(--primary)" />
          <span style={{ color: 'var(--text-muted)' }}>Source:</span>
          <span style={{ fontWeight: 600, color: '#fff' }}>
            {roomState?.sourceType === 'youtube'
              ? 'YouTube Stream'
              : roomState?.sourceType === 'file'
              ? 'Uploaded File HLS Stream'
              : roomState?.sourceType === 'capture'
              ? '🔴 WebRTC Live Tab Share (0 Latency)'
              : 'None Selected'}
          </span>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
          {roomState?.sourceType === 'capture'
            ? 'Live WebRTC screen share active (controlled by host)'
            : 'Host is controlling media playback'}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ padding: '0.8rem 1.2rem' }}>
      {/* Top Tab Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '0.75rem'
      }}>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            type="button"
            onClick={() => setActiveTab('youtube')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: activeTab === 'youtube' ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
              color: activeTab === 'youtube' ? '#fff' : 'var(--text-dim)',
              border: activeTab === 'youtube' ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent'
            }}
          >
            <Youtube size={15} color={activeTab === 'youtube' ? '#ff0000' : 'currentColor'} /> YouTube Link
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: activeTab === 'upload' ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
              color: activeTab === 'upload' ? '#fff' : 'var(--text-dim)',
              border: activeTab === 'upload' ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent'
            }}
          >
            <Upload size={15} /> Upload Local Video
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('capture')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: activeTab === 'capture' ? 'rgba(236, 72, 153, 0.25)' : 'transparent',
              color: activeTab === 'capture' ? '#fff' : 'var(--text-dim)',
              border: activeTab === 'capture' ? '1px solid rgba(236, 72, 153, 0.4)' : '1px solid transparent'
            }}
          >
            <Monitor size={15} color={activeTab === 'capture' ? '#ec4899' : 'currentColor'} /> Share Tab (Live WebRTC)
          </button>
        </div>

        {/* Quality Selector for Uploads */}
        {activeTab === 'upload' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <Settings size={14} /> Quality:
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              style={{
                background: 'var(--bg-input)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '4px',
                padding: '0.2rem 0.4rem',
                fontSize: '0.78rem',
                outline: 'none'
              }}
            >
              <option value="normal">720p Normal</option>
              <option value="data-saver">480p Data Saver</option>
            </select>
          </div>
        )}
      </div>

      {/* Tab 1: YouTube Form */}
      {activeTab === 'youtube' && (
        <form onSubmit={handleYouTubeSubmit} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.8rem',
          flexWrap: 'wrap'
        }}>
          <div style={{ flex: 1, minWidth: '240px', display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              className="input-field"
              placeholder="Paste YouTube link (e.g. https://www.youtube.com/watch?v=...)"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                setErrorMsg('');
              }}
              style={{ padding: '0.5rem 0.85rem', fontSize: '0.85rem' }}
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 1rem', whiteSpace: 'nowrap' }}>
              <Link2 size={16} /> Load Video
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Demo:</span>
            <button
              type="button"
              onClick={() => handlePreset('https://www.youtube.com/watch?v=L_LUpnjgPso')}
              className="btn btn-secondary"
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
            >
              Lofi Beats
            </button>
          </div>
        </form>
      )}

      {/* Tab 2: Local Video Upload Form */}
      {activeTab === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.6rem 1rem',
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px dashed rgba(99, 102, 241, 0.4)',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontSize: '0.88rem',
            fontWeight: 600,
            color: '#a5b4fc',
            justifyContent: 'center'
          }}>
            <Film size={18} /> Select Video File (.mp4, .mkv, .avi, .mov)
            <input
              type="file"
              accept="video/*"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
          </label>

          {/* Upload Progress Bar */}
          {uploadProgress !== null && (
            <div style={{ marginTop: '0.4rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                <span>Uploading file to server...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div style={{ height: '6px', width: '100%', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${uploadProgress}%`, background: 'var(--primary)', transition: 'width 0.2s ease' }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Live Tab Share (WebRTC) */}
      {activeTab === 'capture' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Share any browser tab with audio (Animepahe, Netflix, custom players) directly via 0-latency WebRTC.
          </div>

          {!isCapturing ? (
            <button
              type="button"
              onClick={() => startCapture(roomId, startScreenShareMesh)}
              className="btn btn-primary"
              style={{
                background: 'linear-gradient(135deg, #ec4899 0%, #d946ef 100%)',
                padding: '0.55rem 1.1rem',
                whiteSpace: 'nowrap'
              }}
            >
              <Radio size={16} /> Start WebRTC Tab Share
            </button>
          ) : (
            <button
              type="button"
              onClick={() => stopCapture(roomId, stopScreenShareMesh)}
              className="btn btn-secondary"
              style={{
                borderColor: 'var(--danger)',
                color: '#fca5a5',
                padding: '0.55rem 1.1rem',
                whiteSpace: 'nowrap'
              }}
            >
              <StopCircle size={16} color="var(--danger)" /> Stop Sharing
            </button>
          )}
        </div>
      )}

      {(errorMsg || captureError) && (
        <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.4rem' }}>
          {errorMsg || captureError}
        </div>
      )}
    </div>
  );
}

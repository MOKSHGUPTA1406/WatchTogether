import React, { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useRoomSocket } from '../hooks/useRoomSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import ChatPanel from '../components/ChatPanel';
import HostControls from '../components/HostControls';
import PlayerPanel from '../components/PlayerPanel/PlayerPanel';
import VoicePanel from '../components/VoicePanel';
import { Copy, Check, Crown, Users, ArrowLeft } from 'lucide-react';

export default function RoomPage() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const displayName = searchParams.get('name') || localStorage.getItem('wt_display_name') || 'Guest';

  const [copied, setCopied] = useState(false);

  const {
    socketId,
    isConnected,
    isHost,
    roomState,
    members,
    chatLog,
    sendChat,
    setSource,
    play,
    pause,
    seek,
    requestSync
  } = useRoomSocket(roomId, displayName);

  // WebRTC Mesh Hook for Screen Sharing and Voice Chat
  const {
    localScreenStream,
    remoteScreenStream,
    startScreenShareMesh,
    stopScreenShareMesh,
    isVoiceConnected,
    isMuted,
    isDeafened,
    inVoiceMembers,
    joinVoice,
    leaveVoice,
    toggleMute,
    toggleDeafen
  } = useWebRTC(roomId, socketId, roomState);


  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const memberList = Object.entries(members);

  return (
    <div className="room-page-container" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', minHeight: '100dvh', width: '100vw', overflow: 'hidden' }}>
      {/* Top Navigation Bar */}
      <header className="glass" style={{
        height: '60px',
        padding: '0 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
        flexShrink: 0
      }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
          <Link to="/" className="btn btn-icon" title="Leave Room">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              WatchParty <span style={{ color: 'var(--primary)' }}>#{roomId}</span>
            </h2>
          </div>
        </div>

        {/* Room Info / Copy Code */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(255, 255, 255, 0.06)',
            padding: '0.35rem 0.8rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Code:
            </span>
            <span style={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.08em', color: '#fff' }}>
              {roomId}
            </span>
            <button
              onClick={handleCopyCode}
              className="btn btn-icon"
              style={{ padding: '0.2rem', marginLeft: '0.2rem' }}
              title="Copy Room Code"
            >
              {copied ? <Check size={16} color="var(--success)" /> : <Copy size={16} />}
            </button>
          </div>

          {/* Connection Status Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            color: isConnected ? '#34d399' : '#f87171'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isConnected ? '#34d399' : '#f87171',
              boxShadow: isConnected ? '0 0 10px #34d399' : 'none'
            }} />
            {isConnected ? 'Connected' : 'Connecting...'}
          </div>
        </div>
      </header>

      {/* Main Grid Layout */}
      <div className="room-main-grid" style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 340px',
        gap: '1rem',
        padding: '1rem',
        overflow: 'hidden'
      }}>

        {/* Left Side: Player, Controls & Voice/Members */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', overflow: 'hidden' }}>
          {/* Video Player Engine (FIRST AT TOP) */}
          <PlayerPanel
            roomState={roomState}
            isHost={isHost}
            play={play}
            pause={pause}
            seek={seek}
            localScreenStream={localScreenStream}
            remoteScreenStream={remoteScreenStream}
          />

          {/* Host Control Bar */}
          <HostControls
            isHost={isHost}
            roomState={roomState}
            setSource={setSource}
            roomId={roomId}
            startScreenShareMesh={startScreenShareMesh}
            stopScreenShareMesh={stopScreenShareMesh}
          />


          {/* Voice Chat Panel */}
          <VoicePanel
            isVoiceConnected={isVoiceConnected}
            isMuted={isMuted}
            isDeafened={isDeafened}
            inVoiceMembers={inVoiceMembers}
            joinVoice={joinVoice}
            leaveVoice={leaveVoice}
            toggleMute={toggleMute}
            toggleDeafen={toggleDeafen}
            members={members}
          />

          {/* Members Bar */}
          <div className="glass-panel" style={{
            padding: '0.7rem 1.2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Users size={18} color="var(--primary)" />
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                Party Members ({memberList.length})
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', overflowX: 'auto' }}>
              {memberList.map(([sId, member]) => {
                const isMemberHost = roomState?.hostSocketId === sId;
                const isSelf = sId === socketId;

                return (
                  <div key={sId} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.3rem 0.7rem',
                    background: isSelf ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                    borderRadius: 'var(--radius-full)',
                    border: isSelf ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                    fontSize: '0.8rem'
                  }}>
                    {isMemberHost && <Crown size={12} color="#fbbf24" />}
                    <span style={{ fontWeight: isSelf ? 700 : 500, color: isSelf ? '#fff' : 'var(--text-main)' }}>
                      {member.displayName} {isSelf && '(You)'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Side: Chat Panel */}
        <ChatPanel
          chatLog={chatLog}
          sendChat={sendChat}
          currentSocketId={socketId}
        />
      </div>
    </div>
  );
}

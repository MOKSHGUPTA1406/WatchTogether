import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare } from 'lucide-react';

export default function ChatPanel({ chatLog, sendChat, currentSocketId }) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatLog]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    sendChat(inputText);
    setInputText('');
  };

  const getAvatarColor = (name) => {
    const colors = [
      'linear-gradient(135deg, #6366f1, #8b5cf6)',
      'linear-gradient(135deg, #ec4899, #f43f5e)',
      'linear-gradient(135deg, #10b981, #059669)',
      'linear-gradient(135deg, #f59e0b, #d97706)',
      'linear-gradient(135deg, #06b6d4, #0891b2)'
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'rgba(15, 21, 34, 0.9)',
      borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden'
    }}>
      {/* Chat Header */}
      <div style={{
        padding: '1rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        background: 'rgba(0, 0, 0, 0.2)'
      }}>
        <MessageSquare size={18} color="var(--primary)" />
        <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Room Chat</h3>
      </div>

      {/* Messages List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.8rem'
      }}>
        {chatLog.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: 'var(--text-dim)',
            marginTop: 'auto',
            marginBottom: 'auto',
            fontSize: '0.9rem'
          }}>
            No messages yet. Say hi to the room!
          </div>
        ) : (
          chatLog.map((msg) => {
            if (msg.isSystem) {
              return (
                <div key={msg.id} style={{
                  textAlign: 'center',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  padding: '0.25rem 0.5rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 'var(--radius-full)',
                  margin: '0.2rem auto',
                  maxWidth: '90%'
                }}>
                  {msg.text}
                </div>
              );
            }

            const isSelf = msg.socketId === currentSocketId;

            return (
              <div key={msg.id} style={{
                display: 'flex',
                gap: '0.6rem',
                flexDirection: isSelf ? 'row-reverse' : 'row',
                alignItems: 'flex-start'
              }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: getAvatarColor(msg.displayName),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  color: '#fff',
                  flexShrink: 0
                }}>
                  {(msg.displayName || '?')[0].toUpperCase()}
                </div>

                <div style={{
                  maxWidth: '78%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isSelf ? 'flex-end' : 'flex-start'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    marginBottom: '0.2rem',
                    fontSize: '0.75rem',
                    color: 'var(--text-dim)'
                  }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
                      {msg.displayName}
                    </span>
                    <span>{formatTime(msg.ts)}</span>
                  </div>

                  <div style={{
                    padding: '0.65rem 0.9rem',
                    borderRadius: '12px',
                    fontSize: '0.9rem',
                    lineHeight: '1.4',
                    wordBreak: 'break-word',
                    background: isSelf
                      ? 'linear-gradient(135deg, var(--primary) 0%, #4f46e5 100%)'
                      : 'rgba(255, 255, 255, 0.07)',
                    color: isSelf ? '#fff' : 'var(--text-main)',
                    borderTopRightRadius: isSelf ? '2px' : '12px',
                    borderTopLeftRadius: isSelf ? '12px' : '2px'
                  }}>
                    {msg.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} style={{
        padding: '0.75rem 1rem',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(0, 0, 0, 0.2)',
        display: 'flex',
        gap: '0.5rem'
      }}>
        <input
          type="text"
          className="input-field"
          placeholder="Type a message..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          style={{ padding: '0.55rem 0.85rem', fontSize: '0.88rem' }}
        />
        <button type="submit" className="btn btn-primary" style={{ padding: '0.55rem 0.85rem' }}>
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

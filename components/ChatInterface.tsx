'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export default function ChatInterface({
  messages,
  onSendMessage,
  isLoading,
  disabled = false,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = input.trim();
      if (trimmed && !disabled && !isLoading) {
        onSendMessage(trimmed);
        setInput('');
      }
    },
    [input, disabled, isLoading, onSendMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e as unknown as React.FormEvent);
      }
    },
    [handleSubmit]
  );

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderContent = (content: string) => {
    // Simple markdown-like rendering
    const parts = content.split('\n');
    
    return parts.map((part, i) => {
      // Bold
      let text = part.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      // Code
      text = text.replace(/`(.+?)`/g, '<code>$1</code>');
      
      return (
        <p
          key={i}
          dangerouslySetInnerHTML={{ __html: text }}
          style={{ marginBottom: i < parts.length - 1 ? 8 : 0 }}
        />
      );
    });
  };

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="welcome-message">
            <div className="welcome-icon">♟️</div>
            <h2 className="welcome-title">AI 象棋助手</h2>
            <p className="welcome-desc">
              基于象棋引擎分析，我可以帮你理解当前局面，
              解释最佳走法，以及分析其他选择的利弊。
            </p>
            <div className="welcome-features">
              <div className="feature-item">
                <span className="feature-icon">💡</span>
                <span className="feature-text">局面分析</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">🎯</span>
                <span className="feature-text">走法建议</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">🔄</span>
                <span className="feature-text">变例解读</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">❓</span>
                <span className="feature-text">追问答疑</span>
              </div>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message ${msg.role}`}>
            <div className={`chat-avatar ${msg.role === 'assistant' ? 'ai' : 'user-avatar'}`}>
              {msg.role === 'assistant' ? '🤖' : '👤'}
            </div>
            <div className="chat-bubble">
              {renderContent(msg.content)}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="chat-message ai">
            <div className="chat-avatar ai">🤖</div>
            <div className="chat-bubble">
              <div className="analysis-loading" style={{ padding: 16 }}>
                <div className="spinner" />
                <span className="analysis-loading-text">正在思考...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-area" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入你的问题..."
          disabled={disabled || isLoading}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={disabled || isLoading || !input.trim()}
        >
          发送
        </button>
      </form>
    </div>
  );
}

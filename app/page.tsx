'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import BoardEditor from '@/components/BoardEditor';
import UploadZone from '@/components/UploadZone';
import AnalysisPanel from '@/components/AnalysisPanel';
import ChatInterface, { ChatMessage } from '@/components/ChatInterface';
import { getChessEngine, type EngineAnalysis, type EngineStatus } from '@/lib/chess-engine';
import { STARTING_FEN } from '@/lib/xiangqi-recognizer';

// Generate unique ID
const generateId = () => Math.random().toString(36).substring(2, 11);

export default function HomePage() {
  // State
  const [fen, setFen] = useState(STARTING_FEN);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle');
  const [engineAnalysis, setEngineAnalysis] = useState<EngineAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentDepth, setCurrentDepth] = useState(0);
  const [maxDepth] = useState(20);
  const [analysisDepth, setAnalysisDepth] = useState(18);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [orientation, setOrientation] = useState<'white' | 'black'>('black');
  const [showEditor, setShowEditor] = useState(true);
  const [ocrMessage, setOcrMessage] = useState<string | null>(null);
  
  const engineRef = useRef<ReturnType<typeof getChessEngine> | null>(null);
  const sessionIdRef = useRef(generateId());

  // Initialize engine
  useEffect(() => {
    const engine = getChessEngine();
    engineRef.current = engine;
    
    engine.onStatusChange((status, depth) => {
      setEngineStatus(status);
      if (depth !== undefined) {
        setCurrentDepth(depth);
      }
    });
    
    engine.onAnalysis((analysis) => {
      setEngineAnalysis(analysis);
      setIsAnalyzing(false);
    });
    
    engine.onReady(() => {
      console.log('Engine ready');
    });
  }, []);

  // Start engine analysis
  const startAnalysis = useCallback(() => {
    if (engineRef.current && engineStatus === 'ready') {
      setIsAnalyzing(true);
      setEngineAnalysis(null);
      engineRef.current.analyze(fen, { depth: analysisDepth, multiPv: 3 });
    }
  }, [fen, engineStatus, analysisDepth]);

  // Stop engine analysis
  const stopAnalysis = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.stop();
      setIsAnalyzing(false);
    }
  }, []);

  // Handle FEN changes from editor
  const handleFenChange = useCallback((newFen: string) => {
    setFen(newFen);
    setOcrMessage(null);
    // Stop current analysis when position changes
    if (engineRef.current) {
      engineRef.current.stop();
      setIsAnalyzing(false);
      setEngineAnalysis(null);
    }
  }, []);

  // Handle FEN from OCR
  const handleFenFromOcr = useCallback((ocrFen: string, message: string) => {
    setFen(ocrFen);
    setOcrMessage(message);
    setTimeout(() => setOcrMessage(null), 5000);
  }, []);

  // Send message to chat API
  const handleSendMessage = useCallback(async (message: string) => {
    const newMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, newMessage]);
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          sessionId: sessionIdRef.current,
          fen,
          context: {
            bestMove: engineAnalysis?.bestMove || null,
            evaluation: engineAnalysis?.evaluation ?? 0,
            pv: engineAnalysis?.pv ?? [],
            variations: engineAnalysis?.variations ?? [],
          },
        }),
      });
      
      const data = await response.json();
      
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      
      const errorMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '抱歉，发生了错误，请重试。',
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [fen, engineAnalysis]);

  // Initial AI greeting
  useEffect(() => {
    if (engineStatus === 'ready' && messages.length === 0) {
      const greeting: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: `您好！我是您的象棋AI助手。

**功能说明：**
- 拖拽或上传棋盘截图，系统会自动识别棋子位置
- 也可以使用棋盘编辑器手动摆棋
- 设置好局面后点击"开始分析"，引擎会计算最佳走法
- 下方聊天区域可以询问走法建议、变例分析等

**快速开始：**
1. 拖拽上传一张棋盘截图
2. 或点击"开局"按钮设置标准开局
3. 点击"开始分析"
4. 在右侧询问"应该怎么走？"

请问您现在有什么想分析的棋局吗？`,
        timestamp: new Date(),
      };
      setMessages([greeting]);
    }
  }, [engineStatus, messages.length]);

  const sideToMove = fen.includes(' w ') ? '红方' : '黑方';

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">象</div>
        <div>
          <h1 className="app-title">象棋学习系统</h1>
          <p className="app-subtitle">AI 智能对局分析 · 基于引擎计算</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="engine-status">
            <span className={`engine-dot ${engineStatus === 'ready' ? 'ready' : engineStatus === 'loading' ? 'loading' : ''}`} />
            <span>引擎 {engineStatus === 'ready' ? '就绪' : engineStatus === 'loading' ? '加载中' : engineStatus}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Left Panel - Board & Controls */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-icon">♟</span>
            <span>棋盘编辑器</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                className={`btn ${showEditor ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setShowEditor(true)}
                style={{ padding: '4px 12px', fontSize: 12 }}
              >
                编辑
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setOrientation(o => o === 'white' ? 'black' : 'white')}
                title="翻转视角"
                style={{ padding: '4px 8px', fontSize: 12 }}
              >
                翻转
              </button>
            </div>
          </div>
          <div className="panel-body">
            {/* Upload Zone */}
            <UploadZone
              onFenRecognized={handleFenFromOcr}
              disabled={engineStatus === 'loading'}
            />

            {ocrMessage && (
              <div className="success-message" style={{ marginTop: 12 }}>
                {ocrMessage}
              </div>
            )}

            {/* Turn indicator */}
            <div className="turn-indicator" style={{ marginBottom: 12, justifyContent: 'center' }}>
              <span className={`turn-dot ${fen.includes(' w ') ? 'red' : 'black'}`} />
              <span>{sideToMove}走子</span>
            </div>
            
            {/* Board Editor */}
            <BoardEditor
              fen={fen}
              onFenChange={handleFenChange}
              width={360}
              height={400}
            />

            {/* Analysis Panel */}
            <div className="analysis-section" style={{ marginTop: 16 }}>
              <AnalysisPanel
                analysis={engineAnalysis}
                status={engineStatus}
                currentDepth={currentDepth}
                maxDepth={maxDepth}
                onStartAnalysis={startAnalysis}
                onStopAnalysis={stopAnalysis}
                isAnalyzing={isAnalyzing}
              />
            </div>

            {/* Analysis Depth Selector */}
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ fontSize: 13, color: '#94a3b8' }}>分析深度:</label>
              <input
                type="range"
                min="10"
                max="25"
                value={analysisDepth}
                onChange={(e) => setAnalysisDepth(parseInt(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 13, color: '#f59e0b', minWidth: 24 }}>{analysisDepth}</span>
            </div>
          </div>
        </div>

        {/* Right Panel - Chat */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-icon">💬</span>
            <span>AI 助手</span>
            <button
              className="btn btn-secondary"
              onClick={() => setMessages([])}
              style={{ marginLeft: 'auto', padding: '4px 12px', fontSize: 12 }}
            >
              清空对话
            </button>
          </div>
          <ChatInterface
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            disabled={engineStatus !== 'ready'}
          />
        </div>
      </main>
    </div>
  );
}

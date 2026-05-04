'use client';

import React from 'react';
import type { EngineAnalysis, EngineStatus } from '@/lib/chess-engine';

interface AnalysisPanelProps {
  analysis: EngineAnalysis | null;
  status: EngineStatus;
  currentDepth: number;
  maxDepth: number;
  onDepthChange?: (depth: number) => void;
  onStartAnalysis?: () => void;
  onStopAnalysis?: () => void;
  isAnalyzing: boolean;
}

export default function AnalysisPanel({
  analysis,
  status,
  currentDepth,
  maxDepth,
  onStartAnalysis,
  onStopAnalysis,
  isAnalyzing,
}: AnalysisPanelProps) {
  const formatEvaluation = (score: number): string => {
    if (Math.abs(score) > 100) {
      const sign = score > 0 ? '+' : '';
      return `${sign}${(score / 100).toFixed(1)}`;
    }
    const sign = score > 0 ? '+' : '';
    return `${sign}${score.toFixed(2)}`;
  };

  const getEvaluationBarWidth = (score: number): number => {
    // Convert to percentage (50 = even, 0 = losing significantly)
    const normalized = 50 - Math.min(Math.max(score, -10) * 5, 50);
    return Math.max(5, Math.min(95, normalized));
  };

  const getEvaluationClass = (score: number): string => {
    if (score > 0.5) return 'white-advantage';
    if (score < -0.5) return 'black-advantage';
    return 'even';
  };

  const formatMoves = (moves: string[]): string => {
    return moves.map((m, i) => `${i + 1}. ${m}`).join(' ');
  };

  const getStatusText = (): string => {
    switch (status) {
      case 'loading':
        return '引擎加载中...';
      case 'ready':
        return '就绪';
      case 'analyzing':
        return `分析中... 深度 ${currentDepth}/${maxDepth}`;
      case 'error':
        return '引擎错误';
      default:
        return '空闲';
    }
  };

  const getStatusDotClass = (): string => {
    switch (status) {
      case 'ready':
        return 'ready';
      case 'loading':
      case 'analyzing':
        return 'loading';
      default:
        return '';
    }
  };

  return (
    <div className="analysis-panel">
      {/* Engine Status */}
      <div className="engine-status">
        <span className={`engine-dot ${getStatusDotClass()}`} />
        <span>{getStatusText()}</span>
        {isAnalyzing && (
          <div className="depth-indicator">
            <div className="depth-bar">
              <div
                className="depth-progress"
                style={{ width: `${(currentDepth / maxDepth) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="controls-row" style={{ marginTop: 12 }}>
        {!isAnalyzing ? (
          <button
            className="btn btn-primary"
            onClick={onStartAnalysis}
            disabled={status !== 'ready'}
          >
            ▶ 开始分析
          </button>
        ) : (
          <button className="btn btn-secondary" onClick={onStopAnalysis}>
            ⏹ 停止
          </button>
        )}
      </div>

      {/* Analysis Results */}
      {analysis && (
        <div style={{ marginTop: 20 }}>
          {/* Best Move */}
          {analysis.bestMove && (
            <div className="best-move-display">
              <div className="best-move-label">最佳走法</div>
              <div className="best-move-value">{analysis.bestMove}</div>
            </div>
          )}

          {/* Evaluation Bar */}
          <div className="analysis-title">
            <span>局势评估</span>
            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
              {formatEvaluation(analysis.evaluation)}
            </span>
          </div>
          <div className="evaluation-bar">
            <div
              className={`evaluation-fill ${getEvaluationClass(analysis.evaluation)}`}
              style={{ width: `${getEvaluationBarWidth(analysis.evaluation)}%` }}
            />
          </div>

          {/* Principal Variation */}
          {analysis.pv.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="analysis-title">主要变例</div>
              <div className="variation-line">
                {formatMoves(analysis.pv.slice(0, 8))}
                {analysis.pv.length > 8 && ' ...'}
              </div>
            </div>
          )}

          {/* Alternative Lines */}
          {analysis.variations.length > 1 && (
            <div style={{ marginTop: 16 }}>
              <div className="analysis-title">其他选择</div>
              {analysis.variations.slice(1, 3).map((variation, i) => (
                <div key={i} className="variation-line" style={{ borderColor: 'var(--border-light)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      评估: {formatEvaluation(variation.evaluation)}
                    </span>
                  </div>
                  {formatMoves(variation.moves.slice(0, 6))}
                </div>
              ))}
            </div>
          )}

          {/* Stats */}
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
            <div>搜索深度: {analysis.depth}</div>
            <div>节点数: {analysis.nodes.toLocaleString()}</div>
            {analysis.time > 0 && (
              <div>用时: {(analysis.time / 1000).toFixed(1)}s</div>
            )}
          </div>
        </div>
      )}

      {/* Placeholder when no analysis */}
      {!analysis && !isAnalyzing && (
        <div style={{
          marginTop: 24,
          padding: 20,
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: 13
        }}>
          点击"开始分析"按钮，让引擎分析当前局面
        </div>
      )}
    </div>
  );
}

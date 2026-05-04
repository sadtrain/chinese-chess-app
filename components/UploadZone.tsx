'use client';

import React, { useState, useCallback, useRef } from 'react';
import { recognizeBoardHuggingFace, recognizeBoardLocal } from '@/lib/huggingface-recognizer';
import { STARTING_FEN } from '@/lib/xiangqi-validators';

interface UploadZoneProps {
  onFenRecognized: (fen: string, message: string) => void;
  disabled?: boolean;
}

type RecognizerType = 'huggingface' | 'local';

export default function UploadZone({
  onFenRecognized,
  disabled = false,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recognizerType, setRecognizerType] = useState<RecognizerType>('huggingface');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processImage = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setError('请上传图片文件');
        return;
      }

      setIsProcessing(true);
      setError(null);
      setProgress(0);
      setStatusMessage('正在加载图像...');

      try {
        const imageUrl = URL.createObjectURL(file);

        let result;
        if (recognizerType === 'huggingface') {
          result = await recognizeBoardHuggingFace(imageUrl, (p, msg) => {
            setProgress(p);
            setStatusMessage(msg);
          });
        } else {
          result = await recognizeBoardLocal(imageUrl, (p, msg) => {
            setProgress(p);
            setStatusMessage(msg);
          });
        }

        URL.revokeObjectURL(imageUrl);

        if (result.confidence > 30) {
          onFenRecognized(result.fen, result.message);
        } else {
          setError('识别置信度较低，已自动使用默认开局');
          onFenRecognized(STARTING_FEN, result.message);
        }
      } catch (err: any) {
        console.error('OCR Error:', err);
        setError(err.message || '图片处理失败');
        onFenRecognized(STARTING_FEN, '使用默认开局');
      } finally {
        setIsProcessing(false);
      }
    },
    [recognizerType, onFenRecognized]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        processImage(files[0]);
      }
    },
    [disabled, processImage]
  );

  const handleClick = useCallback(() => {
    if (!disabled && !isProcessing) {
      fileInputRef.current?.click();
    }
  }, [disabled, isProcessing]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        processImage(files[0]);
      }
      e.target.value = '';
    },
    [processImage]
  );

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* 引擎选择 */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 12,
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>识别引擎:</span>
        <button
          onClick={() => setRecognizerType('huggingface')}
          disabled={disabled || isProcessing}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: 'none',
            cursor: disabled || isProcessing ? 'not-allowed' : 'pointer',
            background: recognizerType === 'huggingface' ? '#3b82f6' : '#475569',
            color: '#fff',
            fontSize: 12,
            opacity: disabled || isProcessing ? 0.5 : 1,
          }}
        >
          🤗 HuggingFace AI
        </button>
        <button
          onClick={() => setRecognizerType('local')}
          disabled={disabled || isProcessing}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: 'none',
            cursor: disabled || isProcessing ? 'not-allowed' : 'pointer',
            background: recognizerType === 'local' ? '#3b82f6' : '#475569',
            color: '#fff',
            fontSize: 12,
            opacity: disabled || isProcessing ? 0.5 : 1,
          }}
        >
          💻 本地识别
        </button>

        {recognizerType === 'huggingface' && (
          <span style={{ fontSize: 11, color: '#64748b' }}>
            (使用服务端 API)
          </span>
        )}
      </div>

      {/* 上传区域 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        style={{
          border: '2px dashed #475569',
          borderRadius: 10,
          padding: '20px',
          textAlign: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: isDragging ? 'rgba(245, 158, 11, 0.1)' : '#1e293b',
          borderColor: isDragging ? '#f59e0b' : '#475569',
          transition: 'all 0.2s',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {isProcessing ? (
          <div style={{ padding: 20 }}>
            <div style={{
              width: 40,
              height: 40,
              border: '3px solid #334155',
              borderTopColor: '#f59e0b',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px',
            }} />
            <p style={{ fontSize: 14, color: '#f0f4f8', marginBottom: 8 }}>
              {statusMessage || '正在识别...'}
            </p>
            <div style={{
              width: '80%',
              height: 4,
              background: '#334155',
              borderRadius: 2,
              overflow: 'hidden',
              margin: '0 auto',
            }}>
              <div style={{
                width: `${progress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #f59e0b, #d97706)',
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📷</div>
            <p style={{ fontSize: 14, fontWeight: 500, color: '#f0f4f8', marginBottom: 4 }}>
              点击或拖拽上传棋盘截图
            </p>
            <p style={{ fontSize: 12, color: '#64748b' }}>
              {recognizerType === 'huggingface'
                ? '使用 HuggingFace 深度学习模型识别'
                : '使用本地边缘检测识别'}
            </p>
          </>
        )}
      </div>

      {error && (
        <div style={{
          marginTop: 12,
          padding: '10px 14px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #ef4444',
          borderRadius: 8,
          color: '#ef4444',
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

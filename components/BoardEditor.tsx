'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';

interface Position {
  row: number;
  col: number;
}

// Xiangqi pieces - Unicode characters
const PIECES = {
  // Red pieces (lowercase in FEN)
  R: { char: '車', name: '红车', color: 'red' },
  N: { char: '馬', name: '红马', color: 'red' },
  B: { char: '象', name: '红相', color: 'red' },
  A: { char: '士', name: '红仕', color: 'red' },
  K: { char: '帅', name: '红帅', color: 'red' },
  C: { char: '炮', name: '红炮', color: 'red' },
  P: { char: '兵', name: '红兵', color: 'red' },
  
  // Black pieces (uppercase in FEN)
  r: { char: '車', name: '黑车', color: 'black' },
  n: { char: '馬', name: '黑马', color: 'black' },
  b: { char: '象', name: '黑象', color: 'black' },
  a: { char: '士', name: '黑士', color: 'black' },
  k: { char: '将', name: '黑将', color: 'black' },
  c: { char: '炮', name: '黑炮', color: 'black' },
  p: { char: '卒', name: '黑卒', color: 'black' },
};

type PieceKey = keyof typeof PIECES;

interface BoardEditorProps {
  fen: string;
  onFenChange: (fen: string) => void;
  width?: number;
  height?: number;
}

export default function BoardEditor({ fen, onFenChange, width = 380, height = 420 }: BoardEditorProps) {
  const [selectedPiece, setSelectedPiece] = useState<PieceKey | null>(null);
  const [hoveredSquare, setHoveredSquare] = useState<Position | null>(null);
  const [board, setBoard] = useState<(PieceKey | null)[][]>(() => {
    return Array(10).fill(null).map(() => Array(9).fill(null));
  });
  const [sideToMove, setSideToMove] = useState<'w' | 'b'>('w');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Parse FEN when it changes
  useEffect(() => {
    try {
      const parts = fen.trim().split(' ');
      const ranks = parts[0].split('/');
      const newBoard: (PieceKey | null)[][] = Array(10).fill(null).map(() => Array(9).fill(null));
      
      ranks.forEach((rank, row) => {
        let col = 0;
        for (const char of rank) {
          if (/\d/.test(char)) {
            col += parseInt(char);
          } else {
            newBoard[row][col] = char as PieceKey;
            col++;
          }
        }
      });
      
      setBoard(newBoard);
      if (parts[1]) {
        setSideToMove(parts[1] as 'w' | 'b');
      }
    } catch (e) {
      console.error('Invalid FEN');
    }
  }, [fen]);

  const boardToFen = useCallback(() => {
    const ranks: string[] = [];
    for (let row = 0; row < 10; row++) {
      let fenRow = '';
      let empty = 0;
      for (let col = 0; col < 9; col++) {
        const piece = board[row][col];
        if (piece === null) {
          empty++;
        } else {
          if (empty > 0) {
            fenRow += empty;
            empty = 0;
          }
          fenRow += piece;
        }
      }
      if (empty > 0) fenRow += empty;
      ranks.push(fenRow);
    }
    return `${ranks.join('/')} ${sideToMove} KQkq - 0 1`;
  }, [board, sideToMove]);

  const handleSquareClick = useCallback((row: number, col: number) => {
    if (selectedPiece) {
      // Place piece
      const newBoard = board.map(r => [...r]);
      newBoard[row][col] = selectedPiece;
      setBoard(newBoard);
      onFenChange(boardToFen());
    } else {
      // Remove piece
      const newBoard = board.map(r => [...r]);
      newBoard[row][col] = null;
      setBoard(newBoard);
      onFenChange(boardToFen());
    }
  }, [board, selectedPiece, boardToFen, onFenChange]);

  const drawBoard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const squareW = width / 9;
    const squareH = height / 10;

    canvas.width = width;
    canvas.height = height;

    // Draw background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Draw squares
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 9; col++) {
        const x = col * squareW;
        const y = row * squareH;
        
        // Alternating colors
        const isLight = (row + col) % 2 === 0;
        
        // Check if hovered
        const isHovered = hoveredSquare && hoveredSquare.row === row && hoveredSquare.col === col;
        
        if (isHovered) {
          ctx.fillStyle = selectedPiece ? '#4a5568' : '#718096';
        } else {
          ctx.fillStyle = isLight ? '#e8d4b8' : '#c9a66b';
        }
        
        ctx.fillRect(x + 1, y + 1, squareW - 2, squareH - 2);

        // Draw piece
        const piece = board[row][col];
        if (piece && PIECES[piece]) {
          const info = PIECES[piece];
          
          ctx.font = `bold ${squareW * 0.65}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillText(info.char, x + squareW / 2 + 2, y + squareH / 2 + 2);
          
          // Piece
          ctx.fillStyle = info.color === 'red' ? '#dc2626' : '#1a1a1a';
          ctx.fillText(info.char, x + squareW / 2, y + squareH / 2);
        }
      }
    }

    // Draw grid lines
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;

    // Horizontal lines
    for (let i = 0; i <= 9; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * squareH);
      ctx.lineTo(width, i * squareH);
      ctx.stroke();
    }

    // Vertical lines
    for (let i = 0; i <= 9; i++) {
      ctx.beginPath();
      ctx.moveTo(i * squareW, 0);
      ctx.lineTo(i * squareW, height);
      ctx.stroke();
    }

    // Palace diagonals
    ctx.beginPath();
    // Top palace
    ctx.moveTo(3 * squareW, 0);
    ctx.lineTo(5 * squareW, squareH * 2);
    ctx.moveTo(5 * squareW, 0);
    ctx.lineTo(3 * squareW, squareH * 2);
    // Bottom palace
    ctx.moveTo(3 * squareW, squareH * 7);
    ctx.lineTo(5 * squareW, squareH * 9);
    ctx.moveTo(5 * squareW, squareH * 7);
    ctx.lineTo(3 * squareW, squareH * 9);
    ctx.stroke();

    // River text
    ctx.font = `bold ${squareH * 0.35}px serif`;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillText('楚 河', squareW * 2.5, height / 2 + squareH * 0.1);
    ctx.fillText('漢 界', squareW * 6.5, height / 2 + squareH * 0.1);

    // Coordinates
    ctx.font = `${squareH * 0.15}px Arial`;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    const files = '123456789';
    const ranks = '九八七六五四三二一';
    for (let i = 0; i < 9; i++) {
      ctx.fillText(files[i], i * squareW + squareW / 2, 10);
      ctx.fillText(files[i], i * squareW + squareW / 2, height - 5);
    }
    for (let i = 0; i < 10; i++) {
      ctx.fillText(ranks[i], 5, i * squareH + squareH / 2 + 4);
      ctx.fillText(ranks[i], width - 12, i * squareH + squareH / 2 + 4);
    }
  }, [board, hoveredSquare, selectedPiece, width, height]);

  useEffect(() => {
    drawBoard();
  }, [drawBoard]);

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const squareW = width / 9;
    const squareH = height / 10;

    const col = Math.floor(x / squareW);
    const row = Math.floor(y / squareH);

    if (row >= 0 && row < 10 && col >= 0 && col < 9) {
      setHoveredSquare({ row, col });
    } else {
      setHoveredSquare(null);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const squareW = width / 9;
    const squareH = height / 10;

    const col = Math.floor(x / squareW);
    const row = Math.floor(y / squareH);

    if (row >= 0 && row < 10 && col >= 0 && col < 9) {
      handleSquareClick(row, col);
    }
  };

  const clearBoard = () => {
    setBoard(Array(10).fill(null).map(() => Array(9).fill(null)));
    onFenChange(boardToFen());
  };

  const setStartingPosition = () => {
    const startBoard: (PieceKey | null)[][] = [
      ['r', 'n', 'b', 'a', 'k', 'a', 'b', 'n', 'r'],
      [null, null, null, null, null, null, null, null, null],
      [null, 'c', null, null, null, null, null, 'c', null],
      ['p', null, 'p', null, 'p', null, 'p', null, 'p'],
      [null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null],
      ['P', null, 'P', null, 'P', null, 'P', null, 'P'],
      [null, 'C', null, null, null, null, null, 'C', null],
      [null, null, null, null, null, null, null, null, null],
      ['R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R'],
    ];
    setBoard(startBoard);
    setSideToMove('w');
    onFenChange(boardToFen());
  };

  const toggleSideToMove = () => {
    setSideToMove(prev => prev === 'w' ? 'b' : 'w');
    const parts = fen.trim().split(' ');
    const newFen = `${parts[0]} ${sideToMove === 'w' ? 'b' : 'w'} ${parts.slice(2).join(' ')}`;
    onFenChange(newFen);
  };

  const pieceKeys = Object.keys(PIECES) as PieceKey[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Piece selector */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
        {pieceKeys.map(piece => {
          const info = PIECES[piece];
          const isSelected = selectedPiece === piece;
          return (
            <button
              key={piece}
              onClick={() => setSelectedPiece(isSelected ? null : piece)}
              style={{
                padding: '6px 10px',
                background: isSelected ? (info.color === 'red' ? '#dc2626' : '#1a1a1a') : '#334155',
                color: isSelected ? '#fff' : (info.color === 'red' ? '#fca5a5' : '#e5e5e5'),
                border: isSelected ? '2px solid #fbbf24' : '1px solid #475569',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: '"Noto Sans SC", sans-serif',
                fontSize: 16,
                minWidth: 36,
                transition: 'all 0.15s',
              }}
              title={info.name}
            >
              {info.char}
            </button>
          );
        })}
      </div>

      {/* Instructions */}
      <div style={{ 
        fontSize: 12, 
        color: '#94a3b8', 
        textAlign: 'center',
        background: '#1e293b',
        padding: '8px 12px',
        borderRadius: 6,
      }}>
        {selectedPiece ? (
          <>点击棋盘放置 <strong style={{ color: PIECES[selectedPiece].color === 'red' ? '#ef4444' : '#fff' }}>{PIECES[selectedPiece].name}</strong>，再次点击同棋子取消选择</>
        ) : (
          <>点击已有棋子可移除，点击空位无选择时也可移除</>
        )}
      </div>

      {/* Board */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={() => setHoveredSquare(null)}
          style={{ 
            cursor: selectedPiece ? 'copy' : 'pointer',
            borderRadius: 4,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}
        />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={setStartingPosition}
          className="btn btn-secondary"
          style={{ fontSize: 13, padding: '8px 14px' }}
        >
          开局
        </button>
        <button
          onClick={clearBoard}
          className="btn btn-secondary"
          style={{ fontSize: 13, padding: '8px 14px' }}
        >
          清空
        </button>
        <button
          onClick={toggleSideToMove}
          className="btn btn-secondary"
          style={{ fontSize: 13, padding: '8px 14px' }}
        >
          {sideToMove === 'w' ? '红方走子' : '黑方走子'}
        </button>
      </div>

      {/* Current FEN */}
      <div style={{ 
        background: '#0f172a', 
        padding: 10, 
        borderRadius: 6,
        fontSize: 11,
        fontFamily: 'monospace',
        color: '#94a3b8',
        wordBreak: 'break-all',
      }}>
        <strong style={{ color: '#64748b' }}>FEN:</strong> {fen.split(' ')[0]}
      </div>
    </div>
  );
}

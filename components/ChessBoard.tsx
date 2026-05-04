'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';

interface ChessBoardProps {
  fen: string;
  onMove?: (from: string, to: string, promotion?: string) => void;
  onSquareClick?: (square: string) => void;
  orientation?: 'white' | 'black';
  interactive?: boolean;
  width?: number;
  height?: number;
  lastMove?: { from: string; to: string } | null;
  highlights?: string[];
  showCoordinates?: boolean;
}

export default function ChessBoard({
  fen,
  onMove,
  onSquareClick,
  orientation = 'white',
  interactive = true,
  width = 400,
  height = 400,
  lastMove,
  highlights = [],
  showCoordinates = true,
}: ChessBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Board colors
  const lightSquare = '#f0d9b5';
  const darkSquare = '#b58863';
  const highlightColor = 'rgba(255, 255, 0, 0.5)';
  const lastMoveColor = 'rgba(155, 199, 0, 0.5)';
  const selectedColor = 'rgba(0, 0, 255, 0.4)';

  // Xiangqi piece Unicode characters
  const PIECES: Record<string, string> = {
    // Red pieces (lowercase in FEN)
    'k': '將', 'K': '將',
    'r': '車', 'R': '車',
    'n': '馬', 'N': '馬', // knight
    'b': '象', 'B': '象', // bishop
    'a': '士', 'A': '士', // advisor
    'c': '炮', 'C': '炮',
    'p': '兵', 'P': '兵',
  };

  const getSquareColor = (row: number, col: number) => {
    return (row + col) % 2 === 0 ? lightSquare : darkSquare;
  };

  const parseFen = useCallback((fenStr: string): (string | null)[][] => {
    const board: (string | null)[][] = Array(10)
      .fill(null)
      .map(() => Array(9).fill(null));

    try {
      const parts = fenStr.trim().split(' ');
      const rows = parts[0].split('/');

      rows.forEach((row, i) => {
        let col = 0;
        for (const char of row) {
          if (/\d/.test(char)) {
            col += parseInt(char);
          } else {
            board[i][col] = char;
            col++;
          }
        }
      });
    } catch (e) {
      console.error('Invalid FEN:', e);
    }

    return board;
  }, []);

  const drawBoard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const squareSize = Math.min(width, height) / 9;
    const boardWidth = squareSize * 9;
    const boardHeight = squareSize * 10;

    canvas.width = boardWidth;
    canvas.height = boardHeight;

    const board = parseFen(fen);
    const isFlipped = orientation === 'black';

    // Draw squares
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 9; col++) {
        const actualRow = isFlipped ? 9 - row : row;
        const actualCol = isFlipped ? 8 - col : col;

        const x = col * squareSize;
        const y = row * squareSize;

        // Background color
        ctx.fillStyle = getSquareColor(actualRow, actualCol);
        ctx.fillRect(x, y, squareSize, squareSize);

        // Check for highlights
        const squareName = `${'abcdefghi'[actualCol]}${actualRow + 1}`;
        if (selectedSquare === squareName) {
          ctx.fillStyle = selectedColor;
          ctx.fillRect(x, y, squareSize, squareSize);
        } else if (highlights.includes(squareName)) {
          ctx.fillStyle = highlightColor;
          ctx.fillRect(x, y, squareSize, squareSize);
        } else if (lastMove) {
          if (
            `${'abcdefghi'[actualCol]}${actualRow + 1}` === lastMove.from ||
            `${'abcdefghi'[actualCol]}${actualRow + 1}` === lastMove.to
          ) {
            ctx.fillStyle = lastMoveColor;
            ctx.fillRect(x, y, squareSize, squareSize);
          }
        }

        // Draw piece
        const piece = board[actualRow][actualCol];
        if (piece) {
          const isRed = piece === piece.toLowerCase() && 'kracnba'.includes(piece);
          const isBlack = piece === piece.toUpperCase() && 'KRACNBA'.includes(piece);
          
          ctx.font = `${squareSize * 0.75}px "Noto Sans SC", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillText(
            PIECES[piece] || piece,
            x + squareSize / 2 + 2,
            y + squareSize / 2 + 2
          );
          
          // Piece
          ctx.fillStyle = isRed ? '#c41e3a' : isBlack ? '#1a1a1a' : '#333';
          ctx.fillText(
            PIECES[piece] || piece,
            x + squareSize / 2,
            y + squareSize / 2
          );
        }
      }
    }

    // Draw grid lines
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;

    // Horizontal lines
    for (let i = 0; i <= 9; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * squareSize);
      ctx.lineTo(boardWidth, i * squareSize);
      ctx.stroke();
    }

    // Vertical lines
    for (let i = 0; i <= 9; i++) {
      ctx.beginPath();
      ctx.moveTo(i * squareSize, 0);
      ctx.lineTo(i * squareSize, boardHeight);
      ctx.stroke();
    }

    // Draw palace diagonals (positions 3-5, rows 0-2 and 7-9)
    const palaceY1 = 0;
    const palaceY2 = squareSize * 2;
    const palaceY3 = squareSize * 7;
    const palaceY4 = squareSize * 9;

    // Top palace
    ctx.beginPath();
    ctx.moveTo(3 * squareSize, palaceY1);
    ctx.lineTo(5 * squareSize, palaceY2);
    ctx.moveTo(5 * squareSize, palaceY1);
    ctx.lineTo(3 * squareSize, palaceY2);
    ctx.stroke();

    // Bottom palace
    ctx.beginPath();
    ctx.moveTo(3 * squareSize, palaceY3);
    ctx.lineTo(5 * squareSize, palaceY4);
    ctx.moveTo(5 * squareSize, palaceY3);
    ctx.lineTo(3 * squareSize, palaceY4);
    ctx.stroke();

    // Draw river text
    ctx.font = `bold ${squareSize * 0.4}px serif`;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillText('楚 河', squareSize * 2.5, boardHeight / 2 + squareSize * 0.15);
    ctx.fillText('漢 界', squareSize * 6.5, boardHeight / 2 + squareSize * 0.15);

    // Draw coordinates
    if (showCoordinates) {
      ctx.font = `${squareSize * 0.2}px Arial`;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      const files = isFlipped ? '987654321' : '123456789';
      const ranks = isFlipped ? '一二三四五六七八九' : '九八七六五四三二一';
      
      for (let i = 0; i < 9; i++) {
        ctx.fillText(files[i], i * squareSize + squareSize / 2, 10);
        ctx.fillText(files[i], i * squareSize + squareSize / 2, boardHeight - 5);
      }
      for (let i = 0; i < 10; i++) {
        ctx.fillText(ranks[i], 3, i * squareSize + squareSize / 2 + 4);
        ctx.fillText(ranks[i], boardWidth - 10, i * squareSize + squareSize / 2 + 4);
      }
    }
  }, [fen, orientation, width, height, selectedSquare, lastMove, highlights, parseFen, showCoordinates]);

  useEffect(() => {
    drawBoard();
  }, [drawBoard]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const squareSize = Math.min(width, height) / 9;

    const col = Math.floor(x / squareSize);
    const row = Math.floor(y / squareSize);

    const isFlipped = orientation === 'black';
    const actualRow = isFlipped ? 9 - row : row;
    const actualCol = isFlipped ? 8 - col : col;

    if (col >= 0 && col < 9 && row >= 0 && row < 10) {
      const square = `${'abcdefghi'[actualCol]}${actualRow + 1}`;
      
      if (selectedSquare) {
        // Try to make a move
        onMove?.(selectedSquare, square);
        setSelectedSquare(null);
      } else {
        setSelectedSquare(square);
        onSquareClick?.(square);
      }
    }
  };

  return (
    <div className="board-wrapper" style={{ width, height }}>
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        style={{
          cursor: interactive ? 'pointer' : 'default',
          display: 'block',
        }}
      />
    </div>
  );
}

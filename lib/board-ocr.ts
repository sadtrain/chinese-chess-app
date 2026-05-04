// Chinese Chess (Xiangqi) Board OCR using Tesseract.js
// Attempts to detect piece positions from board screenshots

import Tesseract from 'tesseract.js';

// Standard Xiangqi board FEN (starting position)
export const STARTING_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

// Simplified piece mapping for OCR (Unicode to FEN)
const PIECE_MAP: Record<string, string> = {
  '车': 'r', '俥': 'r', '車': 'r',
  '馬': 'm', '马': 'm', '傌': 'm',
  '相': 'x', '象': 'x', '硨': 'x',
  '仕': 's', '士': 's', '帥': 'S',
  '帅': 'S', '将': 'K', '將': 'K',
  '兵': 'p', '卒': 'p',
  '炮': 'c', '砲': 'c',
};

// Reverse mapping for display
export const FEN_TO_UNICODE: Record<string, string> = {
  'k': '俥', 'K': '車',
  'm': '傌', 'M': '馬', 
  'x': '硨', 'X': '相',
  's': '仕', 'S': '士',
  'r': '俥', 'R': '車',
  'c': '砲', 'C': '炮',
  'p': '卒', 'P': '兵',
  'b': '將', 'B': '帥',
};

// Board coordinates for Xiangqi (rows 0-9, columns 0-8)
interface DetectedPiece {
  row: number;
  col: number;
  piece: string; // FEN character (lowercase = red, uppercase = black)
  confidence?: number;
}

interface OCRResult {
  fen: string;
  pieces: DetectedPiece[];
  confidence: number;
  message: string;
}

// Helper to convert detected pieces to FEN
function piecesToFen(pieces: DetectedPiece[]): string {
  const board: string[][] = Array(10).fill(null).map(() => Array(9).fill(''));
  
  // Place detected pieces
  pieces.forEach(p => {
    if (p.row >= 0 && p.row < 10 && p.col >= 0 && p.col < 9) {
      board[p.row][p.col] = p.piece;
    }
  });

  // Convert rows to FEN
  const ranks: string[] = [];
  for (let row = 0; row < 10; row++) {
    let fenRow = '';
    let empty = 0;
    for (let col = 0; col < 9; col++) {
      const piece = board[row][col];
      if (piece === '') {
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

  // Add side to move and placeholder
  return ranks.join('/') + ' w - - 0 1';
}

// Process OCR result text and extract positions
function parseOCRText(text: string): { row: number; col: number; piece: string }[] {
  const pieces: { row: number; col: number; piece: string }[] = [];
  
  // Try to detect piece patterns from the text
  const lines = text.split('\n');
  
  for (const line of lines) {
    // Match patterns like "r0c0=车" or similar
    const posMatch = line.match(/[rbxspcmRBXSPCM](\d)[,\s](\d)[\s=:]?([车马相仕帅兵炮馬象士將卒砲])/gi);
    if (posMatch) {
      posMatch.forEach(match => {
        const m = match.match(/([rbxspcmRBXSPCM])(\d)[,\s](\d)[\s=:]?([车马相仕帅兵炮馬象士將卒砲])/i);
        if (m) {
          const piece = m[1].toLowerCase();
          const row = parseInt(m[2]);
          const col = parseInt(m[3]);
          const chinese = m[4];
          pieces.push({ row, col, piece: PIECE_MAP[chinese] || piece });
        }
      });
    }

    // Try direct piece detection at specific coordinates
    const directMatch = line.match(/([车马相仕帅兵炮馬象士將卒砲俥傌硨仕帥將卒砲])/g);
    if (directMatch && directMatch.length >= 4) {
      // Assume this is a row with pieces
      let col = 0;
      for (const char of directMatch) {
        if (col < 9) {
          const piece = PIECE_MAP[char];
          if (piece) {
            pieces.push({ row: Math.floor(pieces.length / 9), col, piece });
          }
        }
        col++;
      }
    }
  }

  return pieces;
}

// Detect board from image using template matching approach
export async function detectBoardFromImage(
  imageSource: string | File | Blob,
  onProgress?: (progress: number) => void
): Promise<OCRResult> {
  try {
    onProgress?.(0);
    
    const result = await Tesseract.recognize(imageSource, 'chi_sim+eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          onProgress?.(m.progress * 100);
        }
      },
    });

    onProgress?.(100);

    const text = result.data.text;
    const confidence = result.data.confidence;

    // Parse detected pieces
    const pieces = parseOCRText(text);

    // If we detected some pieces, convert to FEN
    if (pieces.length > 0) {
      const fen = piecesToFen(pieces);
      return {
        fen,
        pieces,
        confidence,
        message: `识别到 ${pieces.length} 个棋子，准确率 ${Math.round(confidence)}%`,
      };
    }

    // Fallback: Return starting position with warning
    return {
      fen: STARTING_FEN,
      pieces: [],
      confidence,
      message: '未能从图片中识别棋盘，请手动输入局面或使用默认开局',
    };
  } catch (error) {
    console.error('OCR Error:', error);
    return {
      fen: STARTING_FEN,
      pieces: [],
      confidence: 0,
      message: '图片识别失败，请手动输入局面',
    };
  }
}

// Validate FEN string
export function isValidFen(fen: string): boolean {
  try {
    const parts = fen.trim().split(' ');
    if (parts.length < 1) return false;
    
    const ranks = parts[0].split('/');
    if (ranks.length !== 10) return false;

    for (const rank of ranks) {
      let count = 0;
      for (const char of rank) {
        if (/\d/.test(char)) {
          count += parseInt(char);
        } else if (/[prnbakbcxsPRNBAKBCXS]/.test(char)) {
          count++;
        } else {
          return false;
        }
      }
      if (count !== 9) return false;
    }

    return true;
  } catch {
    return false;
  }
}

// Convert UCI move to Chinese chess notation
export function uciToChinese(move: string, isRedToMove: boolean): string {
  // For Xiangqi, we'd need a more complex mapping
  // This is a placeholder - real implementation would need piece-specific logic
  const from = move.slice(0, 2);
  const to = move.slice(2, 4);
  
  const files = 'abcdefghi';
  const ranks = '9876543210';
  
  const fromFile = files.indexOf(from[0]);
  const fromRank = parseInt(from[1]);
  const toFile = files.indexOf(to[0]);
  const toRank = parseInt(to[1]);
  
  return `${files[fromFile]}${ranks[fromRank]} ${files[toFile]}${ranks[toRank]}`;
}

// Analyze move for specific variant
export function analyzeAlternativeMove(
  currentFen: string,
  alternativeMove: string,
  engine: any
): Promise<any> {
  return new Promise((resolve) => {
    // This would simulate making the alternative move and analyzing
    // The actual implementation would need chess.js for move validation
    engine.getAnalysis(currentFen, (analysis: any) => {
      resolve({
        originalFen: currentFen,
        alternativeMove,
        analysis,
        message: `分析走法 ${alternativeMove} 的变化`,
      });
    });
  });
}

export default detectBoardFromImage;

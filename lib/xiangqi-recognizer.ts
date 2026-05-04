/**
 * 中国象棋棋盘识别模块
 * 使用 Web Worker 在后台处理，避免阻塞 UI
 */

import { STARTING_FEN, isValidFen } from './xiangqi-validators';

export interface RecognitionResult {
  fen: string;
  confidence: number;
  pieces: Array<{
    row: number;
    col: number;
    type: string;
    confidence: number;
  }>;
  processingTime: number;
  message: string;
}

let worker: Worker | null = null;
let pendingResolve: ((result: RecognitionResult) => void) | null = null;
let pendingReject: ((error: Error) => void) | null = null;

/**
 * Check if we're in a browser environment
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

/**
 * Get or create Worker (lazy initialization, browser only)
 */
function getWorker(): Worker | null {
  if (!isBrowser()) return null;

  if (!worker) {
    try {
      worker = new Worker(
        new URL('./recognizer.worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (e) => {
        const msg = e.data;

        if (msg.type === 'result') {
          const fen = generateFenFromPieces(msg.pieces || []);
          pendingResolve?.({
            fen,
            confidence: Math.min(((msg.pieces?.length || 0) / 32) * 100, 100),
            pieces: (msg.pieces || []).map((p: any) => ({
              row: p.row,
              col: p.col,
              type: p.type,
              confidence: p.confidence,
            })),
            processingTime: 0,
            message: msg.message || '识别完成',
          });
          pendingResolve = null;
          pendingReject = null;
        } else if (msg.type === 'error') {
          pendingReject?.(new Error(msg.error));
          pendingResolve = null;
          pendingReject = null;
        }
      };

      worker.onerror = (e) => {
        pendingReject?.(new Error('Worker 错误: ' + e.message));
      };
    } catch (error) {
      console.error('Failed to create worker:', error);
      return null;
    }
  }
  return worker;
}

const BOARD_ROWS = 10;
const BOARD_COLS = 9;

/**
 * 识别棋盘
 */
export async function recognizeBoard(
  imageSource: string | File,
  onProgress?: (progress: number, message: string) => void
): Promise<RecognitionResult> {
  const startTime = performance.now();

  // Check if we're in a browser with Worker support
  if (!isBrowser()) {
    console.warn('recognizeBoard called outside of browser environment');
    return {
      fen: STARTING_FEN,
      confidence: 0,
      pieces: [],
      processingTime: performance.now() - startTime,
      message: '非浏览器环境，无法进行识别',
    };
  }

  try {
    onProgress?.(5, '正在加载图像...');

    // 加载图像
    const img = await loadImage(imageSource);
    onProgress?.(10, '正在准备处理...');

    // 创建 Canvas 获取图像数据
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, img.width, img.height);

    onProgress?.(20, '正在后台处理...');

    // 使用 Worker 在后台处理
    const w = getWorker();
    if (!w) {
      throw new Error('无法创建 Worker，请确保浏览器支持 Web Workers');
    }

    return new Promise((resolve, reject) => {
      pendingResolve = (result) => {
        result.processingTime = performance.now() - startTime;
        onProgress?.(100, result.message);
        resolve(result);
      };
      pendingReject = reject;

      w.postMessage({
        type: 'process',
        imageData,
        width: img.width,
        height: img.height,
      });
    });
  } catch (error) {
    console.error('Recognition error:', error);
    return {
      fen: STARTING_FEN,
      confidence: 0,
      pieces: [],
      processingTime: performance.now() - startTime,
      message: '识别失败，使用默认开局',
    };
  }
}

/**
 * 加载图像
 */
function loadImage(src: string | File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图像加载失败'));
    img.src = typeof src === 'string' ? src : URL.createObjectURL(src);
  });
}

/**
 * 根据棋子位置和数量生成 FEN
 */
function generateFenFromPieces(pieces: Array<{ row: number; col: number; type: string; confidence: number; color: string }>): string {
  // 创建空棋盘
  const board: string[][] = Array(BOARD_ROWS)
    .fill(null)
    .map(() => Array(BOARD_COLS).fill(''));

  // 统计红黑棋子数量
  const redPieces = pieces.filter(p => p.color === 'red');
  const blackPieces = pieces.filter(p => p.color === 'black');

  // 判断红方在哪边（通过位置）
  const redAvgRow = redPieces.length > 0
    ? redPieces.reduce((sum, p) => sum + p.row, 0) / redPieces.length
    : 7;
  const isRedBottom = redAvgRow > 4;

  // 填充棋子
  for (const piece of pieces) {
    const { row, col, color } = piece;

    // 如果红方在下，需要翻转
    const effectiveRow = isRedBottom ? row : 9 - row;

    // 简化处理：使用棋子颜色和位置推断类型
    const pieceType = inferPieceType(effectiveRow, col, color);

    if (board[effectiveRow][col] === '') {
      board[effectiveRow][col] = pieceType;
    }
  }

  // 转换为 FEN
  const ranks: string[] = [];
  for (let row = 0; row < BOARD_ROWS; row++) {
    let fenRow = '';
    let empty = 0;

    for (let col = 0; col < BOARD_COLS; col++) {
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

  // 确定走棋方
  const sideToMove = isRedBottom ? 'w' : 'b';

  return `${ranks.join('/')} ${sideToMove} - - 0 1`;
}

/**
 * 根据位置推断棋子类型
 */
function inferPieceType(
  row: number,
  col: number,
  color: string
): string {
  const isRed = color === 'red';

  // 中路
  if (col === 4) {
    if (row === 9 || row === 0) return isRed ? 'K' : 'k';
    return isRed ? 'P' : 'p';
  }

  // 边路
  if (col === 0 || col === 8) {
    if (row === 9 || row === 0) return isRed ? 'R' : 'r';
    return isRed ? 'P' : 'p';
  }

  // 马位置
  if (col === 1 || col === 7) {
    if (row === 9 || row === 0) return isRed ? 'N' : 'n';
    return isRed ? 'P' : 'p';
  }

  // 相/象位置
  if (col === 2 || col === 6) {
    if (row === 9 || row === 0) return isRed ? 'B' : 'b';
    return isRed ? 'P' : 'p';
  }

  // 士位置
  if (col === 3 || col === 5) {
    if (row === 9 || row === 0) return isRed ? 'A' : 'a';
    return isRed ? 'P' : 'p';
  }

  return isRed ? 'P' : 'p';
}

/**
 * 验证 FEN 格式
 */
export { isValidFen };
export { STARTING_FEN };

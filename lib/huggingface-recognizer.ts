/**
 * 中国象棋棋盘识别模块 - HuggingFace 深度学习版本
 * 使用 transformers.js 在浏览器端运行推理
 */

import { STARTING_FEN } from './xiangqi-validators';

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

export interface HuggingFaceConfig {
  apiUrl?: string;
  modelId?: string;
  useApi?: boolean;
}

// 默认配置
const DEFAULT_CONFIG: HuggingFaceConfig = {
  // 使用 HuggingFace Inference API
  apiUrl: 'https://api-inference.huggingface.co/models/yolo12138/Chinese_Chess_Recognition',
  useApi: true,
};

// 棋子映射 (FEN 格式)
const PIECE_MAP: Record<string, string> = {
  'k': 'k', // 黑将
  'a': 'a', // 黑士
  'b': 'b', // 黑象
  'n': 'n', // 黑马
  'r': 'r', // 黑车
  'c': 'c', // 黑炮
  'p': 'p', // 黑卒
  'K': 'K', // 红帅
  'A': 'A', // 红仕
  'B': 'B', // 红相
  'N': 'N', // 红马
  'R': 'R', // 红车
  'C': 'C', // 红炮
  'P': 'P', // 红兵
};

const BOARD_ROWS = 10;
const BOARD_COLS = 9;

/**
 * 检查是否在浏览器环境
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof fetch !== 'undefined';
}

/**
 * 加载图像为 base64
 */
async function imageToBase64(imageSource: string | File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      // 缩放到合适大小以加速 API 调用
      const maxSize = 640;
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      if (scale < 1) {
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }

      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => reject(new Error('图像加载失败'));
    img.src = typeof imageSource === 'string' ? imageSource : URL.createObjectURL(imageSource);
  });
}

/**
 * 调用本地 API 代理
 */
async function callLocalApi(
  imageBase64: string,
  onProgress?: (progress: number, message: string) => void
): Promise<{ fen: string; confidence: number }> {
  onProgress?.(10, '正在准备请求...');

  // 移除 data URL 前缀
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  onProgress?.(20, '正在连接服务器...');

  const response = await fetch('/api/recognize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: base64Data,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    if (response.status === 503) {
      throw new Error('模型正在加载中，请稍后重试');
    }
    throw new Error(error.error || `API 请求失败: ${response.status}`);
  }

  onProgress?.(70, '正在解析识别结果...');

  const result = await response.json();
  return result;
}

/**
 * 调用 HuggingFace Inference API (直接调用，需要处理 CORS)
 */
async function callHuggingFaceApiDirect(
  imageBase64: string,
  apiToken: string | null,
  onProgress?: (progress: number, message: string) => void
): Promise<{ fen: string; confidence: number }> {
  onProgress?.(10, '正在连接 HuggingFace API...');

  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiToken) {
    headers['Authorization'] = `Bearer ${apiToken}`;
  }

  onProgress?.(20, '正在发送图像到服务器...');

  const response = await fetch(DEFAULT_CONFIG.apiUrl!, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      inputs: base64Data,
      options: {
        wait_for_model: true,
      },
    }),
  });

  if (!response.ok) {
    if (response.status === 503) {
      throw new Error('模型正在加载中，请稍后重试');
    }
    throw new Error(`API 请求失败: ${response.status}`);
  }

  onProgress?.(70, '正在解析识别结果...');

  const result = await response.json();
  return result;
}

/**
 * 解析模型输出为 FEN
 */
function parseModelOutput(
  modelOutput: any,
  imageWidth: number,
  imageHeight: number
): { pieces: Array<{ row: number; col: number; type: string; confidence: number }>; fen: string } {
  const pieces: Array<{ row: number; col: number; type: string; confidence: number }> = [];

  // 如果模型直接返回 FEN
  if (modelOutput.fen) {
    const piecesFromFen = parseFen(modelOutput.fen);
    return {
      pieces: piecesFromFen,
      fen: modelOutput.fen,
    };
  }

  // 如果模型返回棋盘网格数据 (10x9)
  if (modelOutput.board) {
    const board = modelOutput.board;
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell = board[row]?.[col];
        if (cell && cell !== '.' && cell !== 'x') {
          const fenChar = PIECE_MAP[cell] || cell;
          pieces.push({
            row,
            col,
            type: fenChar,
            confidence: cell.confidence || 0.9,
          });
        }
      }
    }
  }

  // 如果模型返回棋子位置
  if (Array.isArray(modelOutput.pieces)) {
    for (const piece of modelOutput.pieces) {
      if (piece.type && piece.row !== undefined && piece.col !== undefined) {
        const fenChar = PIECE_MAP[piece.type] || piece.type;
        pieces.push({
          row: piece.row,
          col: piece.col,
          type: fenChar,
          confidence: piece.confidence || 0.9,
        });
      }
    }
  }

  return { pieces, fen: generateFen(pieces) };
}

/**
 * 解析 FEN 字符串
 */
function parseFen(fen: string): Array<{ row: number; col: number; type: string; confidence: number }> {
  const pieces: Array<{ row: number; col: number; type: string; confidence: number }> = [];
  const [position] = fen.split(' ');

  const rows = position.split('/');

  for (let row = 0; row < rows.length; row++) {
    let col = 0;
    for (const char of rows[row]) {
      if (char >= '1' && char <= '9') {
        col += parseInt(char);
      } else if (PIECE_MAP[char]) {
        pieces.push({
          row,
          col,
          type: char,
          confidence: 1.0,
        });
        col++;
      }
    }
  }

  return pieces;
}

/**
 * 生成 FEN 字符串
 */
function generateFen(
  pieces: Array<{ row: number; col: number; type: string; confidence: number }>
): string {
  // 创建空棋盘
  const board: string[][] = Array(BOARD_ROWS)
    .fill(null)
    .map(() => Array(BOARD_COLS).fill(''));

  // 填充棋子
  for (const piece of pieces) {
    if (piece.row >= 0 && piece.row < BOARD_ROWS && piece.col >= 0 && piece.col < BOARD_COLS) {
      board[piece.row][piece.col] = piece.type;
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

  return `${ranks.join('/')} w - - 0 1`;
}

/**
 * 识别棋盘
 */
export async function recognizeBoardHuggingFace(
  imageSource: string | File,
  onProgress?: (progress: number, message: string) => void,
  config?: HuggingFaceConfig
): Promise<RecognitionResult> {
  const startTime = performance.now();

  if (!isBrowser()) {
    return {
      fen: STARTING_FEN,
      confidence: 0,
      pieces: [],
      processingTime: 0,
      message: '非浏览器环境',
    };
  }

  try {
    onProgress?.(5, '正在加载图像...');

    // 转换为 base64
    const imageBase64 = await imageToBase64(imageSource);

    onProgress?.(15, '正在调用识别模型...');

    // 调用本地 API (服务端代理)
    const result = await callLocalApi(imageBase64, onProgress);

    onProgress?.(90, '正在格式化结果...');

    const pieces = parseFen(result.fen);
    const confidence = result.confidence || Math.min(pieces.length / 32, 1);

    return {
      fen: result.fen,
      confidence: confidence * 100,
      pieces,
      processingTime: performance.now() - startTime,
      message: `识别成功，检测到 ${pieces.length} 个棋子`,
    };
  } catch (error: any) {
    console.error('HuggingFace recognition error:', error);

    return {
      fen: STARTING_FEN,
      confidence: 0,
      pieces: [],
      processingTime: performance.now() - startTime,
      message: error.message || '识别失败',
    };
  }
}

/**
 * 备用方案：使用本地简单识别
 * 当 API 不可用时使用
 */
export async function recognizeBoardLocal(
  imageSource: string | File,
  onProgress?: (progress: number, message: string) => void
): Promise<RecognitionResult> {
  const startTime = performance.now();

  if (!isBrowser()) {
    return {
      fen: STARTING_FEN,
      confidence: 0,
      pieces: [],
      processingTime: 0,
      message: '非浏览器环境',
    };
  }

  try {
    onProgress?.(10, '正在加载图像...');

    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('图像加载失败'));
      img.src = typeof imageSource === 'string' ? imageSource : URL.createObjectURL(imageSource);
    });

    onProgress?.(30, '正在检测棋盘区域...');

    // 创建 Canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, img.width, img.height);

    // 简单的棋盘检测
    const boardRegion = detectBoardRegion(imageData);

    if (!boardRegion) {
      onProgress?.(100, '未检测到棋盘区域');
      return {
        fen: STARTING_FEN,
        confidence: 0,
        pieces: [],
        processingTime: performance.now() - startTime,
        message: '未检测到棋盘',
      };
    }

    onProgress?.(50, '正在检测棋子...');

    // 检测棋子位置
    const pieces = detectPiecesSimple(imageData, boardRegion);

    onProgress?.(80, '正在生成 FEN...');

    const fen = generateFen(pieces);
    const confidence = Math.min(pieces.length / 32, 1) * 100;

    return {
      fen,
      confidence,
      pieces,
      processingTime: performance.now() - startTime,
      message: `检测到 ${pieces.length} 个棋子`,
    };
  } catch (error: any) {
    return {
      fen: STARTING_FEN,
      confidence: 0,
      pieces: [],
      processingTime: performance.now() - startTime,
      message: error.message || '识别失败',
    };
  }
}

/**
 * 检测棋盘区域
 */
function detectBoardRegion(imageData: ImageData): { x: number; y: number; width: number; height: number } | null {
  const { data, width, height } = imageData;

  // 转换为灰度
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    gray[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
  }

  // 简单的边缘检测
  const edges = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx = gray[idx + 1] - gray[idx - 1];
      const gy = gray[idx + width] - gray[idx - width];
      edges[idx] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
    }
  }

  // 找到包含最多边缘的矩形区域
  let bestRegion = null;
  let maxEdges = 0;

  // 尝试不同的缩放比例
  const aspectRatios = [0.9, 1.0, 1.1];

  for (const aspect of aspectRatios) {
    // 假设棋盘占据图片的 50%-90%
    for (let scale = 0.5; scale <= 0.9; scale += 0.1) {
      const boardWidth = width * scale;
      const boardHeight = boardWidth * aspect;

      // 在不同位置滑动
      for (let y = 0; y < height - boardHeight; y += boardHeight / 5) {
        for (let x = 0; x < width - boardWidth; x += boardWidth / 5) {
          let edgeCount = 0;

          // 统计边缘点
          for (let by = Math.floor(y); by < y + boardHeight; by += 10) {
            for (let bx = Math.floor(x); bx < x + boardWidth; bx += 10) {
              if (edges[by * width + bx] > 50) edgeCount++;
            }
          }

          if (edgeCount > maxEdges) {
            maxEdges = edgeCount;
            bestRegion = { x: Math.floor(x), y: Math.floor(y), width: Math.floor(boardWidth), height: Math.floor(boardHeight) };
          }
        }
      }
    }
  }

  return bestRegion;
}

/**
 * 简单棋子检测
 */
function detectPiecesSimple(
  imageData: ImageData,
  boardRegion: { x: number; y: number; width: number; height: number }
): Array<{ row: number; col: number; type: string; confidence: number }> {
  const { data, width } = imageData;
  const { x, y, width: boardWidth, height: boardHeight } = boardRegion;

  const pieces: Array<{ row: number; col: number; type: string; confidence: number }> = [];
  const cellWidth = boardWidth / 8;
  const cellHeight = boardHeight / 9;

  for (let row = 0; row < BOARD_ROWS; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      const centerX = x + (col + 0.5) * cellWidth;
      const centerY = y + (row + 0.5) * cellHeight;
      const radius = Math.min(cellWidth, cellHeight) * 0.4;

      let redCount = 0;
      let blackCount = 0;
      let total = 0;

      // 采样检测颜色
      for (let dy = -radius; dy < radius; dy += 3) {
        for (let dx = -radius; dx < radius; dx += 3) {
          const px = Math.floor(centerX + dx);
          const py = Math.floor(centerY + dy);

          if (px < 0 || px >= width || py < 0 || py >= imageData.height) continue;

          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > radius) continue;

          const idx = (py * width + px) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          total++;

          // 红色棋子
          if (r > 150 && r > g * 1.3 && r > b * 1.3) redCount++;
          // 黑色棋子
          if (r < 80 && g < 80 && b < 80) blackCount++;
        }
      }

      if (total > 0) {
        const redRatio = redCount / total;
        const blackRatio = blackCount / total;

        if (redRatio > 0.05 || blackRatio > 0.1) {
          const isRed = redRatio > blackRatio;
          const type = inferPieceType(row, col, isRed);

          pieces.push({
            row,
            col,
            type,
            confidence: Math.max(redRatio, blackRatio),
          });
        }
      }
    }
  }

  return pieces;
}

/**
 * 根据位置推断棋子类型
 */
function inferPieceType(row: number, col: number, isRed: boolean): string {
  const base = isRed ? 'R' : 'r';

  // 中路
  if (col === 4) {
    if (row === 0 || row === 9) return isRed ? 'K' : 'k';
    return isRed ? 'P' : 'p';
  }

  // 边路
  if (col === 0 || col === 8) {
    if (row === 0 || row === 9) return isRed ? 'R' : 'r';
    return isRed ? 'P' : 'p';
  }

  // 马位置
  if (col === 1 || col === 7) {
    if (row === 0 || row === 9) return isRed ? 'N' : 'n';
    return isRed ? 'P' : 'p';
  }

  // 相/象位置
  if (col === 2 || col === 6) {
    if (row === 0 || row === 9) return isRed ? 'B' : 'b';
    return isRed ? 'P' : 'p';
  }

  // 士位置
  if (col === 3 || col === 5) {
    if (row === 0 || row === 9) return isRed ? 'A' : 'a';
    return isRed ? 'P' : 'p';
  }

  return isRed ? 'P' : 'p';
}

export { STARTING_FEN };

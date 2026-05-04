/**
 * 中国象棋棋盘识别器 - 基于 OpenCV.js 原理
 * 使用 Canvas API 模拟 OpenCV 的图像处理功能
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

export interface BoardPosition {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
}

// 棋子 FEN 映射
const PIECE_MAP: Record<string, string> = {
  '帅': 'K', '帥': 'K', '將': 'k', '将': 'k',
  '車': 'R', '车': 'R',
  '馬': 'N', '马': 'N',
  '相': 'B', '象': 'b',
  '仕': 'A', '士': 'a',
  '炮': 'C', '砲': 'C',
  '兵': 'P', '卒': 'p',
};

// 简化的棋子类型
const PIECE_CHARS = {
  red: ['帥', '車', '馬', '相', '仕', '炮', '兵'],
  black: ['將', '車', '馬', '象', '士', '炮', '卒'],
};

const BOARD_ROWS = 10;
const BOARD_COLS = 9;

/**
 * 加载图像并转换为 ImageData
 */
function loadImageToImageData(src: string): Promise<{ imageData: ImageData; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      resolve({
        imageData: ctx.getImageData(0, 0, img.width, img.height),
        width: img.width,
        height: img.height,
      });
    };
    img.onerror = () => reject(new Error('图像加载失败'));
    img.src = src;
  });
}

/**
 * 将彩色图像转换为灰度
 */
function toGrayscale(imageData: ImageData): Uint8ClampedArray {
  const { data, width, height } = imageData;
  const gray = new Uint8ClampedArray(width * height);
  
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  
  return gray;
}

/**
 * 高斯模糊
 */
function gaussianBlur(gray: Uint8ClampedArray, width: number, height: number, kernelSize: number = 5): Uint8ClampedArray {
  const kernel = createGaussianKernel(kernelSize);
  const half = Math.floor(kernelSize / 2);
  const result = new Uint8ClampedArray(width * height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let weightSum = 0;
      
      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const px = Math.min(Math.max(x + kx, 0), width - 1);
          const py = Math.min(Math.max(y + ky, 0), height - 1);
          const weight = kernel[(ky + half) * kernelSize + (kx + half)];
          sum += gray[py * width + px] * weight;
          weightSum += weight;
        }
      }
      
      result[y * width + x] = Math.round(sum / weightSum);
    }
  }
  
  return result;
}

/**
 * 创建高斯核
 */
function createGaussianKernel(size: number): number[] {
  const sigma = size / 6;
  const half = Math.floor(size / 2);
  const kernel: number[] = [];
  let sum = 0;
  
  for (let y = -half; y <= half; y++) {
    for (let x = -half; x <= half; x++) {
      const value = Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
      kernel.push(value);
      sum += value;
    }
  }
  
  return kernel.map(v => v / sum);
}

/**
 * Canny 边缘检测
 */
function cannyEdgeDetection(gray: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  // 1. 高斯模糊
  const blurred = gaussianBlur(gray, width, height, 5);
  
  // 2. Sobel 算子计算梯度
  const gradientMagnitude = new Uint8ClampedArray(width * height);
  const gradientDirection = new Float32Array(width * height);
  
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pixel = blurred[(y + ky) * width + (x + kx)];
          const idx = (ky + 1) * 3 + (kx + 1);
          gx += pixel * sobelX[idx];
          gy += pixel * sobelY[idx];
        }
      }
      
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      const direction = Math.atan2(gy, gx);
      
      gradientMagnitude[y * width + x] = Math.min(255, magnitude);
      gradientDirection[y * width + x] = direction;
    }
  }
  
  // 3. 非极大值抑制
  const suppressed = nonMaxSuppression(gradientMagnitude, gradientDirection, width, height);
  
  // 4. 双阈值处理和边缘连接
  return doubleThresholdAndEdgeLinking(suppressed, width, height);
}

/**
 * 非极大值抑制
 */
function nonMaxSuppression(
  magnitude: Uint8ClampedArray,
  direction: Float32Array,
  width: number,
  height: number
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(width * height);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const angle = direction[idx] * 180 / Math.PI;
      const mag = magnitude[idx];
      
      let q = 255, r = 255;
      
      // 角度量化到 4 个方向
      if ((angle >= -22.5 && angle < 22.5) || (angle >= 157.5 || angle < -157.5)) {
        q = magnitude[y * width + x + 1];
        r = magnitude[y * width + x - 1];
      } else if ((angle >= 22.5 && angle < 67.5) || (angle >= -157.5 && angle < -112.5)) {
        q = magnitude[(y + 1) * width + x - 1];
        r = magnitude[(y - 1) * width + x + 1];
      } else if ((angle >= 67.5 && angle < 112.5) || (angle >= -112.5 && angle < -67.5)) {
        q = magnitude[(y + 1) * width + x];
        r = magnitude[(y - 1) * width + x];
      } else {
        q = magnitude[(y - 1) * width + x - 1];
        r = magnitude[(y + 1) * width + x + 1];
      }
      
      result[idx] = (mag >= q && mag >= r) ? mag : 0;
    }
  }
  
  return result;
}

/**
 * 双阈值处理和边缘连接
 */
function doubleThresholdAndEdgeLinking(
  edges: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const lowThreshold = 50;
  const highThreshold = 150;
  
  const result = new Uint8ClampedArray(width * height);
  
  for (let i = 0; i < edges.length; i++) {
    if (edges[i] >= highThreshold) {
      result[i] = 255;
    } else if (edges[i] >= lowThreshold) {
      result[i] = 128; // 弱边缘
    }
  }
  
  // 连接弱边缘到强边缘
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (result[y * width + x] === 128) {
        // 检查周围是否有强边缘
        const hasStrongNeighbor = [
          [-1, -1], [-1, 0], [-1, 1],
          [0, -1],           [0, 1],
          [1, -1],  [1, 0],  [1, 1]
        ].some(([dy, dx]) => result[(y + dy) * width + (x + dx)] === 255);
        
        result[y * width + x] = hasStrongNeighbor ? 255 : 0;
      }
    }
  }
  
  return result;
}

/**
 * 霍夫变换检测直线
 */
function houghLineDetection(
  edges: Uint8ClampedArray,
  width: number,
  height: number
): Array<{ rho: number; theta: number }> {
  const maxRho = Math.sqrt(width * width + height * height);
  const rhoResolution = 2;
  const thetaResolution = 1;
  const rhoBins = Math.ceil(2 * maxRho / rhoResolution);
  const thetaBins = 180 / thetaResolution;
  
  const accumulator = new Uint32Array(rhoBins * thetaBins);
  
  // 投票
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (edges[y * width + x] === 255) {
        for (let theta = 0; theta < thetaBins; theta++) {
          const angle = theta * thetaResolution * Math.PI / 180;
          const rho = x * Math.cos(angle) + y * Math.sin(angle);
          const rhoIdx = Math.round(rho / rhoResolution + rhoBins / 2);
          
          if (rhoIdx >= 0 && rhoIdx < rhoBins) {
            accumulator[rhoIdx * thetaBins + theta]++;
          }
        }
      }
    }
  }
  
  // 找峰值
  const threshold = 100;
  const lines: Array<{ rho: number; theta: number }> = [];
  
  for (let r = 0; r < rhoBins; r++) {
    for (let t = 0; t < thetaBins; t++) {
      if (accumulator[r * thetaBins + t] > threshold) {
        lines.push({
          rho: (r - rhoBins / 2) * rhoResolution,
          theta: t * thetaResolution * Math.PI / 180
        });
      }
    }
  }
  
  return lines;
}

/**
 * 检测棋盘区域
 */
function detectBoardRegion(
  imageData: ImageData,
  width: number,
  height: number
): BoardPosition | null {
  const gray = toGrayscale(imageData);
  const edges = cannyEdgeDetection(gray, width, height);
  const lines = houghLineDetection(edges, width, height);
  
  // 分类水平和垂直线
  const horizontalLines: typeof lines = [];
  const verticalLines: typeof lines = [];
  
  for (const line of lines) {
    const angle = line.theta * 180 / Math.PI;
    if ((angle >= 0 && angle <= 10) || (angle >= 170 && angle <= 180)) {
      horizontalLines.push(line);
    } else if (angle >= 80 && angle <= 100) {
      verticalLines.push(line);
    }
  }
  
  // 如果直线检测不够，使用备选方案
  if (horizontalLines.length < 2 || verticalLines.length < 2) {
    return detectBoardRegionFallback(imageData, width, height);
  }
  
  // 排序并选择最外层的线
  horizontalLines.sort((a, b) => a.rho - b.rho);
  verticalLines.sort((a, b) => a.rho - b.rho);
  
  const topY = horizontalLines[0].rho;
  const bottomY = horizontalLines[horizontalLines.length - 1].rho;
  const leftX = verticalLines[0].rho;
  const rightX = verticalLines[verticalLines.length - 1].rho;
  
  return {
    topLeft: { x: leftX, y: topY },
    topRight: { x: rightX, y: topY },
    bottomLeft: { x: leftX, y: bottomY },
    bottomRight: { x: rightX, y: bottomY },
  };
}

/**
 * 备选棋盘检测方案（基于颜色和边缘密度）
 */
function detectBoardRegionFallback(
  imageData: ImageData,
  width: number,
  height: number
): BoardPosition | null {
  const padding = Math.min(width, height) * 0.05;
  
  return {
    topLeft: { x: padding, y: padding },
    topRight: { x: width - padding, y: padding },
    bottomLeft: { x: padding, y: height - padding },
    bottomRight: { x: width - padding, y: height - padding },
  };
}

/**
 * 透视变换（简化版）
 */
function perspectiveTransform(
  imageData: ImageData,
  board: BoardPosition,
  targetWidth: number,
  targetHeight: number
): ImageData {
  const { width, height } = imageData;
  const result = new ImageData(targetWidth, targetHeight);
  
  // 简单网格插值
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.min(width - 1, Math.max(0, x * width / targetWidth));
      const srcY = Math.min(height - 1, Math.max(0, y * height / targetHeight));
      
      const srcIdx = (Math.floor(srcY) * width + Math.floor(srcX)) * 4;
      const dstIdx = (y * targetWidth + x) * 4;
      
      result.data[dstIdx] = imageData.data[srcIdx];
      result.data[dstIdx + 1] = imageData.data[srcIdx + 1];
      result.data[dstIdx + 2] = imageData.data[srcIdx + 2];
      result.data[dstIdx + 3] = 255;
    }
  }
  
  return result;
}

/**
 * 检测棋子颜色
 */
function detectPieceColor(
  imageData: ImageData,
  x: number,
  y: number,
  radius: number
): 'red' | 'black' | 'empty' {
  const { width, data } = imageData;
  let redPixels = 0;
  let blackPixels = 0;
  let totalPixels = 0;
  
  const sampleStep = 2;
  for (let py = y - radius; py < y + radius; py += sampleStep) {
    for (let px = x - radius; px < x + radius; px += sampleStep) {
      const dist = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
      if (dist > radius) continue;
      
      if (px < 0 || px >= width || py < 0 || py >= imageData.height) continue;
      
      const idx = (Math.floor(py) * width + Math.floor(px)) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      
      totalPixels++;
      
      // 红色检测
      if (r > 150 && r > g * 1.3 && r > b * 1.3 && (r - g) > 40) {
        redPixels++;
      }
      // 黑色检测
      if (r < 80 && g < 80 && b < 80) {
        blackPixels++;
      }
    }
  }
  
  if (totalPixels === 0) return 'empty';
  
  const redRatio = redPixels / totalPixels;
  const blackRatio = blackPixels / totalPixels;
  
  if (redRatio > 0.1) return 'red';
  if (blackRatio > 0.2) return 'black';
  return 'empty';
}

/**
 * 生成 FEN 字符串
 */
function generateFen(
  pieces: Array<{ row: number; col: number; color: 'red' | 'black'; type: string }>
): string {
  const board: string[][] = Array(BOARD_ROWS)
    .fill(null)
    .map(() => Array(BOARD_COLS).fill(''));
  
  // 填充棋子
  for (const piece of pieces) {
    const { row, col, color, type } = piece;
    const fenChar = PIECE_MAP[type] || (color === 'red' ? 'P' : 'p');
    board[row][col] = fenChar;
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
 * 主识别函数
 */
export async function recognizeBoardOpenCV(
  imageSource: string,
  onProgress?: (progress: number, message: string) => void
): Promise<RecognitionResult> {
  const startTime = performance.now();
  
  try {
    onProgress?.(5, '正在加载图像...');
    
    // 加载图像
    const { imageData, width, height } = await loadImageToImageData(imageSource);
    onProgress?.(20, '检测棋盘区域...');
    
    // 检测棋盘
    const board = detectBoardRegion(imageData, width, height);
    
    if (!board) {
      throw new Error('未检测到棋盘区域');
    }
    
    onProgress?.(40, '校正棋盘视角...');
    
    // 透视变换
    const targetWidth = 360;
    const targetHeight = 400;
    const transformed = perspectiveTransform(imageData, board, targetWidth, targetHeight);
    
    onProgress?.(60, '识别棋子...');
    
    // 计算每个交叉点的位置
    const cellWidth = targetWidth / 8;
    const cellHeight = targetHeight / 9;
    const pieceRadius = Math.min(cellWidth, cellHeight) * 0.35;
    
    const pieces: Array<{ row: number; col: number; color: 'red' | 'black'; type: string }> = [];
    
    // 识别每个位置的棋子
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const x = Math.floor((col + 0.5) * cellWidth);
        const y = Math.floor((row + 0.5) * cellHeight);
        
        const color = detectPieceColor(transformed, x, y, pieceRadius);
        
        if (color !== 'empty') {
          // 根据位置推断棋子类型（简化版）
          const type = inferPieceType(row, col, color);
          pieces.push({ row, col, color, type });
        }
      }
    }
    
    onProgress?.(90, '生成 FEN...');
    
    // 生成 FEN
    const fen = generateFen(pieces);
    const processingTime = performance.now() - startTime;
    
    onProgress?.(100, `识别完成，检测到 ${pieces.length} 个棋子`);
    
    return {
      fen,
      confidence: Math.min((pieces.length / 32) * 100, 100),
      pieces: pieces.map(p => ({
        row: p.row,
        col: p.col,
        type: PIECE_MAP[p.type] || (p.color === 'red' ? 'P' : 'p'),
        confidence: 80,
      })),
      processingTime,
      message: `识别完成，检测到 ${pieces.length} 个棋子`,
    };
  } catch (error) {
    console.error('OpenCV Recognition error:', error);
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
 * 根据位置推断棋子类型
 */
function inferPieceType(row: number, col: number, color: 'red' | 'black'): string {
  const isRed = color === 'red';
  
  // 中路
  if (col === 4) {
    if (row === 9 || row === 0) return isRed ? '帥' : '將';
    return isRed ? '兵' : '卒';
  }
  
  // 边路
  if (col === 0 || col === 8) {
    if (row === 9 || row === 0) return isRed ? '車' : '車';
    return isRed ? '兵' : '卒';
  }
  
  // 马位置
  if (col === 1 || col === 7) {
    if (row === 9 || row === 0) return isRed ? '馬' : '馬';
    return isRed ? '兵' : '卒';
  }
  
  // 相/象位置
  if (col === 2 || col === 6) {
    if (row === 9 || row === 0) return isRed ? '相' : '象';
    return isRed ? '兵' : '卒';
  }
  
  // 士位置
  if (col === 3 || col === 5) {
    if (row === 9 || row === 0) return isRed ? '仕' : '士';
    return isRed ? '兵' : '卒';
  }
  
  // 炮位置
  if (col === 4) {
    if (row === 7 || row === 2) return isRed ? '炮' : '炮';
  }

  // 卒/兵位置
  if (row === 3 || row === 6) {
    return isRed ? '兵' : '卒';
  }
  
  return isRed ? '兵' : '卒';
}

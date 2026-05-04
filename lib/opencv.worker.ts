/**
 * OpenCV 识别 Web Worker
 * 使用纯 Canvas API 实现 OpenCV 的图像处理功能
 */

const BOARD_ROWS = 10;
const BOARD_COLS = 9;

interface WorkerMessage {
  type: 'process';
  imageData: ImageData;
  width: number;
  height: number;
}

interface WorkerResult {
  type: 'result' | 'progress' | 'error';
  pieces?: Array<{ row: number; col: number; type: string; color: string; confidence: number }>;
  progress?: number;
  message?: string;
  error?: string;
  fen?: string;
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

/**
 * 灰度转换
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
  const sigma = kernelSize / 6;
  const half = Math.floor(kernelSize / 2);
  const result = new Uint8ClampedArray(width * height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      
      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const px = Math.min(Math.max(x + kx, 0), width - 1);
          const py = Math.min(Math.max(y + ky, 0), height - 1);
          const weight = Math.exp(-(kx * kx + ky * ky) / (2 * sigma * sigma));
          sum += gray[py * width + px] * weight;
        }
      }
      
      result[y * width + x] = Math.round(sum);
    }
  }
  
  return result;
}

/**
 * Canny 边缘检测
 */
function cannyEdgeDetection(gray: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  // 1. 高斯模糊
  const blurred = gaussianBlur(gray, width, height, 5);
  
  // 2. Sobel 梯度
  const gradientMagnitude = new Uint8ClampedArray(width * height);
  const gradientDirection = new Float32Array(width * height);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const gx = 
        -blurred[y * width + x - 1] + blurred[y * width + x + 1] +
        -2 * blurred[(y - 1) * width + x - 1] + 2 * blurred[(y - 1) * width + x + 1] +
        -blurred[(y + 1) * width + x - 1] + blurred[(y + 1) * width + x + 1];
      const gy = 
        -blurred[(y - 1) * width + x] + blurred[(y + 1) * width + x] +
        -2 * blurred[(y - 1) * width + x - 1] + 2 * blurred[(y + 1) * width + x - 1] +
        -blurred[(y - 1) * width + x + 1] + blurred[(y + 1) * width + x + 1];
      
      gradientMagnitude[y * width + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
      gradientDirection[y * width + x] = Math.atan2(gy, gx);
    }
  }
  
  // 3. 非极大值抑制
  const suppressed = new Uint8ClampedArray(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const angle = gradientDirection[idx];
      const mag = gradientMagnitude[idx];
      
      let q = 0, r = 0;
      const deg = angle * 180 / Math.PI;
      
      if ((deg >= -22.5 && deg < 22.5) || deg <= -157.5 || deg >= 157.5) {
        q = gradientMagnitude[idx + 1];
        r = gradientMagnitude[idx - 1];
      } else if ((deg >= 22.5 && deg < 67.5) || (deg <= -112.5 && deg >= -157.5)) {
        q = gradientMagnitude[(y - 1) * width + x + 1];
        r = gradientMagnitude[(y + 1) * width + x - 1];
      } else if ((deg >= 67.5 && deg < 112.5) || (deg <= -67.5 && deg >= -112.5)) {
        q = gradientMagnitude[(y - 1) * width + x];
        r = gradientMagnitude[(y + 1) * width + x];
      } else {
        q = gradientMagnitude[(y - 1) * width + x - 1];
        r = gradientMagnitude[(y + 1) * width + x + 1];
      }
      
      suppressed[idx] = (mag >= q && mag >= r) ? mag : 0;
    }
  }
  
  // 4. 双阈值
  const result = new Uint8ClampedArray(width * height);
  const low = 50, high = 150;
  
  for (let i = 0; i < suppressed.length; i++) {
    if (suppressed[i] >= high) result[i] = 255;
    else if (suppressed[i] >= low) result[i] = 128;
  }
  
  // 边缘连接
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (result[y * width + x] === 128) {
        const hasStrong = 
          result[(y-1)*width+x-1] === 255 || result[(y-1)*width+x] === 255 || result[(y-1)*width+x+1] === 255 ||
          result[y*width+x-1] === 255 ||                                     result[y*width+x+1] === 255 ||
          result[(y+1)*width+x-1] === 255 || result[(y+1)*width+x] === 255 || result[(y+1)*width+x+1] === 255;
        result[y * width + x] = hasStrong ? 255 : 0;
      }
    }
  }
  
  return result;
}

/**
 * 霍夫变换检测直线
 */
function houghLines(edges: Uint8ClampedArray, width: number, height: number) {
  const maxRho = Math.sqrt(width * width + height * height);
  const rhoRes = 2;
  const thetaBins = 180;
  const rhoBins = Math.ceil(2 * maxRho / rhoRes);
  const acc = new Uint32Array(rhoBins * thetaBins);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (edges[y * width + x] === 255) {
        for (let t = 0; t < thetaBins; t++) {
          const theta = t * Math.PI / 180;
          const rho = x * Math.cos(theta) + y * Math.sin(theta);
          const ri = Math.round(rho / rhoRes + rhoBins / 2);
          if (ri >= 0 && ri < rhoBins) acc[ri * thetaBins + t]++;
        }
      }
    }
  }
  
  const lines: Array<{ rho: number; theta: number; votes: number }> = [];
  for (let r = 0; r < rhoBins; r++) {
    for (let t = 0; t < thetaBins; t++) {
      if (acc[r * thetaBins + t] > 80) {
        lines.push({
          rho: (r - rhoBins / 2) * rhoRes,
          theta: t * Math.PI / 180,
          votes: acc[r * thetaBins + t]
        });
      }
    }
  }
  
  return lines;
}

/**
 * 检测棋盘区域
 */
function detectBoard(imageData: ImageData, width: number, height: number) {
  self.postMessage({ type: 'progress', progress: 25, message: '检测棋盘边缘...' } as WorkerResult);
  
  const gray = toGrayscale(imageData);
  const edges = cannyEdgeDetection(gray, width, height);
  const lines = houghLines(edges, width, height);
  
  // 分类水平和垂直线
  const hLines: typeof lines = [];
  const vLines: typeof lines = [];
  
  for (const line of lines) {
    const deg = line.theta * 180 / Math.PI;
    if ((deg >= 0 && deg <= 10) || (deg >= 170 && deg <= 180)) hLines.push(line);
    else if (deg >= 80 && deg <= 100) vLines.push(line);
  }
  
  // 按 rho 排序找边界
  hLines.sort((a, b) => a.rho - b.rho);
  vLines.sort((a, b) => a.rho - b.rho);
  
  if (hLines.length < 2 || vLines.length < 2) {
    // 使用默认值
    const pad = Math.min(width, height) * 0.08;
    return { x: pad, y: pad, w: width - pad * 2, h: height - pad * 2 };
  }
  
  return {
    x: Math.max(0, vLines[0].rho - 20),
    y: Math.max(0, hLines[0].rho - 20),
    w: Math.min(width, vLines[vLines.length - 1].rho - vLines[0].rho + 40),
    h: Math.min(height, hLines[hLines.length - 1].rho - hLines[0].rho + 40),
  };
}

/**
 * 检测棋子颜色
 */
function detectColor(imageData: ImageData, x: number, y: number, radius: number): { hasPiece: boolean; isRed: boolean; confidence: number } {
  const { width, data } = imageData;
  let red = 0, black = 0, total = 0;
  
  for (let py = Math.max(0, y - radius); py < Math.min(imageData.height, y + radius); py += 2) {
    for (let px = Math.max(0, x - radius); px < Math.min(width, x + radius); px += 2) {
      const dist = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
      if (dist > radius) continue;
      
      const idx = (py * width + px) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      total++;
      
      if (r > 150 && r > g * 1.3 && r > b * 1.3 && (r - g) > 40) red++;
      if (r < 80 && g < 80 && b < 80) black++;
    }
  }
  
  if (total === 0) return { hasPiece: false, isRed: true, confidence: 0 };
  
  const redR = red / total, blackR = black / total;
  const hasPiece = redR > 0.08 || blackR > 0.15;
  
  return { hasPiece, isRed: redR > blackR, confidence: Math.max(redR, blackR) * 2 };
}

/**
 * 根据位置推断棋子类型
 */
function inferType(row: number, col: number, isRed: boolean): string {
  if (col === 4) return isRed ? (row === 9 ? '帅' : '兵') : (row === 0 ? '将' : '卒');
  if (col === 0 || col === 8) return isRed ? (row === 9 ? '车' : '兵') : (row === 0 ? '车' : '卒');
  if (col === 1 || col === 7) return isRed ? (row === 9 ? '马' : '兵') : (row === 0 ? '马' : '卒');
  if (col === 2 || col === 6) return isRed ? (row === 9 ? '相' : '兵') : (row === 0 ? '象' : '卒');
  if (col === 3 || col === 5) return isRed ? (row === 9 ? '仕' : '兵') : (row === 0 ? '士' : '卒');
  if (col === 4 && (row === 7 || row === 2)) return '炮';
  return isRed ? '兵' : '卒';
}

/**
 * 生成 FEN
 */
function toFen(pieces: Array<{ row: number; col: number; color: string; type: string }>): string {
  const board: string[][] = Array(BOARD_ROWS).fill(null).map(() => Array(BOARD_COLS).fill(''));
  
  for (const p of pieces) {
    const r = p.row;
    const fen = PIECE_MAP[p.type] || (p.color === 'red' ? 'P' : 'p');
    if (board[r][p.col] === '') board[r][p.col] = fen;
  }
  
  return board.map(row => {
    let s = '', empty = 0;
    for (const p of row) {
      if (p === '') empty++;
      else { if (empty) { s += empty; empty = 0; } s += p; }
    }
    return s + (empty ? empty : '');
  }).join('/') + ' w - - 0 1';
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type !== 'process') return;
  
  const { imageData, width, height } = e.data;
  const pieces: Array<{ row: number; col: number; color: string; type: string; confidence: number }> = [];
  
  try {
    // 检测棋盘区域
    const board = detectBoard(imageData, width, height);
    self.postMessage({ type: 'progress', progress: 40, message: '正在分析交叉点...' } as WorkerResult);
    
    // 计算每个交叉点
    const cellW = board.w / 8;
    const cellH = board.h / 9;
    const radius = Math.min(cellW, cellH) * 0.35;
    
    // 提取棋盘区域
    const canvas = new OffscreenCanvas(board.w, board.h);
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imageData, -board.x, -board.y);
    const boardImageData = ctx.getImageData(0, 0, board.w, board.h);
    
    self.postMessage({ type: 'progress', progress: 50, message: '识别棋子...' } as WorkerResult);
    
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const x = Math.floor((col + 0.5) * cellW);
        const y = Math.floor((row + 0.5) * cellH);
        
        const colorInfo = detectColor(boardImageData, x, y, radius);
        
        if (colorInfo.hasPiece) {
          const type = inferType(row, col, colorInfo.isRed);
          pieces.push({
            row, col,
            color: colorInfo.isRed ? 'red' : 'black',
            type,
            confidence: colorInfo.confidence
          });
        }
      }
      
      const progress = 50 + Math.floor((row / BOARD_ROWS) * 40);
      self.postMessage({ type: 'progress', progress, message: `扫描行 ${row + 1}/${BOARD_ROWS}...` } as WorkerResult);
    }
    
    const fen = toFen(pieces);
    
    self.postMessage({
      type: 'result',
      pieces,
      fen,
      message: `识别完成，检测到 ${pieces.length} 个棋子`
    } as WorkerResult);
    
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    } as WorkerResult);
  }
};

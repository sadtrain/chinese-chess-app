/**
 * 棋盘识别 Web Worker
 * 使用 Tesseract.js 进行 OCR 识别
 */

import Tesseract from 'tesseract.js';

const BOARD_ROWS = 10;
const BOARD_COLS = 9;

// 棋子字符到 FEN 的映射
const PIECE_MAP: Record<string, string> = {
  '帅': 'K', '帥': 'K', '將': 'k', '将': 'k',
  '車': 'R', '车': 'R',
  '馬': 'N', '马': 'N',
  '相': 'B', '象': 'b', 'bishop': 'b',
  '仕': 'A', '士': 'a',
  '炮': 'C', '砲': 'C',
  '兵': 'P', '卒': 'p',
};

interface WorkerMessage {
  type: 'process';
  imageData: ImageData;
  width: number;
  height: number;
}

interface WorkerResult {
  type: 'result' | 'progress' | 'error';
  pieces?: Array<{ row: number; col: number; type: string; confidence: number; color: string }>;
  progress?: number;
  message?: string;
  error?: string;
}

let recognizer: Tesseract.Worker | null = null;

/**
 * 初始化 Tesseract recognizer
 */
async function initRecognizer(): Promise<Tesseract.Worker> {
  if (recognizer) return recognizer;

  self.postMessage({ type: 'progress', progress: 5, message: '加载 OCR 引擎...' } as WorkerResult);

  recognizer = await Tesseract.createWorker('eng+chi_sim', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        self.postMessage({
          type: 'progress',
          progress: 5 + Math.floor(m.progress * 10),
          message: '加载 OCR 引擎...',
        } as WorkerResult);
      }
    },
  });

  return recognizer;
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  try {
    if (e.data.type === 'process') {
      await processImage(e.data);
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    } as WorkerResult);
  }
};

async function processImage(msg: WorkerMessage) {
  const { imageData, width, height } = msg;
  const pieces: Array<{ row: number; col: number; type: string; confidence: number; color: string }> = [];

  self.postMessage({ type: 'progress', progress: 15, message: '检测棋盘区域...' } as WorkerResult);

  const boardRegion = detectBoardRegion(imageData, width, height);

  if (!boardRegion) {
    self.postMessage({
      type: 'error',
      error: '未检测到棋盘区域',
    } as WorkerResult);
    return;
  }

  self.postMessage({ type: 'progress', progress: 25, message: '扫描交叉点...' } as WorkerResult);

  const intersections = getIntersections(boardRegion);

  self.postMessage({ type: 'progress', progress: 30, message: '准备 OCR 识别...' } as WorkerResult);

  const ocr = await initRecognizer();

  self.postMessage({ type: 'progress', progress: 35, message: '开始识别棋子...' } as WorkerResult);

  // 分批处理，每批 5 个
  const batchSize = 5;
  for (let batch = 0; batch < intersections.length; batch += batchSize) {
    const batchEnd = Math.min(batch + batchSize, intersections.length);

    for (let i = batch; i < batchEnd; i++) {
      const { row, col, x, y } = intersections[i];

      // 先检测颜色
      const colorInfo = detectPieceColor(imageData, width, height, x, y, boardRegion);

      if (colorInfo.hasPiece) {
        // 提取棋子区域用于 OCR
        const pieceImage = extractPieceRegion(imageData, width, height, x, y, boardRegion);

        // 用 Tesseract 识别字符
        const charResult = await recognizeCharacter(ocr, pieceImage, colorInfo.isRed);
        const fenChar = mapCharToFen(charResult.text, colorInfo.isRed);

        pieces.push({
          row,
          col,
          type: fenChar,
          confidence: colorInfo.confidence * (charResult.confidence / 100),
          color: colorInfo.isRed ? 'red' : 'black',
        });
      }
    }

    const progress = 35 + Math.floor((batchEnd / intersections.length) * 55);
    self.postMessage({
      type: 'progress',
      progress,
      message: `识别棋子 ${batchEnd}/${intersections.length}...`,
    } as WorkerResult);

    await sleep(10);
  }

  self.postMessage({
    type: 'result',
    pieces,
    message: `识别完成，检测到 ${pieces.length} 个棋子`,
  } as WorkerResult);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 检测棋盘区域
 */
function detectBoardRegion(
  imageData: ImageData,
  width: number,
  height: number
): { x: number; y: number; w: number; h: number } | null {
  const data = imageData.data;
  const hEdges = new Int32Array(height);
  const vEdges = new Int32Array(width);

  const blockHeight = 4;
  const blockWidth = 4;

  // 水平边缘
  for (let y = 0; y < height - 1; y += blockHeight) {
    for (let x = 0; x < width; x += blockWidth) {
      const yEnd = Math.min(y + blockHeight, height);
      let maxDiff = 0;

      for (let by = y; by < yEnd; by++) {
        const idx1 = (by * width + x) * 4;
        const idx2 = ((by + 1) * width + x) * 4;
        const diff = Math.abs(data[idx1] - data[idx2]) +
                     Math.abs(data[idx1 + 1] - data[idx2 + 1]) +
                     Math.abs(data[idx1 + 2] - data[idx2 + 2]);
        if (diff > maxDiff) maxDiff = diff;
      }

      if (maxDiff > 30) {
        for (let by = y; by < yEnd; by++) hEdges[by]++;
      }
    }
  }

  // 垂直边缘
  for (let y = 0; y < height; y += blockHeight) {
    for (let x = 0; x < width - 1; x += blockWidth) {
      const yEnd = Math.min(y + blockHeight, height);
      let maxDiff = 0;

      for (let by = y; by < yEnd; by++) {
        for (let bx = x; bx < Math.min(x + blockWidth, width - 1); bx++) {
          const idx1 = (by * width + bx) * 4;
          const idx2 = (by * width + bx + 1) * 4;
          const diff = Math.abs(data[idx1] - data[idx2]) +
                       Math.abs(data[idx1 + 1] - data[idx2 + 1]) +
                       Math.abs(data[idx1 + 2] - data[idx2 + 2]);
          if (diff > maxDiff) maxDiff = diff;
        }
      }

      if (maxDiff > 30) {
        for (let bx = x; bx < Math.min(x + blockWidth, width - 1); bx++) vEdges[bx]++;
      }
    }
  }

  let minY = 0, maxY = height - 1;
  let minX = 0, maxX = width - 1;
  const thresholdH = width * 0.08;
  const thresholdV = height * 0.08;

  for (let i = 0; i < height * 0.4; i++) {
    if (hEdges[i] > thresholdH) minY = i;
  }
  for (let i = height - 1; i > height * 0.6; i--) {
    if (hEdges[i] > thresholdH) maxY = i;
  }
  for (let i = 0; i < width * 0.4; i++) {
    if (vEdges[i] > thresholdV) minX = i;
  }
  for (let i = width - 1; i > width * 0.6; i--) {
    if (vEdges[i] > thresholdV) maxX = i;
  }

  const boardWidth = maxX - minX;
  const boardHeight = maxY - minY;

  if (boardWidth < 200 || boardHeight < 200) {
    const padding = 0.1;
    return {
      x: Math.floor(width * padding),
      y: Math.floor(height * padding),
      w: Math.floor(width * (1 - padding * 2)),
      h: Math.floor(height * (1 - padding * 2)),
    };
  }

  return {
    x: Math.max(0, minX - 20),
    y: Math.max(0, minY - 20),
    w: Math.min(width, boardWidth + 40),
    h: Math.min(height, boardHeight + 40),
  };
}

/**
 * 获取交叉点
 */
function getIntersections(region: { x: number; y: number; w: number; h: number }) {
  const intersections: Array<{ row: number; col: number; x: number; y: number }> = [];
  const cellWidth = region.w / 8;
  const cellHeight = region.h / 9;

  for (let row = 0; row < BOARD_ROWS; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      intersections.push({
        row,
        col,
        x: Math.floor(region.x + (col + 0.5) * cellWidth),
        y: Math.floor(region.y + (row + 0.5) * cellHeight),
      });
    }
  }

  return intersections;
}

/**
 * 检测棋子颜色
 */
function detectPieceColor(
  imageData: ImageData,
  width: number,
  height: number,
  x: number,
  y: number,
  region: { x: number; y: number; w: number; h: number }
): { hasPiece: boolean; isRed: boolean; confidence: number } {
  const cellWidth = region.w / 8;
  const cellHeight = region.h / 9;
  const pieceRadius = Math.min(cellWidth, cellHeight) * 0.4;
  const extractSize = Math.floor(pieceRadius * 2.5);

  // 棋子区域中心坐标
  const centerX = Math.floor(x);
  const centerY = Math.floor(y);
  const radius = Math.floor(pieceRadius * 0.8);

  const data = imageData.data;

  let redPixels = 0;
  let blackPixels = 0;
  let totalPixels = 0;

  const sampleStep = 2;
  for (let py = centerY - radius; py < centerY + radius; py += sampleStep) {
    for (let px = centerX - radius; px < centerX + radius; px += sampleStep) {
      const dist = Math.sqrt((px - centerX) ** 2 + (py - centerY) ** 2);
      if (dist > radius) continue;

      if (px < 0 || px >= width || py < 0 || py >= height) continue;

      const idx = (py * width + px) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      if (r > 150 && r > g * 1.4 && r > b * 1.4 && (r - g) > 50) {
        redPixels++;
      }
      if (r < 90 && g < 90 && b < 90 && (r + g + b) < 200) {
        blackPixels++;
      }
      totalPixels++;
    }
  }

  if (totalPixels === 0) return { hasPiece: false, isRed: true, confidence: 0 };

  const redRatio = redPixels / totalPixels;
  const blackRatio = blackPixels / totalPixels;

  const hasPiece = redRatio > 0.15 || blackRatio > 0.25;
  if (!hasPiece) return { hasPiece: false, isRed: true, confidence: 0 };

  return {
    hasPiece: true,
    isRed: redRatio > blackRatio,
    confidence: Math.max(redRatio, blackRatio) * 2,
  };
}

/**
 * 提取棋子区域图像
 */
function extractPieceRegion(
  imageData: ImageData,
  width: number,
  height: number,
  x: number,
  y: number,
  region: { x: number; y: number; w: number; h: number }
): ImageData {
  const cellWidth = region.w / 8;
  const cellHeight = region.h / 9;
  const pieceRadius = Math.min(cellWidth, cellHeight) * 0.4;
  const extractSize = Math.floor(pieceRadius * 2.5);

  const sx = Math.max(0, Math.floor(x - extractSize / 2));
  const sy = Math.max(0, Math.floor(y - extractSize / 2));

  // 修正边界，确保不超出图像范围
  const actualSx = Math.min(sx, width - extractSize);
  const actualSy = Math.min(sy, height - extractSize);
  const actualSize = Math.min(extractSize, width - actualSx, height - actualSy);

  // 创建 80x80 的图像
  const canvas = new OffscreenCanvas(80, 80);
  const ctx = canvas.getContext('2d')!;

  // 填充背景色
  ctx.fillStyle = '#DEB887';
  ctx.fillRect(0, 0, 80, 80);

  // 创建临时画布用于提取区域
  const tempCanvas = new OffscreenCanvas(width, height);
  const tempCtx = tempCanvas.getContext('2d')!;
  tempCtx.putImageData(imageData, 0, 0);

  // 绘制棋子区域到目标画布
  ctx.drawImage(
    tempCanvas,
    actualSx, actualSy, actualSize, actualSize,
    5, 5, 70, 70
  );

  return ctx.getImageData(0, 0, 80, 80);
}

/**
 * 使用 Tesseract 识别字符
 */
async function recognizeCharacter(
  ocr: Tesseract.Worker,
  imageData: ImageData,
  isRed: boolean
): Promise<{ text: string; confidence: number }> {
  try {
    // 转换为 base64
    const canvas = new OffscreenCanvas(imageData.width, imageData.height);
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imageData, 0, 0);

    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const reader = new FileReaderSync ? self : null;

    // 直接用 canvas 转 base64
    const dataUrl = await canvasToDataUrl(canvas);

    const result = await ocr.recognize(dataUrl);
    const text = result.data.text.trim();

    return {
      text,
      confidence: result.data.confidence,
    };
  } catch (error) {
    console.error('OCR error:', error);
    return { text: '', confidence: 0 };
  }
}

/**
 * Canvas 转 DataURL
 */
function canvasToDataUrl(canvas: OffscreenCanvas): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.convertToBlob({ type: 'image/png' }).then(blob => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }).catch(reject);
  });
}

/**
 * 映射识别字符到 FEN
 */
function mapCharToFen(text: string, isRed: boolean): string {
  const trimmed = text.replace(/\s/g, '');

  // 精确匹配
  if (PIECE_MAP[trimmed]) {
    return PIECE_MAP[trimmed];
  }

  // 模糊匹配
  const char = trimmed[0];
  if (char) {
    // 红方
    if (isRed) {
      if (['帅', '帥'].includes(char)) return 'K';
      if (['車', '车'].includes(char)) return 'R';
      if (['馬', '马'].includes(char)) return 'N';
      if (['相'].includes(char)) return 'B';
      if (['仕', '士'].includes(char)) return 'A';
      if (['炮', '砲'].includes(char)) return 'C';
      if (['兵'].includes(char)) return 'P';
    } else {
      // 黑方
      if (['將', '将'].includes(char)) return 'k';
      if (['車', '车'].includes(char)) return 'r';
      if (['馬', '马'].includes(char)) return 'n';
      if (['象'].includes(char)) return 'b';
      if (['士', '仕'].includes(char)) return 'a';
      if (['炮', '砲'].includes(char)) return 'c';
      if (['卒'].includes(char)) return 'p';
    }
  }

  // 默认值
  return isRed ? 'P' : 'p';
}

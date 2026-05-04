// Chinese Chess (Xiangqi) Engine Wrapper using Stockfish WASM
// This provides engine analysis for Chinese chess positions

export interface EngineAnalysis {
  bestMove: string | null;
  evaluation: number;
  depth: number;
  pv: string[];
  nodes: number;
  time: number;
  variations: EngineVariation[];
}

export interface EngineVariation {
  moves: string[];
  evaluation: number;
  depth: number;
}

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'analyzing' | 'error';

export type MessageHandler = (message: string) => void;

class ChessEngine {
  private worker: Worker | null = null;
  private status: EngineStatus = 'idle';
  private currentFen: string = '';
  private statusListeners: ((status: EngineStatus, depth?: number) => void)[] = [];
  private analysisListeners: ((analysis: EngineAnalysis) => void)[] = [];
  private onReadyCallbacks: (() => void)[] = [];
  private isXiangqi: boolean = true;
  private currentDepth: number = 0;

  constructor() {
    this.init();
  }

  private async init() {
    try {
      this.setStatus('loading');
      await this.loadEngine();
    } catch (error) {
      console.error('Failed to initialize engine:', error);
      this.setStatus('error');
    }
  }

  private async loadEngine(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // 优先使用本地文件（解决 CORS 问题）
        this.worker = new Worker('/stockfish.js');

        let readyCount = 0;
        let timeout = setTimeout(() => {
          reject(new Error('引擎初始化超时'));
        }, 30000);

        const readyHandler = (e: MessageEvent) => {
          const msg = e.data;
          if (msg === 'uciok' || msg === 'readyok') {
            readyCount++;
            if (readyCount >= 2 || msg === 'readyok') {
              this.worker?.removeEventListener('message', readyHandler);
              this.setStatus('ready');
              this.onReadyCallbacks.forEach(cb => cb());
              resolve();
            }
          }
        };

        this.worker.addEventListener('message', readyHandler);
        this.worker.addEventListener('message', this.handleMessage.bind(this));

        // Initialize UCI
        this.worker.postMessage('uci');
        
        // 5秒后自动继续（如果还没 ready）
        setTimeout(() => {
          clearTimeout(timeout);
          if (this.status === 'loading') {
            readyCount = 2;
            this.setStatus('ready');
            this.onReadyCallbacks.forEach(cb => cb());
            resolve();
          }
        }, 5000);
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(e: MessageEvent) {
    const line = e.data;
    if (!line || typeof line !== 'string') return;

    // Parse UCI info lines
    if (line.startsWith('info depth')) {
      this.parseInfoLine(line);
    }

    // Best move
    if (line.startsWith('bestmove')) {
      const parts = line.split(' ');
      const bestMove = parts[1] || null;
      this.setStatus('ready');
      this.emitAnalysis({
        bestMove,
        evaluation: this.lastEvaluation || 0,
        depth: this.currentDepth,
        pv: this.lastPv,
        nodes: this.lastNodes || 0,
        time: this.lastTime || 0,
        variations: this.lastVariations,
      });
    }
  }

  private lastEvaluation: number = 0;
  private lastPv: string[] = [];
  private lastNodes: number = 0;
  private lastTime: number = 0;
  private lastVariations: EngineVariation[] = [];

  private parseInfoLine(line: string) {
    const parts = line.split(' ');
    let depth = 0;
    let score = 0;
    let pv: string[] = [];
    let nodes = 0;
    let time = 0;
    let multipv = 1;
    let isMate = false;

    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === 'depth') depth = parseInt(parts[i + 1]) || 0;
      if (parts[i] === 'multipv') multipv = parseInt(parts[i + 1]) || 1;
      if (parts[i] === 'score') {
        if (parts[i + 1] === 'cp') {
          score = (parseInt(parts[i + 2]) || 0) / 100;
        } else if (parts[i + 1] === 'mate') {
          isMate = true;
          score = parseInt(parts[i + 2]) || 0;
        }
      }
      if (parts[i] === 'nodes') nodes = parseInt(parts[i + 1]) || 0;
      if (parts[i] === 'time') time = parseInt(parts[i + 1]) || 0;
      if (parts[i] === 'pv') {
        pv = parts.slice(i + 1);
      }
    }

    this.currentDepth = depth;
    this.lastEvaluation = score;
    this.lastNodes = nodes;
    this.lastTime = time;
    
    if (multipv === 1 && pv.length > 0) {
      this.lastPv = pv;
    }

    this.setStatus('analyzing', depth);
  }

  private setStatus(status: EngineStatus, depth?: number) {
    this.status = status;
    this.statusListeners.forEach(cb => cb(status, depth));
  }

  onStatusChange(callback: (status: EngineStatus, depth?: number) => void) {
    this.statusListeners.push(callback);
  }

  onAnalysis(callback: (analysis: EngineAnalysis) => void) {
    this.analysisListeners.push(callback);
  }

  onReady(callback: () => void) {
    this.onReadyCallbacks.push(callback);
  }

  private emitAnalysis(analysis: EngineAnalysis) {
    this.analysisListeners.forEach(cb => cb(analysis));
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  setOption(name: string, value: string | number) {
    if (this.worker) {
      this.worker.postMessage(`setoption name ${name} value ${value}`);
    }
  }

  setXiangqiMode(enabled: boolean) {
    this.isXiangqi = enabled;
  }

  analyze(fen: string, options: {
    depth?: number;
    multiPv?: number;
    fen?: string;
  } = {}) {
    const { depth = 20, multiPv = 3 } = options;

    if (!this.worker) {
      console.error('Engine not initialized');
      return;
    }

    this.currentFen = fen;
    
    // Stop any current analysis
    this.worker.postMessage('stop');
    
    // Set options
    this.worker.postMessage(`setoption name MultiPV value ${multiPv}`);
    
    // Set position
    this.worker.postMessage(`position fen ${fen}`);
    
    // Start analysis
    this.worker.postMessage(`go depth ${depth}`);
    
    this.setStatus('analyzing');
  }

  analyzeWithTime(fen: string, maxTimeMs: number = 5000) {
    if (!this.worker) {
      console.error('Engine not initialized');
      return;
    }

    this.currentFen = fen;
    this.worker.postMessage('stop');
    this.worker.postMessage(`position fen ${fen}`);
    this.worker.postMessage(`go movetime ${maxTimeMs}`);
    this.setStatus('analyzing');
  }

  stop() {
    if (this.worker) {
      this.worker.postMessage('stop');
      this.setStatus('ready');
    }
  }

  quit() {
    if (this.worker) {
      this.worker.postMessage('quit');
      this.worker.terminate();
      this.worker = null;
    }
  }

  getAnalysis(fen: string, callback: (analysis: EngineAnalysis) => void) {
    const listener = (analysis: EngineAnalysis) => {
      callback(analysis);
      this.analysisListeners = this.analysisListeners.filter(l => l !== listener);
    };
    this.onAnalysis(listener);
    this.analyze(fen);
  }
}

// Singleton instance
let engineInstance: ChessEngine | null = null;

export function getChessEngine(): ChessEngine {
  if (!engineInstance) {
    engineInstance = new ChessEngine();
  }
  return engineInstance;
}

export function resetEngine(): ChessEngine {
  if (engineInstance) {
    engineInstance.quit();
  }
  engineInstance = new ChessEngine();
  return engineInstance;
}

export default ChessEngine;

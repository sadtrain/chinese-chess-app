/**
 * 中国象棋验证器
 */

// 默认开局 FEN
export const STARTING_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

/**
 * 验证 FEN 格式
 */
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

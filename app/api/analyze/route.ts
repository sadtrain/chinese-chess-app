import { NextRequest, NextResponse } from 'next/server';

// Chinese Chess AI Analysis API
// This endpoint provides AI-powered analysis using the engine data

interface AnalysisRequest {
  fen: string;
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  engineAnalysis?: {
    bestMove: string | null;
    evaluation: number;
    depth: number;
    pv: string[];
    variations: Array<{ moves: string[]; evaluation: number }>;
  };
}

// Move notation translations for Chinese Chess
const MOVE_NOTATIONS: Record<string, string> = {
  // Red pieces
  'k': '将', 'K': '将',
  'r': '车', 'R': '车',
  'n': '马', 'N': '马',
  'b': '象', 'B': '象',
  'a': '士', 'A': '士',
  'c': '炮', 'C': '炮',
  'p': '兵', 'P': '兵',
};

function formatEngineAnalysis(analysis: AnalysisRequest['engineAnalysis']): string {
  if (!analysis) return '';

  let text = `【引擎分析结果】\n\n`;
  
  if (analysis.bestMove) {
    text += `最佳走法: **${analysis.bestMove}**\n\n`;
  }
  
  const eval_ = analysis.evaluation;
  const evalText = eval_ > 0 ? `红方优势 ${eval_.toFixed(2)} 分` :
                   eval_ < 0 ? `黑方优势 ${Math.abs(eval_).toFixed(2)} 分` :
                   '局势均衡';
  text += `局势评估: ${evalText}\n`;
  text += `搜索深度: ${analysis.depth}\n\n`;
  
  if (analysis.pv.length > 0) {
    text += `主要变例:\n${analysis.pv.slice(0, 6).join(' → ')}`;
  }
  
  return text;
}

function generateResponse(request: AnalysisRequest): string {
  const { fen, message, engineAnalysis, history } = request;
  
  // Check if it's a follow-up question about alternative moves
  const isFollowUp = history.length > 0;
  const hasAlternativeMoveQuestion = /为什么.*不走|可以.*吗|其他.*走法|变例|变化/i.test(message);
  
  // Generate response based on context
  let response = '';
  
  // Include engine analysis if available
  if (engineAnalysis) {
    response += formatEngineAnalysis(engineAnalysis) + '\n\n';
  }
  
  // General response logic
  if (message.includes('怎么走') || message.includes('建议') || message.includes('应该')) {
    response += `基于当前局面分析:\n\n`;
    
    if (engineAnalysis?.bestMove) {
      response += `我建议走 **${engineAnalysis.bestMove}**。\n\n`;
      response += `这个走法的考虑是:\n`;
      response += `- 符合象棋基本战术原则\n`;
      response += `- 符合局面平衡发展要求\n`;
      response += `- 为后续变化留下空间\n\n`;
    } else {
      response += `让我解释一下当前的战略考量...\n`;
      response += `首先，需要分析双方的子力配置和位置。\n`;
      response += `其次，考虑出子速度和阵型协调。\n`;
      response += `最后，预判对手可能的应对。\n\n`;
    }
    
    response += `请问您想了解更多细节吗？`;
  }
  else if (hasAlternativeMoveQuestion || (isFollowUp && engineAnalysis?.variations)) {
    response += `好问题！让我们分析一下其他走法的变化:\n\n`;
    
    if (engineAnalysis?.variations && engineAnalysis.variations.length > 1) {
      engineAnalysis.variations.slice(1, 3).forEach((v, i) => {
        const evalText = v.evaluation > 0 ? '红优' : v.evaluation < 0 ? '黑优' : '均势';
        response += `**变例 ${i + 1}**: ${v.moves.slice(0, 4).join(' → ')}\n`;
        response += `评估: ${evalText} (${Math.abs(v.evaluation).toFixed(2)})\n`;
        response += `这个走法的特点是...\n\n`;
      });
    } else {
      response += `走其他位置虽然也是一种选择，但可能会有以下问题:\n`;
      response += `- 开放中路给对方进攻机会\n`;
      response += `- 子力部署不够协调\n`;
      response += `- 容易被对手利用\n\n`;
    }
    
    response += `总的来说，主变走法更为稳健。其他选择并非不可行，但需要更精确的计算。`;
  }
  else if (message.includes('为什么') || message.includes('原因')) {
    response += `这个问题很关键！让我详细解释:\n\n`;
    response += `1. **子力价值**: 每个棋子都有其价值，走法需要考虑子力交换的得失\n`;
    response += `2. **位置价值**: 好位置比多子更重要，棋子需要占据有利位置\n`;
    response += `3. **配合协调**: 棋子之间需要相互配合，形成整体合力\n`;
    response += `4. **战略考虑**: 短期战术和长期战略需要平衡\n\n`;
    
    if (engineAnalysis) {
      const eval_ = engineAnalysis.evaluation;
      if (Math.abs(eval_) > 1) {
        response += `当前评估显示${eval_ > 0 ? '红方' : '黑方'}有较大优势，所以稳重的走法更为重要。`;
      }
    }
  }
  else if (message.includes('开局') || message.includes('布阵')) {
    response += `开局阶段非常重要，需要注意以下几点:\n\n`;
    response += `**基本原则:**\n`;
    response += `1. 出动大子（车马炮）要快\n`;
    response += `2. 保持阵型协调\n`;
    response += `3. 控制中心区域\n`;
    response += `4. 注意子之间的联络\n\n`;
    response += `常见的开局陷阱需要避免，新手下棋时建议稳扎稳打，不要过于冒进。`;
  }
  else {
    // Default conversational response
    response += `我来帮你分析这个问题:\n\n`;
    
    if (engineAnalysis) {
      const eval_ = engineAnalysis.evaluation;
      const side = fen.includes(' w ') ? '红方' : '黑方';
      
      response += `当前局面: ${side}走子\n`;
      
      if (Math.abs(eval_) < 0.5) {
        response += `局势相对均衡，双方机会相当。\n\n`;
      } else if (Math.abs(eval_) < 2) {
        response += `${eval_ > 0 ? '红方' : '黑方'}有轻微优势，需要谨慎走子。\n\n`;
      } else {
        response += `${eval_ > 0 ? '红方' : '黑方'}优势明显，需要把握机会。\n\n`;
      }
    }
    
    response += `您可以问我:\n`;
    response += `- "当前局面应该怎么走？"\n`;
    response += `- "为什么建议这样走？"\n`;
    response += `- "不走这一步可以吗？"\n`;
    response += `- "分析一下其他变化"\n`;
  }
  
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const body: AnalysisRequest = await request.json();
    
    const { fen, message, history, engineAnalysis } = body;
    
    if (!message) {
      return NextResponse.json(
        { error: '消息内容不能为空' },
        { status: 400 }
      );
    }
    
    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
    
    const response = generateResponse({
      fen: fen || 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1',
      message,
      history: history || [],
      engineAnalysis,
    });
    
    return NextResponse.json({
      response,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Analysis API Error:', error);
    return NextResponse.json(
      { error: '分析失败，请重试' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: '象棋AI分析API',
    endpoints: {
      'POST /api/analyze': '发送分析请求',
    },
  });
}

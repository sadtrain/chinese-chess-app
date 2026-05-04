export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory store for chat sessions (in production, use a database)
const chatHistory = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();

interface ChatRequest {
  message: string;
  sessionId?: string;
  fen?: string;
  context?: {
    bestMove?: string;
    evaluation?: number;
    pv?: string[];
    variations?: Array<{ moves: string[]; evaluation: number }>;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { message, sessionId = 'default', fen, context } = body;

    if (!message) {
      return NextResponse.json({ error: '消息不能为空' }, { status: 400 });
    }

    // Get or create session history
    const history = chatHistory.get(sessionId) || [];
    history.push({ role: 'user', content: message });

    // Generate AI response
    const response = await generateChessResponse(message, fen, context, history);

    // Add to history
    history.push({ role: 'assistant', content: response });
    chatHistory.set(sessionId, history.slice(-20)); // Keep last 20 messages

    return NextResponse.json({
      response,
      sessionId,
    });
  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: '处理失败' }, { status: 500 });
  }
}

async function generateChessResponse(
  message: string,
  fen?: string,
  context?: ChatRequest['context'],
  history?: Array<{ role: string; content: string }>
): Promise<string> {
  const lowerMessage = message.toLowerCase();
  
  // Extract key information from context
  const bestMove = context?.bestMove;
  const evaluation = context?.evaluation ?? 0;
  const pv = context?.pv ?? [];
  const variations = context?.variations ?? [];
  
  const isRedToMove = fen?.includes(' w ') ?? true;
  const currentSide = isRedToMove ? '红方' : '黑方';
  
  // Check for follow-up questions about alternative moves
  const isAlternativeQuestion = 
    /为什么不走|可以.*吗|其他.*走法|变例|变化|不一样/i.test(message);
  
  const isWhyQuestion = /为什么|原因|依据/i.test(message);
  const isHowQuestion = /怎么|如何|建议/i.test(message);
  
  let response = '';
  
  // Build response based on question type
  if (isAlternativeQuestion && variations.length > 1) {
    response = `好问题！让我们看看其他走法的变化：\n\n`;
    
    variations.slice(1, 3).forEach((v, i) => {
      const evalChange = v.evaluation - evaluation;
      const evalText = v.evaluation > 0 ? '红优' : v.evaluation < 0 ? '黑优' : '均势';
      const changeText = evalChange > 0 ? '变优' : evalChange < 0 ? '变劣' : '相当';
      
      response += `**变例 ${i + 1}**: ${v.moves.slice(0, 4).join(' → ')}\n`;
      response += `评估: ${evalText} (${Math.abs(v.evaluation).toFixed(2)})\n`;
      response += `相比最佳走法: ${changeText} ${Math.abs(evalChange).toFixed(2)}\n\n`;
    });
    
    response += `这些变例的共同特点是：${variations[1].evaluation > evaluation ? '进攻性更强' : '更加稳健'}。`;
    response += `选择哪种走法取决于你对局面的判断和个人风格。`;
  }
  else if (isWhyQuestion) {
    response = `让我解释为什么当前推荐这个走法：\n\n`;
    
    if (bestMove) {
      response += `**推荐走法**: ${bestMove}\n\n`;
    }
    
    response += `**分析依据**:\n\n`;
    
    // Evaluate based on evaluation score
    if (Math.abs(evaluation) < 0.3) {
      response += `1. 局势处于相持阶段，双方子力配置均衡\n`;
      response += `2. 这个走法保持了局面的平衡性\n`;
      response += `3. 没有给对方明显的进攻机会\n\n`;
    } else if (evaluation > 0.5) {
      response += `1. 红方当前有一定优势，这个走法可以扩大优势\n`;
      response += `2. 符合局面优先的原则\n`;
      response += `3. 为后续发展留下空间\n\n`;
    } else if (evaluation < -0.5) {
      response += `1. 当前局势红方稍处下风\n`;
      response += `2. 这个走法是最优的防守或反击选择\n`;
      response += `3. 需要谨慎应对，寻找翻盘机会\n\n`;
    }
    
    if (pv.length > 0) {
      response += `**后续发展参考**:\n${pv.slice(0, 6).join(' → ')}\n\n`;
    }
    
    response += `每一步棋都需要综合考虑进攻和防守，您有其他疑问吗？`;
  }
  else if (isHowQuestion) {
    response = `基于当前局面（${currentSide}走子），我的建议是：\n\n`;
    
    if (bestMove) {
      response += `**最佳走法**: ${bestMove}\n\n`;
    }
    
    const evalText = evaluation > 0 ? '红方优势' : evaluation < 0 ? '黑方优势' : '局势均衡';
    response += `当前评估: ${evalText} (${Math.abs(evaluation).toFixed(2)})\n\n`;
    
    response += `**走法要点**:\n\n`;
    
    if (isRedToMove) {
      response += `1. 注意出子速度，车马炮应尽快出动\n`;
      response += `2. 保持阵型协调，士相防守要到位\n`;
      response += `3. 控制中心区域，限制对方子力活动\n`;
    } else {
      response += `1. 黑方布阵要稳健，抵抗红方进攻\n`;
      response += `2. 寻找反击机会，出其不意\n`;
      response += `3. 注意子力协调配合\n`;
    }
    
    if (variations.length > 0) {
      response += `\n**其他参考**:\n`;
      response += `次优选择: ${variations[1]?.moves.slice(0, 3).join(' → ') || '无'}\n`;
    }
    
    response += `\n\n您想深入了解某个具体方面吗？`;
  }
  else if (message.includes('教学') || message.includes('学习') || message.includes('技巧')) {
    response = `象棋学习建议：\n\n`;
    response += `**基础技巧**:\n`;
    response += `1. **开局原则**: 快出大子，保持阵型\n`;
    response += `2. **中局战术**: 捉子争先，牵制对方\n`;
    response += `3. **残局要领**: 精细计算，王者争位\n\n`;
    response += `**常用战术**:\n`;
    response += `- 抽将: 利用将军抽吃对方子力\n`;
    response += `- 闪将: 移动棋子露出另一个棋子将军\n`;
    response += `- 双重攻击: 同时攻击对方两个目标\n\n`;
    response += `**练习建议**:\n`;
    response += `多做残局练习，培养计算能力。分析高手对局，学习开局套路。`;
  }
  else if (message.includes('术语') || message.includes('规则')) {
    response = `象棋基本术语：\n\n`;
    response += `**棋子名称**:\n`;
    response += `- 车(俥): 直线移动，不限步数\n`;
    response += `- 马: 日字形移动，有蹩马腿\n`;
    response += `- 炮(砲): 直线移动，吃子需隔一子（炮架）\n`;
    response += `- 象(相): 田字形移动，有塞象眼\n`;
    response += `- 士(仕): 斜线移动，限九宫内\n`;
    response += `- 将/帅: 一步一格，限九宫内\n`;
    response += `- 兵/卒: 过河前只能前进，过河后可左右\n\n`;
    response += `**特殊规则**:\n`;
    response += `- 长将不变作和\n`;
    response += `- 将军必须应将\n`;
    response += `- 将死对方将/帅为胜`;
  }
  else {
    // General conversational response
    response = `我理解了。您问的是：${message}\n\n`;
    
    if (evaluation !== undefined) {
      const evalText = evaluation > 0 ? '红方优势' : evaluation < 0 ? '黑方优势' : '局势均衡';
      response += `当前局面: ${currentSide}走子，${evalText}（${Math.abs(evaluation).toFixed(2)}分）\n\n`;
    }
    
    response += `我可以帮您分析:\n`;
    response += `- 当前局面应该怎么走\n`;
    response += `- 为什么要这样走\n`;
    response += `- 分析其他走法的变化\n`;
    response += `- 解释象棋术语和技巧\n\n`;
    response += `请告诉我您想了解的具体内容？`;
  }
  
  return response;
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: '象棋聊天API',
  });
}

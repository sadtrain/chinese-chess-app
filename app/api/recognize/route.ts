import { NextRequest, NextResponse } from 'next/server';

const HUGGINGFACE_API_URL = 'https://api-inference.huggingface.co/models/yolo12138/Chinese_Chess_Recognition';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image } = body;

    if (!image) {
      return NextResponse.json(
        { error: '缺少图像数据' },
        { status: 400 }
      );
    }

    // 从环境变量获取 HuggingFace Token
    const token = process.env.HUGGINGFACE_TOKEN;

    if (!token) {
      return NextResponse.json(
        { error: '未配置 HuggingFace API Token' },
        { status: 500 }
      );
    }

    // 调用 HuggingFace API
    const response = await fetch(HUGGINGFACE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: image,
        options: {
          wait_for_model: true,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HuggingFace API error:', response.status, errorText);

      if (response.status === 503) {
        return NextResponse.json(
          { error: '模型正在加载中，请稍后重试' },
          { status: 503 }
        );
      }

      return NextResponse.json(
        { error: `API 请求失败: ${response.status}` },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Recognition API error:', error);
    return NextResponse.json(
      { error: error.message || '识别失败' },
      { status: 500 }
    );
  }
}

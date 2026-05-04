/**
 * 棋盘识别测试脚本
 * 用于验证 xiangqi-recognizer 的修复
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 测试图片路径
const TEST_IMAGE_PATH = process.argv[2];

if (!TEST_IMAGE_PATH) {
  console.log('用法: node test-recognizer.mjs <图片路径>');
  console.log('示例: node test-recognizer.mjs ./test-board.png');
  process.exit(1);
}

if (!existsSync(TEST_IMAGE_PATH)) {
  console.error(`错误: 找不到图片文件: ${TEST_IMAGE_PATH}`);
  process.exit(1);
}

console.log('=== 棋盘识别测试 ===');
console.log(`测试图片: ${TEST_IMAGE_PATH}\n`);

// 读取图片并转换为 base64
const imageBuffer = readFileSync(TEST_IMAGE_PATH);
const base64Image = imageBuffer.toString('base64');
const mimeType = TEST_IMAGE_PATH.endsWith('.png') ? 'image/png' : 'image/jpeg';
const dataUrl = `data:${mimeType};base64,${base64Image}`;

console.log('图片已加载，大小:', Math.round(imageBuffer.length / 1024), 'KB');
console.log('图片 MIME 类型:', mimeType);
console.log('\n注意: Web Worker 需要在浏览器环境中运行');
console.log('请在浏览器中打开应用并上传此图片进行测试。\n');

// 创建一个 HTML 测试页面
const testHtml = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>棋盘识别测试</title>
  <style>
    body { font-family: system-ui; max-width: 800px; margin: 40px auto; padding: 20px; background: #1a1a2e; color: #eee; }
    h1 { color: #f59e0b; }
    .test-section { background: #16213e; padding: 20px; border-radius: 10px; margin: 20px 0; }
    .result { background: #0f3460; padding: 15px; border-radius: 8px; margin-top: 15px; }
    .success { color: #22c55e; }
    .error { color: #ef4444; }
    pre { background: #000; padding: 10px; border-radius: 5px; overflow-x: auto; }
    img { max-width: 100%; border-radius: 8px; margin: 10px 0; }
  </style>
</head>
<body>
  <h1>♟ 棋盘识别测试</h1>

  <div class="test-section">
    <h2>测试图片预览</h2>
    <img src="${dataUrl}" alt="测试棋盘" id="preview" />
    <p>点击下方按钮进行识别测试</p>
  </div>

  <div class="test-section">
    <h2>识别结果</h2>
    <div id="status">等待开始...</div>
    <div id="result" class="result" style="display:none;">
      <p><strong>状态:</strong> <span id="status-text"></span></p>
      <p><strong>FEN:</strong></p>
      <pre id="fen"></pre>
      <p><strong>置信度:</strong> <span id="confidence"></span>%</p>
      <p><strong>处理时间:</strong> <span id="time"></span>ms</p>
    </div>
    <button onclick="startTest()" style="margin-top: 15px; padding: 10px 20px; background: #f59e0b; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">
      开始识别测试
    </button>
  </div>

  <div class="test-section">
    <h2>控制台输出</h2>
    <pre id="console-output" style="height: 200px; overflow-y: auto;"></pre>
  </div>

  <script type="module">
    // 重定向 console 到页面
    const output = document.getElementById('console-output');
    const originalLog = console.log;
    const originalError = console.error;

    console.log = (...args) => {
      originalLog.apply(console, args);
      output.textContent += '[LOG] ' + args.join(' ') + '\\n';
      output.scrollTop = output.scrollHeight;
    };

    console.error = (...args) => {
      originalError.apply(console, args);
      output.textContent += '[ERROR] ' + args.join(' ') + '\\n';
      output.scrollTop = output.scrollHeight;
    };

    window.onerror = (msg, url, line, col, error) => {
      output.textContent += '[UNCAUGHT ERROR] ' + msg + ' at ' + line + ':' + col + '\\n';
      if (error && error.stack) {
        output.textContent += error.stack + '\\n';
      }
    };

    async function startTest() {
      const statusEl = document.getElementById('status');
      const resultEl = document.getElementById('result');
      const statusText = document.getElementById('status-text');
      const fenEl = document.getElementById('fen');
      const confidenceEl = document.getElementById('confidence');
      const timeEl = document.getElementById('time');

      statusEl.textContent = '正在加载图像...';
      resultEl.style.display = 'none';

      try {
        // 动态导入识别模块
        const { recognizeBoard } = await import('/src/lib/xiangqi-recognizer.ts');

        console.log('开始识别...');

        const result = await recognizeBoard('${dataUrl}', (progress, message) => {
          console.log('进度:', progress + '% -', message);
          statusEl.textContent = message + ' (' + progress + '%)';
        });

        console.log('识别完成!');
        console.log('FEN:', result.fen);
        console.log('置信度:', result.confidence + '%');
        console.log('棋子数量:', result.pieces.length);
        console.log('处理时间:', result.processingTime.toFixed(2) + 'ms');

        statusEl.textContent = '识别完成';
        resultEl.style.display = 'block';
        statusText.textContent = result.message;
        fenEl.textContent = result.fen;
        confidenceEl.textContent = result.confidence.toFixed(1);
        timeEl.textContent = result.processingTime.toFixed(2);

      } catch (error) {
        console.error('识别失败:', error);
        statusEl.innerHTML = '<span class="error">识别失败: ' + error.message + '</span>';
      }
    }

    window.startTest = startTest;
  </script>
</body>
</html>
`;

const outputPath = join(__dirname, 'test-recognizer.html');
writeFileSync(outputPath, testHtml);
console.log(`已生成测试页面: ${outputPath}`);
console.log('\n请在浏览器中打开此 HTML 文件进行测试。');

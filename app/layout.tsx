import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '象棋学习系统 - AI 智能对局分析',
  description: '上传对局截图，AI 引擎自动分析，提供走法建议和变例解读',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

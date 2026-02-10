# Acad Co-Pilot

> 论文导师的智能助手 — 成为导师的"能力放大器"而非"替代者"

## Project Overview

- **Name**: Acad Co-Pilot
- **Goal**: 让AI处理80%的标准化问题，让导师专注于20%的高价值创造性指导
- **定位**: 论文导师助手，解决师生配比1:17的结构性失衡
- **Tech Stack**: Hono + TypeScript + Tailwind CSS (CDN) + Cloudflare Pages

## Features (Completed)

### Marketing Landing Page
- **Hero Section**: 带渐变光效、网格背景和仪表盘预览的震撼首屏
- **Stats Section**: 核心数据展示 (1:17配比、80%标准化问题、72h反馈周期、<3s AI响应)
- **四大核心功能展示**:
  1. AI辅助格式检查、语法润色、文献检索 — 带格式校验动画可视化
  2. 实时反馈机制 — 带即时对话界面模拟
  3. 分层次指导体系 — 带L1/L2/L3层级可视化
  4. 透明化AI使用边界 — 带合规日志界面
- **关键洞察 Section**: 核心矛盾与项目特征卡片
- **核心价值 Section**: 四大价值主张详细展示
- **设计理念 Section**: 六大原则卡片
- **CTA Section**: 行动召唤
- **Footer**: 完整页脚导航

### Design Features
- Linear.app 风格暗色主题
- 滚动触发入场动画 (Intersection Observer)
- 3D卡片悬停效果
- 指标条动画
- 聊天打字机动画
- 导航栏滚动背景模糊
- 英雄区鼠标跟随光效
- 响应式设计 (Desktop/Tablet/Mobile)
- 噪点纹理覆盖层

## URLs
- **Preview**: (via sandbox service URL)
- **API**: `/` - 主页面

## Project Structure
```
webapp/
├── src/
│   └── index.tsx          # Hono 应用主入口 (完整HTML内联)
├── public/
│   └── static/
│       ├── style.css      # 完整CSS样式 (~32KB)
│       ├── app.js         # 交互动画脚本 (~8KB)
│       └── favicon.svg    # SVG图标
├── ecosystem.config.cjs   # PM2 配置
├── wrangler.jsonc         # Cloudflare配置
├── vite.config.ts         # Vite构建配置
├── tsconfig.json          # TypeScript配置
└── package.json           # 依赖管理
```

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: Development
- **Last Updated**: 2026-02-10

## Development

```bash
# Install
npm install

# Build
npm run build

# Dev (Sandbox)
pm2 start ecosystem.config.cjs

# Deploy to Cloudflare
npm run deploy
```

## Design Philosophy
1. **放大器，非替代者** — AI是导师能力的延伸
2. **标准化归AI，创造性归人** — 清晰分工边界
3. **即时反馈优于延迟完美** — 3秒80分 > 72小时100分
4. **透明优于禁止** — 规范治理而非一刀切
5. **系统化优于碎片化** — 结构化训练路径
6. **数据驱动，持续进化** — 智能化迭代

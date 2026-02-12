# Acad Co-Pilot

> 论文导师的智能助手 — 成为导师的"能力放大器"而非"替代者"

## Project Overview

- **Name**: Acad Co-Pilot
- **Goal**: 让AI处理80%的标准化问题，让导师专注于20%的高价值创造性指导
- **定位**: 论文导师助手，解决师生配比1:17的结构性失衡
- **Tech Stack**: Hono + TypeScript + Tailwind CSS (CDN) + Cloudflare Pages + D1 Database
- **GitHub**: https://github.com/fenychin/Acad-Co-Pilot-212

## Features (Completed)

### 1. Marketing Landing Page
- **Hero Section**: 带渐变光效、网格背景和仪表盘预览的震撼首屏
- **Stats Section**: 核心数据展示 (1:17配比、80%标准化问题、72h反馈周期、<3s AI响应)
- **四大核心功能展示**:
  1. AI辅助格式检查、语法润色、文献检索 — 带格式校验动画可视化
  2. 实时反馈机制 — 带即时对话界面模拟
  3. 分层次指导体系 — 带L1/L2/L3层级可视化
  4. 透明化AI使用边界 — 带合规日志界面
- **关键洞察 / 核心价值 / 设计理念 / CTA / Footer**

### 2. 用户认证系统（含邮箱验证码）
- **两步注册流程**:
  - Step 1: 输入邮箱 → 发送6位验证码 → 输入验证码验证
  - Step 2: 填写姓名、密码、身份(学生/导师)、所属机构 → 创建账户
- **邮箱验证码安全机制**:
  - 6位随机数字验证码
  - 60秒发送冷却 (防刷)
  - 最多5次验证尝试 (防暴力)
  - 10分钟有效期
  - 注册成功后自动清理验证记录
- **登录页** (`/login`): 邮箱 + 密码登录，含密码显示切换
- **Dashboard** (`/dashboard`): 登录后控制台，显示用户信息、四大功能模块入口
- **会话管理**: 基于 cookie 的 httpOnly session，7天有效期
- **保护路由**: Dashboard 未登录自动重定向到登录页
- **导航栏联动**: 已登录显示"进入控制台"，未登录显示"登录/开始使用"

### Design Features
- Linear.app 风格暗色主题 (全站统一)
- 步骤指示器 (验证邮箱 → 完善信息) 带动画过渡
- 验证码输入框居中大字显示，60s 倒计时动画
- 注册页密码强度实时检测（弱/中/强）
- 表单 loading 状态与错误提示 shake 动画
- 滚动触发入场动画、3D卡片悬停效果
- 响应式设计 (Desktop/Tablet/Mobile)

## URLs & Routes

| 路径 | 说明 | 需要认证 |
|------|------|----------|
| `/` | 营销首页 | 否 |
| `/signup` | 注册页 (两步验证) | 否 |
| `/login` | 登录页 | 否 |
| `/dashboard` | 用户控制台 | 是 |
| `/api/auth/send-code` | 发送验证码 (POST) | 否 |
| `/api/auth/verify-code` | 验证验证码 (POST) | 否 |
| `/api/auth/signup` | 注册 (POST, 需已验证邮箱) | 否 |
| `/api/auth/login` | 登录 (POST) | 否 |
| `/api/auth/logout` | 登出 (POST) | 否 |
| `/api/auth/me` | 当前用户信息 (GET) | 是 |

### API 参数说明

**POST /api/auth/send-code**
```json
{ "email": "邮箱 (必填)" }
```

**POST /api/auth/verify-code**
```json
{ "email": "邮箱 (必填)", "code": "6位验证码 (必填)" }
```

**POST /api/auth/signup** (需先完成邮箱验证)
```json
{
  "name": "姓名 (必填)",
  "email": "已验证邮箱 (必填)",
  "password": "密码 (必填, >= 6字符)",
  "role": "student | tutor",
  "institution": "所属机构 (选填)"
}
```

**POST /api/auth/login**
```json
{ "email": "邮箱 (必填)", "password": "密码 (必填)" }
```

## Data Architecture

- **Database**: Cloudflare D1 (SQLite)
- **Tables**: `users` (用户), `sessions` (会话), `email_verifications` (邮箱验证码)
- **密码存储**: PBKDF2 + SHA-256 (100,000 iterations) + random salt
- **会话机制**: 随机 32 字节 session ID, httpOnly cookie
- **验证码**: 6位随机数字, 10分钟有效, 最多5次尝试

## Project Structure
```
webapp/
├── src/
│   └── index.tsx              # Hono 应用主入口 (API + 页面路由)
├── public/
│   └── static/
│       ├── style.css          # 营销页 CSS (~32KB)
│       ├── auth.css           # 认证页 + Dashboard CSS (~15KB)
│       ├── app.js             # 营销页交互脚本 (~8KB)
│       ├── auth.js            # 认证页交互脚本 (~14KB)
│       └── favicon.svg        # SVG 图标
├── migrations/
│   ├── 0001_users_sessions.sql     # 用户 + 会话表
│   └── 0002_email_verifications.sql # 邮箱验证码表
├── ecosystem.config.cjs       # PM2 配置 (含 D1 local)
├── wrangler.jsonc             # Cloudflare 配置 (含 D1 binding)
├── vite.config.ts             # Vite 构建配置
├── tsconfig.json              # TypeScript 配置
└── package.json               # 依赖管理
```

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: Development
- **GitHub**: https://github.com/fenychin/Acad-Co-Pilot-212
- **Last Updated**: 2026-02-12

## Development

```bash
# Install
npm install

# Build
npm run build

# Apply D1 migrations (local)
npx wrangler d1 migrations apply acad-copilot-db --local

# Dev (Sandbox with D1)
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

## Next Steps
- [ ] 接入真实邮件服务 (Resend/SendGrid) 替代 dev 模式直接返回验证码
- [ ] 功能模块开发（格式检查、语法润色、文献检索、实时反馈）
- [ ] 导师端控制台
- [ ] AI辅助使用日志与合规报告
- [ ] 忘记密码流程
- [ ] 部署到 Cloudflare Pages 生产环境

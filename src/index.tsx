import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { cors } from 'hono/cors'

// Types
type Bindings = {
  DB: D1Database
}

type Variables = {
  user?: { id: number; email: string; name: string; role: string; institution: string }
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use('/api/*', cors())

// ============================================================
// Crypto helpers (Web Crypto API — Cloudflare Workers compatible)
// ============================================================
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256)
  const hashArray = new Uint8Array(bits)
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('')
  const hashHex = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${saltHex}:${hashHex}`
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':')
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)))
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256)
  const hashArray = new Uint8Array(bits)
  const computedHex = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('')
  return computedHex === hashHex
}

function generateSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ============================================================
// Auth Middleware
// ============================================================
async function getSessionUser(c: any) {
  const sessionId = getCookie(c, 'session_id')
  if (!sessionId) return null
  const db = c.env.DB as D1Database
  const row = await db.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.institution
     FROM sessions s JOIN users u ON s.user_id = u.id
     WHERE s.id = ? AND s.expires_at > datetime('now')`
  ).bind(sessionId).first()
  return row || null
}

// ============================================================
// Shared HTML head
// ============================================================
function htmlHead(title: string) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Acad Co-Pilot</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
  <link href="/static/style.css" rel="stylesheet">
  <link href="/static/auth.css" rel="stylesheet">
</head>`
}

const logoSvg = `<svg width="32" height="32" viewBox="0 0 28 28" fill="none">
  <rect width="28" height="28" rx="7" fill="url(#lg)"/>
  <path d="M8 14.5L12 18.5L20 10" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <defs><linearGradient id="lg" x1="0" y1="0" x2="28" y2="28"><stop stop-color="#6C5CE7"/><stop offset="1" stop-color="#4ECDC4"/></linearGradient></defs>
</svg>`

// ============================================================
// API: Sign Up
// ============================================================
app.post('/api/auth/signup', async (c) => {
  try {
    const body = await c.req.json()
    const { email, password, name, role, institution } = body

    if (!email || !password || !name) {
      return c.json({ error: '请填写所有必填字段' }, 400)
    }

    if (password.length < 6) {
      return c.json({ error: '密码至少需要6个字符' }, 400)
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return c.json({ error: '请输入有效的邮箱地址' }, 400)
    }

    const db = c.env.DB
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase().trim()).first()
    if (existing) {
      return c.json({ error: '该邮箱已被注册' }, 409)
    }

    const passwordHash = await hashPassword(password)
    const userRole = (role === 'tutor' || role === 'student') ? role : 'student'

    const result = await db.prepare(
      'INSERT INTO users (email, name, password_hash, role, institution) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      email.toLowerCase().trim(),
      name.trim(),
      passwordHash,
      userRole,
      (institution || '').trim()
    ).run()

    const userId = result.meta.last_row_id
    const sessionId = generateSessionId()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    await db.prepare(
      'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
    ).bind(sessionId, userId, expiresAt).run()

    setCookie(c, 'session_id', sessionId, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 7 * 24 * 60 * 60,
    })

    return c.json({
      success: true,
      user: { id: userId, email: email.toLowerCase().trim(), name: name.trim(), role: userRole }
    })
  } catch (e: any) {
    return c.json({ error: '注册失败，请稍后重试' }, 500)
  }
})

// ============================================================
// API: Login
// ============================================================
app.post('/api/auth/login', async (c) => {
  try {
    const body = await c.req.json()
    const { email, password } = body

    if (!email || !password) {
      return c.json({ error: '请输入邮箱和密码' }, 400)
    }

    const db = c.env.DB
    const user = await db.prepare(
      'SELECT id, email, name, password_hash, role, institution FROM users WHERE email = ?'
    ).bind(email.toLowerCase().trim()).first<any>()

    if (!user) {
      return c.json({ error: '邮箱或密码错误' }, 401)
    }

    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) {
      return c.json({ error: '邮箱或密码错误' }, 401)
    }

    // Clean expired sessions for this user
    await db.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at <= datetime('now')").bind(user.id).run()

    const sessionId = generateSessionId()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    await db.prepare(
      'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
    ).bind(sessionId, user.id, expiresAt).run()

    setCookie(c, 'session_id', sessionId, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 7 * 24 * 60 * 60,
    })

    return c.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    })
  } catch (e: any) {
    return c.json({ error: '登录失败，请稍后重试' }, 500)
  }
})

// ============================================================
// API: Logout
// ============================================================
app.post('/api/auth/logout', async (c) => {
  const sessionId = getCookie(c, 'session_id')
  if (sessionId) {
    const db = c.env.DB
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run()
  }
  deleteCookie(c, 'session_id', { path: '/' })
  return c.json({ success: true })
})

// ============================================================
// API: Current user
// ============================================================
app.get('/api/auth/me', async (c) => {
  const user = await getSessionUser(c)
  if (!user) {
    return c.json({ error: '未登录' }, 401)
  }
  return c.json({ user })
})

// ============================================================
// Favicon redirect
// ============================================================
app.get('/favicon.ico', (c) => c.redirect('/static/favicon.svg', 301))

// ============================================================
// Page: Sign Up
// ============================================================
app.get('/signup', (c) => {
  return c.html(`${htmlHead('注册')}
<body class="auth-body">
  <div class="noise"></div>
  <div class="auth-glow"></div>
  <div class="auth-grid-bg"></div>

  <div class="auth-container">
    <a href="/" class="auth-logo">
      ${logoSvg}
      <span>Acad Co-Pilot</span>
    </a>

    <div class="auth-card">
      <div class="auth-header">
        <h1>创建账户</h1>
        <p>加入 Acad Co-Pilot，开启智能学术指导之旅</p>
      </div>

      <form id="signup-form" class="auth-form" autocomplete="off">
        <div class="form-group">
          <label for="name">姓名 <span class="required">*</span></label>
          <input type="text" id="name" name="name" placeholder="请输入您的姓名" required autocomplete="name">
        </div>

        <div class="form-group">
          <label for="email">邮箱地址 <span class="required">*</span></label>
          <input type="email" id="email" name="email" placeholder="name@university.edu" required autocomplete="email">
        </div>

        <div class="form-group">
          <label for="password">密码 <span class="required">*</span></label>
          <div class="input-password-wrap">
            <input type="password" id="password" name="password" placeholder="至少6位字符" required minlength="6" autocomplete="new-password">
            <button type="button" class="toggle-pw" data-target="password" aria-label="显示密码">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
          <div class="pw-strength" id="pw-strength">
            <div class="pw-bar"><div class="pw-fill" id="pw-fill"></div></div>
            <span id="pw-label"></span>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group half">
            <label for="role">身份</label>
            <select id="role" name="role">
              <option value="student">学生</option>
              <option value="tutor">导师</option>
            </select>
          </div>
          <div class="form-group half">
            <label for="institution">所属机构</label>
            <input type="text" id="institution" name="institution" placeholder="大学/研究所">
          </div>
        </div>

        <div class="form-error" id="form-error"></div>

        <button type="submit" class="btn-submit" id="btn-submit">
          <span class="btn-text">创建账户</span>
          <span class="btn-loading" style="display:none">
            <svg class="spinner" width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="31.4 31.4" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></circle></svg>
            注册中...
          </span>
        </button>
      </form>

      <div class="auth-footer">
        <span>已有账户？</span>
        <a href="/login">登录</a>
      </div>
    </div>

    <p class="auth-terms">
      注册即表示您同意我们的<a href="#">服务条款</a>和<a href="#">隐私政策</a>
    </p>
  </div>

  <script src="/static/auth.js"></script>
</body>
</html>`)
})

// ============================================================
// Page: Login
// ============================================================
app.get('/login', (c) => {
  return c.html(`${htmlHead('登录')}
<body class="auth-body">
  <div class="noise"></div>
  <div class="auth-glow"></div>
  <div class="auth-grid-bg"></div>

  <div class="auth-container">
    <a href="/" class="auth-logo">
      ${logoSvg}
      <span>Acad Co-Pilot</span>
    </a>

    <div class="auth-card">
      <div class="auth-header">
        <h1>欢迎回来</h1>
        <p>登录您的 Acad Co-Pilot 账户</p>
      </div>

      <form id="login-form" class="auth-form" autocomplete="off">
        <div class="form-group">
          <label for="email">邮箱地址</label>
          <input type="email" id="email" name="email" placeholder="name@university.edu" required autocomplete="email">
        </div>

        <div class="form-group">
          <div class="label-row">
            <label for="password">密码</label>
            <a href="#" class="forgot-link">忘记密码？</a>
          </div>
          <div class="input-password-wrap">
            <input type="password" id="password" name="password" placeholder="请输入密码" required autocomplete="current-password">
            <button type="button" class="toggle-pw" data-target="password" aria-label="显示密码">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>

        <div class="form-error" id="form-error"></div>

        <button type="submit" class="btn-submit" id="btn-submit">
          <span class="btn-text">登录</span>
          <span class="btn-loading" style="display:none">
            <svg class="spinner" width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="31.4 31.4" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></circle></svg>
            登录中...
          </span>
        </button>
      </form>

      <div class="auth-footer">
        <span>还没有账户？</span>
        <a href="/signup">注册</a>
      </div>
    </div>

    <p class="auth-terms">
      <a href="/">返回首页</a>
    </p>
  </div>

  <script src="/static/auth.js"></script>
</body>
</html>`)
})

// ============================================================
// Page: Dashboard (protected)
// ============================================================
app.get('/dashboard', async (c) => {
  const user = await getSessionUser(c)
  if (!user) {
    return c.redirect('/login')
  }

  const u = user as any
  const roleLabel = u.role === 'tutor' ? '导师' : '学生'
  const roleBadgeClass = u.role === 'tutor' ? 'role-tutor' : 'role-student'
  const initials = u.name.slice(0, 1).toUpperCase()

  return c.html(`${htmlHead('控制台')}
<body class="auth-body dashboard-body">
  <div class="noise"></div>

  <!-- Dashboard Nav -->
  <nav class="dash-nav">
    <div class="dash-nav-inner">
      <a href="/" class="auth-logo small">
        ${logoSvg}
        <span>Acad Co-Pilot</span>
      </a>
      <div class="dash-nav-right">
        <span class="user-badge ${roleBadgeClass}">${roleLabel}</span>
        <div class="user-menu" id="user-menu">
          <button class="user-avatar" id="user-avatar-btn">${initials}</button>
          <div class="user-dropdown" id="user-dropdown">
            <div class="dropdown-header">
              <strong>${u.name}</strong>
              <span>${u.email}</span>
            </div>
            <div class="dropdown-divider"></div>
            <button class="dropdown-item" id="btn-logout">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              退出登录
            </button>
          </div>
        </div>
      </div>
    </div>
  </nav>

  <!-- Dashboard Content -->
  <main class="dashboard-main">
    <div class="dashboard-container">
      <div class="welcome-section">
        <div class="welcome-text">
          <h1>你好，${u.name} <span class="wave">👋</span></h1>
          <p>欢迎来到 Acad Co-Pilot 控制台${u.institution ? ' · ' + u.institution : ''}</p>
        </div>
      </div>

      <div class="dash-grid">
        <div class="dash-tile">
          <div class="tile-icon" style="--tile-color: #6C5CE7">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6C5CE7" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
          </div>
          <div class="tile-content">
            <h3>格式检查</h3>
            <p>一键检测论文格式规范</p>
          </div>
          <span class="tile-badge soon">即将上线</span>
        </div>

        <div class="dash-tile">
          <div class="tile-icon" style="--tile-color: #F39C12">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F39C12" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </div>
          <div class="tile-content">
            <h3>语法润色</h3>
            <p>学术语境下的智能润色</p>
          </div>
          <span class="tile-badge soon">即将上线</span>
        </div>

        <div class="dash-tile">
          <div class="tile-icon" style="--tile-color: #4ECDC4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ECDC4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <div class="tile-content">
            <h3>文献检索</h3>
            <p>跨数据库智能文献推荐</p>
          </div>
          <span class="tile-badge soon">即将上线</span>
        </div>

        <div class="dash-tile">
          <div class="tile-icon" style="--tile-color: #00B894">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00B894" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          </div>
          <div class="tile-content">
            <h3>实时反馈</h3>
            <p>秒级AI学术反馈</p>
          </div>
          <span class="tile-badge soon">即将上线</span>
        </div>
      </div>

      <div class="dash-info-card">
        <div class="info-icon">🎉</div>
        <div class="info-content">
          <h4>账户已激活</h4>
          <p>您已成功注册 Acad Co-Pilot。各功能模块正在紧锣密鼓开发中，敬请期待！我们将在功能上线后第一时间通知您。</p>
        </div>
      </div>
    </div>
  </main>

  <script src="/static/auth.js"></script>
</body>
</html>`)
})

// ============================================================
// Page: Landing (with updated nav links)
// ============================================================
app.get('/', async (c) => {
  const user = await getSessionUser(c)
  const navActions = user
    ? `<a href="/dashboard" class="btn-primary-sm">进入控制台</a>`
    : `<a href="/login" class="btn-ghost">登录</a>
       <a href="/signup" class="btn-primary-sm">开始使用</a>`

  const ctaButton = user
    ? `<a href="/dashboard" class="btn-primary large">进入控制台<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></a>`
    : `<a href="/signup" class="btn-primary large">申请体验名额<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></a>`

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Acad Co-Pilot — 论文导师的智能助手</title>
  <meta name="description" content="成为导师的能力放大器而非替代者。让AI处理80%的标准化问题，让导师专注于20%的高价值创造性指导。">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
  <link href="/static/style.css" rel="stylesheet">
</head>
<body>
  <div class="noise"></div>

  <nav class="nav" id="nav">
    <div class="nav-inner">
      <a href="#" class="nav-logo">
        ${logoSvg}
        <span>Acad Co-Pilot</span>
      </a>
      <div class="nav-links">
        <a href="#features">功能</a>
        <a href="#insight">洞察</a>
        <a href="#values">价值</a>
        <a href="#principles">理念</a>
      </div>
      <div class="nav-actions">
        ${navActions}
      </div>
    </div>
  </nav>

  <section class="hero">
    <div class="hero-glow"></div>
    <div class="hero-grid-bg"></div>
    <div class="container">
      <div class="hero-badge" data-animate="fade-up">
        <span class="badge-dot"></span>
        重新定义学术指导范式
      </div>
      <h1 class="hero-title" data-animate="fade-up" data-delay="100">
        导师的<span class="gradient-text">能力放大器</span><br>
        而非替代者
      </h1>
      <p class="hero-subtitle" data-animate="fade-up" data-delay="200">
        让AI处理80%的标准化问题，让导师专注于20%的高价值创造性指导。<br>
        从根本上解决师生配比1:17的结构性失衡。
      </p>
      <div class="hero-cta" data-animate="fade-up" data-delay="300">
        <a href="/signup" class="btn-primary">
          申请体验
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
        <a href="#features" class="btn-secondary">了解更多</a>
      </div>

      <div class="hero-visual" data-animate="fade-up" data-delay="400">
        <div class="hero-visual-glow"></div>
        <div class="hero-dashboard">
          <div class="dash-header"><div class="dash-dots"><span></span><span></span><span></span></div><span class="dash-title">Acad Co-Pilot Dashboard</span><div class="dash-status"><span class="status-dot online"></span>AI 在线</div></div>
          <div class="dash-body">
            <div class="dash-sidebar">
              <div class="dash-nav-item active"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/></svg>总览</div>
              <div class="dash-nav-item"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V3a1 1 0 00-1-1z" stroke="currentColor" stroke-width="1.2"/><path d="M2 6h12M6 6v8" stroke="currentColor" stroke-width="1.2"/></svg>格式检查</div>
              <div class="dash-nav-item"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M12 6l-4-4-4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>语法润色</div>
              <div class="dash-nav-item"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.2"/><path d="M14 14l-4-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>文献检索</div>
              <div class="dash-nav-item"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>反馈中心</div>
            </div>
            <div class="dash-content">
              <div class="dash-card glass"><div class="dash-card-header"><span class="dash-card-label">AI 辅助分析</span><span class="dash-card-badge">实时</span></div>
                <div class="dash-metrics">
                  <div class="metric"><span class="metric-value">94<span class="metric-unit">%</span></span><span class="metric-label">格式合规率</span><div class="metric-bar"><div class="metric-fill" style="width:94%"></div></div></div>
                  <div class="metric"><span class="metric-value">2.3<span class="metric-unit">s</span></span><span class="metric-label">平均响应时间</span><div class="metric-bar"><div class="metric-fill fast" style="width:88%"></div></div></div>
                  <div class="metric"><span class="metric-value">127</span><span class="metric-label">已处理问题</span><div class="metric-bar"><div class="metric-fill accent" style="width:72%"></div></div></div>
                </div>
              </div>
              <div class="dash-card glass small"><div class="dash-card-header"><span class="dash-card-label">指导分层</span></div>
                <div class="layer-list">
                  <div class="layer-item"><span class="layer-icon ai">AI</span><span class="layer-text">格式校验 · 语法修正 · 引用核查</span><span class="layer-tag auto">自动</span></div>
                  <div class="layer-item"><span class="layer-icon human">导</span><span class="layer-text">论点评估 · 方法论指导 · 创新建议</span><span class="layer-tag manual">人工</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="stats-section">
    <div class="container">
      <p class="stats-label" data-animate="fade-up">打破最大迷思</p>
      <h2 class="stats-quote" data-animate="fade-up" data-delay="100">"导师制是学术指导的最优解"<br><span class="muted">—— 实际上在结构性资源稀缺下，这种模式已无法持续。</span></h2>
      <div class="stats-grid" data-animate="fade-up" data-delay="200">
        <div class="stat-card"><span class="stat-number">1:17</span><span class="stat-desc">平均师生配比</span><span class="stat-sub">远超导师精力上限</span></div>
        <div class="stat-card"><span class="stat-number">80%</span><span class="stat-desc">标准化问题占比</span><span class="stat-sub">可由AI高效处理</span></div>
        <div class="stat-card"><span class="stat-number">72h</span><span class="stat-desc">平均反馈周期</span><span class="stat-sub">导致记忆流失严重</span></div>
        <div class="stat-card"><span class="stat-number">&lt;3s</span><span class="stat-desc">AI 即时反馈</span><span class="stat-sub">解决延迟反馈痛点</span></div>
      </div>
    </div>
  </section>

  <section class="features" id="features">
    <div class="container">
      <div class="section-header" data-animate="fade-up"><span class="section-label">核心功能</span><h2 class="section-title">为现代学术指导而设计</h2><p class="section-desc">Acad Co-Pilot 以分层服务理念为核心，用AI处理标准化工作，释放导师时间用于高价值创造性指导。</p></div>
      <div class="feature-block" data-animate="fade-up">
        <div class="feature-content"><div class="feature-icon-wrap"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="url(#ck)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="10" stroke="url(#ck)" stroke-width="1.5"/><defs><linearGradient id="ck" x1="2" y1="2" x2="22" y2="22"><stop stop-color="#6C5CE7"/><stop offset="1" stop-color="#4ECDC4"/></linearGradient></defs></svg></div><h3 class="feature-title">AI 辅助格式检查 · 语法润色 · 文献检索</h3><p class="feature-desc">自动检测论文格式规范、语法错误和引用完整性。涵盖APA、MLA、Chicago等主流引用格式，支持跨学科文献智能检索与推荐。</p><ul class="feature-list"><li><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8l3 3 5-5" stroke="#4ECDC4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>一键格式校验，秒级反馈修正建议</li><li><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8l3 3 5-5" stroke="#4ECDC4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>学术语法润色，保持原意精确性</li><li><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8l3 3 5-5" stroke="#4ECDC4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>跨数据库文献智能检索与相关性排序</li></ul></div>
        <div class="feature-visual"><div class="fv-format-check"><div class="fv-header"><span class="fv-dot green"></span><span>format_check.analysis</span></div><div class="fv-content"><div class="fv-line"><span class="fv-status pass">PASS</span><span>标题格式 — Times New Roman, 16pt, 加粗</span></div><div class="fv-line"><span class="fv-status pass">PASS</span><span>摘要字数 — 287 / 300 字 (合规)</span></div><div class="fv-line"><span class="fv-status warn">WARN</span><span>参考文献 — 第23条缺少DOI号</span></div><div class="fv-line"><span class="fv-status fail">FIX</span><span>页边距 — 左侧2.3cm → 需调整为2.5cm</span></div><div class="fv-progress"><div class="fv-progress-bar"><div class="fv-progress-fill" style="width:94%"></div></div><span>94% 合规</span></div></div></div></div>
      </div>
      <div class="feature-block reverse" data-animate="fade-up">
        <div class="feature-content"><div class="feature-icon-wrap"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="url(#bl)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="bl" x1="3" y1="2" x2="21" y2="22"><stop stop-color="#F7DC6F"/><stop offset="1" stop-color="#F39C12"/></linearGradient></defs></svg></div><h3 class="feature-title">实时反馈机制</h3><p class="feature-desc">利用AI的即时性彻底解决反馈延迟导致的"记忆流失"问题。学生在写作过程中即时获得指导，构建真正的实时反馈循环。</p><ul class="feature-list"><li><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8l3 3 5-5" stroke="#F7DC6F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>写作过程中的即时语境反馈</li><li><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8l3 3 5-5" stroke="#F7DC6F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>平均响应时间 &lt; 3秒，告别72小时等待</li><li><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8l3 3 5-5" stroke="#F7DC6F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>建立持续学习的正向反馈循环</li></ul></div>
        <div class="feature-visual"><div class="fv-chat"><div class="fv-header"><span class="fv-dot amber"></span><span>realtime_feedback</span></div><div class="fv-chat-body"><div class="chat-msg student"><div class="chat-avatar stu">学</div><div class="chat-bubble"><p>我在讨论部分的论点逻辑是否连贯？</p><span class="chat-time">14:32:05</span></div></div><div class="chat-msg ai"><div class="chat-avatar bot">AI</div><div class="chat-bubble"><p>检测到第3段论点跳跃：从「用户行为」直接过渡到「市场策略」，建议补充连接论证。</p><span class="chat-time">14:32:07</span><span class="chat-speed">响应时间 2.1s</span></div></div><div class="chat-typing"><div class="chat-avatar bot">AI</div><div class="typing-indicator"><span></span><span></span><span></span></div></div></div></div></div>
      </div>
      <div class="feature-block" data-animate="fade-up">
        <div class="feature-content"><div class="feature-icon-wrap"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5z" stroke="url(#ly)" stroke-width="1.5" stroke-linejoin="round"/><path d="M2 12l10 5 10-5" stroke="url(#ly)" stroke-width="1.5" stroke-linejoin="round"/><path d="M2 17l10 5 10-5" stroke="url(#ly)" stroke-width="1.5" stroke-linejoin="round"/><defs><linearGradient id="ly" x1="2" y1="2" x2="22" y2="22"><stop stop-color="#A29BFE"/><stop offset="1" stop-color="#6C5CE7"/></linearGradient></defs></svg></div><h3 class="feature-title">分层次指导体系</h3><p class="feature-desc">基础问题AI解决，复杂问题导师解决。智能分流学术问题，让每个参与者都在最擅长的领域发挥价值。</p><ul class="feature-list"><li><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8l3 3 5-5" stroke="#A29BFE" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>L1 AI层：格式、语法、引用等标准化问题</li><li><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8l3 3 5-5" stroke="#A29BFE" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>L2 协作层：AI初筛 + 导师确认的混合模式</li><li><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8l3 3 5-5" stroke="#A29BFE" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>L3 导师层：论点创新、方法论等高阶指导</li></ul></div>
        <div class="feature-visual"><div class="fv-layers"><div class="fv-header"><span class="fv-dot purple"></span><span>guidance_layers</span></div><div class="fv-layers-body"><div class="layer-card l3"><div class="layer-label">L3 · 导师专属</div><div class="layer-items"><span>论点创新</span><span>方法论指导</span><span>研究方向</span></div><div class="layer-indicator"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#A29BFE" stroke-width="1.2"/><circle cx="7" cy="7" r="3" fill="#A29BFE"/></svg>需要导师经验判断</div></div><div class="layer-card l2"><div class="layer-label">L2 · 人机协作</div><div class="layer-items"><span>结构评估</span><span>论证逻辑</span><span>数据分析</span></div><div class="layer-indicator"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#6C5CE7" stroke-width="1.2"/><path d="M4 7h6" stroke="#6C5CE7" stroke-width="1.2" stroke-linecap="round"/></svg>AI 辅助 + 导师确认</div></div><div class="layer-card l1"><div class="layer-label">L1 · AI 自动</div><div class="layer-items"><span>格式校验</span><span>语法修正</span><span>引用核查</span><span>文献检索</span></div><div class="layer-indicator"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#4ECDC4" stroke-width="1.2"/><path d="M4 7l2 2 4-4" stroke="#4ECDC4" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>全自动处理 · 秒级响应</div></div></div></div></div>
      </div>
      <div class="feature-block reverse" data-animate="fade-up">
        <div class="feature-content"><div class="feature-icon-wrap"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="url(#sh)" stroke-width="1.5"/><path d="M12 8v4M12 16h.01" stroke="url(#sh)" stroke-width="2" stroke-linecap="round"/><defs><linearGradient id="sh" x1="2" y1="2" x2="22" y2="22"><stop stop-color="#00B894"/><stop offset="1" stop-color="#00CEC9"/></linearGradient></defs></svg></div><h3 class="feature-title">透明化 AI 使用边界</h3><p class="feature-desc">主动披露AI辅助范围，建立信任与合规框架。不做AI代写，从"禁止AI"转向"规范治理"，让学术诚信在透明中得以保障。</p><ul class="feature-list"><li><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8l3 3 5-5" stroke="#00B894" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>完整AI辅助日志，每次操作可追溯</li><li><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8l3 3 5-5" stroke="#00B894" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>自动生成AI使用声明书</li><li><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8l3 3 5-5" stroke="#00B894" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>清晰界定AI辅助与学生原创边界</li></ul></div>
        <div class="feature-visual"><div class="fv-transparency"><div class="fv-header"><span class="fv-dot green"></span><span>ai_transparency_log</span></div><div class="fv-transparency-body"><div class="trans-header-row"><span>AI 辅助使用报告</span><span class="trans-badge">合规 ✓</span></div><div class="trans-item"><div class="trans-icon grammar">Aa</div><div class="trans-detail"><span class="trans-action">语法润色</span><span class="trans-scope">修正 12 处语法问题，保留原意</span></div><span class="trans-status allowed">允许</span></div><div class="trans-item"><div class="trans-icon format">F</div><div class="trans-detail"><span class="trans-action">格式调整</span><span class="trans-scope">统一引用格式为 APA 第7版</span></div><span class="trans-status allowed">允许</span></div><div class="trans-item"><div class="trans-icon search">S</div><div class="trans-detail"><span class="trans-action">文献推荐</span><span class="trans-scope">推荐 5 篇相关文献供参考</span></div><span class="trans-status allowed">允许</span></div><div class="trans-divider"></div><div class="trans-item blocked"><div class="trans-icon block">✕</div><div class="trans-detail"><span class="trans-action">内容生成</span><span class="trans-scope">请求代写论文段落</span></div><span class="trans-status blocked">禁止</span></div></div></div></div>
      </div>
    </div>
  </section>

  <section class="insight-section" id="insight">
    <div class="container">
      <div class="section-header" data-animate="fade-up"><span class="section-label">关键洞察</span><h2 class="section-title">结构性问题需要<br>结构性解决方案</h2></div>
      <div class="insight-grid" data-animate="fade-up" data-delay="100">
        <div class="insight-card main"><div class="insight-card-glow"></div><span class="insight-icon">⚡</span><h3>核心矛盾</h3><p class="insight-highlight">师生配比 1:17 vs 学术指导需求增长</p><p>在结构性资源稀缺下，传统导师制已无法承载日益增长的学术指导需求。我们需要的不是更多导师，而是更智能的指导体系。</p></div>
        <div class="insight-card"><span class="insight-icon">🔬</span><h3>不做"AI代写"</h3><p>我们坚守学术诚信底线。AI只处理标准化流程问题，绝不触碰学术创作本身。</p></div>
        <div class="insight-card"><span class="insight-icon">🎯</span><h3>聚焦分层服务</h3><p>用AI处理格式、语法、文献检索等标准化问题，释放导师时间处理高价值创造性指导。</p></div>
        <div class="insight-card"><span class="insight-icon">⏱️</span><h3>实时反馈</h3><p>利用AI的即时性解决反馈延迟导致的记忆流失问题，构建持续学习的正向循环。</p></div>
        <div class="insight-card"><span class="insight-icon">🛡️</span><h3>透明治理</h3><p>主动披露AI辅助范围，从禁止转向规范治理，建立信任与合规框架。</p></div>
      </div>
    </div>
  </section>

  <section class="values-section" id="values">
    <div class="container">
      <div class="section-header" data-animate="fade-up"><span class="section-label">核心价值</span><h2 class="section-title">四大核心价值主张</h2><p class="section-desc">从分层指导到透明治理，系统性解决学术指导领域的结构性痛点。</p></div>
      <div class="values-grid" data-animate="fade-up" data-delay="100">
        <div class="value-card"><div class="value-number">01</div><div class="value-icon-box"><svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M16 4L4 10l12 6 12-6L16 4z" stroke="#6C5CE7" stroke-width="1.5" stroke-linejoin="round"/><path d="M4 16l12 6 12-6" stroke="#6C5CE7" stroke-width="1.5" stroke-linejoin="round" opacity="0.7"/><path d="M4 22l12 6 12-6" stroke="#6C5CE7" stroke-width="1.5" stroke-linejoin="round" opacity="0.4"/></svg></div><h3>分层学术指导体系</h3><p>解决导师资源稀缺与需求不匹配的核心矛盾，建立AI+导师的分层协作模型。</p><div class="value-tag">AI处理80% · 导师聚焦20%</div></div>
        <div class="value-card"><div class="value-number">02</div><div class="value-icon-box"><svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="12" stroke="#F39C12" stroke-width="1.5"/><path d="M16 10v6l4 4" stroke="#F39C12" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="16" r="2" fill="#F39C12"/></svg></div><h3>实时反馈循环系统</h3><p>突破传统72小时反馈周期限制，利用AI即时性构建持续学习的正向反馈循环。</p><div class="value-tag">72h → &lt;3s · 记忆零流失</div></div>
        <div class="value-card"><div class="value-number">03</div><div class="value-icon-box"><svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M6 26L6 6" stroke="#4ECDC4" stroke-width="1.5" stroke-linecap="round"/><path d="M6 6h20" stroke="#4ECDC4" stroke-width="1.5" stroke-linecap="round"/><path d="M10 20l5-6 4 3 7-9" stroke="#4ECDC4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="26" cy="8" r="3" stroke="#4ECDC4" stroke-width="1.5"/></svg></div><h3>结构化学术训练路径</h3><p>替代低效的试错学习模式，提供循序渐进的结构化训练，让学术能力稳步提升。</p><div class="value-tag">告别试错 · 系统化成长</div></div>
        <div class="value-card"><div class="value-number">04</div><div class="value-icon-box"><svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M16 4L4 10v12l12 6 12-6V10L16 4z" stroke="#00B894" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 16l3 3 5-5" stroke="#00B894" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div><h3>透明化AI辅助治理框架</h3><p>从禁止转向规范治理，建立可信赖的AI使用透明化体系，守护学术诚信。</p><div class="value-tag">从禁止到规范 · 全程可追溯</div></div>
      </div>
    </div>
  </section>

  <section class="principles-section" id="principles">
    <div class="container">
      <div class="section-header" data-animate="fade-up"><span class="section-label">设计理念</span><h2 class="section-title">我们坚信的原则</h2></div>
      <div class="principles-grid" data-animate="fade-up" data-delay="100">
        <div class="principle-card"><h4>放大器，非替代者</h4><p>AI是导师能力的延伸，而非取代。我们增强而不消解教育中的人文关怀。</p></div>
        <div class="principle-card"><h4>标准化归AI，创造性归人</h4><p>清晰的分工边界让每个参与者在最擅长的领域创造最大价值。</p></div>
        <div class="principle-card"><h4>即时反馈优于延迟完美</h4><p>3秒内的80分反馈，远胜于72小时后的100分反馈。时效性决定学习效果。</p></div>
        <div class="principle-card"><h4>透明优于禁止</h4><p>与其禁止使用AI，不如规范其使用。透明化治理是学术诚信的最佳守护者。</p></div>
        <div class="principle-card"><h4>系统化优于碎片化</h4><p>结构化的训练路径胜过碎片式的指导，让学术成长可衡量、可预测。</p></div>
        <div class="principle-card"><h4>数据驱动，持续进化</h4><p>基于使用数据不断优化指导策略，让系统随着使用越来越智能。</p></div>
      </div>
    </div>
  </section>

  <section class="cta-section" id="cta">
    <div class="cta-glow"></div>
    <div class="container">
      <div class="cta-content" data-animate="fade-up">
        <h2 class="cta-title">准备好重新定义<br><span class="gradient-text">学术指导</span>了吗？</h2>
        <p class="cta-desc">加入 Acad Co-Pilot，让AI成为导师的得力助手，<br>为每一位学生提供高质量的学术指导体验。</p>
        <div class="cta-actions">
          ${ctaButton}
          <a href="#" class="btn-secondary large">联系我们</a>
        </div>
        <p class="cta-note">面向高校及研究机构开放申请</p>
      </div>
    </div>
  </section>

  <footer class="footer">
    <div class="container">
      <div class="footer-top">
        <div class="footer-brand"><div class="footer-logo">${logoSvg}<span>Acad Co-Pilot</span></div><p>论文导师的智能助手</p></div>
        <div class="footer-links">
          <div class="footer-col"><h5>产品</h5><a href="#features">功能概览</a><a href="#">格式检查</a><a href="#">语法润色</a><a href="#">文献检索</a></div>
          <div class="footer-col"><h5>资源</h5><a href="#">帮助文档</a><a href="#">API 接口</a><a href="#">更新日志</a><a href="#">常见问题</a></div>
          <div class="footer-col"><h5>关于</h5><a href="#insight">核心洞察</a><a href="#values">价值主张</a><a href="#principles">设计理念</a><a href="#">联系我们</a></div>
        </div>
      </div>
      <div class="footer-bottom"><span>&copy; 2026 Acad Co-Pilot. All rights reserved.</span><div class="footer-bottom-links"><a href="#">隐私政策</a><a href="#">服务条款</a><a href="#">学术诚信承诺</a></div></div>
    </div>
  </footer>

  <script src="/static/app.js"></script>
</body>
</html>`

  return c.html(html)
})

export default app

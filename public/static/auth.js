/* ======================================
   Acad Co-Pilot — Auth & Dashboard JS
   ====================================== */
;(function () {
  'use strict'

  // ========== PASSWORD TOGGLE ==========
  document.querySelectorAll('.toggle-pw').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetId = btn.getAttribute('data-target')
      var input = document.getElementById(targetId)
      if (!input) return
      var isPassword = input.type === 'password'
      input.type = isPassword ? 'text' : 'password'
      // Swap icon between eye and eye-off
      btn.innerHTML = isPassword
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    })
  })

  // ========== PASSWORD STRENGTH METER ==========
  var pwInput = document.getElementById('password')
  var pwStrength = document.getElementById('pw-strength')
  var pwFill = document.getElementById('pw-fill')
  var pwLabel = document.getElementById('pw-label')

  if (pwInput && pwStrength && pwFill && pwLabel) {
    // Only show strength meter on signup page
    var signupForm = document.getElementById('signup-form')
    if (signupForm) {
      pwInput.addEventListener('input', function () {
        var val = pwInput.value
        if (!val) {
          pwStrength.classList.remove('visible')
          return
        }
        pwStrength.classList.add('visible')

        var score = 0
        if (val.length >= 6) score++
        if (val.length >= 10) score++
        if (/[A-Z]/.test(val)) score++
        if (/[0-9]/.test(val)) score++
        if (/[^A-Za-z0-9]/.test(val)) score++

        pwFill.className = 'pw-fill'
        if (score <= 1) {
          pwFill.classList.add('weak')
          pwLabel.textContent = '弱'
          pwLabel.style.color = '#e74c3c'
        } else if (score <= 3) {
          pwFill.classList.add('medium')
          pwLabel.textContent = '中等'
          pwLabel.style.color = '#F39C12'
        } else {
          pwFill.classList.add('strong')
          pwLabel.textContent = '强'
          pwLabel.style.color = '#00B894'
        }
      })
    }
  }

  // ========== HELPER: Show error ==========
  function showError(msg) {
    var errorEl = document.getElementById('form-error')
    if (!errorEl) return
    errorEl.textContent = msg
    errorEl.classList.add('show')
    // Re-trigger shake animation
    errorEl.style.animation = 'none'
    // Force reflow
    void errorEl.offsetWidth
    errorEl.style.animation = ''
  }

  function hideError() {
    var errorEl = document.getElementById('form-error')
    if (!errorEl) return
    errorEl.classList.remove('show')
  }

  // ========== HELPER: Toggle loading state ==========
  function setLoading(loading) {
    var btn = document.getElementById('btn-submit')
    if (!btn) return
    var textEl = btn.querySelector('.btn-text')
    var loadingEl = btn.querySelector('.btn-loading')
    if (loading) {
      btn.disabled = true
      if (textEl) textEl.style.display = 'none'
      if (loadingEl) loadingEl.style.display = 'flex'
    } else {
      btn.disabled = false
      if (textEl) textEl.style.display = ''
      if (loadingEl) loadingEl.style.display = 'none'
    }
  }

  // ========== SIGN-UP FORM ==========
  var signupForm = document.getElementById('signup-form')
  if (signupForm) {
    signupForm.addEventListener('submit', async function (e) {
      e.preventDefault()
      hideError()

      var name = document.getElementById('name').value.trim()
      var email = document.getElementById('email').value.trim()
      var password = document.getElementById('password').value
      var role = document.getElementById('role').value
      var institution = document.getElementById('institution').value.trim()

      // Client-side validation
      if (!name) { showError('请输入您的姓名'); return }
      if (!email) { showError('请输入邮箱地址'); return }
      if (password.length < 6) { showError('密码至少需要6个字符'); return }

      var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) { showError('请输入有效的邮箱地址'); return }

      setLoading(true)

      try {
        var res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name, email: email, password: password, role: role, institution: institution })
        })

        var data = await res.json()

        if (!res.ok) {
          showError(data.error || '注册失败，请稍后重试')
          setLoading(false)
          return
        }

        // Success — redirect to dashboard
        window.location.href = '/dashboard'
      } catch (err) {
        showError('网络错误，请检查网络连接')
        setLoading(false)
      }
    })
  }

  // ========== LOGIN FORM ==========
  var loginForm = document.getElementById('login-form')
  if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault()
      hideError()

      var email = document.getElementById('email').value.trim()
      var password = document.getElementById('password').value

      if (!email) { showError('请输入邮箱地址'); return }
      if (!password) { showError('请输入密码'); return }

      setLoading(true)

      try {
        var res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password })
        })

        var data = await res.json()

        if (!res.ok) {
          showError(data.error || '登录失败，请稍后重试')
          setLoading(false)
          return
        }

        // Success — redirect to dashboard
        window.location.href = '/dashboard'
      } catch (err) {
        showError('网络错误，请检查网络连接')
        setLoading(false)
      }
    })
  }

  // ========== DASHBOARD: User dropdown ==========
  var avatarBtn = document.getElementById('user-avatar-btn')
  var dropdown = document.getElementById('user-dropdown')

  if (avatarBtn && dropdown) {
    avatarBtn.addEventListener('click', function (e) {
      e.stopPropagation()
      dropdown.classList.toggle('open')
    })

    // Close dropdown when clicking outside
    document.addEventListener('click', function (e) {
      if (!dropdown.contains(e.target) && e.target !== avatarBtn) {
        dropdown.classList.remove('open')
      }
    })

    // Escape key closes dropdown
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        dropdown.classList.remove('open')
      }
    })
  }

  // ========== DASHBOARD: Logout ==========
  var logoutBtn = document.getElementById('btn-logout')
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function () {
      try {
        await fetch('/api/auth/logout', { method: 'POST' })
      } catch (e) {
        // Ignore errors — we redirect regardless
      }
      window.location.href = '/login'
    })
  }

  // ========== Form input focus effects ==========
  document.querySelectorAll('.auth-form input, .auth-form select').forEach(function (input) {
    input.addEventListener('focus', function () {
      var group = input.closest('.form-group')
      if (group) group.classList.add('focused')
    })
    input.addEventListener('blur', function () {
      var group = input.closest('.form-group')
      if (group) group.classList.remove('focused')
    })
  })
})()

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

  // ========== HELPERS ==========
  function showError(id, msg) {
    var errorEl = document.getElementById(id)
    if (!errorEl) return
    errorEl.textContent = msg
    errorEl.classList.add('show')
    errorEl.style.animation = 'none'
    void errorEl.offsetWidth
    errorEl.style.animation = ''
  }

  function hideError(id) {
    var errorEl = document.getElementById(id)
    if (!errorEl) return
    errorEl.classList.remove('show')
  }

  function setBtnLoading(btn, loading) {
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

  // ========== SIGN-UP: Two-Step Flow ==========
  var verifiedEmail = ''  // track verified email across steps
  var countdownTimer = null

  // Step 1: Send code initial button
  var btnSendInit = document.getElementById('btn-send-init')
  var btnSendCode = document.getElementById('btn-send-code')
  var btnVerify = document.getElementById('btn-verify')
  var codeGroup = document.getElementById('code-group')
  var emailInput = document.getElementById('email')

  function startCountdown(btnEl) {
    var seconds = 60
    var textEl = btnEl.querySelector('.send-text')
    var countdownEl = btnEl.querySelector('.send-countdown')
    if (!textEl || !countdownEl) return

    btnEl.disabled = true
    textEl.style.display = 'none'
    countdownEl.style.display = ''
    countdownEl.textContent = seconds + 's'

    countdownTimer = setInterval(function () {
      seconds--
      countdownEl.textContent = seconds + 's'
      if (seconds <= 0) {
        clearInterval(countdownTimer)
        countdownTimer = null
        btnEl.disabled = false
        textEl.style.display = ''
        countdownEl.style.display = 'none'
        textEl.textContent = '重新发送'
      }
    }, 1000)
  }

  async function sendCode(email, loadingBtn) {
    hideError('form-error')

    if (!email) { showError('form-error', '请输入邮箱地址'); return false }
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) { showError('form-error', '请输入有效的邮箱地址'); return false }

    if (loadingBtn) setBtnLoading(loadingBtn, true)

    try {
      var res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email })
      })
      var data = await res.json()

      if (!res.ok) {
        showError('form-error', data.error || '发送失败')
        if (loadingBtn) setBtnLoading(loadingBtn, false)
        return false
      }

      // DEV: show the code in a subtle way for testing
      if (data._dev_code) {
        console.log('[DEV] Verification code:', data._dev_code)
        // Auto-fill for dev convenience
        var vcodeInput = document.getElementById('vcode')
        if (vcodeInput) vcodeInput.value = data._dev_code
      }

      return true
    } catch (err) {
      showError('form-error', '网络错误，请检查连接')
      if (loadingBtn) setBtnLoading(loadingBtn, false)
      return false
    }
  }

  // Initial "发送验证码" button (before code input is visible)
  if (btnSendInit) {
    btnSendInit.addEventListener('click', async function () {
      var email = emailInput ? emailInput.value.trim() : ''
      var success = await sendCode(email, btnSendInit)
      if (success) {
        // Transition: hide init button, show code input + verify + resend
        btnSendInit.style.display = 'none'
        if (codeGroup) codeGroup.style.display = ''
        if (btnVerify) btnVerify.style.display = ''
        if (emailInput) emailInput.readOnly = true
        // Start countdown on the inline resend button
        if (btnSendCode) startCountdown(btnSendCode)
        // Focus code input
        var vcodeInput = document.getElementById('vcode')
        if (vcodeInput) vcodeInput.focus()
      }
      setBtnLoading(btnSendInit, false)
    })
  }

  // Resend button (inline, after initial send)
  if (btnSendCode) {
    btnSendCode.addEventListener('click', async function () {
      var email = emailInput ? emailInput.value.trim() : ''
      var success = await sendCode(email, null)
      if (success) {
        startCountdown(btnSendCode)
      }
    })
  }

  // Verify code form
  var emailVerifyForm = document.getElementById('email-verify-form')
  if (emailVerifyForm) {
    emailVerifyForm.addEventListener('submit', async function (e) {
      e.preventDefault()
      hideError('form-error')

      var email = emailInput ? emailInput.value.trim() : ''
      var code = document.getElementById('vcode') ? document.getElementById('vcode').value.trim() : ''

      if (!code || code.length !== 6) {
        showError('form-error', '请输入6位验证码')
        return
      }

      setBtnLoading(btnVerify, true)

      try {
        var res = await fetch('/api/auth/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, code: code })
        })
        var data = await res.json()

        if (!res.ok) {
          showError('form-error', data.error || '验证失败')
          setBtnLoading(btnVerify, false)
          return
        }

        // Success: go to step 2
        verifiedEmail = email
        document.getElementById('step-1').style.display = 'none'
        document.getElementById('step-2').style.display = ''

        // Update step indicator
        document.getElementById('step-ind-1').classList.remove('active')
        document.getElementById('step-ind-1').classList.add('done')
        document.getElementById('step-line').classList.add('done')
        document.getElementById('step-ind-2').classList.add('active')

        // Show verified email
        var verifiedEmailEl = document.getElementById('verified-email')
        if (verifiedEmailEl) verifiedEmailEl.textContent = email

        // Focus name input
        var nameInput = document.getElementById('name')
        if (nameInput) nameInput.focus()

        // Re-bind password toggle for step 2 elements
        document.querySelectorAll('#step-2 .toggle-pw').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var targetId = btn.getAttribute('data-target')
            var input = document.getElementById(targetId)
            if (!input) return
            var isPassword = input.type === 'password'
            input.type = isPassword ? 'text' : 'password'
            btn.innerHTML = isPassword
              ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
              : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
          })
        })
      } catch (err) {
        showError('form-error', '网络错误，请检查连接')
        setBtnLoading(btnVerify, false)
      }
    })
  }

  // Step 2: Complete registration
  var signupForm = document.getElementById('signup-form')
  if (signupForm) {
    signupForm.addEventListener('submit', async function (e) {
      e.preventDefault()
      hideError('form-error-2')

      var name = document.getElementById('name').value.trim()
      var password = document.getElementById('password').value
      var role = document.getElementById('role').value
      var institution = document.getElementById('institution').value.trim()

      if (!name) { showError('form-error-2', '请输入您的姓名'); return }
      if (password.length < 6) { showError('form-error-2', '密码至少需要6个字符'); return }

      var btn = document.getElementById('btn-submit')
      setBtnLoading(btn, true)

      try {
        var res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name,
            email: verifiedEmail,
            password: password,
            role: role,
            institution: institution
          })
        })

        var data = await res.json()

        if (!res.ok) {
          showError('form-error-2', data.error || '注册失败，请稍后重试')
          setBtnLoading(btn, false)
          return
        }

        window.location.href = '/dashboard'
      } catch (err) {
        showError('form-error-2', '网络错误，请检查连接')
        setBtnLoading(btn, false)
      }
    })
  }

  // ========== LOGIN FORM ==========
  var loginForm = document.getElementById('login-form')
  if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault()
      hideError('form-error')

      var email = document.getElementById('email').value.trim()
      var password = document.getElementById('password').value

      if (!email) { showError('form-error', '请输入邮箱地址'); return }
      if (!password) { showError('form-error', '请输入密码'); return }

      var btn = document.getElementById('btn-submit')
      setBtnLoading(btn, true)

      try {
        var res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password })
        })

        var data = await res.json()

        if (!res.ok) {
          showError('form-error', data.error || '登录失败，请稍后重试')
          setBtnLoading(btn, false)
          return
        }

        window.location.href = '/dashboard'
      } catch (err) {
        showError('form-error', '网络错误，请检查连接')
        setBtnLoading(btn, false)
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
    document.addEventListener('click', function (e) {
      if (!dropdown.contains(e.target) && e.target !== avatarBtn) {
        dropdown.classList.remove('open')
      }
    })
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') dropdown.classList.remove('open')
    })
  }

  // ========== DASHBOARD: Logout ==========
  var logoutBtn = document.getElementById('btn-logout')
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function () {
      try { await fetch('/api/auth/logout', { method: 'POST' }) } catch (e) {}
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

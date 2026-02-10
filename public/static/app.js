/* ======================================
   Acad Co-Pilot — Interactions & Animations
   ====================================== */

(function () {
  'use strict';

  // ==================
  // Scroll Animations (Intersection Observer)
  // ==================
  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -60px 0px',
    threshold: 0.1
  };

  const animateOnScroll = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const delay = parseInt(el.dataset.delay || '0', 10);
        setTimeout(() => {
          el.classList.add('visible');
        }, delay);
        animateOnScroll.unobserve(el);
      }
    });
  }, observerOptions);

  document.querySelectorAll('[data-animate]').forEach((el) => {
    animateOnScroll.observe(el);
  });

  // ==================
  // Navbar Scroll Effect
  // ==================
  const nav = document.getElementById('nav');
  let lastScroll = 0;

  function handleNavScroll() {
    const scrollY = window.scrollY;
    if (scrollY > 40) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
    lastScroll = scrollY;
  }

  window.addEventListener('scroll', handleNavScroll, { passive: true });
  handleNavScroll();

  // ==================
  // Smooth Scroll for Anchor Links
  // ==================
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      
      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        const navHeight = 64;
        const top = targetEl.getBoundingClientRect().top + window.scrollY - navHeight;
        window.scrollTo({
          top: top,
          behavior: 'smooth'
        });
      }
    });
  });

  // ==================
  // Dashboard Sidebar Hover
  // ==================
  document.querySelectorAll('.dash-nav-item').forEach((item) => {
    item.addEventListener('click', function () {
      document.querySelectorAll('.dash-nav-item').forEach((i) => i.classList.remove('active'));
      this.classList.add('active');
    });
  });

  // ==================
  // Metric Counter Animation
  // ==================
  function animateMetrics() {
    const metrics = document.querySelectorAll('.metric-fill');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const fill = entry.target;
          const width = fill.style.width;
          fill.style.width = '0%';
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              fill.style.width = width;
            });
          });
          observer.unobserve(fill);
        }
      });
    }, { threshold: 0.5 });

    metrics.forEach((m) => observer.observe(m));
  }

  animateMetrics();

  // ==================
  // Progress Bar Animation
  // ==================
  function animateProgressBars() {
    const bars = document.querySelectorAll('.fv-progress-fill');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const bar = entry.target;
          const width = bar.style.width;
          bar.style.width = '0%';
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              bar.style.width = width;
            });
          });
          observer.unobserve(bar);
        }
      });
    }, { threshold: 0.5 });

    bars.forEach((b) => observer.observe(b));
  }

  animateProgressBars();

  // ==================
  // Subtle Hover Parallax on Cards
  // ==================
  function initCardHoverEffects() {
    const cards = document.querySelectorAll('.stat-card, .insight-card, .value-card, .principle-card');
    
    cards.forEach((card) => {
      card.addEventListener('mousemove', function (e) {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = (y - centerY) / 25;
        const rotateY = (centerX - x) / 25;

        card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
      });

      card.addEventListener('mouseleave', function () {
        card.style.transform = '';
      });
    });
  }

  initCardHoverEffects();

  // ==================
  // Typing animation for chat
  // ==================
  function initTypingAnimation() {
    const typingEl = document.querySelector('.typing-indicator');
    if (!typingEl) return;
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          typingEl.style.opacity = '1';
        }
      });
    }, { threshold: 0.5 });

    observer.observe(typingEl);
  }

  initTypingAnimation();

  // ==================
  // Gradient glow following mouse on hero
  // ==================
  const heroGlow = document.querySelector('.hero-glow');
  const hero = document.querySelector('.hero');

  if (heroGlow && hero) {
    hero.addEventListener('mousemove', function (e) {
      const rect = hero.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      heroGlow.style.left = x + 'px';
      heroGlow.style.top = (y - 200) + 'px';
      heroGlow.style.transform = 'translateX(-50%)';
    });
  }

  // ==================
  // Feature visual stagger animation
  // ==================
  function initFeatureVisuals() {
    const visuals = document.querySelectorAll('.feature-visual');
    
    visuals.forEach((visual) => {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const lines = visual.querySelectorAll('.fv-line, .trans-item, .layer-card, .chat-msg');
            lines.forEach((line, i) => {
              line.style.opacity = '0';
              line.style.transform = 'translateY(8px)';
              line.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
              setTimeout(() => {
                line.style.opacity = '1';
                line.style.transform = 'translateY(0)';
              }, 100 + i * 80);
            });
            observer.unobserve(visual);
          }
        });
      }, { threshold: 0.3 });

      observer.observe(visual);
    });
  }

  initFeatureVisuals();

  // ==================
  // Stat number count-up animation
  // ==================
  function animateStatNumbers() {
    const stats = document.querySelectorAll('.stat-number');
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const text = el.textContent;
          
          // Only animate pure numbers
          if (/^\d+$/.test(text.replace(/[%h:s<>]/g, ''))) {
            const num = parseInt(text.replace(/[^0-9]/g, ''), 10);
            const suffix = text.replace(/[0-9.]/g, '');
            const prefix = text.match(/^[<>]/) ? text.match(/^[<>]/)[0] : '';
            const cleanNum = num;
            let start = 0;
            const duration = 1200;
            const startTime = performance.now();

            function update(currentTime) {
              const elapsed = currentTime - startTime;
              const progress = Math.min(elapsed / duration, 1);
              // Ease out cubic
              const eased = 1 - Math.pow(1 - progress, 3);
              const current = Math.round(start + (cleanNum - start) * eased);
              el.textContent = prefix + current + suffix;
              
              if (progress < 1) {
                requestAnimationFrame(update);
              }
            }
            
            requestAnimationFrame(update);
          }
          
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.5 });

    stats.forEach((s) => observer.observe(s));
  }

  animateStatNumbers();

})();

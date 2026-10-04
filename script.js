if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.addEventListener('pageshow', () => window.scrollTo({ top: 0, behavior: 'instant' }));

// ── Fast Page Loader Dismissal (CSP Compliant) ───────────────────────────
function dismissLoader() {
  const loader = document.getElementById('pageLoader');
  if (!loader || loader.classList.contains('loader-done')) return;
  loader.classList.add('loader-done');
  setTimeout(() => {
    try { loader.remove(); } catch (_) {}
  }, 450);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  dismissLoader();
} else {
  document.addEventListener('DOMContentLoaded', dismissLoader, { once: true });
  window.addEventListener('load', dismissLoader, { once: true });
}

document.addEventListener('DOMContentLoaded', () => {
  dismissLoader();
  window.scrollTo({ top: 0, behavior: 'instant' });

  // ── Security Logger ──────────────────────────────────────────────────────
  // Local diagnostics only. Never include URLs, field values or provider messages.
  // Server-side failures are logged separately by the Worker.
  const secLog = {
    _fmt: (level, event, detail) => ({
      level, event,
      status: Number.isInteger(detail?.status) ? detail.status : undefined,
      ts: new Date().toISOString(),
    }),
    warn:  (event, detail) => console.warn('[KECPA-SEC]',  JSON.stringify(secLog._fmt('WARN',  event, detail))),
    error: (event, detail) => console.error('[KECPA-SEC]', JSON.stringify(secLog._fmt('ERROR', event, detail))),
    info:  (event, detail) => console.info('[KECPA-SEC]',  JSON.stringify(secLog._fmt('INFO',  event, detail))),
  };

  // ── Form Rate Limiter ─────────────────────────────────────────────────────
  // Browser convenience only; Formspree must enforce server-side abuse controls.
  const RATE_LIMIT_MS = 60_000;
  const RL_KEY = 'kecpa_form_last_submit';
  let lastSubmission = 0;
  function getLastSubmission() {
    try { return parseInt(localStorage.getItem(RL_KEY) || '0', 10) || lastSubmission; }
    catch { return lastSubmission; }
  }
  function isRateLimited() {
    return Date.now() - getLastSubmission() < RATE_LIMIT_MS;
  }
  function markSubmission() {
    lastSubmission = Date.now();
    try { localStorage.setItem(RL_KEY, String(lastSubmission)); }
    catch { /* Private browsers can block storage; retain this session's cooldown. */ }
  }

  // ── Input Sanitizer ───────────────────────────────────────────────────────
  // Strips all HTML tags, script-injectable characters, and dangerous patterns
  // from a string before it is sent anywhere. Defense against XSS / script injection.
  function sanitize(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/</g, '&lt;')          // block < (HTML tags / script injection)
      .replace(/>/g, '&gt;')          // block >
      .replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;') // escape stray &
      .replace(/"/g, '&quot;')        // block attribute injection
      .replace(/'/g, '&#x27;')        // block attribute injection
      .replace(/`/g, '&#x60;')        // block template literal injection
      .replace(/javascript:/gi, '')   // block javascript: URIs
      .replace(/on\w+\s*=/gi, '')     // block inline event handlers (onclick= etc.)
      .trim();
  }

  // ── Field Validators ──────────────────────────────────────────────────────
  // Each returns null if valid, or an error string if invalid.
  const ALLOWED_SERVICES = [
    '', 'Financial Accounting & Reporting', 'Tax Preparation & Planning',
    'Audit Support & Compliance', 'Bookkeeping & Payroll', 'Virtual CFO & Advisory'
  ];

  const validators = {
    name(v) {
      if (!v || v.length < 2)  return 'Name must be at least 2 characters.';
      if (v.length > 80)       return 'Name must be under 80 characters.';
      if (!/^[A-Za-z\s'\-]+$/.test(v)) return 'Name may only contain letters, spaces, hyphens, and apostrophes.';
      return null;
    },
    phone(v) {
      if (!v || v.length < 7)  return 'Phone number must be at least 7 digits.';
      if (v.length > 20)       return 'Phone number must be under 20 characters.';
      if (!/^[\+]?[0-9\s\-\(\)]+$/.test(v)) return 'Enter a valid phone number.';
      return null;
    },
    email(v) {
      if (!v)                  return 'Email address is required.';
      if (v.length > 254)      return 'Email address is too long.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address.';
      return null;
    },
    service(v) {
      if (!ALLOWED_SERVICES.includes(v)) {
        secLog.warn('INVALID_SELECT_VALUE', { field: 'service', value: v });
        return 'Please select a valid service from the list.';
      }
      return null;
    },
    message(v) {
      if (v.length > 2000) return 'Message must be under 2000 characters.';
      return null;
    }
  };

  // Show / clear inline validation errors
  function showFieldError(id, msg) {
    let el = document.getElementById(id + '_err');
    if (!el) {
      el = document.createElement('span');
      el.id = id + '_err';
      el.className = 'field-error';
      el.setAttribute('role', 'alert');
      document.getElementById(id)?.insertAdjacentElement('afterend', el);
    }
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
    const field = document.getElementById(id);
    field?.setAttribute('aria-invalid', String(Boolean(msg)));
    field?.setAttribute('aria-describedby', el.id);
  }

  // 1. NAVBAR SCROLL
  const navbar = document.getElementById('navbar');

  // 2. MOBILE MENU
  const menuToggle = document.getElementById('menuToggle');
  const navLinks = document.getElementById('navLinks');
  function setMenu(isOpen) {
    navLinks.classList.toggle('open', isOpen);
    menuToggle.classList.toggle('open', isOpen);
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  }
  menuToggle.addEventListener('click', () => setMenu(!navLinks.classList.contains('open')));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navLinks.classList.contains('open')) {
      setMenu(false);
      menuToggle.focus();
    }
  });
  document.addEventListener('click', event => {
    if (!navbar.contains(event.target)) setMenu(false);
  });
  navbar.addEventListener('focusout', event => {
    if (!navbar.contains(event.relatedTarget)) setMenu(false);
  });
  window.matchMedia('(min-width: 761px)').addEventListener('change', () => setMenu(false));
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      setMenu(false);
    });
  });

  // 3. SCROLL REVEAL
  // Native scroll: photo parallax, pinned service photos and finite reveals.
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const heroPhoto = document.querySelector('.hero-photo');
  const servicePhotos = [...document.querySelectorAll('.service-photo')];
  const serviceIndex = document.querySelector('.service-photo-index');
  const hero = document.querySelector('.hero');

  const cards = [...document.querySelectorAll('.service-card')];
  const processSteps = [...document.querySelectorAll('.process-step')];
  const process = document.getElementById('process');
  const progress = document.querySelector('.reading-progress');
  const navAnchors = [...navLinks.querySelectorAll('.nav-link')];
  const sections = [...document.querySelectorAll('main > section[id]')];
  const clamp = value => Math.min(1, Math.max(0, value));
  // Reveal once, with content visible even when observation/animation is unavailable.
  // Individual translate avoids competing with the scroll-driven card transforms.
  const revealAnimations = new Set();
  const revealTargets = [...document.querySelectorAll('.reveal-up, .reveal-left, .reveal-right, .footer-col, .footer-brand, .footer-wordmark')];
  if ('IntersectionObserver' in window && typeof Element.prototype.animate === 'function') {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        observer.unobserve(target);
        target.classList.add('motion-entered');
        if (motionPreference.matches || target.contains(document.activeElement)) return;
        const sideways = window.innerWidth > 760 && target.matches('.reveal-left, .reveal-right');
        const bounds = target.getBoundingClientRect();
        const fromLeft = target.matches('.reveal-left');
        const room = Math.max(0, (fromLeft ? bounds.left : innerWidth - bounds.right) - 2);
        const x = sideways ? Math.min(48, room) * (fromLeft ? -1 : 1) : 0;
        const siblings = [...target.parentElement.children].filter(el => revealTargets.includes(el));
        const delay = Math.min(Math.max(0, siblings.indexOf(target)) * 120, 300);
        const animation = target.animate([
          { opacity: 0, translate: `${x}px ${sideways ? 24 : 56}px`, filter: 'blur(4px)' },
          { opacity: 1, translate: '0px 0px', filter: 'blur(0px)' }
        ], { duration: 950, delay, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
        revealAnimations.add(animation);
        animation.finished.then(() => revealAnimations.delete(animation), () => revealAnimations.delete(animation));
      });
    }, { threshold: 0, rootMargin: '0px 0px -6% 0px' });
    revealTargets.forEach(el => observer.observe(el));
  }
  document.addEventListener('focusin', () => {
    revealAnimations.forEach(animation => {
      if (animation.effect.target.contains(document.activeElement)) animation.cancel();
    });
  });
  // Read untransformed layout on resize only. Measuring animated bounds on every
  // scroll creates feedback and visible judder as cards rotate into position.
  let cardLayout = [], stepLayout = [];
  function measureMotion() {
    const measure = el => {
      let top = 0;
      for (let node = el; node; node = node.offsetParent) top += node.offsetTop;
      return { top, height: el.offsetHeight };
    };
    cardLayout = cards.map(measure);
    let stepTop = measure(document.querySelector('.process-steps')).top;
    stepLayout = processSteps.map(step => {
      const rect = { top: stepTop, height: step.offsetHeight };
      stepTop += step.offsetHeight + parseFloat(getComputedStyle(step).marginBottom);
      return rect;
    });
  }
  measureMotion();
  let frame = 0;
  function renderMotion() {
    frame = 0;
    const height = window.innerHeight;
    const reduced = motionPreference.matches;
    const desktop = window.innerWidth > 760;
    const heroRect = hero.getBoundingClientRect();
    const processRect = process.getBoundingClientRect();

    const cardRects = cardLayout.map(rect => ({ top: rect.top - window.scrollY, bottom: rect.top + rect.height - window.scrollY }));
    const sectionRects = sections.map(section => section.getBoundingClientRect());
    const scrollRange = document.documentElement.scrollHeight - height;
    progress.style.transform = `scaleX(${clamp(window.scrollY / Math.max(1, scrollRange))})`;
    navbar.classList.toggle('scrolled', window.scrollY > 30);
    const current = sections.filter((section, i) => sectionRects[i].top < height * .4).at(-1)?.id || 'home';
    navAnchors.forEach(link => {
      if (link.hash === `#${current}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    const activeService = Math.max(0, cardRects.findLastIndex(rect => rect.top < height * .6));
    servicePhotos.forEach((photo, i) => photo.classList.toggle('is-active', i === activeService));
    serviceIndex.textContent = `0${activeService + 1} / 05`;
    if (reduced) {
      revealAnimations.forEach(animation => animation.cancel());
      heroPhoto.style.transform = '';
      [...cards, ...processSteps].forEach(el => el.style.transform = '');
      return;
    }
    if (heroRect.bottom > 0) {
      const p = clamp(-heroRect.top / heroRect.height);
      heroPhoto.style.transform = desktop ? `scale(${1.08 + p * .1}) translateY(${p * 5}%)` : '';
    }
    cards.forEach((card, i) => {
      const rect = cardRects[i];
      if (rect.bottom < 0 || rect.top > height) return;
      const enter = clamp((rect.top - height * .35) / (height * .65));
      card.style.transform = `translateY(${enter * (desktop ? 48 : 16)}px)`;
    });
    processSteps.forEach((step, i) => {
      if (processRect.bottom < 0 || processRect.top > height) return;
      const p = clamp((height * .9 - (stepLayout[i].top - window.scrollY)) / (height * .45));
      const next = stepLayout[i + 1];
      const covered = next ? clamp((height * .7 - (next.top - window.scrollY)) / (height * .7 - 48)) : 0;
      step.style.transform = desktop ? `scale(${.92 + p * .08 - covered * .045})` : `translateY(${(1-p)*16}px)`;
    });
  }
  function scheduleMotion() { if (!frame) frame = requestAnimationFrame(renderMotion); }
  window.addEventListener('scroll', scheduleMotion, { passive: true });
  window.addEventListener('resize', () => { measureMotion(); scheduleMotion(); }, { passive: true });
  motionPreference.addEventListener('change', scheduleMotion);
  document.fonts.ready.then(() => { measureMotion(); scheduleMotion(); });
  window.addEventListener('load', () => { measureMotion(); scheduleMotion(); }, { once: true });
  scheduleMotion();


  // VISITOR BADGE — src set via JS to avoid HTML & encoding issues; extraCount seeds from 1000
  const badge = document.getElementById('visitorBadge');
  if (badge) {
    badge.src = 'https://hits.sh/knowledgeexcellencecpa.com.svg?style=flat&label=Visitors&color=b8860b&labelColor=0a1628&extraCount=1000';
  }

  // 6. SCROLL TO TOP
  document.getElementById('scrollTop')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: motionPreference.matches ? 'instant' : 'smooth' });
  });

  // 7. CONTACT FORM — with sanitization, validation, rate limiting, honeypot
  const contactForm = document.getElementById('contactForm');
  const submitBtn   = document.getElementById('submitBtn');
  const formStatus  = document.getElementById('formStatus');

  // Character counter for message field
  const msgArea    = document.getElementById('message');
  const msgCounter = document.getElementById('msgCounter');
  if (msgArea && msgCounter) {
    msgArea.addEventListener('input', () => {
      const len = msgArea.value.length;
      msgCounter.textContent = `${len} / 2000`;
      msgCounter.style.color = len > 1800 ? '#dc2626' : '';
    });
  }

  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // 1. Honeypot check
      const honeypot = contactForm.querySelector('input[name="_gotcha"]');
      if (honeypot && honeypot.value) {
        secLog.warn('HONEYPOT_TRIGGERED', { field: '_gotcha' });
        return;
      }

      // 2. Rate limit check
      if (isRateLimited()) {
        const remaining = Math.ceil((RATE_LIMIT_MS - (Date.now() - getLastSubmission())) / 1000);
        secLog.warn('RATE_LIMIT_HIT', { cooldown_s: remaining });
        formStatus.className = 'form-status error';
        formStatus.textContent = `⚠️ Please wait ${remaining}s before sending another message.`;
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…';
      formStatus.className = 'form-status';
      formStatus.textContent = '';

      // 3. Validate all fields — show inline errors, abort if any fail
      const fields = { name: 'name', phone: 'phone', email: 'email', service: 'service', message: 'message' };
      let hasError = false;
      for (const [field, id] of Object.entries(fields)) {
        const el  = document.getElementById(id);
        const val = el ? el.value : '';
        const err = validators[field] ? validators[field](val) : null;
        showFieldError(id, err);
        if (err) hasError = true;
      }
      if (hasError) {
        secLog.warn('VALIDATION_FAILED', { fields: Object.keys(fields) });
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Message';
        contactForm.querySelector('[aria-invalid="true"]')?.focus();
        return;
      }

      // 4. Sanitize — build a clean FormData with stripped values only
      const cleanData = new FormData();
      cleanData.append('name',    sanitize(document.getElementById('name').value));
      cleanData.append('phone',   sanitize(document.getElementById('phone').value));
      cleanData.append('email',   sanitize(document.getElementById('email').value));
      cleanData.append('service', sanitize(document.getElementById('service').value));
      cleanData.append('message', sanitize(document.getElementById('message').value));

      try {
        const res = await fetch(contactForm.action, {
          method: 'POST',
          body: cleanData,
          headers: { 'Accept': 'application/json' }
        });

        if (res.ok) {
          markSubmission();
          secLog.info('FORM_SUBMIT_SUCCESS', { status: res.status });
          formStatus.className = 'form-status success';
          formStatus.textContent = '✅ Thank you! We\'ll be in touch within 24 hours.';
          contactForm.reset();
          if (msgCounter) msgCounter.textContent = '0 / 2000';
        } else {
          const data = await res.json().catch(() => ({}));
          const msg = data.errors ? data.errors.map(e => e.message).join(', ') : 'Submission failed.';
          secLog.error('FORM_SUBMIT_FAILED', { status: res.status, msg });
          formStatus.className = 'form-status error';
          formStatus.textContent = '❌ ' + msg;
        }
      } catch (err) {
        secLog.error('FORM_NETWORK_ERROR', { message: err.message });
        formStatus.className = 'form-status error';
        formStatus.textContent = '❌ Network error. Please email us directly.';
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Message';
      }
    });
  }

  // Log unhandled JS errors (unusual JS exceptions may indicate tampering)
  window.addEventListener('error', (e) => {
    secLog.error('UNHANDLED_JS_ERROR', { message: e.message, file: e.filename, line: e.lineno });
  });

  // Log failed resource loads (CSP violations, blocked scripts, missing assets)
  window.addEventListener('error', (e) => {
    if (e.target && e.target !== window) {
      secLog.warn('RESOURCE_LOAD_FAILED', { tag: e.target.tagName, src: e.target.src || e.target.href });
    }
  }, true);

});

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
  // Structured client-side logging for anomalies, API errors, and spam attempts.
  // In production, replace console.warn with a POST to your logging endpoint.
  const secLog = {
    _fmt: (level, event, detail) => ({
      level, event, detail,
      ts: new Date().toISOString(),
      url: location.href,
      ua: navigator.userAgent.slice(0, 120)
    }),
    warn:  (event, detail) => console.warn('[KECPA-SEC]',  JSON.stringify(secLog._fmt('WARN',  event, detail))),
    error: (event, detail) => console.error('[KECPA-SEC]', JSON.stringify(secLog._fmt('ERROR', event, detail))),
    info:  (event, detail) => console.info('[KECPA-SEC]',  JSON.stringify(secLog._fmt('INFO',  event, detail))),
  };

  // ── Form Rate Limiter ─────────────────────────────────────────────────────
  // Prevents repeated submissions within 60 seconds.
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
  // Finite, scroll-linked 3D motion. No scroll hijacking or perpetual render loop.
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const world = document.querySelector('.finance-world');
  const hero = document.querySelector('.hero');
  const columns = [...document.querySelectorAll('.growth-column')];
  const cards = [...document.querySelectorAll('.service-card')];
  const processSteps = [...document.querySelectorAll('.process-step')];
  const process = document.getElementById('process');
  const processRail = document.querySelector('.process-steps');
  const globe = document.querySelector('.globe-line-2');
  const globalMap = document.querySelector('.global-map');
  const cta = document.querySelector('.cta-banner');
  const ctaOrbits = [...document.querySelectorAll('.cta-orbits span')];
  const progress = document.querySelector('.reading-progress');
  const navAnchors = [...navLinks.querySelectorAll('.nav-link')];
  const sections = [...document.querySelectorAll('main > section[id]')];
  const clamp = value => Math.min(1, Math.max(0, value));
  let pointerX = 0, pointerY = 0, frame = 0;
  function renderMotion() {
    frame = 0;
    const height = window.innerHeight;
    const reduced = motionPreference.matches;
    const desktop = window.innerWidth > 760;
    const heroRect = hero.getBoundingClientRect();
    const processRect = process.getBoundingClientRect();
    const mapRect = globalMap.getBoundingClientRect();
    const ctaRect = cta.getBoundingClientRect();
    const cardRects = cards.map(card => card.getBoundingClientRect());
    const sectionRects = sections.map(section => section.getBoundingClientRect());
    const scrollRange = document.documentElement.scrollHeight - height;
    progress.style.transform = `scaleX(${clamp(window.scrollY / Math.max(1, scrollRange))})`;
    navbar.classList.toggle('scrolled', window.scrollY > 30);
    const current = sections.filter((section, i) => sectionRects[i].top < height * .4).at(-1)?.id || 'home';
    navAnchors.forEach(link => {
      if (link.hash === `#${current}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    if (reduced) {
      world.style.transform = '';
      [...cards, ...columns, ...processSteps, ...ctaOrbits, globe].forEach(el => el.style.transform = '');
      processRail.style.setProperty('--process-progress', '1');
      return;
    }
    if (heroRect.bottom > 0) {
      const p = clamp(-heroRect.top / heroRect.height);
      world.style.transform = `rotateX(${-19 + p * 16 + pointerY * 4}deg) rotateY(${-31 + p * 42 + pointerX * 9}deg) translateY(${-p * 1.875}em)`;
      columns.forEach((column, i) => column.style.transform = `translateY(${-p * i * .875}em)`);
    }
    cards.forEach((card, i) => {
      const rect = cardRects[i];
      if (!desktop) { card.style.transform = ''; return; }
      if (rect.bottom < 0 || rect.top > height) return;
      const enter = clamp((rect.top - height * .5) / (height * .6));
      card.style.transform = desktop && !card.matches(':focus-within, :hover') ? `rotateX(${enter * 12}deg) translateY(${enter * 18}px)` : '';
    });
    const processProgress = clamp((height - processRect.top) / (height * .85));
    processRail.style.setProperty('--process-progress', String(processProgress));
    processSteps.forEach((step, i) => {
      if (!desktop) { step.style.transform = ''; return; }
      if (processRect.bottom < 0 || processRect.top > height) return;
      const p = clamp((processProgress - i * .12) / .64);
      step.style.transform = desktop ? `rotateX(${(1 - p) * 16}deg) translateY(${(1 - p) * 28}px)` : '';
    });
    if (mapRect.top < height && mapRect.bottom > 0) globe.style.transform = `rotate(${-18 + clamp((height - mapRect.top) / height) * 45}deg) scaleX(.5)`;
    if (ctaRect.top < height && ctaRect.bottom > 0) {
      const p = clamp((height - ctaRect.top) / (height + ctaRect.height));
      ctaOrbits.forEach((ring, i) => ring.style.transform = `rotateX(${52 + p * 20}deg) rotateZ(${-35 + p * 45 + i * 5}deg)`);
    }
  }
  function scheduleMotion() { if (!frame) frame = requestAnimationFrame(renderMotion); }
  window.addEventListener('scroll', scheduleMotion, { passive: true });
  window.addEventListener('resize', scheduleMotion, { passive: true });
  motionPreference.addEventListener('change', scheduleMotion);
  hero.addEventListener('pointermove', event => {
    if (!finePointer.matches || motionPreference.matches) return;
    const rect = hero.getBoundingClientRect();
    pointerX = (event.clientX - rect.left) / rect.width - .5;
    pointerY = (event.clientY - rect.top) / rect.height - .5;
    scheduleMotion();
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { pointerX = pointerY = 0; scheduleMotion(); });
  document.fonts.ready.then(scheduleMotion);
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

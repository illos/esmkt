  document.getElementById('footerYear').textContent = new Date().getFullYear();

  // ─── Fallback hours (used if API is unavailable) ──────────────────────────
  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  let siteSettings = {
    storeHours: DAYS.map(d => ({ day:d, open:'08:30', close:'19:30', closed:false })),
    snackbarHours:  DAYS.map((d,i) => ({ day:d, open:i<6?'09:00':null, close:i<6?'15:00':null, closed:i===6 })),
  };

  // ─── Time helpers ─────────────────────────────────────────────────────────
  function toMins(t) { if (!t) return null; const [h,m] = t.split(':').map(Number); return h*60+m; }
  function fmt12(t) {
    if (!t) return '—';
    const [h,m] = t.split(':').map(Number);
    const ampm = h < 12 ? 'AM' : 'PM';
    const h12  = h % 12 || 12;
    return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
  }

  function todayHours(hoursArr) {
    // JS getDay(): 0=Sun, 1=Mon … 6=Sat
    // Our array: 0=Mon … 6=Sun
    const jsDay = new Date().getDay();
    const idx   = jsDay === 0 ? 6 : jsDay - 1;
    return hoursArr[idx] || null;
  }

  function hoursVary(hoursArr) {
    const open = hoursArr.filter(h => !h.closed);
    if (!open.length) return false;
    const first = `${open[0].open}|${open[0].close}`;
    return open.some(h => `${h.open}|${h.close}` !== first);
  }

  function summarizeDays(hoursArr) {
    const open   = hoursArr.filter(h => !h.closed);
    const closed = hoursArr.filter(h => h.closed);
    if (!closed.length) return 'Open Every Day';
    if (closed.length === 1) return `Closed ${closed[0].day}`;
    const openDays = open.map(h => h.day);
    if (!openDays.length) return 'Closed Every Day';
    return `${openDays[0]} \u2013 ${openDays[openDays.length-1]}`;
  }

  function renderHoursCard(hoursArr, timeId, daysId, scheduleId) {
    const timeEl  = document.getElementById(timeId);
    const daysEl  = document.getElementById(daysId);
    const schedEl = document.getElementById(scheduleId);
    const open    = hoursArr.filter(h => !h.closed);

    if (!open.length) {
      // All days closed
      timeEl.textContent = 'Closed'; daysEl.textContent = 'All Days';
      timeEl.style.display = ''; daysEl.style.display = '';
      schedEl.style.display = 'none';
      return;
    }

    if (hoursVary(hoursArr)) {
      // Mixed times — show per-day table
      timeEl.style.display = 'none'; daysEl.style.display = 'none';
      schedEl.style.display = '';
      const now = new Date();
      const todayIdx = now.getDay() === 0 ? 6 : now.getDay() - 1;
      schedEl.innerHTML = hoursArr.map((h, i) => {
        const timeStr = h.closed ? 'Closed' : `${fmt12(h.open)} \u2013 ${fmt12(h.close)}`;
        const classes = [
          i === todayIdx ? 'is-today' : '',
          h.closed ? 'is-closed' : '',
        ].filter(Boolean).join(' ');
        return `<div class="hours-schedule-row${classes ? ' '+classes : ''}">
          <span class="hours-schedule-day">${h.day}</span>
          <span class="hours-schedule-time">${timeStr}</span>
        </div>`;
      }).join('');
    } else {
      // All open days have same time — simple display
      timeEl.textContent = `${fmt12(open[0].open)} \u2013 ${fmt12(open[0].close)}`;
      daysEl.textContent = summarizeDays(hoursArr);
      timeEl.style.display = ''; daysEl.style.display = '';
      schedEl.style.display = 'none';
    }
  }

  // ─── Update store open/closed pill ────────────────────────────────────────
  function updateStoreStatus() {
    const today = todayHours(siteSettings.storeHours);
    const el    = document.getElementById('storeStatus');
    if (!el) return;
    if (!today || today.closed || !today.open) {
      el.textContent = 'Closed Today';
      el.className   = 'store-status is-closed';
      return;
    }
    const now     = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    const opens   = toMins(today.open);
    const closes  = toMins(today.close);
    let text, state;
    if (current >= opens && current < closes) {
      text = 'Open Now'; state = 'is-open';
    } else if (current < opens) {
      text = `Opens ${fmt12(today.open)}`; state = 'is-closed';
    } else {
      text = `Opens ${fmt12(today.open)} Tomorrow`; state = 'is-closed';
    }
    el.textContent = text;
    el.className   = `store-status ${state}`;
  }

  // ─── Render links (hero panel, nav overlay, footer) ──────────────────────
  function renderLinks(links) {
    const ql = (links && links.length) ? links : DEFAULT_LINKS;

    // 1. Hero quick-links panel
    const heroPanel = document.getElementById('heroLinksPanel');
    if (heroPanel) {
      const header = heroPanel.querySelector('.hv2-links-header');
      heroPanel.querySelectorAll('.hv2-link').forEach(el => el.remove());
      ql.forEach(lk => {
        const isExt = lk.url.startsWith('http');
        const a = document.createElement('a');
        a.href = lk.url;
        a.className = 'hv2-link';
        if (isExt) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        a.innerHTML = `<span>${escNavHtml(lk.text)}</span><span class="hv2-arr">&rarr;</span>`;
        heroPanel.appendChild(a);
      });
    }

    // 2. Nav overlay
    renderNavLinks(ql);

    // 3. Footer quick links
    const footerEl = document.getElementById('footerQuickLinks');
    if (footerEl) {
      footerEl.innerHTML = ql.map(lk => {
        const isExt  = lk.url.startsWith('http');
        const target = isExt ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<a href="${escNavHtml(lk.url)}" class="gf-link"${target}>${escNavHtml(lk.text)}</a>`;
      }).join('');
    }
  }

  // ─── Render hours cards ───────────────────────────────────────────────────
  function renderHoursCards() {
    renderHoursCard(siteSettings.storeHours,   'storeHoursTime',           'storeHoursDays',           'storeHoursSchedule');
    renderHoursCard(siteSettings.snackbarHours,'snackbarHoursTime',        'snackbarHoursDays',        'snackbarHoursSchedule');
    // Footer copies
    if (document.getElementById('footerStoreHoursTime')) {
      renderHoursCard(siteSettings.storeHours,    'footerStoreHoursTime',    'footerStoreHoursDays',    'footerStoreHoursSchedule');
      renderHoursCard(siteSettings.snackbarHours, 'footerSnackbarHoursTime', 'footerSnackbarHoursDays', 'footerSnackbarHoursSchedule');
    }
  }

  // ─── Apply site-info fields from settings ────────────────────────────────
  function applySiteInfo(s) {
    if (!s) return;
    if (s.phone) {
      const digits = s.phone.replace(/\D/g, '');
      const navPhone    = document.getElementById('navPhone');
      const callBtn     = document.getElementById('callBtn');
      const callBtnPhone = document.getElementById('callBtnPhone');
      const footerPhone = document.getElementById('footerPhone');
      if (navPhone)     { navPhone.textContent = s.phone; navPhone.href = `tel:${digits}`; }
      if (callBtn)      { callBtn.href = `tel:${digits}`; }
      if (callBtnPhone) { callBtnPhone.textContent = s.phone; }
      if (footerPhone)  { footerPhone.textContent = s.phone; }
    }
    if (s.heroDescription) {
      const el = document.getElementById('heroDesc');
      if (el) el.textContent = s.heroDescription;
    }
    if (s.heroButtonText || s.heroButtonLink) {
      const btn = document.getElementById('heroBtn');
      if (btn) {
        if (s.heroButtonText) btn.textContent = s.heroButtonText;
        if (s.heroButtonLink) btn.href = s.heroButtonLink;
      }
    }
    if (s.heroBgPhoto) {
      const heroBg = document.getElementById('heroBgImg');
      if (heroBg) heroBg.style.backgroundImage = `url('/images/${s.heroBgPhoto}')`;
    }
  }

  // ─── Load settings + events from API ─────────────────────────────────────
  async function initSite() {
    // Render links with defaults immediately so page isn't blank
    renderLinks(null);
    try {
      const [settingsRes, eventsRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/events'),
      ]);
      if (settingsRes.ok) {
        const sData = await settingsRes.json();
        // sData.deliHours is the KV field name — copy to snackbarHours for local use
        siteSettings = { ...sData, snackbarHours: sData.deliHours };
        applySiteInfo(siteSettings);
        renderLinks(siteSettings.quickLinks || null);
      }
      if (eventsRes.ok) {
        const eData = await eventsRes.json();
        renderEvents(eData.events || []);
      }
    } catch(_) { /* API unavailable — use fallback */ }
    renderHoursCards();
    updateStoreStatus();
  }

  // ─── Render events section ────────────────────────────────────────────────
  function renderEvents(events) {
    if (!events.length) return; // section stays hidden
    const grid    = document.getElementById('eventsGrid');
    const section = document.getElementById('events');
    grid.innerHTML = events.map((ev, idx) => {
      const dateStr = ev.date
        ? new Date(ev.date + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })
        : '';
      const imgHtml = ev.photo
        ? `<img class="event-img" src="/images/${ev.photo}" alt="${escHtml(ev.title)}" loading="lazy"/>`
        : `<div class="event-img-placeholder">&#10022;</div>`;
      const ctaHtml = (ev.ctaText && ev.ctaLink)
        ? `<a class="event-cta-btn" href="${escHtml(ev.ctaLink)}" target="_blank" rel="noopener noreferrer">${escHtml(ev.ctaText)} &rarr;</a>`
        : '';
      const body = `<div class="event-body topo-light">
          ${dateStr ? `<div class="event-date">${dateStr}</div>` : ''}
          <div class="event-title">${escHtml(ev.title)}</div>
          ${ev.description ? `<div class="event-desc">${escHtml(ev.description)}</div>` : ''}
          ${ctaHtml}
        </div>`;
      if (idx === 0) {
        // Featured: text left, image right, full image visible
        return `<div class="event-card event-card--featured">
          ${body}
          ${imgHtml}
        </div>`;
      }
      // Standard card: image on top, text below
      return `<div class="event-card event-card--standard">
        ${imgHtml}
        ${body}
      </div>`;
    }).join('');
    section.style.display = '';
  }

  function escHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  initSite();
  setInterval(updateStoreStatus, 60_000);

// ─── Exploring Esmeralda — scroll-driven trail animation ─────────────────────
(function () {
  var trail  = null;
  var fill   = null;
  var stops  = null;
  var ticking = false;

  function getProgress() {
    var rect  = trail.getBoundingClientRect();
    var viewH = window.innerHeight;
    // 0 when trail top hits 80% down screen → 1 when trail bottom leaves top of screen
    var start = viewH * 0.8;
    var total = rect.height + start;
    var done  = start - rect.top;
    return Math.max(0, Math.min(1, done / total));
  }

  function update() {
    ticking = false;
    var prog = getProgress();
    fill.style.height = (prog * 100) + '%';

    // Activate each stop when its marker crosses 68% down the viewport
    stops.forEach(function (stop) {
      var sr = stop.getBoundingClientRect();
      if (sr.top < window.innerHeight * 0.68) {
        stop.classList.add('is-active');
      }
    });
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    trail = document.getElementById('exploreTrail');
    fill  = document.getElementById('trailFill');
    stops = document.querySelectorAll('.explore-stop');
    if (!trail || !fill || !stops.length) return;
    window.addEventListener('scroll', onScroll, { passive: true });
    update(); // run once on load in case already scrolled
  });
}());


// Patch applySiteInfo: hero bg now drives an <img> src instead of CSS background
(function () {
  var _orig = applySiteInfo;
  applySiteInfo = function (s) {
    _orig(s); // handles phone, heroDesc, heroBtn
    if (s && s.heroBgPhoto) {
      var photo = document.getElementById('heroBgImg');
      if (photo) photo.style.backgroundImage = "url('/images/" + s.heroBgPhoto + "')";
    }
    // Mirror phone to the Call Us quick-link
    if (s && s.phone) {
      var el = document.getElementById('heroCallLink');
      if (el) el.href = 'tel:' + s.phone.replace(/\D/g, '');
    }
  };
}());

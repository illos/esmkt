/* ═══════════════════════════════════════════════════════════════════════════
   SECTIONS — shared section-type registry and render engine
   Used by both index.html (for rendering the page) and admin.html (for
   building forms and the sections list UI, in later phases).

   Design goal: the output of renderSection({type, data}) must produce HTML
   visually identical to the hand-authored markup in index.legacy.html.
   The existing CSS in css/index.css and css/base.css is untouched.

   Loaded as a plain script (no build step). Attaches its exports to
   window.SECTIONS so both pages can use them.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ─── util: HTML escape ────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─── SVG ICON LIBRARY ─────────────────────────────────────────────────────
  // Inner markup for each named icon. Wrapped in an <svg> by svgIcon().
  var SVG_ICONS = {
    // Banner icons (lucide-style)
    'send':      '<path d="M3 11l19-9-9 19-2-8-8-2z"/>',
    'sparkles':  '<path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M19.07 4.93l-2.83 2.83"/><path d="M7.76 16.24l-2.83 2.83"/><circle cx="12" cy="12" r="3"/>',
    'fuel':      '<path d="M3 22V6a2 2 0 012-2h8a2 2 0 012 2v16"/><path d="M3 22h12"/><path d="M9 6v4"/><path d="M15 10h2a2 2 0 012 2v2a2 2 0 002 2v0a2 2 0 002-2V8l-3-3"/><path d="M19 5v0a1 1 0 011 1v1"/>',
    'compass':   '<circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
    'map-pin':   '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>',

    // Service icons (the existing 10 on the current homepage, in order)
    'drink':        '<path d="M7 3h10l-1.5 9H8.5L7 3z"/><path d="M8.5 12v7a1 1 0 001 1h5a1 1 0 001-1v-7"/><path d="M5 7h14"/><path d="M10 16h4"/>',
    'shopping-bag': '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>',
    'box':          '<path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>',
    'snowflake':    '<line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/><line x1="19.07" y1="4.93" x2="4.93" y2="19.07"/>',
    'coffee':       '<path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>',
    'bottle':       '<path d="M5 3h11l1 4H5V3z"/><path d="M5 7v13a1 1 0 001 1h9a1 1 0 001-1V7"/><path d="M17 9h2a2 2 0 010 4h-2"/>',
    'leaf':         '<path d="M12 2a9 9 0 00-6.36 15.36C7.24 19 9.5 20 12 20s4.76-1 6.36-2.64A9 9 0 0012 2z"/><path d="M12 2c0 4-2 7-2 10s2 6 2 8"/><path d="M6.5 8c2 1 5 1.5 5.5 4"/><path d="M17.5 8c-2 1-5 1.5-5.5 4"/>',
    'mountains':    '<path d="M3 11l4-4 4 4 4-4 4 4"/><path d="M3 18l4-4 4 4 4-4 4 4"/>',
    'restroom':     '<circle cx="9" cy="4" r="1.5"/><path d="M6 8h6l-1 5H7L6 8z"/><path d="M7 13l-1 5h4l.5-2.5"/><path d="M10 13l1 5h-1"/><circle cx="17" cy="4" r="1.5"/><path d="M14.5 8h5l-1 5h-3l-1-5z"/><path d="M15.5 13l-1 5h4l-1-5"/>',
    'wifi':         '<path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none"/>'
  };

  function svgIcon(name) {
    var inner = SVG_ICONS[name];
    if (!inner) return '';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }

  // ─── BANNER VARIANTS ──────────────────────────────────────────────────────
  var BANNER_VARIANTS = [
    { value: 'snackbar',  label: 'Snackbar (teal/green)', className: 'snackbar-banner'  },
    { value: 'fireworks', label: 'Fireworks (red)',        className: 'fireworks-banner' },
    { value: 'fuel',      label: 'Fuel (gold/amber)',      className: 'fuel-banner'      },
    { value: 'explore',   label: 'Explore (blue/slate)',   className: 'explore-banner'   },
    { value: 'see-you',   label: 'See You Soon (purple)',  className: 'see-you-banner'   }
  ];

  function bannerVariantClass(value) {
    for (var i = 0; i < BANNER_VARIANTS.length; i++) {
      if (BANNER_VARIANTS[i].value === value) return BANNER_VARIANTS[i].className;
    }
    return BANNER_VARIANTS[0].className;
  }

  // ─── RENDER FUNCTIONS ─────────────────────────────────────────────────────
  // One per section type. Each returns an HTML string.
  // Render functions receive the raw `data` object from the section + a `ctx`
  // carrying { settings, events } loaded by index.js.

  var SVG_CALL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.47 11.47 0 003.58.57 1 1 0 011 1V21a1 1 0 01-1 1A17 17 0 013 5a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.58a1 1 0 01-.25 1.01z"/></svg>';

  function renderHero(d, ctx) {
    var settings    = (ctx && ctx.settings) || {};
    var phone       = settings.phone || '775-572-3200';
    var phoneDigits = phone.replace(/\D/g, '');
    var bgImage     = d.bg_photo    ? '/images/' + d.bg_photo    : 'assets/landscape.jpg';
    var storePhoto  = d.store_photo ? '/images/' + d.store_photo : 'assets/store-photo.jpg';
    var description     = d.description       != null ? d.description       : (settings.heroDescription || '');
    var primaryCtaLabel = d.primary_cta_label != null ? d.primary_cta_label : (settings.heroButtonText  || 'Order from the Snackbar');
    var primaryCtaLink  = d.primary_cta_link  != null ? d.primary_cta_link  : (settings.heroButtonLink  || 'menu.html');

    var headlineParts = [];
    if (d.eyebrow)  headlineParts.push('<span class="hv2-eyebrow">' + esc(d.eyebrow)  + '</span>');
    if (d.name)     headlineParts.push('<span class="hv2-name">'    + esc(d.name)     + '</span>');
    if (d.subtitle) headlineParts.push('<span class="hv2-market">'  + esc(d.subtitle) + '</span>');
    if (d.tagline)  headlineParts.push('<span class="hv2-tagline">' + d.tagline       + '</span>');

    var linksPanelHtml = '';
    if (d.show_links_panel !== false) {
      linksPanelHtml =
        '<nav class="hv2-links-panel" id="heroLinksPanel" aria-label="Quick links">' +
          '<div class="hv2-links-header">Links</div>' +
        '</nav>';
    }

    return [
      '<section class="hero-v2 topo">',
        '<div class="hero-v2-inner">',
          '<div class="hero-v2-left">',
            '<div class="hv2-headline">',
              headlineParts.join(''),
            '</div>',
            '<div class="hv2-divider"></div>',
            '<p class="hv2-desc" id="heroDesc">' + esc(description) + '</p>',
            '<div class="hv2-ctas">',
              '<a href="tel:' + esc(phoneDigits) + '" class="btn-call" id="callBtn">',
                SVG_CALL,
                '<span id="callBtnPhone">' + esc(phone) + '</span>',
              '</a>',
              '<a href="' + esc(primaryCtaLink) + '" class="btn-order" id="heroBtn">' + esc(primaryCtaLabel) + ' \u2192</a>',
            '</div>',
          '</div>',
          '<div class="hero-v2-right">',
            '<div class="hv2-photo" id="heroBgImg" style="background-image: url(\'' + esc(bgImage) + '\')"></div>',
            '<div class="hv2-store-pop">',
              '<img src="' + esc(storePhoto) + '" alt="Esmeralda Market storefront"/>',
            '</div>',
          '</div>',
          linksPanelHtml,
        '</div>',
      '</section>'
    ].join('');
  }

  function renderBanner(d) {
    var variantClass = bannerVariantClass(d.variant);
    var iconHtml = svgIcon(d.icon || 'sparkles');
    var hasCta  = !!(d.cta_label && d.cta_link);
    var showStar = d.show_star === true;

    var trailingHtml;
    if (hasCta) {
      trailingHtml = '<a href="' + esc(d.cta_link) + '" class="banner-menu-btn">' + esc(d.cta_label) + ' \u2192</a>';
    } else if (showStar) {
      trailingHtml = '<span class="service-banner-star">\u2726</span>';
    } else {
      trailingHtml = '';
    }

    var subtitleHtml = d.subtitle ? '<span class="service-banner-sub">' + d.subtitle + '</span>' : '';

    return [
      '<div class="service-banner ' + variantClass + '">',
        '<div class="service-banner-inner">',
          '<div class="service-banner-icon">' + iconHtml + '</div>',
          '<div class="service-banner-body">',
            '<span class="service-banner-title">' + esc(d.title || '') + '</span>',
            subtitleHtml,
          '</div>',
          trailingHtml,
        '</div>',
      '</div>'
    ].join('');
  }

  function renderArticle(d) {
    // Body is passed through unescaped; future richtext (Trix) will provide safe HTML.
    var imageSrc  = d.image ? '/images/' + d.image : '';
    var labelHtml = d.section_label ? '<div class="section-label">' + esc(d.section_label) + '</div>' : '';
    var titleHtml = d.title         ? '<h2 class="section-heading">' + esc(d.title) + '</h2>'        : '';
    var imgHtml   = imageSrc        ? '<img class="article-image" src="' + esc(imageSrc) + '" alt="" loading="lazy" style="width:100%;max-height:400px;object-fit:cover;border-radius:4px;margin:20px 0;"/>' : '';
    var bodyHtml  = d.body          ? '<div class="article-body">' + d.body + '</div>' : '';

    return [
      '<section class="section article topo">',
        '<div class="section-inner">',
          labelHtml,
          titleHtml,
          imgHtml,
          bodyHtml,
        '</div>',
      '</section>'
    ].join('');
  }

  function renderEvents(d) {
    // This renders the scaffold only — events themselves are fetched from
    // /api/events by index.js and populated into #eventsGrid.
    var showFb  = d.show_facebook_strip !== false;
    var fbUrl   = d.facebook_url   || 'https://www.facebook.com/WhiteMountainsNV';
    var fbTitle = d.facebook_title || 'Follow us on Facebook';
    var fbSub   = d.facebook_sub   || 'Get the latest news, specials &amp; events from Esmeralda Market';
    var fbCta   = d.facebook_cta   || 'Follow Our Page';

    var fbStripHtml = '';
    if (showFb) {
      fbStripHtml = [
        '<div class="fb-follow-strip">',
          '<svg class="fb-follow-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.884v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>',
          '<div class="fb-follow-text">',
            '<span class="fb-follow-title">' + esc(fbTitle) + '</span>',
            '<span class="fb-follow-sub">'   + fbSub        + '</span>',
          '</div>',
          '<a href="' + esc(fbUrl) + '" target="_blank" rel="noopener noreferrer" class="fb-follow-btn">' + esc(fbCta) + ' \u2192</a>',
        '</div>'
      ].join('');
    }

    return [
      '<section class="section events topo" id="events" style="display:none">',
        '<div class="section-inner">',
          '<div class="section-label">' + esc(d.section_label || 'Whats new') + '</div>',
          '<h2 class="section-heading">' + esc(d.heading || 'Upcoming Events') + '</h2>',
          '<div class="events-grid" id="eventsGrid"></div>',
          fbStripHtml,
        '</div>',
      '</section>'
    ].join('');
  }

  function renderHours(d) {
    var showLocation  = d.show_location_card !== false;
    var mapsUrl       = d.maps_url        || 'https://maps.app.goo.gl/dhU5oMRYwXpTUhmY9';
    var addr1         = d.address_line_1  || 'HWY 264, Mile Marker 8';
    var addr2         = d.address_line_2  || 'Dyer, NV&nbsp;&nbsp;89010';
    var addrSub       = d.address_sub     || 'Fish Lake Valley \u00b7 Esmeralda County, NV';
    var marketLabel   = d.market_label    || 'Market \u00b7 Gas';
    var marketName    = d.market_name     || 'Esmeralda Market';
    var snackbarLabel = d.snackbar_label  || 'Hot Food \u00b7 Made Fresh Daily';
    var snackbarName  = d.snackbar_name   || 'Snackbar';

    var locationHtml = '';
    if (showLocation) {
      locationHtml = [
        '<div class="hours-card location-card topo-light">',
          '<div class="hours-card-type">Location</div>',
          '<div class="hours-card-name">Find Us</div>',
          '<div class="location-address">',
            '<div class="location-line">' + addr1   + '</div>',
            '<div class="location-line">' + addr2   + '</div>',
            '<div class="location-sub">'  + addrSub + '</div>',
          '</div>',
          '<a href="' + esc(mapsUrl) + '" target="_blank" rel="noopener noreferrer" class="btn-maps">',
            '<span class="btn-maps-icon">\uD83D\uDCCD</span>',
            'Open in Google Maps',
          '</a>',
        '</div>'
      ].join('');
    }

    return [
      '<section class="section info-strip" id="hours">',
        '<div class="section-inner" style="padding-bottom:0">',
          '<div class="section-label">' + esc(d.section_label || "We're here for you") + '</div>',
          '<h2 class="section-heading">' + esc(d.heading || 'Business Hours') + '</h2>',
        '</div>',
        '<div class="info-strip-inner">',
          '<div class="hours-card topo-light">',
            '<div class="hours-card-type">' + esc(marketLabel) + '</div>',
            '<div class="hours-card-name">' + esc(marketName)  + '</div>',
            '<div class="hours-time" id="storeHoursTime">8:30 AM \u2013 7:30 PM</div>',
            '<div class="hours-days" id="storeHoursDays">Open Every Day</div>',
            '<div class="hours-schedule" id="storeHoursSchedule" style="display:none"></div>',
          '</div>',
          '<div class="hours-card topo-light">',
            '<div class="hours-card-type">' + esc(snackbarLabel) + '</div>',
            '<div class="hours-card-name">' + esc(snackbarName)  + '</div>',
            '<div class="hours-time" id="snackbarHoursTime">9:00 AM \u2013 3:00 PM</div>',
            '<div class="hours-days" id="snackbarHoursDays">Monday \u2013 Saturday</div>',
            '<div class="hours-schedule" id="snackbarHoursSchedule" style="display:none"></div>',
          '</div>',
          locationHtml,
        '</div>',
      '</section>'
    ].join('');
  }

  function renderServices(d) {
    var items = Array.isArray(d.items) ? d.items : [];
    var itemsHtml = items.map(function (it) {
      return [
        '<div class="service-item topo-light">',
          '<div class="service-icon">' + svgIcon(it.icon || '') + '</div>',
          '<div class="service-label">' + (it.label || '') + '</div>',
        '</div>'
      ].join('');
    }).join('');

    return [
      '<section class="section services topo" id="services">',
        '<div class="section-inner">',
          '<div class="section-label">' + esc(d.section_label || 'What We Offer') + '</div>',
          '<h2 class="section-heading">' + esc(d.heading || 'Services') + '</h2>',
          '<div class="services-grid">' + itemsHtml + '</div>',
        '</div>',
      '</section>'
    ].join('');
  }

  function renderExplore(d) {
    var stops = Array.isArray(d.stops) ? d.stops : [];
    var stopsHtml = stops.map(function (stop, i) {
      var layout = stop.layout || 'text-right';
      // Image path: existing defaults use relative "assets/foo.webp"; user uploads will be bare filenames → /images/foo
      var imgSrc;
      if (!stop.image) {
        imgSrc = '';
      } else if (stop.image.indexOf('assets/') === 0 || stop.image.indexOf('/') !== -1) {
        imgSrc = stop.image;
      } else {
        imgSrc = '/images/' + stop.image;
      }
      var imgAlt = stop.title || '';
      var stopNum = i + 1;

      if (layout === 'hero') {
        var heroImgHtml = imgSrc ? '<img class="explore-hero-img" src="' + esc(imgSrc) + '" alt="' + esc(imgAlt) + '" loading="lazy"/>' : '';
        var heroTag     = stop.tag   ? '<div class="explore-tag">'       + esc(stop.tag)   + '</div>' : '';
        var heroTitle   = stop.title ? '<h3 class="explore-name explore-name--hero">' + esc(stop.title) + '</h3>' : '';
        var heroDesc    = stop.description ? '<p class="explore-desc">' + stop.description + '</p>' : '';
        return [
          '<div class="explore-stop" data-stop="' + i + '">',
            '<div class="stop-marker"><div class="stop-dot">' + stopNum + '</div></div>',
            '<div class="explore-card explore-card--hero topo-light">',
              '<div class="explore-hero-wrap">',
                heroImgHtml,
                '<div class="explore-hero-overlay">',
                  heroTag,
                  heroTitle,
                '</div>',
              '</div>',
              '<div class="explore-body explore-body--hero">',
                heroDesc,
              '</div>',
            '</div>',
          '</div>'
        ].join('');
      }

      // text-right: image left, body right (default card)
      // text-left:  body left,  image right (uses .explore-card--left modifier)
      var isTextLeft = (layout === 'text-left');
      var bodyTag   = stop.tag         ? '<div class="explore-tag">'  + esc(stop.tag)         + '</div>' : '';
      var bodyTitle = stop.title       ? '<h3 class="explore-name">' + esc(stop.title)       + '</h3>' : '';
      var bodyDesc  = stop.description ? '<p class="explore-desc">'  + stop.description      + '</p>'  : '';
      var bodyHtml = [
        '<div class="explore-body topo-light">',
          bodyTag,
          bodyTitle,
          bodyDesc,
        '</div>'
      ].join('');
      var imgHtml = imgSrc
        ? '<div class="explore-img-wrap"><img class="explore-img" src="' + esc(imgSrc) + '" alt="' + esc(imgAlt) + '" loading="lazy"/></div>'
        : '<div class="explore-img-wrap"></div>';

      var cardClass = isTextLeft ? 'explore-card explore-card--left' : 'explore-card';
      var inner = isTextLeft ? (bodyHtml + imgHtml) : (imgHtml + bodyHtml);

      return [
        '<div class="explore-stop" data-stop="' + i + '">',
          '<div class="stop-marker"><div class="stop-dot">' + stopNum + '</div></div>',
          '<div class="' + cardClass + '">',
            inner,
          '</div>',
        '</div>'
      ].join('');
    }).join('');

    var ledeHtml = d.lede ? '<p class="explore-lede">' + d.lede + '</p>' : '';
    var stripHtml = d.trail_strip_text ? [
      '<div class="hero-trail-strip">',
        '<span class="hero-trail-star">\u2726</span>',
        '<p class="hero-trail-text">' + d.trail_strip_text + '</p>',
        '<span class="hero-trail-star">\u2726</span>',
      '</div>'
    ].join('') : '';

    return [
      '<section class="section explore-section" id="explore">',
        '<div class="section-inner ">',
          ledeHtml,
          '<div class="explore-trail" id="exploreTrail">',
            '<div class="trail-line-track">',
              '<div class="trail-line-fill" id="trailFill"></div>',
            '</div>',
            stopsHtml,
          '</div>',
          stripHtml,
        '</div>',
      '</section>'
    ].join('');
  }

  function renderMenu(d) {
    // Reserved: snackbar ordering UI still lives at menu.html today.
    return [
      '<section class="section menu-section">',
        '<div class="section-inner">',
          '<div class="section-label">' + esc(d.section_label || 'Order Online') + '</div>',
          '<h2 class="section-heading">' + esc(d.heading || 'Snackbar Menu') + '</h2>',
          '<p style="text-align:center;color:var(--cream-dim);padding:40px 0">',
            'Menu ordering is on the <a href="menu.html" style="color:var(--gold)">Snackbar page</a>.',
          '</p>',
        '</div>',
      '</section>'
    ].join('');
  }

  function renderContactForm(d) {
    return [
      '<section class="section contact-section">',
        '<div class="section-inner">',
          '<div class="section-label">' + esc(d.section_label || 'Get in Touch') + '</div>',
          '<h2 class="section-heading">' + esc(d.heading || 'Contact Us') + '</h2>',
          '<p style="text-align:center;color:var(--cream-dim);padding:40px 0">',
            'Contact form is on the <a href="contact.html" style="color:var(--gold)">Contact page</a>.',
          '</p>',
        '</div>',
      '</section>'
    ].join('');
  }

  function renderFooterSection() { return ''; }

  /* ═══════════════════════════════════════════════════════════════════════
     SECTION TYPE REGISTRY
     - label:       display name in admin
     - icon:        emoji/char used in the admin section-list row
     - description: one-liner shown in the Add Section picker
     - category:    'custom' | 'generic' | 'reserved'
     - schema:      field definitions for the Phase 3 admin form builder
     - defaults:    seed data object for new instances
     - render:      fn(data, ctx) -> HTML string
     ═══════════════════════════════════════════════════════════════════════ */

  var SECTION_TYPES = {
    hero: {
      label: 'Hero',
      icon:  '\u2728',
      description: 'Large welcome section with headline, description, photos, and CTAs.',
      category: 'custom',
      schema: {
        eyebrow:           { type: 'text',     label: 'Eyebrow',           placeholder: 'Welcome to the' },
        name:              { type: 'text',     label: 'Name Line',         placeholder: 'Esmeralda' },
        subtitle:          { type: 'text',     label: 'Subtitle Line',     placeholder: 'Market' },
        tagline:           { type: 'text',     label: 'Tagline' },
        description:       { type: 'longtext', label: 'Description' },
        primary_cta_label: { type: 'text',     label: 'Button Label' },
        primary_cta_link:  { type: 'text',     label: 'Button Link' },
        bg_photo:          { type: 'image',    label: 'Background Photo' },
        store_photo:       { type: 'image',    label: 'Store Pop-out Photo' },
        show_links_panel:  { type: 'boolean',  label: 'Show Links Panel',  defaultValue: true }
      },
      defaults: {
        eyebrow: 'Welcome to the',
        name: 'Esmeralda',
        subtitle: 'Market',
        tagline: 'Gas &nbsp;&middot;&nbsp; Groceries &nbsp;&middot;&nbsp; Snackbar',
        description: 'Your full-service desert outpost in Fish Lake Valley \u2014 gas up, stock the cooler, and grab a scratch-made snackbar sandwich before hitting the open road.',
        primary_cta_label: 'Order from the Snackbar',
        primary_cta_link: 'menu.html',
        bg_photo: null,
        store_photo: null,
        show_links_panel: true
      },
      render: renderHero
    },

    banner: {
      label: 'Banner',
      icon:  '\u25AC',
      description: 'Narrow colored bar with icon, title, sub, and optional button.',
      category: 'generic',
      schema: {
        title:     { type: 'text',    label: 'Title' },
        subtitle:  { type: 'text',    label: 'Subtitle' },
        icon:      { type: 'icon',    label: 'Icon',     iconSet: ['send','sparkles','fuel','compass','map-pin'] },
        variant:   { type: 'select',  label: 'Color',    options: BANNER_VARIANTS },
        cta_label: { type: 'text',    label: 'Button Label (optional)' },
        cta_link:  { type: 'text',    label: 'Button Link (optional)' },
        show_star: { type: 'boolean', label: 'Show ✦ star (when no button)' }
      },
      defaults: {
        title: 'New Banner', subtitle: '',
        icon: 'sparkles', variant: 'fuel',
        cta_label: '', cta_link: '', show_star: true
      },
      render: renderBanner
    },

    article: {
      label: 'Article',
      icon:  '\u00B6',
      description: 'Title + optional image + long-form body (rich text coming later).',
      category: 'generic',
      schema: {
        section_label: { type: 'text',     label: 'Small Label' },
        title:         { type: 'text',     label: 'Heading' },
        image:         { type: 'image',    label: 'Hero Image' },
        body:          { type: 'richtext', label: 'Body' }
      },
      defaults: { section_label: '', title: 'New Article', image: null, body: '' },
      render: renderArticle
    },

    events: {
      label: 'Events',
      icon:  '\uD83D\uDCC5',
      description: 'Upcoming events grid (pulls from Events admin tab) with optional Facebook strip.',
      category: 'custom',
      schema: {
        section_label:       { type: 'text',    label: 'Small Label' },
        heading:             { type: 'text',    label: 'Heading' },
        show_facebook_strip: { type: 'boolean', label: 'Show Facebook Follow Strip', defaultValue: true },
        facebook_url:        { type: 'text',    label: 'Facebook URL' },
        facebook_title:      { type: 'text',    label: 'Facebook Strip Title' },
        facebook_sub:        { type: 'text',    label: 'Facebook Strip Subtitle' },
        facebook_cta:        { type: 'text',    label: 'Facebook Strip Button Text' }
      },
      defaults: {
        section_label: 'Whats new',
        heading: 'Upcoming Events',
        show_facebook_strip: true,
        facebook_url: 'https://www.facebook.com/WhiteMountainsNV',
        facebook_title: 'Follow us on Facebook',
        facebook_sub: 'Get the latest news, specials &amp; events from Esmeralda Market',
        facebook_cta: 'Follow Our Page'
      },
      render: renderEvents
    },

    hours: {
      label: 'Hours',
      icon:  '\u23F0',
      description: 'Market + Snackbar hours with location card (hours pulled from Hours admin tab).',
      category: 'custom',
      schema: {
        section_label:      { type: 'text',    label: 'Small Label' },
        heading:            { type: 'text',    label: 'Heading' },
        market_label:       { type: 'text',    label: 'Market Card — Small Label' },
        market_name:        { type: 'text',    label: 'Market Card — Name' },
        snackbar_label:     { type: 'text',    label: 'Snackbar Card — Small Label' },
        snackbar_name:      { type: 'text',    label: 'Snackbar Card — Name' },
        show_location_card: { type: 'boolean', label: 'Show Location Card', defaultValue: true },
        address_line_1:     { type: 'text',    label: 'Address Line 1' },
        address_line_2:     { type: 'text',    label: 'Address Line 2' },
        address_sub:        { type: 'text',    label: 'Address Subtitle' },
        maps_url:           { type: 'text',    label: 'Google Maps URL' }
      },
      defaults: {
        section_label: "We're here for you",
        heading: 'Business Hours',
        market_label: 'Market \u00b7 Gas',
        market_name:  'Esmeralda Market',
        snackbar_label: 'Hot Food \u00b7 Made Fresh Daily',
        snackbar_name:  'Snackbar',
        show_location_card: true,
        address_line_1: 'HWY 264, Mile Marker 8',
        address_line_2: 'Dyer, NV&nbsp;&nbsp;89010',
        address_sub:    'Fish Lake Valley \u00b7 Esmeralda County, NV',
        maps_url: 'https://maps.app.goo.gl/dhU5oMRYwXpTUhmY9'
      },
      render: renderHours
    },

    services: {
      label: 'Services',
      icon:  '\u2699',
      description: 'Grid of service icons (e.g. Cold Drinks, Groceries, WiFi).',
      category: 'custom',
      schema: {
        section_label: { type: 'text', label: 'Small Label' },
        heading:       { type: 'text', label: 'Heading' },
        items: {
          type: 'list', label: 'Services',
          itemSchema: {
            icon:  { type: 'icon', label: 'Icon',  iconSet: ['drink','shopping-bag','box','snowflake','coffee','bottle','leaf','mountains','restroom','wifi','compass','map-pin','send','sparkles','fuel'] },
            label: { type: 'text', label: 'Label' }
          }
        }
      },
      defaults: {
        section_label: 'What We Offer',
        heading: 'Services',
        items: [
          { icon: 'drink',        label: 'Cold Drinks' },
          { icon: 'shopping-bag', label: 'Groceries' },
          { icon: 'box',          label: 'Daily Essentials' },
          { icon: 'snowflake',    label: 'Ice' },
          { icon: 'coffee',       label: 'Fresh Coffee' },
          { icon: 'bottle',       label: 'Beer & Liquor' },
          { icon: 'leaf',         label: 'Tobacco' },
          { icon: 'mountains',    label: 'Snacks' },
          { icon: 'restroom',     label: 'Restrooms' },
          { icon: 'wifi',         label: 'Free WiFi' }
        ]
      },
      render: renderServices
    },

    explore: {
      label: 'Explore',
      icon:  '\u25C8',
      description: 'Numbered trail of destination cards with scroll-driven animation.',
      category: 'custom',
      schema: {
        lede: { type: 'longtext', label: 'Intro Paragraph' },
        stops: {
          type: 'list', label: 'Stops',
          itemSchema: {
            layout: { type: 'select', label: 'Layout', options: [
              { value: 'hero',       label: 'Hero (image on top, description below)' },
              { value: 'text-right', label: 'Text Right (image left)' },
              { value: 'text-left',  label: 'Text Left (image right)' }
            ]},
            tag:         { type: 'text',     label: 'Tag Line' },
            title:       { type: 'text',     label: 'Title' },
            description: { type: 'longtext', label: 'Description' },
            image:       { type: 'image',    label: 'Photo' }
          }
        },
        trail_strip_text: { type: 'longtext', label: 'Trail Strip Footer Text' }
      },
      defaults: {
        lede: 'Come visit us and explore this little stretch of rural Nevada \u2014 wide open skies, wild horses, ancient forests, and natural hot springs, all within a short drive of the Market. In this little dust bowl there\u2019s always "on more" dirt road to explore.',
        stops: [
          { layout: 'hero',       tag: 'Come Explore The High Desert',          title: 'Welcome to Fish Lake Valley',    description: 'Sprawling across 30 miles of open high desert, Fish Lake Valley is home to free-roaming wild mustang herds, vast alkali flats, and some of the most dramatic big-sky scenery in the American West. Miles of side-by-side and OHV trails wind through the basin \u2014 and on a quiet evening out here, the silence is complete. Esmeralda Market is your basecamp for all of it.', image: 'assets/fish-lake-valley-1.webp' },
          { layout: 'text-left',  tag: 'Decompress in these beautiful springs', title: 'Fish Lake Valley Hot Springs',   description: 'One of the Great Basin\u2019s best-kept secrets \u2014 free, remote, and gloriously uncrowded. These geothermal pools rise right from the desert floor and offer a long, steaming soak beneath an enormous Nevada sky. Best at sunrise or after dark, when warm water meets cool desert air in a way you won\u2019t forget.', image: 'assets/hotsprings.webp' },
          { layout: 'text-right', tag: 'Fishing with a view',                   title: 'Trail Canyon Reservoir',         description: 'Wind up into the White Mountains and you\u2019ll find this quiet alpine pond tucked among juniper and pinyon pine. Stocked with rainbow trout and ringed by sweeping views of the valley floor below, Trail Canyon Reservoir is a perfect half-day escape from the summer heat \u2014 bring a rod and stay a while.', image: 'assets/trail-canyon-resevior.webp' },
          { layout: 'text-left',  tag: 'Brave the climb',                       title: 'Boundary Peak Trailhead',        description: 'Nevada\u2019s highest point at 13,147 feet, Boundary Peak towers over the valley from the White Mountain crest. The trailhead is just up the road \u2014 fuel up and grab a sandwich before setting out on the state\u2019s ultimate summit hike. It\u2019s roughly 8 miles round trip with 4,000 feet of gain. The views from the top stretch into four states.', image: 'assets/boundery-1.webp' },
          { layout: 'text-right', tag: '"If these trees could talk"',           title: 'Bristlecone Pine Forest',        description: 'High in the White Mountains live some of the oldest organisms on Earth. The Ancient Bristlecone Pine Forest holds trees more than 5,000 years old \u2014 gnarled, wind-twisted, and achingly beautiful. They were already ancient when the pyramids were built. Standing among them in the alpine quiet puts the scale of human time in sharp, humbling perspective.', image: 'assets/bristlecone-pine-forest.webp' }
        ],
        trail_strip_text: 'Make sure you stop in at the Market before hitting the trails \u2014 stock up on fuel, cold drinks, and a fresh-made snackbar sandwich to keep you going.'
      },
      render: renderExplore
    },

    menu: {
      label: 'Menu', icon: '\uD83C\uDF54',
      description: 'Snackbar ordering interface (reserved — real menu is still on menu.html).',
      category: 'reserved',
      schema: {
        section_label: { type: 'text', label: 'Small Label' },
        heading:       { type: 'text', label: 'Heading' }
      },
      defaults: { section_label: 'Order Online', heading: 'Snackbar Menu' },
      render: renderMenu
    },

    contact_form: {
      label: 'Contact Form', icon: '\u2709',
      description: 'Contact form with Turnstile (reserved \u2014 real form is on contact.html).',
      category: 'reserved',
      schema: {
        section_label: { type: 'text', label: 'Small Label' },
        heading:       { type: 'text', label: 'Heading' }
      },
      defaults: { section_label: 'Get in Touch', heading: 'Contact Us' },
      render: renderContactForm
    },

    footer: {
      label: 'Footer', icon: '\u2301',
      description: 'Global footer (reserved \u2014 still hand-authored today).',
      category: 'reserved',
      schema: {}, defaults: {}, render: renderFooterSection
    }
  };

  // ─── DEFAULT HOMEPAGE STRUCTURE ───────────────────────────────────────────
  function defaultHomepageSections() {
    return [
      { id: 'sec_hero',         type: 'hero',     data: clone(SECTION_TYPES.hero.defaults) },
      { id: 'sec_banner_snack', type: 'banner',   data: { title: 'Snackbar',            subtitle: 'Hot Food &nbsp;&middot;&nbsp; Made Fresh Daily',              icon: 'send',     variant: 'snackbar',  cta_label: 'See the Menu',    cta_link: 'menu.html',                                   show_star: false } },
      { id: 'sec_events',       type: 'events',   data: clone(SECTION_TYPES.events.defaults) },
      { id: 'sec_banner_fw',    type: 'banner',   data: { title: 'Fireworks',           subtitle: 'Light up your Evening &nbsp;&middot;&nbsp; Sold year-round',  icon: 'sparkles', variant: 'fireworks', cta_label: '',                cta_link: '',                                            show_star: true  } },
      { id: 'sec_hours',        type: 'hours',    data: clone(SECTION_TYPES.hours.defaults) },
      { id: 'sec_banner_fuel',  type: 'banner',   data: { title: '24-Hour Fuel',        subtitle: 'Gas &amp; Diesel &nbsp;&middot;&nbsp; Always Open',           icon: 'fuel',     variant: 'fuel',      cta_label: '',                cta_link: '',                                            show_star: true  } },
      { id: 'sec_services',     type: 'services', data: clone(SECTION_TYPES.services.defaults) },
      { id: 'sec_banner_exp',   type: 'banner',   data: { title: 'Exploring Esmeralda', subtitle: 'Off the Beaten Path &nbsp;&middot;&nbsp; Fish Lake Valley, NV', icon: 'compass',  variant: 'explore',   cta_label: '',                cta_link: '',                                            show_star: false } },
      { id: 'sec_explore',      type: 'explore',  data: clone(SECTION_TYPES.explore.defaults) },
      { id: 'sec_banner_bye',   type: 'banner',   data: { title: 'See You Soon',        subtitle: 'HWY 264 Mile Marker 8 &nbsp;&middot;&nbsp; Dyer, NV 89010',   icon: 'map-pin',  variant: 'see-you',   cta_label: 'Get Directions', cta_link: 'https://maps.app.goo.gl/dhU5oMRYwXpTUhmY9', show_star: false } }
    ];
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  // ─── sectionSummary(section) ──────────────────────────────────────────────
  // Returns a short one-line preview used by the admin's section list rows.
  // Each type gets a purpose-built summary; unknown types fall back to type.
  function stripTags(s) { return String(s || '').replace(/<[^>]*>/g, ''); }
  function decodeEntities(s) {
    return String(s || '')
      .replace(/&nbsp;/g,  ' ')
      .replace(/&middot;/g, '\u00b7')
      .replace(/&mdash;/g,  '\u2014')
      .replace(/&ndash;/g,  '\u2013')
      .replace(/&amp;/g,    '&')
      .replace(/&lt;/g,     '<')
      .replace(/&gt;/g,     '>')
      .replace(/&quot;/g,   '"')
      .replace(/&#39;/g,    "'");
  }
  function truncate(s, n) {
    s = decodeEntities(stripTags(s)).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '\u2026' : s;
  }
  function sectionSummary(section) {
    var d = (section && section.data) || {};
    switch (section && section.type) {
      case 'hero':
        var bits = [];
        if (d.name || d.subtitle) bits.push(decodeEntities([d.name, d.subtitle].filter(Boolean).join(' ')));
        if (d.primary_cta_label) bits.push('\u2192 ' + decodeEntities(d.primary_cta_label));
        return bits.join('  \u00b7  ') || 'Hero';
      case 'banner':
        var title = decodeEntities(d.title || 'Banner');
        var variant = '';
        for (var i = 0; i < BANNER_VARIANTS.length; i++) {
          if (BANNER_VARIANTS[i].value === d.variant) { variant = BANNER_VARIANTS[i].label; break; }
        }
        var tail = d.subtitle ? (' \u00b7 ' + truncate(d.subtitle, 50)) : '';
        return title + tail + (variant ? ' \u00b7 ' + variant : '');
      case 'article':
        return decodeEntities(d.title || 'Untitled Article') + (d.body ? ' \u00b7 ' + truncate(d.body, 60) : '');
      case 'events':
        return decodeEntities(d.heading || 'Upcoming Events') + (d.show_facebook_strip !== false ? ' \u00b7 Facebook strip on' : '');
      case 'hours':
        return decodeEntities(d.heading || 'Business Hours') + (d.show_location_card !== false ? ' \u00b7 with Location card' : '');
      case 'services':
        var count = (d.items && d.items.length) || 0;
        var first = d.items && d.items.slice(0, 3).map(function (i) { return i.label; }).filter(Boolean).join(', ');
        return count + ' service' + (count !== 1 ? 's' : '') + (first ? ' \u00b7 ' + first + (count > 3 ? '\u2026' : '') : '');
      case 'explore':
        var stopCount = (d.stops && d.stops.length) || 0;
        return stopCount + ' stop' + (stopCount !== 1 ? 's' : '');
      case 'menu':         return 'Menu placeholder \u2014 links to menu.html';
      case 'contact_form': return 'Contact form placeholder \u2014 links to contact.html';
      case 'footer':       return 'Footer placeholder';
      default:             return section && section.type || '';
    }
  }

  // ─── renderSection / renderSectionList ────────────────────────────────────
  function renderSection(section, ctx) {
    var type = SECTION_TYPES[section.type];
    if (!type) return '<!-- unknown section type: ' + esc(section.type) + ' -->';
    return type.render(section.data || {}, ctx || {});
  }

  function renderSectionList(sections, mountEl, ctx) {
    if (!mountEl) return;
    var list = sections || [];
    mountEl.innerHTML = list.map(function (s) { return renderSection(s, ctx); }).join('\n');
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  window.SECTIONS = {
    TYPES:                   SECTION_TYPES,
    BANNER_VARIANTS:         BANNER_VARIANTS,
    SVG_ICONS:               SVG_ICONS,
    svgIcon:                 svgIcon,
    renderSection:           renderSection,
    renderSectionList:       renderSectionList,
    sectionSummary:          sectionSummary,
    defaultHomepageSections: defaultHomepageSections,
    esc:                     esc,
    clone:                   clone
  };
})();

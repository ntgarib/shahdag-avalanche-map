/* ==========================================================================
   js/charts.js  -  hand-made SVG charts and the radar-runs table
   --------------------------------------------------------------------------
   Reads everything from PAGE_DATA (web_ready/page_data.js, loaded first).
   Fills these empty <div>s from index.html:
     #chart-season   snow season by elevation band
     #chart-heatmap  share of time with snow, by month and elevation band
     #chart-snowfall monthly snowfall / rain / temperature + snowfall per winter
     #chart-meltout  melt-out date by slope direction
     #runs-table     table of all radar runs
   Colours come from the CSS variables in style.css (var(--snow) etc.) so dark
   mode works. Each SVG uses viewBox = its real pixel width, so text stays the
   same size on a phone; charts are redrawn when the window width changes.
   ========================================================================== */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // The snow-season day numbers count from 1 August (1 Aug = 0). These are the
  // day numbers on which each month starts (non-leap year, 365 days).
  const YEAR_ORDER = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
  const YEAR_START = { Aug: 0, Sep: 31, Oct: 61, Nov: 92, Dec: 122, Jan: 153, Feb: 184, Mar: 212, Apr: 243, May: 273, Jun: 304, Jul: 334 };
  const YEAR_DAYS = 365;

  // Four slope directions: fixed, colour-blind-friendly colours (more than the CSS variables offer)
  const ASPECTS = [
    { key: 'north', letter: 'N', label: 'North', color: '#0072B2' },
    { key: 'east',  letter: 'E', label: 'East',  color: '#009E73' },
    { key: 'south', letter: 'S', label: 'South', color: '#D55E00' },
    { key: 'west',  letter: 'W', label: 'West',  color: '#CC79A7' }
  ];

  // Shared SVG text / line styles (all use the page's CSS variables)
  const AX_TEXT = 'fill:var(--muted);font-size:11px';
  const LBL_TEXT = 'fill:var(--fg);font-size:11px';
  const GRID = 'stroke:var(--line);stroke-width:1;fill:none';

  /* ---------------------------------------------------------------- helpers */

  /** Create an SVG element, set attributes, optionally append to a parent and set text. */
  function S(tag, attrs, parent, text) {
    const node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text !== undefined && text !== null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }

  /** Create an HTML element the same way. */
  function h(tag, attrs, parent, text) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text !== undefined && text !== null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }

  /** Hover tooltip on any SVG mark. */
  function tip(node, text) { S('title', {}, node, text); }

  function clear(box) { while (box.firstChild) box.removeChild(box.firstChild); }

  /** Drawing width: the container's width, never below 300 px. */
  function widthOf(box) { return Math.max(300, Math.floor(box.clientWidth || 640)); }

  /** New responsive <svg> (viewBox = real size, width 100%). */
  function makeSvg(box, W, H, label) {
    const svg = S('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      'aria-label': label,
      style: 'width:100%;height:auto;display:block'
    });
    box.appendChild(svg);
    return svg;
  }

  /** Short legend under a chart. items = [{swatch: 'css for a small box', text: '...'}] */
  function addLegend(box, items) {
    const wrap = h('div', { style: 'display:flex;flex-wrap:wrap;gap:4px 16px;margin:6px 0 0;font-size:.85rem;color:var(--muted)' }, box);
    items.forEach(function (it) {
      const item = h('span', { style: 'display:inline-flex;align-items:center;gap:6px' }, wrap);
      h('span', { style: 'display:inline-block;flex:none;' + it.swatch }, item);
      h('span', {}, item, it.text);
    });
  }

  /** Round axis: smallest "nice" step (1, 2, 5 x 10^n) giving at most maxSteps intervals. */
  function niceAxis(max, maxSteps) {
    for (let p = -1; p < 6; p++) {
      for (const b of [1, 2, 5]) {
        const step = b * Math.pow(10, p);
        if (max / step <= maxSteps) return { step: step, max: Math.ceil(max / step - 1e-9) * step };
      }
    }
    return { step: max, max: max };
  }

  /** "17 Apr" -> day number counted from 1 August. */
  function dayNum(str) {
    const parts = str.split(' ');
    return YEAR_START[parts[1]] + parseInt(parts[0], 10) - 1;
  }

  /** "2025-04-17" -> "17 Apr 2025" */
  function fmtDate(iso) {
    const p = iso.split('-');
    return parseInt(p[2], 10) + ' ' + MONTHS[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }

  /** Cut month label to one letter on narrow charts. */
  function monthLabel(name, narrow) { return narrow ? name.charAt(0) : name; }

  /* ------------------------------------------------ 1. snow season by band */

  function drawSeason(box) {
    clear(box);
    const rows = PAGE_DATA.charts.snow_season_by_elevation.slice().sort(function (a, b) { return a.band - b.band; });
    const n = rows.length;
    const W = widthOf(box), narrow = W < 520;
    const m = { t: 34, r: 12, b: 44, l: narrow ? 80 : 108 };
    const rowH = 24;
    const H = m.t + n * rowH + m.b;
    const iw = W - m.l - m.r;
    const x = function (d) { return m.l + (d / YEAR_DAYS) * iw; };
    const plotBottom = m.t + n * rowH;
    const svg = makeSvg(box, W, H, 'Snow season by elevation band: median snow onset to median melt-out, August to July');

    // Light shading: early season (Nov-Dec) and spring (Mar-May), with labels
    [[YEAR_START.Nov, YEAR_START.Jan, 'Early season'], [YEAR_START.Mar, YEAR_START.Jun, 'Spring']].forEach(function (s) {
      S('rect', { x: x(s[0]), y: m.t - 6, width: x(s[1]) - x(s[0]), height: n * rowH + 6, style: 'fill:var(--accent);fill-opacity:0.12' }, svg);
      S('text', { x: (x(s[0]) + x(s[1])) / 2, y: m.t - 14, 'text-anchor': 'middle', style: AX_TEXT }, svg, s[2]);
    });

    // Month grid lines and labels (Aug -> Jul)
    YEAR_ORDER.forEach(function (mon, i) {
      const start = YEAR_START[mon];
      const end = i < 11 ? YEAR_START[YEAR_ORDER[i + 1]] : YEAR_DAYS;
      S('line', { x1: x(start), x2: x(start), y1: m.t - 6, y2: plotBottom, style: GRID }, svg);
      S('text', { x: (x(start) + x(end)) / 2, y: plotBottom + 15, 'text-anchor': 'middle', style: AX_TEXT }, svg, monthLabel(mon, iw / 12 < 26));
    });
    S('line', { x1: x(YEAR_DAYS), x2: x(YEAR_DAYS), y1: m.t - 6, y2: plotBottom, style: GRID }, svg);
    S('line', { x1: m.l, x2: m.l + iw, y1: plotBottom, y2: plotBottom, style: 'stroke:var(--muted);stroke-width:1' }, svg);
    S('text', { x: m.l + iw / 2, y: H - 6, 'text-anchor': 'middle', style: AX_TEXT }, svg, 'Month (snow year runs August to July)');

    // One row per elevation band, lowest at the bottom
    rows.forEach(function (r) {
      const cy = m.t + (n - 1 - r.band) * rowH + rowH / 2;
      S('text', { x: m.l - 6, y: cy + 4, 'text-anchor': 'end', style: LBL_TEXT }, svg, r.elevation);

      // thin line: earliest onset -> latest melt-out, with small end caps
      S('line', { x1: x(r.on_min), x2: x(r.off_max), y1: cy, y2: cy, style: 'stroke:var(--muted);stroke-width:1.5' }, svg);
      S('line', { x1: x(r.on_min), x2: x(r.on_min), y1: cy - 4, y2: cy + 4, style: 'stroke:var(--muted);stroke-width:1.5' }, svg);
      S('line', { x1: x(r.off_max), x2: x(r.off_max), y1: cy - 4, y2: cy + 4, style: 'stroke:var(--muted);stroke-width:1.5' }, svg);

      // bar: median onset -> median melt-out
      const bar = S('rect', {
        x: x(r.on_med), y: cy - 6, width: Math.max(2, x(r.off_med) - x(r.on_med)), height: 12, rx: 2,
        style: 'fill:var(--snow);stroke:var(--accent);stroke-width:1'
      }, svg);
      tip(bar, r.elevation + ': snow from about ' + r.onset_med + ' (earliest ' + r.onset_min + ', latest ' + r.onset_max +
        ') to about ' + r.meltout_med + ' (earliest ' + r.meltout_min + ', latest ' + r.meltout_max + '). Median season ' +
        r.season_days_median + ' days, ' + r.winters + ' winters.');
    });

    addLegend(box, [
      { swatch: 'width:16px;height:10px;background:var(--snow);border:1px solid var(--accent)', text: 'Median snow onset to median melt-out' },
      { swatch: 'width:16px;height:0;border-top:2px solid var(--muted)', text: 'Earliest onset to latest melt-out' },
      { swatch: 'width:12px;height:12px;background:var(--accent);opacity:.2', text: 'Shaded: early season (Nov\u2013Dec) and spring (Mar\u2013May)' }
    ]);
  }

  /* --------------------------------------------- 2. snow-cover heatmap */

  let heatAspect = 'all'; // current button state

  function drawHeat(box) {
    clear(box);
    const rows = PAGE_DATA.charts.snow_fraction_by_month;

    // Buttons: All / North / East / South / West
    const ctl = h('div', { role: 'group', 'aria-label': 'Slope direction', style: 'display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px' }, box);
    [{ key: 'all', label: 'All' }].concat(ASPECTS).forEach(function (opt) {
      const on = opt.key === heatAspect;
      const btn = h('button', {
        type: 'button',
        'aria-pressed': String(on),
        style: 'font:inherit;font-size:.85rem;padding:4px 12px;border-radius:6px;cursor:pointer;border:1px solid var(--line);' +
          (on ? 'background:var(--accent);color:#fff' : 'background:var(--card);color:var(--fg)')
      }, ctl, opt.label);
      btn.addEventListener('click', function () { heatAspect = opt.key; drawHeat(box); });
    });

    // Average the snow fraction per (band, month) over the chosen aspect(s)
    const sums = {}, counts = {}, bandName = {};
    rows.forEach(function (r) {
      if (heatAspect !== 'all' && r.aspect !== heatAspect) return;
      const band = Math.floor(r.zone / 4);
      const k = band + '|' + r.month;
      sums[k] = (sums[k] || 0) + r.snow_fraction;
      counts[k] = (counts[k] || 0) + 1;
      bandName[band] = r.elevation;
    });
    const bands = Object.keys(bandName).map(Number).sort(function (a, b) { return b - a; }); // highest first

    const W = widthOf(box), narrow = W < 520;
    const m = { t: 22, r: 6, b: 6, l: narrow ? 80 : 108 };
    const ch = 22, cw = (W - m.l - m.r) / 12;
    const H = m.t + bands.length * ch + m.b;
    const aspectText = heatAspect === 'all' ? 'all slope directions averaged' : heatAspect + '-facing slopes';
    const svg = makeSvg(box, W, H, 'Share of the time with snow cover by month and elevation band, ' + aspectText);

    MONTHS.forEach(function (name, i) {
      S('text', { x: m.l + i * cw + cw / 2, y: m.t - 8, 'text-anchor': 'middle', style: AX_TEXT }, svg, monthLabel(name, cw < 30));
    });

    bands.forEach(function (band, ri) {
      const y = m.t + ri * ch;
      S('text', { x: m.l - 6, y: y + ch / 2 + 4, 'text-anchor': 'end', style: LBL_TEXT }, svg, bandName[band]);
      for (let mo = 1; mo <= 12; mo++) {
        const k = band + '|' + mo;
        const v = counts[k] ? sums[k] / counts[k] : 0;
        const cx = m.l + (mo - 1) * cw;
        S('rect', { x: cx, y: y, width: cw, height: ch, style: 'fill:var(--card);stroke:var(--line);stroke-width:1' }, svg);
        const cell = S('rect', { x: cx, y: y, width: cw, height: ch, style: 'fill:var(--snow);fill-opacity:' + v.toFixed(3) }, svg);
        const pct = Math.round(v * 100);
        tip(cell, bandName[band] + ', ' + MONTHS[mo - 1] + ' (' + aspectText + '): snow present ' + pct + '% of the time');
        if (cw >= 34 && pct >= 1) {
          // % in the cell, with a halo so it reads on any shade
          S('text', {
            x: cx + cw / 2, y: y + ch / 2 + 4, 'text-anchor': 'middle',
            style: 'fill:var(--fg);font-size:10px;paint-order:stroke;stroke:var(--bg);stroke-width:2.5px;pointer-events:none'
          }, svg, pct + '%');
        }
      }
    });

    // Colour key: 0% -> 100%
    const key = h('div', { style: 'display:flex;align-items:center;gap:8px;margin:6px 0 0;font-size:.85rem;color:var(--muted);flex-wrap:wrap' }, box);
    h('span', {}, key, '0%');
    h('span', { style: 'display:inline-block;width:120px;height:12px;border:1px solid var(--line);background:linear-gradient(to right,var(--card),var(--snow))' }, key);
    h('span', {}, key, '100% of the time with snow (10-year average, ' + aspectText + ')');
  }

  /* ---------------------------------------------- 3. snowfall and rain */

  /** Order Nov -> May. */
  function seasonOrder(mo) { return mo >= 11 ? mo - 11 : mo + 2; }

  /** (a) Grouped bars (snowfall, rain) + temperature line on a second axis. */
  function drawMonthly(host, W) {
    const data = PAGE_DATA.charts.era5_monthly.slice().sort(function (p, q) { return seasonOrder(p.m) - seasonOrder(q.m); });
    const narrow = W < 520;
    const m = { t: 24, r: narrow ? 40 : 48, b: 28, l: narrow ? 38 : 46 };
    const H = narrow ? 220 : 250;
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const svg = makeSvg(host, W, H, 'Monthly snowfall and rain (mm of water) and mean daily maximum temperature, November to May');

    // Left axis (mm) and right axis (degrees C)
    const maxMM = Math.max.apply(null, data.map(function (d) { return Math.max(d.snow_mm, d.rain_mm); }));
    const L = niceAxis(maxMM, 7);
    const temps = data.map(function (d) { return d.tmax_mean_c; });
    let tmin = Math.floor(Math.min.apply(null, temps) / 5) * 5;
    let tmax = Math.ceil(Math.max.apply(null, temps) / 5) * 5;
    if (tmax === tmin) tmax += 5;
    const y = function (v) { return m.t + ih - (v / L.max) * ih; };
    const yT = function (v) { return m.t + ih - ((v - tmin) / (tmax - tmin)) * ih; };

    for (let v = 0; v <= L.max + 1e-9; v += L.step) {
      S('line', { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), style: GRID }, svg);
      S('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end', style: AX_TEXT }, svg, String(Math.round(v * 10) / 10));
    }
    for (let t = tmin; t <= tmax; t += 5) {
      S('text', { x: m.l + iw + 6, y: yT(t) + 4, 'text-anchor': 'start', style: 'fill:var(--temp);font-size:11px' }, svg, String(t));
    }
    S('text', { x: m.l, y: 12, 'text-anchor': 'start', style: AX_TEXT }, svg, 'mm of water per month');
    S('text', { x: m.l + iw, y: 12, 'text-anchor': 'end', style: 'fill:var(--temp);font-size:11px' }, svg, '\u00B0C');
    if (tmin < 0 && tmax > 0) { // dashed 0 degC reference
      S('line', { x1: m.l, x2: m.l + iw, y1: yT(0), y2: yT(0), style: 'stroke:var(--temp);stroke-width:1;stroke-dasharray:4 3;opacity:.5' }, svg);
    }

    // Bars
    const step = iw / data.length, bw = step * 0.32;
    const pts = [];
    data.forEach(function (d, i) {
      const gx = m.l + i * step;
      const name = MONTHS[d.m - 1];
      const sb = S('rect', { x: gx + step * 0.17, y: y(d.snow_mm), width: bw, height: y(0) - y(d.snow_mm), style: 'fill:var(--snow);stroke:var(--accent);stroke-width:1' }, svg);
      tip(sb, name + ': snowfall ' + d.snow_mm + ' mm of water');
      const rb = S('rect', { x: gx + step * 0.51, y: y(d.rain_mm), width: bw, height: y(0) - y(d.rain_mm), style: 'fill:var(--rain)' }, svg);
      tip(rb, name + ': rain ' + d.rain_mm + ' mm');
      S('text', { x: gx + step / 2, y: H - m.b + 16, 'text-anchor': 'middle', style: AX_TEXT }, svg, name);
      pts.push([gx + step / 2, yT(d.tmax_mean_c), d]);
    });
    S('line', { x1: m.l, x2: m.l + iw, y1: y(0), y2: y(0), style: 'stroke:var(--muted);stroke-width:1' }, svg);

    // Temperature line on top
    S('polyline', { points: pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' '), style: 'fill:none;stroke:var(--temp);stroke-width:2' }, svg);
    pts.forEach(function (p) {
      const dot = S('circle', { cx: p[0], cy: p[1], r: 3.5, style: 'fill:var(--temp)' }, svg);
      tip(dot, MONTHS[p[2].m - 1] + ': mean daily maximum ' + p[2].tmax_mean_c + ' \u00B0C');
    });

    addLegend(host, [
      { swatch: 'width:12px;height:12px;background:var(--snow);border:1px solid var(--accent)', text: 'Snowfall (mm of water)' },
      { swatch: 'width:12px;height:12px;background:var(--rain)', text: 'Rain (mm)' },
      { swatch: 'width:16px;height:0;border-top:2px solid var(--temp)', text: 'Mean daily maximum temperature (\u00B0C, right axis)' }
    ]);
  }

  /** (b) Total snowfall in each winter (2016 -> "2016/17"). */
  function drawWinters(host, W) {
    const data = PAGE_DATA.charts.era5_per_winter.slice().sort(function (a, b) { return a.season - b.season; });
    const n = data.length;
    const m0 = { t: 18, r: 10, l: 44 };
    const step = (W - m0.l - m0.r) / n;
    const rotate = step < 54; // long labels need tilting on narrow screens
    const m = { t: m0.t, r: m0.r, l: m0.l, b: rotate ? 52 : 30 };
    const H = 190 + (rotate ? 20 : 0);
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const svg = makeSvg(host, W, H, 'Total snowfall in each winter, November to May, in mm of water');

    const A = niceAxis(Math.max.apply(null, data.map(function (d) { return d.snow_mm; })), 5);
    const y = function (v) { return m.t + ih - (v / A.max) * ih; };
    for (let v = 0; v <= A.max + 1e-9; v += A.step) {
      S('line', { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), style: GRID }, svg);
      S('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end', style: AX_TEXT }, svg, String(v));
    }
    S('text', { x: m.l, y: 10, 'text-anchor': 'start', style: AX_TEXT }, svg, 'mm of water, Nov\u2013May');

    const bw = Math.min(step * 0.6, 40);
    data.forEach(function (d, i) {
      const cx = m.l + i * step + step / 2;
      const label = d.season + '/' + String((d.season + 1) % 100).padStart(2, '0');
      const bar = S('rect', { x: cx - bw / 2, y: y(d.snow_mm), width: bw, height: y(0) - y(d.snow_mm), style: 'fill:var(--snow);stroke:var(--accent);stroke-width:1' }, svg);
      tip(bar, 'Winter ' + label + ': ' + d.snow_mm + ' mm of water as snow');
      if (bw >= 24) S('text', { x: cx, y: y(d.snow_mm) - 4, 'text-anchor': 'middle', style: AX_TEXT }, svg, String(Math.round(d.snow_mm)));
      const ly = y(0) + 15;
      const t = S('text', { x: cx, y: ly, 'text-anchor': rotate ? 'end' : 'middle', style: AX_TEXT }, svg, label);
      if (rotate) t.setAttribute('transform', 'rotate(-45 ' + cx + ' ' + ly + ')');
    });
    S('line', { x1: m.l, x2: m.l + iw, y1: y(0), y2: y(0), style: 'stroke:var(--muted);stroke-width:1' }, svg);
  }

  function drawSnowfall(box) {
    clear(box);
    const W = widthOf(box);
    const a = h('div', {}, box);
    h('p', { style: 'margin:0 0 4px;font-weight:600;font-size:.9rem' }, a, 'Average month, November to May');
    drawMonthly(a, W);
    const b = h('div', { style: 'margin-top:18px' }, box);
    h('p', { style: 'margin:0 0 4px;font-weight:600;font-size:.9rem' }, b, 'Total snowfall in each winter');
    drawWinters(b, W);
  }

  /* ------------------------------------------- 4. melt-out by aspect */

  function drawMeltout(box) {
    clear(box);
    const rows = PAGE_DATA.charts.meltout_by_aspect.slice().sort(function (a, b) { return a.band - b.band; });
    const n = rows.length;
    const W = widthOf(box), narrow = W < 520;
    const m = { t: 12, r: 16, b: 30, l: narrow ? 80 : 108 };
    const rowH = 28;
    const H = m.t + n * rowH + m.b;
    const iw = W - m.l - m.r;
    const D0 = YEAR_START.Feb, D1 = YEAR_DAYS; // axis: 1 Feb -> 1 Aug
    const x = function (d) { return m.l + ((d - D0) / (D1 - D0)) * iw; };
    const plotBottom = m.t + n * rowH;
    const svg = makeSvg(box, W, H, 'Median melt-out date by slope direction in each elevation band');

    // Month grid (1 Feb ... 1 Aug)
    ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'].forEach(function (mon) {
      const d = mon === 'Aug' ? YEAR_DAYS : YEAR_START[mon];
      S('line', { x1: x(d), x2: x(d), y1: m.t, y2: plotBottom, style: GRID }, svg);
      S('text', { x: x(d), y: plotBottom + 15, 'text-anchor': 'middle', style: AX_TEXT }, svg, narrow ? mon : '1 ' + mon);
    });

    // One row per band, highest at the top; one dot per aspect (small vertical offsets avoid overlaps)
    rows.forEach(function (r) {
      const cy = m.t + (n - 1 - r.band) * rowH + rowH / 2;
      S('line', { x1: m.l, x2: m.l + iw, y1: cy, y2: cy, style: 'stroke:var(--line);stroke-width:1;stroke-dasharray:2 3' }, svg);
      S('text', { x: m.l - 6, y: cy + 4, 'text-anchor': 'end', style: LBL_TEXT }, svg, r.elevation);
      ASPECTS.forEach(function (a, i) {
        const dot = S('circle', { cx: x(dayNum(r[a.key])), cy: cy + (i - 1.5) * 5, r: 3.4, style: 'fill:' + a.color + ';stroke:var(--bg);stroke-width:0.8' }, svg);
        tip(dot, r.elevation + ', ' + a.label.toLowerCase() + '-facing: median melt-out ' + r[a.key]);
      });
    });
    S('line', { x1: m.l, x2: m.l + iw, y1: plotBottom, y2: plotBottom, style: 'stroke:var(--muted);stroke-width:1' }, svg);

    addLegend(box, ASPECTS.map(function (a) {
      return { swatch: 'width:10px;height:10px;border-radius:50%;background:' + a.color, text: a.label + '-facing' };
    }));
    h('p', { style: 'margin:10px 0 0' }, box,
      'Finding: below 3,250 m, south-facing slopes melt out 4\u201316 days (up to about two weeks) before north-facing ones; ' +
      'higher up there is no consistent difference. The bands describe elevation and slope direction, not individual slopes.');
  }

  /* ------------------------------------------------ radar runs table */

  function drawRuns(box) {
    clear(box);
    const wrap = h('div', { class: 'table-wrap' }, box);
    const table = h('table', {}, wrap);
    const head = h('tr', {}, h('thead', {}, table));
    ['Run', 'Orbit', 'Before', 'After', 'Snow mask', 'Patches', 'Patches within 1.5 km of Mahmud Dere'].forEach(function (t, i) {
      h('th', i >= 5 ? { style: 'text-align:right' } : {}, head, t);
    });
    const body = h('tbody', {}, table);
    PAGE_DATA.radar_runs.forEach(function (r) {
      const tr = h('tr', {}, body);
      h('td', {}, tr, r.run);
      h('td', {}, tr, String(r.orbit));
      h('td', {}, tr, fmtDate(r.before));
      h('td', {}, tr, fmtDate(r.after));
      h('td', {}, tr, r.snow_mask === 'off' ? 'none' : r.snow_mask.replace('>=', ' \u2265 '));
      h('td', { style: 'text-align:right' }, tr, String(r.patches));
      h('td', { style: 'text-align:right' }, tr, r.within_1500m_of_mahmud === null ? '\u2013' : String(r.within_1500m_of_mahmud));
    });
    h('p', { style: 'margin:6px 0 0;font-size:.85rem;color:var(--muted)' }, box,
      'Patches are snow-change patches: possible avalanche activity; the patches are unconfirmed. \u201C\u2013\u201D = not counted.');
  }

  /* ----------------------------------------------------- draw / redraw */

  function renderAll() {
    [['chart-season', drawSeason], ['chart-heatmap', drawHeat], ['chart-snowfall', drawSnowfall],
     ['chart-meltout', drawMeltout], ['runs-table', drawRuns]].forEach(function (pair) {
      const box = document.getElementById(pair[0]);
      if (!box) return;
      try {
        pair[1](box);
      } catch (err) {
        clear(box);
        h('p', { style: 'color:var(--muted)' }, box, 'This chart could not be drawn.');
        if (window.console) console.error(pair[0], err);
      }
    });
  }

  if (typeof PAGE_DATA === 'undefined') {
    ['chart-season', 'chart-heatmap', 'chart-snowfall', 'chart-meltout', 'runs-table'].forEach(function (id) {
      const box = document.getElementById(id);
      if (box) box.textContent = 'Data file web_ready/page_data.js not found.';
    });
    return;
  }

  renderAll();

  // Redraw when the width changes (ignore height-only resizes, e.g. phone address bar)
  let lastW = (document.getElementById('chart-season') || {}).clientWidth;
  let timer = null;
  window.addEventListener('resize', function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      const w = (document.getElementById('chart-season') || {}).clientWidth;
      if (w !== lastW) { lastW = w; renderAll(); }
    }, 150);
  });
})();

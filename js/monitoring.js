/* ==========================================================================
   js/monitoring.js  (Stage 4)
   Fills the "Next step: storm-triggered monitoring" section of index.html.

   Reads ONLY PAGE_DATA.monitoring (summary + events). Fills:
     #monitoring-rules       three rule cards + one summary sentence
     #monitoring-timeline    SVG timeline of trigger events, one row per winter
     #monitoring-thresholds  threshold test table
     #monitoring-cases       known cases table + "first new test" sentence

   Wording: these are "radar checks" for mapping possible avalanche activity
   after the fact. This is a record-building proposal, not a warning system.
   No fetch(), no libraries: works when index.html is opened by double-click.
   ========================================================================== */
(function () {
  'use strict';

  if (typeof PAGE_DATA === 'undefined' || !PAGE_DATA.monitoring) {
    console.warn('monitoring.js: PAGE_DATA.monitoring not found');
    return;
  }

  var S = PAGE_DATA.monitoring.summary;
  var EVENTS = PAGE_DATA.monitoring.events;

  /* ---- Event types: label + colour (categorical colours, fixed hex) ----- */
  var TYPES = ['storm', 'warm', 'rain'];
  var TYPE_LABEL = { storm: 'Storm', warm: 'Warm spell', rain: 'Rain on snow' };
  var TYPE_COLOR = { storm: '#2f6fb5', warm: '#d0472b', rain: '#2e9e5b' };

  /* ---- Small helpers ---------------------------------------------------- */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var SVG_NS = 'http://www.w3.org/2000/svg';

  /** Create an HTML element with optional class and text. */
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /** Create an SVG element with attributes. */
  function s(tag, attrs, text) {
    var e = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /** Split "YYYY-MM-DD" into numbers. */
  function parts(iso) {
    var p = iso.split('-');
    return { y: +p[0], m: +p[1], d: +p[2] };
  }

  /** "2017-12-24" -> "24 Dec 2017" */
  function fmtDate(iso) {
    var p = parts(iso);
    return p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y;
  }

  /** A radar pair "before -> after", compact: "19→31 Dec 2017" or across months/years. */
  function fmtPair(before, after) {
    var b = parts(before), a = parts(after);
    if (b.y === a.y && b.m === a.m) {
      return b.d + '→' + a.d + ' ' + MONTHS[a.m - 1] + ' ' + a.y;
    }
    if (b.y === a.y) {
      return b.d + ' ' + MONTHS[b.m - 1] + '→' + a.d + ' ' + MONTHS[a.m - 1] + ' ' + a.y;
    }
    return fmtDate(before) + '→' + fmtDate(after);
  }

  /** Pair text for an event/case on one orbit, or "no pair". */
  function pairText(before, after) {
    return (before && after) ? fmtPair(before, after) : 'no pair';
  }

  /** Append a table built from header names and row arrays of text/nodes. */
  function buildTable(headers, rows, rowClassFn) {
    var wrap = h('div', 'table-wrap');
    var table = h('table');
    var thead = h('thead');
    var trh = h('tr');
    headers.forEach(function (t) { trh.appendChild(h('th', null, t)); });
    thead.appendChild(trh);
    table.appendChild(thead);
    var tbody = h('tbody');
    rows.forEach(function (r, i) {
      var tr = h('tr');
      var cls = rowClassFn ? rowClassFn(i) : '';
      if (cls) {
        tr.className = cls;
        tr.style.fontWeight = '600';
        tr.style.boxShadow = 'inset 3px 0 0 var(--accent)';
      }
      r.forEach(function (cell) {
        var td = h('td');
        if (cell && cell.nodeType) td.appendChild(cell); else td.textContent = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  /** Format a number with 1 decimal (for display of values read from data). */
  function f1(v) { return Number(v).toFixed(1); }

  /* ======================================================================
     1. RULE CARDS  (#monitoring-rules)
     ====================================================================== */
  (function buildRules() {
    var box = document.getElementById('monitoring-rules');
    if (!box) return;
    box.innerHTML = '';

    var grid = h('div', 'rule-cards');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:12px 0;';

    TYPES.forEach(function (t) {
      var card = h('div', 'rule-card');
      card.style.cssText = 'background:var(--card);border:1px solid var(--line);' +
        'border-left:5px solid ' + TYPE_COLOR[t] + ';border-radius:8px;padding:12px 14px;';
      var title = h('h4', null, TYPE_LABEL[t]);
      title.style.margin = '0 0 6px';
      card.appendChild(title);
      card.appendChild(h('p', null, S.rules_text[t])).style.margin = '0 0 8px';
      var count = h('p', null, S.events_by_type[t] + ' events in ' + S.winters + ' winters');
      count.style.cssText = 'margin:0;color:var(--muted);font-size:0.92em;';
      card.appendChild(count);
      grid.appendChild(card);
    });
    box.appendChild(grid);

    box.appendChild(h('p', null,
      'About ' + f1(S.events_per_winter_average) + ' events per winter lead to about ' +
      f1(S.radar_checks_per_winter.o101) + ' radar checks per winter on orbit 101 and ' +
      f1(S.radar_checks_per_winter.o6) + ' on orbit 6, because several events fall into the same 12-day radar pair.'));

    var note = h('p', null,
      'A radar check maps possible avalanche activity after the fact, to build a record. It is not a warning.');
    note.style.color = 'var(--muted)';
    box.appendChild(note);
  })();

  /* ======================================================================
     2. TIMELINE  (#monitoring-timeline)
     One row per winter; x = 1 Nov -> 31 May; one mark per event.
     ====================================================================== */
  (function buildTimeline() {
    var box = document.getElementById('monitoring-timeline');
    if (!box) return;
    box.innerHTML = '';
    box.style.position = 'relative';

    var winters = Object.keys(S.events_by_winter);   // "2016/17" ... in order (top = first)

    // Layout (viewBox units; the SVG scales to the container width)
    var W = 560, LEFT = 56, RIGHT = 12, TOP = 28, ROW = 40, BOTTOM = 34;
    var H = TOP + ROW * winters.length + BOTTOM;
    var PLOT = W - LEFT - RIGHT;

    // Season axis: use a non-leap reference calendar (Nov-Dec 2001, Jan-May 2002)
    // so all winters line up. 29 Feb is treated as 28 Feb.
    function seasonDay(iso) {
      var p = parts(iso);
      var d = p.d;
      if (p.m === 2 && d > 28) d = 28;
      var refYear = p.m >= 11 ? 2001 : 2002;
      return (Date.UTC(refYear, p.m - 1, d) - Date.UTC(2001, 10, 1)) / 86400000;
    }
    var SPAN = seasonDay('2002-05-31') + 1;           // days from 1 Nov to end of 31 May
    function xOf(day) { return LEFT + (day / SPAN) * PLOT; }

    var svg = s('svg', {
      viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img',
      'aria-label': 'Trigger events in each winter from November to May, by type'
    });
    svg.style.cssText = 'display:block;width:100%;height:auto;font-size:11px;';

    // Month gridlines + labels along the top
    [['2001-11-01', 'Nov'], ['2001-12-01', 'Dec'], ['2002-01-01', 'Jan'], ['2002-02-01', 'Feb'],
     ['2002-03-01', 'Mar'], ['2002-04-01', 'Apr'], ['2002-05-01', 'May']].forEach(function (m) {
      var x = xOf(seasonDay(m[0]));
      svg.appendChild(s('line', { x1: x, x2: x, y1: TOP - 6, y2: TOP + ROW * winters.length,
        style: 'stroke:var(--line);stroke-width:1' }));
      svg.appendChild(s('text', { x: x + 3, y: TOP - 11, style: 'fill:var(--muted)' }, m[1]));
    });

    // Row labels and faint row separators
    var rowCentre = {};
    winters.forEach(function (w, i) {
      var cy = TOP + i * ROW + ROW / 2;
      rowCentre[w] = cy;
      svg.appendChild(s('text', { x: LEFT - 6, y: cy + 4, 'text-anchor': 'end', style: 'fill:var(--fg)' }, w));
      svg.appendChild(s('line', { x1: LEFT, x2: W - RIGHT, y1: TOP + (i + 1) * ROW, y2: TOP + (i + 1) * ROW,
        style: 'stroke:var(--line);stroke-width:0.5;opacity:0.6' }));
    });

    // Vertical offset by type so events on the same dates do not hide each other
    var OFFSET = { storm: -8, warm: 0, rain: 8 };

    // Known cases -> short labels (matched to events by start, end and type)
    function shortLabel(key) {
      if (/Mahmud/i.test(key)) return 'Mahmud Dere';
      if (/storm/i.test(key)) return 'April 2025 storm';
      if (/warm/i.test(key)) return 'April 2025 warm spell';
      return key;
    }
    var known = [];
    Object.keys(S.known_cases).forEach(function (key) {
      S.known_cases[key].forEach(function (c) { known.push({ key: key, c: c }); });
    });
    function knownFor(ev) {
      for (var i = 0; i < known.length; i++) {
        var c = known[i].c;
        if (c.start === ev.start && c.end === ev.end && c.type === ev.type) return known[i];
      }
      return null;
    }

    // Tooltip (one shared div; shown on hover and on tap)
    var tip = h('div', 'tt');
    tip.style.cssText = 'position:absolute;display:none;z-index:5;max-width:260px;pointer-events:none;' +
      'background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:6px;' +
      'padding:8px 10px;font-size:0.85em;line-height:1.35;box-shadow:0 2px 8px rgba(0,0,0,0.25);';
    function showTip(ev, evt) {
      tip.innerHTML = '';
      var l1 = h('div', null, TYPE_LABEL[ev.type] + ': ' +
        (ev.start === ev.end ? fmtDate(ev.start) : fmtDate(ev.start) + ' to ' + fmtDate(ev.end)));
      l1.style.fontWeight = '600';
      tip.appendChild(l1);
      tip.appendChild(h('div', null, 'Snowfall ' + f1(ev.snow_mm) + ' mm, rain ' + f1(ev.rain_mm) + ' mm (water)'));
      tip.appendChild(h('div', null, 'Orbit 101: ' + pairText(ev.o101_before, ev.o101_after)));
      tip.appendChild(h('div', null, 'Orbit 6: ' + pairText(ev.o6_before, ev.o6_after)));
      tip.style.display = 'block';
      var r = box.getBoundingClientRect();
      var x = evt.clientX - r.left + 12, y = evt.clientY - r.top + 12;
      var maxX = r.width - tip.offsetWidth - 4;
      if (x > maxX) x = Math.max(0, maxX);
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    }
    function hideTip() { tip.style.display = 'none'; }
    document.addEventListener('click', function (e) {
      if (!svg.contains(e.target)) hideTip();
    });

    // Draw events (sort so known cases sit on top)
    var rings = [];
    EVENTS.forEach(function (ev) {
      var cy = rowCentre[ev.winter];
      if (cy === undefined) return;
      var d0 = seasonDay(ev.start), d1 = seasonDay(ev.end) + 1;
      var x0 = xOf(d0), w = Math.max(xOf(d1) - x0, 4);
      var y = cy + OFFSET[ev.type];
      var mark = s('rect', {
        x: x0, y: y - 3, width: w, height: 6, rx: 2,
        fill: TYPE_COLOR[ev.type], 'fill-opacity': '0.85'
      });
      mark.style.cursor = 'pointer';
      mark.addEventListener('mousemove', function (e) { showTip(ev, e); });
      mark.addEventListener('mouseleave', hideTip);
      mark.addEventListener('click', function (e) { e.stopPropagation(); showTip(ev, e); });
      svg.appendChild(mark);

      var k = knownFor(ev);
      if (k) rings.push({ ev: ev, k: k, cx: x0 + w / 2, cy: y });
    });

    // Rings and labels for the known cases
    rings.forEach(function (r) {
      svg.appendChild(s('circle', { cx: r.cx, cy: r.cy, r: 9, fill: 'none',
        style: 'stroke:var(--fg);stroke-width:1.5' }));
      var late = r.cx > LEFT + PLOT * 0.55;           // labels near the right edge run leftwards
      var labelY = r.ev.type === 'warm' ? r.cy + 24 : r.cy - 14;
      svg.appendChild(s('text', {
        x: late ? r.cx + 6 : r.cx - 6, y: labelY,
        'text-anchor': late ? 'end' : 'start',
        style: 'fill:var(--fg);font-weight:600'
      }, shortLabel(r.k.key)));
    });

    // Legend under the chart
    var lx = LEFT;
    TYPES.forEach(function (t) {
      svg.appendChild(s('rect', { x: lx, y: H - 20, width: 12, height: 6, rx: 2, fill: TYPE_COLOR[t] }));
      svg.appendChild(s('text', { x: lx + 17, y: H - 14, style: 'fill:var(--fg)' }, TYPE_LABEL[t]));
      lx += 100;
    });
    svg.appendChild(s('circle', { cx: lx + 6, cy: H - 17, r: 6, fill: 'none', style: 'stroke:var(--fg);stroke-width:1.5' }));
    svg.appendChild(s('text', { x: lx + 17, y: H - 14, style: 'fill:var(--fg)' }, 'Known case'));

    box.appendChild(svg);
    box.appendChild(tip);
  })();

  /* ======================================================================
     3. THRESHOLD TABLE  (#monitoring-thresholds)
     ====================================================================== */
  (function buildThresholds() {
    var box = document.getElementById('monitoring-thresholds');
    if (!box) return;
    box.innerHTML = '';

    box.appendChild(h('h3', null, 'Choosing the storm threshold'));

    var yn = function (b) { return b ? 'Yes' : 'No'; };
    var rows = S.threshold_test.map(function (r) {
      var chosen = (r.storm_mm === S.rules.storm_mm);
      return [
        r.storm_mm + ' mm' + (chosen ? ' (chosen)' : ''),
        f1(r.trigger_periods_per_winter),
        yn(r.catches_dec2017),
        yn(r.catches_apr2025)
      ];
    });
    box.appendChild(buildTable(
      ['Storm threshold (mm over 3 days)', 'Trigger periods per winter', 'Catches Mahmud Dere (Dec 2017)', 'Catches April 2025'],
      rows,
      function (i) { return S.threshold_test[i].storm_mm === S.rules.storm_mm ? 'chosen' : ''; }
    ));

    var def = h('p', null, 'Trigger period: ' + S.definitions.trigger_period + '.');
    def.style.cssText = 'color:var(--muted);font-size:0.92em;';
    box.appendChild(def);
  })();

  /* ======================================================================
     4. KNOWN CASES  (#monitoring-cases)
     ====================================================================== */
  (function buildCases() {
    var box = document.getElementById('monitoring-cases');
    if (!box) return;
    box.innerHTML = '';

    box.appendChild(h('h3', null, 'What the rules pick for the known cases'));

    /** Was this exact orbit + before + after already run? Return the run name or null. */
    function runName(orbit, before, after) {
      if (!before || !after) return null;
      for (var i = 0; i < S.runs_already_done.length; i++) {
        var r = S.runs_already_done[i];
        if (r.orbit === orbit && r.before === before && r.after === after) return r.run;
      }
      return null;
    }

    /** Cell text for one orbit: the pair and whether it was run. */
    function cell(orbit, before, after) {
      if (!before || !after) return 'no pair';
      var name = runName(orbit, before, after);
      return fmtPair(before, after) + (name ? ' (already run: ' + name + ')' : ' (not run yet)');
    }

    var rows = [];
    var firstNew = null;                               // first orbit-101 pair never run
    Object.keys(S.known_cases).forEach(function (key) {
      S.known_cases[key].forEach(function (c) {
        rows.push([
          key,
          TYPE_LABEL[c.type] || c.type,
          cell(101, c.o101_before, c.o101_after),
          cell(6, c.o6_before, c.o6_after)
        ]);
        if (!firstNew && c.type === 'storm' && c.o101_before && !runName(101, c.o101_before, c.o101_after)) {
          firstNew = c;
        }
      });
    });

    box.appendChild(buildTable(
      ['Case', 'Trigger type', 'Radar pair chosen: orbit 101', 'Radar pair chosen: orbit 6'],
      rows
    ));

    if (firstNew) {
      box.appendChild(h('p', null,
        'The storm pair on orbit 101, ' + fmtPair(firstNew.o101_before, firstNew.o101_after) +
        ', has not been run yet and is the first new test.'));
    }
  })();
})();

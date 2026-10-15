/* ==========================================================================
   js/map.js  -  interactive map, legend and route table
   Şahdüzü Winter Recreation Map

   Runs after Leaflet 1.9.4 and web_ready/page_data.js (global PAGE_DATA).
   Fills three elements of index.html:  #map, #map-legend, #route-table.

   All data values are read from PAGE_DATA. Only labels and explanatory
   wording (taken from BRIEF.md / DATA_GUIDE.md) are typed here.
   ========================================================================== */
(function () {
  'use strict';

  var D = window.PAGE_DATA;
  var mapEl = document.getElementById('map');

  // Fail visibly (not silently) if something did not load.
  if (!window.L || !D) {
    if (mapEl) {
      mapEl.textContent = 'The map could not be loaded (Leaflet or web_ready/page_data.js is missing).';
    }
    return;
  }

  /* ------------------------------------------------------------------------
     0. Small helpers
     ------------------------------------------------------------------------ */
  var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /** Escape text before putting it into an HTML string (popups, tables). */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /** 0.141 -> "14%" */
  function pct(f) { return Math.round(f * 100) + '%'; }
  /** 1752 -> "1,752" */
  function num(n) { return Number(n).toLocaleString('en-GB'); }
  /** "2017-12-19" -> "19 Dec 2017" */
  function fmtDate(iso) {
    var p = String(iso).split('-');
    return parseInt(p[2], 10) + ' ' + MONTHS_SHORT[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }
  /** [w, s, e, n] -> Leaflet bounds [[s, w], [n, e]] */
  function wsenToBounds(a) { return [[a[1], a[0]], [a[3], a[2]]]; }

  var IMG = D.images;
  var LAYERS = D.layers;

  /* ------------------------------------------------------------------------
     1. Styles for the custom control, legend and labels
        (injected here so this file works on its own; page colours come from
        the CSS variables defined in style.css)
     ------------------------------------------------------------------------ */
  var css = [
    '#map{background:var(--card);}',
    '.leaflet-container{background:var(--card);font-family:inherit;}',

    /* overlay control */
    '.ml-panel{background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:8px;',
    '  box-shadow:0 1px 5px rgba(0,0,0,.35);font-size:13px;line-height:1.35;width:250px;max-width:72vw;}',
    '.ml-panel-toggle{display:flex;justify-content:space-between;align-items:center;width:100%;',
    '  background:none;border:0;color:inherit;font:inherit;font-weight:600;padding:8px 10px;cursor:pointer;}',
    '.ml-panel-body{padding:2px 10px 8px;max-height:52vh;overflow-y:auto;}',
    '.ml-panel.collapsed .ml-panel-body{display:none;}',
    '.ml-panel-body label{cursor:pointer;}',
    '.ml-row{padding:4px 0;border-top:1px solid var(--line);}',
    '.ml-row:first-child{border-top:0;}',
    '.ml-row-head{display:flex;align-items:center;gap:6px;}',
    '.ml-row-head input{margin:0;}',
    '.ml-extra{margin:4px 0 2px 22px;display:flex;flex-direction:column;gap:3px;}',
    '.ml-extra input[type=range]{width:100%;margin:0;}',
    '.ml-extra .ml-val{color:var(--muted);font-size:12px;}',
    '.ml-radios{display:flex;gap:10px;flex-wrap:wrap;}',

    /* map labels */
    '.ml-label{background:rgba(255,255,255,.92);color:#111;border:1px solid rgba(0,0,0,.35);',
    '  border-radius:3px;box-shadow:none;font-size:11px;padding:1px 5px;}',
    '.ml-label:before{display:none;}',
    '.ml-peak{color:#fff;font-size:15px;line-height:15px;text-shadow:0 0 3px #000,0 0 3px #000;}',

    /* legend below the map */
    '#map-legend{margin-top:.75rem;font-size:.9rem;}',
    '#map-legend .ml-leg-group{margin:.5rem 0;}',
    '#map-legend .ml-leg-title{font-weight:600;margin-bottom:.2rem;}',
    '#map-legend .ml-leg-items{display:flex;flex-wrap:wrap;gap:.25rem 1rem;}',
    '#map-legend .ml-leg-item{display:inline-flex;align-items:center;gap:.4rem;}',
    '#map-legend .ml-sw{display:inline-block;width:16px;height:16px;border:1px solid var(--line);border-radius:3px;flex:none;}',
    '#map-legend .ml-ln{display:inline-block;width:22px;height:0;border-top:4px solid;flex:none;}',
    '#map-legend .ml-note{color:var(--muted);margin:.15rem 0 0;}',

    /* route table */
    '#route-table .ml-rt-sw{display:inline-block;width:18px;height:0;border-top:4px solid;vertical-align:middle;margin-right:.4rem;}',
    '#route-table tbody tr{cursor:pointer;}',
    '#route-table tbody tr:hover,#route-table tbody tr:focus{background:var(--card);outline:none;}',
    '#route-table td.num,#route-table th.num{text-align:right;white-space:nowrap;}',
    '#route-table .ml-rt-note{color:var(--muted);font-size:.85rem;margin-top:.5rem;}'
  ].join('\n');
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ------------------------------------------------------------------------
     2. Map, panes, scale bar
     ------------------------------------------------------------------------ */
  var studyBounds = wsenToBounds(D.meta.study_area_wsen);
  var planBounds = wsenToBounds(D.meta.planning_area_wsen);

  var map = L.map('map', { zoomSnap: 0.25, zoomControl: true, attributionControl: true });
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution(
    'Contains modified Copernicus Sentinel data (2017–2025); MODIS (NASA); Copernicus DEM GLO-30');

  // Own panes so the stacking order is fixed whatever order layers are toggled:
  // rasters < patches < Mahmud Dere < routes (markers/tooltips are higher by default).
  map.createPane('rasters').style.zIndex = 250;
  map.createPane('patches').style.zIndex = 410;
  map.createPane('mahmud').style.zIndex = 420;
  map.createPane('routes').style.zIndex = 430;

  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

  /** Image overlay in the raster pane. */
  function rasterLayer(def, z, opacity) {
    return L.imageOverlay(def.file, def.bounds, {
      pane: 'rasters', zIndex: z, opacity: opacity == null ? 1 : opacity, alt: def.label
    });
  }

  /* ------------------------------------------------------------------------
     3. Base layers (radio buttons, standard Leaflet layers control)
     ------------------------------------------------------------------------ */
  var baseS2 = rasterLayer(IMG.winter_s2, 1);
  var baseHill = rasterLayer(IMG.hillshade, 1);
  var baseLayers = {};
  baseLayers[IMG.winter_s2.label] = baseS2;
  baseLayers[IMG.hillshade.label] = baseHill;
  baseS2.addTo(map); // default
  L.control.layers(baseLayers, null, { position: 'topleft', collapsed: true }).addTo(map);

  /* ------------------------------------------------------------------------
     4. Study-area outline (always on)
     ------------------------------------------------------------------------ */
  var studyGroup = L.layerGroup().addTo(map);
  // dark under-line + white dashed line, so it shows on both backgrounds
  L.geoJSON(LAYERS.study_area, {
    interactive: false, style: { color: '#000', weight: 4, opacity: 0.45, fill: false }
  }).addTo(studyGroup);
  L.geoJSON(LAYERS.study_area, {
    interactive: false, style: { color: '#fff', weight: 2, dashArray: '7 6', fill: false }
  }).addTo(studyGroup);
  L.circleMarker([studyBounds[1][0], studyBounds[0][1]], {
    radius: 1, opacity: 0, fillOpacity: 0, interactive: false
  }).bindTooltip('Şahdüzü pastures study area', {
    permanent: true, direction: 'right', offset: [6, 12], className: 'ml-label'
  }).addTo(studyGroup);

  /* ------------------------------------------------------------------------
     5. Overlay layers
     ------------------------------------------------------------------------ */

  // a) slope classes
  var slopeLayer = rasterLayer(IMG.slope, 3, 0.6);

  // b) snow cover by month (12 images sharing one bounds)
  var snowImgs = IMG.snow_by_month;
  var snowMonth = 0; // index 0 = January
  var snowLayer = L.imageOverlay(snowImgs.files[snowMonth], snowImgs.bounds, {
    pane: 'rasters', zIndex: 4, opacity: 0.8, alt: snowImgs.label
  });

  // c) radar change image
  var radarLayer = rasterLayer(IMG.radar_change, 5, 0.7);

  // d) Sentinel-2 before / after (one overlay, file swapped by the radios)
  var s2Which = 'before';
  var s2Layer = rasterLayer(IMG.s2_before, 2, 1);

  // e) April 2025 patches, coloured by grade
  var gradeColor = {};
  D.legends.grade.forEach(function (g) { gradeColor[g.grade] = g.color; });

  var aprilLayer = L.geoJSON(LAYERS.april_patches, {
    pane: 'patches',
    style: function (f) {
      var c = gradeColor[f.properties.grade] || '#e0412b';
      return { color: c, weight: 1.5, fillColor: c, fillOpacity: 0.35 };
    },
    onEachFeature: function (f, layer) {
      var p = f.properties;
      layer.bindPopup(
        '<strong>Snow-change patch, grade ' + esc(p.grade) + '</strong>' +
        '<br>Area: ' + esc(p.area_ha) + ' ha' +
        '<br>Elevation: ' + num(p.elev_m) + ' m' +
        '<br>Slope: ' + esc(p.slope_deg) + '°' +
        '<br>Radar brightening: ' + esc(p.dB_change) + ' dB' +
        '<br><em>Unconfirmed: snow change after the April 2025 storm; ' +
        'no debris visible in Sentinel-2.</em>');
    }
  });

  // f) Mahmud Dere: matched patches + reported point (one group)
  var MAHMUD_PURPLE = '#8e3fbf';
  var mahmudPatches = L.geoJSON(LAYERS.mahmud_patches, {
    pane: 'mahmud',
    style: { color: MAHMUD_PURPLE, weight: 4, fillColor: MAHMUD_PURPLE, fillOpacity: 0.2 },
    onEachFeature: function (f, layer) {
      var p = f.properties;
      layer.bindPopup(
        '<strong>Mahmud Dere: matched snow-change patch</strong>' +
        '<br>Distance to reported point: ' + num(p.dist_to_site_m) + ' m' +
        '<br>Elevation: ' + num(p.elev_m) + ' m, slope ' + esc(p.slope_deg) + '°' +
        '<br>Radar brightening: ' + esc(p.dB_change) + ' dB' +
        '<br>Radar pair: ' + fmtDate(p.before) + ' → ' + fmtDate(p.after) +
        '<br><em>Possible avalanche activity. Status: probable, not confirmed.</em>');
    }
  });
  var mp = LAYERS.mahmud_point;
  var mahmudMarker = L.circleMarker([mp.lat, mp.lon], {
    pane: 'mahmud', radius: 9, color: MAHMUD_PURPLE, weight: 4, fillColor: '#fff', fillOpacity: 1
  }).bindPopup('<strong>Mahmud Dere</strong><br>' + esc(mp.text))
    .bindTooltip('Mahmud Dere (reported)', { direction: 'top', offset: [0, -8], className: 'ml-label' });
  var mahmudGroup = L.layerGroup([mahmudPatches, mahmudMarker]);

  // g) routes: white casing underneath + coloured line on top
  var ROUTE_PALETTE = ['#1565c0', '#00a676', '#d81b60', '#00b8d4', '#6d4c41', '#222222', '#aeb800'];
  var routeColor = {};   // route name -> colour
  var routeLine = {};    // route name -> Leaflet layer (for zooming and popups)
  LAYERS.routes.features.forEach(function (f, i) {
    routeColor[f.properties.name] = ROUTE_PALETTE[i % ROUTE_PALETTE.length];
  });

  /** Popup HTML for one route (numbers read from the feature properties). */
  function routePopup(p) {
    return '<strong>' + esc(p.name) + '</strong>' +
      '<br>Length: ' + p.length_km.toFixed(1) + ' km' +
      '<br>Elevation: ' + num(p.elev_min_m) + '–' + num(p.elev_max_m) + ' m' +
      '<br>On slopes of 30° or more: ' + pct(p.share_on_30deg_plus) +
      '<br>Below steep slopes: ' + pct(p.share_below_steep_slopes) +
      '<br>Snow season at mid-elevation: ' + esc(p.snow_season_mid_elevation) +
      '<br><em>A candidate for professional assessment, not an approved route.</em>';
  }

  var routeCasing = L.geoJSON(LAYERS.routes, {
    pane: 'routes', interactive: false,
    style: { color: '#fff', weight: 7, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }
  });
  var routeLines = L.geoJSON(LAYERS.routes, {
    pane: 'routes',
    style: function (f) {
      return { color: routeColor[f.properties.name], weight: 3.5, opacity: 1, lineCap: 'round', lineJoin: 'round' };
    },
    onEachFeature: function (f, layer) {
      routeLine[f.properties.name] = layer;
      layer.bindPopup(routePopup(f.properties));
    }
  });
  var routeGroup = L.layerGroup([routeCasing, routeLines]);

  // h) places as labelled markers (the Mahmud Dere report already has its own marker)
  var placesGroup = L.layerGroup();
  LAYERS.places.forEach(function (pl) {
    if (pl.type === 'avalanche report') { return; }
    var label = esc(pl.name) + (pl.elevation_m != null ? ' (' + num(pl.elevation_m) + ' m)' : '');
    L.marker([pl.lat, pl.lon], {
      icon: L.divIcon({ className: 'ml-peak', html: '▲', iconSize: [15, 15], iconAnchor: [7, 11] }),
      title: pl.name, keyboard: false
    }).bindTooltip(label, { permanent: true, direction: 'right', offset: [6, 0], className: 'ml-label' })
      .addTo(placesGroup);
  });

  /* ------------------------------------------------------------------------
     6. Custom overlay control (one collapsible panel, top right)
     ------------------------------------------------------------------------ */
  var legendEl = document.getElementById('map-legend');
  var overlays = {}; // key -> { layer, input } so the legend and route table can query / switch layers

  var panel = L.DomUtil.create('div', 'leaflet-control ml-panel');
  var toggleBtn = L.DomUtil.create('button', 'ml-panel-toggle', panel);
  toggleBtn.type = 'button';
  var body = L.DomUtil.create('div', 'ml-panel-body', panel);

  function setCollapsed(c) {
    panel.classList.toggle('collapsed', c);
    toggleBtn.setAttribute('aria-expanded', c ? 'false' : 'true');
    toggleBtn.innerHTML = '<span>Map layers</span><span aria-hidden="true">' + (c ? '▾' : '▴') + '</span>';
  }
  toggleBtn.addEventListener('click', function () {
    setCollapsed(!panel.classList.contains('collapsed'));
  });
  // collapsed by default on phones, open on larger screens
  setCollapsed(window.matchMedia('(max-width: 640px)').matches);

  /**
   * Add one row to the panel: a checkbox that adds/removes `layer`.
   * `buildExtra(extraDiv)` can add sliders / radios under the checkbox.
   */
  function addRow(key, label, layer, on, buildExtra) {
    var row = L.DomUtil.create('div', 'ml-row', body);
    var head = L.DomUtil.create('label', 'ml-row-head', row);
    var input = L.DomUtil.create('input', '', head);
    input.type = 'checkbox';
    input.checked = on;
    var span = L.DomUtil.create('span', '', head);
    span.textContent = label;
    if (on) { layer.addTo(map); }
    input.addEventListener('change', function () {
      if (input.checked) { map.addLayer(layer); } else { map.removeLayer(layer); }
      updateLegend();
    });
    overlays[key] = { layer: layer, input: input };
    if (buildExtra) { buildExtra(L.DomUtil.create('div', 'ml-extra', row)); }
    return row;
  }

  /** Opacity slider (0–1) bound to an image overlay, with a % read-out. */
  function opacitySlider(div, layer, start) {
    var r = L.DomUtil.create('input', '', div);
    r.type = 'range'; r.min = 0; r.max = 1; r.step = 0.05; r.value = start;
    r.setAttribute('aria-label', 'Opacity');
    var v = L.DomUtil.create('span', 'ml-val', div);
    v.textContent = 'Opacity ' + Math.round(start * 100) + '%';
    r.addEventListener('input', function () {
      layer.setOpacity(parseFloat(r.value));
      v.textContent = 'Opacity ' + Math.round(r.value * 100) + '%';
    });
  }

  // a) slope + opacity slider
  addRow('slope', IMG.slope.label, slopeLayer, true, function (div) {
    opacitySlider(div, slopeLayer, 0.6);
  });

  // b) snow by month + month slider
  addRow('snow', IMG.snow_by_month.label, snowLayer, false, function (div) {
    var r = L.DomUtil.create('input', '', div);
    r.type = 'range'; r.min = 0; r.max = 11; r.step = 1; r.value = snowMonth;
    r.setAttribute('aria-label', 'Month');
    var v = L.DomUtil.create('span', 'ml-val', div);
    v.textContent = MONTHS_LONG[snowMonth];
    r.addEventListener('input', function () {
      snowMonth = parseInt(r.value, 10);
      snowLayer.setUrl(snowImgs.files[snowMonth]);
      v.textContent = MONTHS_LONG[snowMonth];
      updateLegend();
    });
  });

  // c) radar change + opacity slider
  addRow('radar', IMG.radar_change.label, radarLayer, false, function (div) {
    opacitySlider(div, radarLayer, 0.7);
  });

  // d) Sentinel-2 before / after toggle
  addRow('s2', 'Sentinel-2 before / after (April 2025)', s2Layer, false, function (div) {
    var box = L.DomUtil.create('div', 'ml-radios', div);
    [['before', 'before (7 Apr)', IMG.s2_before], ['after', 'after (27 Apr)', IMG.s2_after]].forEach(function (o) {
      var lab = L.DomUtil.create('label', '', box);
      var rb = L.DomUtil.create('input', '', lab);
      rb.type = 'radio'; rb.name = 'ml-s2'; rb.checked = (o[0] === s2Which);
      lab.appendChild(document.createTextNode(' ' + o[1]));
      rb.addEventListener('change', function () {
        s2Which = o[0];
        s2Layer.setUrl(o[2].file);
        updateLegend();
      });
    });
    var note = L.DomUtil.create('span', 'ml-val', div);
    note.textContent = 'Study area only';
  });

  // e) April 2025 patches
  addRow('april', 'April 2025 snow-change patches (possible avalanche activity, unconfirmed)', aprilLayer, false);

  // f) Mahmud Dere
  addRow('mahmud', 'Mahmud Dere: reported point and matched patches', mahmudGroup, true);

  // g) routes
  addRow('routes', 'Recorded routes', routeGroup, true);

  // h) places
  addRow('places', 'Peaks', placesGroup, true);

  var OverlayControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function () {
      L.DomEvent.disableClickPropagation(panel);   // sliders must not pan the map
      L.DomEvent.disableScrollPropagation(panel);
      return panel;
    }
  });
  new OverlayControl().addTo(map);

  /* ------------------------------------------------------------------------
     7. Legend (#map-legend), only for the layers that are switched on
     ------------------------------------------------------------------------ */
  function isOn(key) { return overlays[key] && overlays[key].input.checked; }

  function legendGroup(title, itemsHtml, note) {
    return '<div class="ml-leg-group"><div class="ml-leg-title">' + title + '</div>' +
      (itemsHtml ? '<div class="ml-leg-items">' + itemsHtml + '</div>' : '') +
      (note ? '<p class="ml-note">' + note + '</p>' : '') + '</div>';
  }
  function swatch(color, label) {
    return '<span class="ml-leg-item"><span class="ml-sw" style="background:' + color + '"></span>' + esc(label) + '</span>';
  }
  function lineSwatch(color, label) {
    return '<span class="ml-leg-item"><span class="ml-ln" style="border-top-color:' + color + '"></span>' + esc(label) + '</span>';
  }

  function updateLegend() {
    if (!legendEl) { return; }
    var h = '';

    if (isOn('slope')) {
      h += legendGroup('Slope steepness',
        D.legends.slope.map(function (s) { return swatch(s.color, s.label); }).join(''),
        'Areas under 25° are left uncoloured. Slopes of 30° or more cover about a third of the planning area.');
    }
    if (isOn('snow')) {
      h += legendGroup('Snow cover, ' + MONTHS_LONG[snowMonth] + ' (10-year average)', '',
        'Darker blue = snow present more of the time (10-year MODIS average for each 250 m elevation band and slope direction). ' +
        'Transparent = snow present under 10% of the time. This shows general patterns, not snow at a particular spot.');
    }
    if (isOn('radar')) {
      h += legendGroup('Radar change, 17–29 April 2025',
        swatch('#d32f2f', 'radar signal got brighter') + swatch('#26c6da', 'no increase (cyan / grey)'),
        'Study area only. Brighter areas are snow-change patches; their interpretation is unconfirmed.');
    }
    if (isOn('s2')) {
      h += legendGroup(esc(s2Which === 'before' ? IMG.s2_before.label : IMG.s2_after.label), '',
        'Study area only.');
    }
    if (isOn('april')) {
      h += legendGroup('April 2025 snow-change patches (unconfirmed)',
        D.legends.grade.map(function (g) { return swatch(g.color, g.label); }).join(''),
        'Possible avalanche activity after the 15–16 April 2025 storm. Agreement between the two radar directions is about what chance gives, so it is not independent confirmation.');
    }
    if (isOn('mahmud')) {
      h += legendGroup('Mahmud Dere, December 2017',
        swatch(MAHMUD_PURPLE, 'matched patches (purple outline)') +
        '<span class="ml-leg-item"><span class="ml-sw" style="background:#fff;border:3px solid ' + MAHMUD_PURPLE +
        ';border-radius:50%"></span>local report of an avalanche, 24–25 Dec 2017</span>',
        'Status: probable, not confirmed. The report point may mark the valley rather than the deposit.');
    }
    if (isOn('routes')) {
      h += legendGroup('Recorded routes',
        LAYERS.routes.features.map(function (f) {
          return lineSwatch(routeColor[f.properties.name], f.properties.name);
        }).join(''));
    }
    if (isOn('places')) {
      h += legendGroup('Peaks', '<span class="ml-leg-item">▲ summit (elevation in label)</span>');
    }

    legendEl.innerHTML = h;
  }

  /* ------------------------------------------------------------------------
     8. Initial view: fit to the study area (also works on a phone)
     ------------------------------------------------------------------------ */
  function fitToStudyArea() {
    map.invalidateSize();
    map.fitBounds(studyBounds, { padding: [8, 8] });
    // stop panning/zooming far outside the data (there are no web tiles)
    try {
      map.setMinZoom(map.getBoundsZoom(planBounds, false));
      map.setMaxBounds(L.latLngBounds(planBounds).pad(0.15));
    } catch (e) { /* container not sized yet; harmless */ }
  }
  fitToStudyArea();
  window.addEventListener('load', fitToStudyArea);
  updateLegend();

  /* ------------------------------------------------------------------------
     9. Route table (#route-table); clicking a row zooms the map to the route
     ------------------------------------------------------------------------ */
  var tableEl = document.getElementById('route-table');
  if (tableEl) {
    var html = '<div class="table-wrap"><table>' +
      '<thead><tr>' +
      '<th>Route</th>' +
      '<th class="num">Length (km)</th>' +
      '<th class="num">Elevation (m)</th>' +
      '<th class="num">On slopes 30°+ (%)</th>' +
      '<th class="num">Below steep slopes (%)</th>' +
      '<th class="num">April 2025 patches within 500 m</th>' +
      '<th>Typical snow season at mid-elevation</th>' +
      '</tr></thead><tbody>';

    LAYERS.routes.features.forEach(function (f) {
      var p = f.properties;
      html += '<tr tabindex="0" data-route="' + esc(p.name) + '" title="Show on map">' +
        '<td><span class="ml-rt-sw" style="border-top-color:' + routeColor[p.name] + '"></span>' + esc(p.name) + '</td>' +
        '<td class="num">' + p.length_km.toFixed(1) + '</td>' +
        '<td class="num">' + num(p.elev_min_m) + '–' + num(p.elev_max_m) + '</td>' +
        '<td class="num">' + pct(p.share_on_30deg_plus) + '</td>' +
        '<td class="num">' + pct(p.share_below_steep_slopes) + '</td>' +
        '<td class="num">' + esc(p.april2025_patches_within_500m) + '</td>' +
        '<td>' + esc(p.snow_season_mid_elevation) + '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>' +
      '<p class="ml-rt-note">Click a route to show it on the map. “Below steep slopes” is the share of a route ' +
      'with slopes of 30° or more uphill within 300 m, a crude runout measure. These are candidates for ' +
      'professional assessment, not approved routes.</p>';
    tableEl.innerHTML = html;

    /** Zoom to a route, make sure the route layer is on, open its popup. */
    function showRoute(name) {
      var layer = routeLine[name];
      if (!layer) { return; }
      if (!isOn('routes')) {
        overlays.routes.input.checked = true;
        map.addLayer(overlays.routes.layer);
        updateLegend();
      }
      mapEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      map.fitBounds(layer.getBounds(), { padding: [30, 30] });
      layer.openPopup(layer.getBounds().getCenter());
    }

    tableEl.addEventListener('click', function (e) {
      var tr = e.target.closest ? e.target.closest('tr[data-route]') : null;
      if (tr) { showRoute(tr.getAttribute('data-route')); }
    });
    tableEl.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') { return; }
      var tr = e.target.closest ? e.target.closest('tr[data-route]') : null;
      if (tr) { e.preventDefault(); showRoute(tr.getAttribute('data-route')); }
    });
  }
})();

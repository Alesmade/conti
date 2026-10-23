/* Conti — app per i conti personali. Tutti i dati restano sul telefono (localStorage). */
(function () {
  'use strict';

  var KEY = 'conti.v1';
  var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  var MESI_BREVI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  var GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  var IN_TYPES = ['Stipendio', 'Fattura', 'Altro'];
  var TAX_CAT = 'Tasse';

  var DEFAULT_SETTINGS = {
    regime: 'forfettario', aliquota: 5, coeff: 78, aliquotaOrd: 23,
    cassa: 'ENPAP', sogg: 11, integr: 4, mat: 130, minSogg: 856,
    comm: 600, bollo: true
  };
  var DEFAULT_CATS = ['Casa', 'Cibo', 'Auto', 'Abbonamenti', 'Salute', 'Svago', 'Regali', 'Altro'];

  /* ---------- dati ---------- */
  function fresh() {
    return { v: 1, name: '', settings: copy(DEFAULT_SETTINGS), cats: DEFAULT_CATS.slice(), items: [], savings: [], budgets: {}, saveGoal: 0, notified: {} };
  }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return fresh();
      return normalize(JSON.parse(raw));
    } catch (e) { return fresh(); }
  }
  function normalize(s) {
    var f = fresh();
    if (!s || typeof s !== 'object') return f;
    f.name = typeof s.name === 'string' ? s.name : '';
    f.settings = Object.assign(copy(DEFAULT_SETTINGS), s.settings || {});
    f.cats = Array.isArray(s.cats) && s.cats.length ? s.cats.filter(function (c) { return typeof c === 'string'; }) : DEFAULT_CATS.slice();
    f.items = Array.isArray(s.items) ? s.items.filter(function (i) { return i && i.id && i.date && typeof i.amount === 'number'; }) : [];
    f.savings = Array.isArray(s.savings) ? s.savings.filter(function (i) { return i && typeof i.amount === 'number' && i.date; }) : [];
    f.budgets = s.budgets && typeof s.budgets === 'object' ? s.budgets : {};
    f.saveGoal = Number(s.saveGoal) || 0;
    f.notified = s.notified && typeof s.notified === 'object' ? s.notified : {};
    return f;
  }
  var S = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Non riesco a salvare sul telefono'); }
  }

  /* ---------- utilità ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function isoYMD(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function today() { return iso(new Date()); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function dim(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
  function r2(x) { return Math.round(x * 100) / 100; }
  function num(v) {
    var s = String(v == null ? '' : v).replace(/[\s€]/g, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (!/^\d+\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
    var n = parseFloat(s); return isFinite(n) ? n : 0;
  }
  function numPlain(v) { var n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; }
  function fmt(x) {
    x = r2(x);
    var neg = x < 0; x = Math.abs(x);
    var whole = Math.abs(x % 1) < 0.005;
    var parts = (whole ? Math.round(x).toString() : x.toFixed(2)).split('.');
    var int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '−' : '') + int + (parts[1] ? ',' + parts[1] : '') + ' €';
  }
  function fmtUp(x) { return fmt(Math.ceil(r2(x) - 0.001)); }
  function fmtInput(x) { x = r2(x); return Math.abs(x % 1) < 0.005 ? String(Math.round(x)) : x.toFixed(2).replace('.', ','); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function dayLabel(s) { var d = parse(s); return GIORNI[d.getDay()] + ' ' + d.getDate(); }
  function shortDate(s) { var d = parse(s); return d.getDate() + ' ' + MESI[d.getMonth()]; }

  /* ---------- calcolo fattura ---------- */
  function invoice(compenso, st) {
    st = st || S.settings;
    var integr = r2(compenso * st.integr / 100);
    var bollo = st.bollo && compenso > 77.47 ? 2 : 0;
    var base = st.regime === 'forfettario' ? compenso * st.coeff / 100 : compenso;
    var pens = r2(base * st.sogg / 100);
    var rate = st.regime === 'forfettario' ? st.aliquota : st.aliquotaOrd;
    var tasse = r2(Math.max(0, base - pens) * rate / 100);
    return { compenso: r2(compenso), integr: integr, bollo: bollo, pens: pens, tasse: tasse, incasso: r2(compenso + integr + bollo), via: r2(integr + bollo + pens + tasse) };
  }

  /* ---------- ricorrenze ---------- */
  function occurrences(item, from, to) {
    var out = [];
    if (item.freq === 'monthly') {
      var s = parse(item.date), day = s.getDate();
      var y = s.getFullYear(), m = s.getMonth();
      var ty = parse(to).getFullYear(), tm = parse(to).getMonth();
      var guard = 0;
      while ((y < ty || (y === ty && m <= tm)) && guard++ < 600) {
        var d = isoYMD(y, m, Math.min(day, dim(y, m)));
        if (d >= item.date && d >= from && d <= to && (!item.end || d <= item.end)) out.push({ item: item, date: d });
        m++; if (m > 11) { m = 0; y++; }
      }
    } else if (item.date >= from && item.date <= to) {
      out.push({ item: item, date: item.date });
    }
    return out;
  }
  function allOcc(from, to) {
    var list = [];
    S.items.forEach(function (it) { list = list.concat(occurrences(it, from, to)); });
    list.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return list;
  }
  function totals(from, to) {
    var t = today(), lim = to < t ? to : t;
    var r = { inn: 0, out: 0, save: 0, via: 0, paid: 0, pens: 0, any: false };
    if (from > t) return r;
    allOcc(from, lim).forEach(function (o) {
      r.any = true;
      if (o.item.kind === 'in') {
        r.inn += o.item.amount;
        if (o.item.inv) { r.via += o.item.inv.via; r.pens += o.item.inv.pens; }
      } else {
        r.out += o.item.amount;
        if (o.item.tax) r.paid += o.item.amount;
      }
    });
    S.savings.forEach(function (sv) { if (sv.date >= from && sv.date <= lim) { r.save += sv.amount; r.any = true; } });
    r.left = r.inn - r.out - r.save;
    return r;
  }
  function weeksOf(y, m) {
    var res = [], d = 1, n = dim(y, m);
    while (d <= n) {
      var dow = (new Date(y, m, d).getDay() + 6) % 7;
      var end = Math.min(n, d + (6 - dow));
      res.push({ from: isoYMD(y, m, d), to: isoYMD(y, m, end), label: d === end ? d + ' ' + MESI[m] : d + ' – ' + end + ' ' + MESI[m] });
      d = end + 1;
    }
    return res;
  }
  function weekOf(dateIso) {
    var d = parse(dateIso), ws = weeksOf(d.getFullYear(), d.getMonth());
    for (var i = 0; i < ws.length; i++) if (dateIso >= ws[i].from && dateIso <= ws[i].to) return ws[i];
    return ws[0];
  }
  function yearOf(s) { return parse(s).getFullYear(); }

  /* ---------- stato interfaccia ---------- */
  var now = parse(today());
  var UI = { screen: 'home', view: 'year', y: now.getFullYear(), m: now.getMonth(), wFrom: weekOf(today()).from, form: null, confirm: false, budgetEdit: false, saved: null };
  var stack = [];
  function snapshot() { return { screen: UI.screen, view: UI.view, y: UI.y, m: UI.m, wFrom: UI.wFrom }; }
  function go(patch, noHistory) {
    if (!noHistory) {
      stack.push(snapshot());
      try { history.pushState({ n: stack.length }, ''); } catch (e) {}
    }
    Object.assign(UI, patch);
    UI.confirm = false;
    render();
    window.scrollTo(0, 0);
  }
  window.addEventListener('popstate', function () {
    var prev = stack.pop();
    if (prev) { Object.assign(UI, prev); UI.form = UI.screen === 'add' ? UI.form : null; UI.confirm = false; UI.saved = null; render(); window.scrollTo(0, 0); }
  });

  /* ---------- icone ---------- */
  var I = {
    bell: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    down: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2C8A57" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
    up: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C2392E" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    piggy: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2C6DB5" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>',
    left: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    right: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    close: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    home: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    list: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    plus: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    jar: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h10M8 3v3a5 5 0 0 0-3 4.6V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8.4A5 5 0 0 0 16 6V3"/><path d="M5 13h14"/></svg>',
    gear: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
  };

  /* ---------- pezzi riusati ---------- */
  function contoCard(t) {
    var h = '<div class="card">' +
      '<div class="line"><span class="bubble in">' + I.down + '</span><span class="what">Sono entrati</span><span class="amt num c-green">' + fmt(t.inn) + '</span></div>' +
      '<div class="line"><span class="bubble out">' + I.up + '</span><span class="what">Hai speso</span><span class="amt num c-red">' + fmt(t.out) + '</span></div>';
    if (t.save > 0) h += '<div class="line"><span class="bubble save">' + I.piggy + '</span><span class="what">Nel risparmio</span><span class="amt num c-blue">' + fmt(t.save) + '</span></div>';
    if (t.left >= 0) h += '<div class="line total"><span class="bubble eq">=</span><span class="what">Ti restano</span><span class="amt num c-green">' + fmt(t.left) + '</span></div>';
    else h += '<div class="line total"><span class="bubble eq" style="background:#C2392E">=</span><span class="what">Sei sotto di</span><span class="amt num c-red">' + fmt(-t.left) + '</span></div>';
    return h + '</div>';
  }
  function seg(name, options, current, action) {
    return '<div class="seg" role="group" aria-label="' + esc(name) + '">' + options.map(function (o) {
      return '<button type="button" data-a="' + action + '" data-v="' + esc(o[0]) + '" aria-pressed="' + (o[0] === current) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }
  function upcoming(days) {
    var t = today();
    return allOcc(t, addDays(t, days)).filter(function (o) { return o.item.freq === 'monthly' || o.item.freq === 'future'; });
  }
  function dueSoon() {
    var t = today(), tm = addDays(t, 1);
    return upcoming(1).filter(function (o) { return o.item.remind && (o.date === t || o.date === tm); });
  }
  function whenText(d) {
    var n = diffDays(today(), d);
    if (n === 0) return 'Oggi';
    if (n === 1) return 'Domani';
    if (n < 7) return 'Tra ' + n + ' giorni';
    return 'Il ' + shortDate(d);
  }
  function taxJar(year) {
    var t = totals(year + '-01-01', year + '-12-31');
    return { keep: Math.max(0, r2(t.via - t.paid)), via: t.via, paid: t.paid, pens: t.pens };
  }
  function eCassa() { var c = S.settings.cassa || ''; return (/^[aeiouAEIOU]/.test(c) ? 'ed ' : 'e ') + c; }
  function savedTotal() { return S.savings.reduce(function (a, s) { return a + s.amount; }, 0); }

  /* ---------- schermata principale ---------- */
  function homeHeader(title, prevOk, nextOk) {
    var bellDot = dueSoon().length ? '<span class="dot"></span>' : '';
    var hello = UI.view === 'year' ? '<span class="hello">Ciao' + (S.name ? ' ' + esc(S.name) : '') + '</span>' : '';
    return '<div class="top"><div class="stack" style="gap:2px">' + hello +
      '<div class="period"><button type="button" class="arrow" data-a="prev" aria-label="Periodo prima"' + (prevOk ? '' : ' disabled') + '>' + I.left + '</button>' +
      '<h1' + (title.length > 10 ? ' style="font-size:24px"' : '') + '>' + esc(title) + '</h1>' +
      '<button type="button" class="arrow" data-a="next" aria-label="Periodo dopo"' + (nextOk ? '' : ' disabled') + '>' + I.right + '</button></div></div>' +
      '<button type="button" class="iconbtn" data-a="alerts" aria-label="Scadenze">' + I.bell + bellDot + '</button></div>';
  }
  function renderHome() {
    var h = '';
    var t = today();
    if (UI.view === 'year') {
      h += homeHeader(String(UI.y), true, UI.y < parse(t).getFullYear() + 1);
      h += seg('Vista', [['week', 'Settimana'], ['month', 'Mese'], ['year', 'Anno']], 'year', 'view');
      h += contoCard(totals(UI.y + '-01-01', UI.y + '-12-31'));
      var jar = taxJar(UI.y);
      h += '<div class="jars"><button type="button" class="jar tax" data-a="nav" data-v="jars"><span class="t">Tasse ' + esc(eCassa()) + '</span><span class="v num">' + fmtUp(jar.keep) + '</span><span class="s">da tenere da parte</span></button>' +
        '<button type="button" class="jar save" data-a="nav" data-v="jars"><span class="t">Risparmio</span><span class="v num">' + fmt(savedTotal()) + '</span><span class="s">' + (S.saveGoal ? 'obiettivo ' + fmt(S.saveGoal) + ' al mese' : 'messi da parte') + '</span></button></div>';
      h += '<div class="stack"><h2>I mesi</h2><div class="folders">';
      for (var m = 0; m < 12; m++) {
        var from = isoYMD(UI.y, m, 1), to = isoYMD(UI.y, m, dim(UI.y, m));
        var tt = totals(from, to), fut = from > t, nowM = t >= from && t <= to;
        var net = fut || !tt.any ? '—' : (tt.left >= 0 ? '+ ' : '− ') + fmt(Math.abs(tt.left));
        var col = fut || !tt.any ? 'var(--muted)' : tt.left >= 0 ? 'var(--green)' : 'var(--red)';
        h += '<button type="button" class="folder' + (nowM ? ' now' : '') + (fut ? ' future' : '') + '" data-a="month" data-v="' + m + '"><span class="tab"></span><span class="body"><span class="name">' + MESI_BREVI[m] + '</span><span class="net num" style="color:' + col + '">' + net + '</span></span></button>';
      }
      h += '</div></div>';
    } else if (UI.view === 'month') {
      var mf = isoYMD(UI.y, UI.m, 1), mt = isoYMD(UI.y, UI.m, dim(UI.y, UI.m));
      h += homeHeader(cap(MESI[UI.m]) + (UI.y !== parse(t).getFullYear() ? ' ' + UI.y : ''), true, true);
      h += seg('Vista', [['week', 'Settimana'], ['month', 'Mese'], ['year', 'Anno']], 'month', 'view');
      h += contoCard(totals(mf, mt));
      var next = upcoming(7)[0];
      if (next) h += '<button type="button" class="note" data-a="alerts">' + I.bell.replace('currentColor', '#2C6DB5') + '<span class="grow">' + esc(whenText(next.date)) + ': <b>' + esc(next.item.name) + '</b></span><span class="num" style="font-weight:700">' + fmt(next.item.amount) + '</span></button>';
      h += '<div class="stack"><h2>Le settimane</h2><div class="folders list">';
      weeksOf(UI.y, UI.m).forEach(function (w) {
        var tw = totals(w.from, w.to), fut = w.from > t, nowW = t >= w.from && t <= w.to;
        var net = fut || !tw.any ? '' : (tw.left >= 0 ? '+ ' : '− ') + fmt(Math.abs(tw.left));
        var col = tw.left >= 0 ? 'var(--green)' : 'var(--red)';
        h += '<button type="button" class="folder' + (nowW ? ' now' : '') + (fut ? ' future' : '') + '" data-a="week" data-v="' + w.from + '"><span class="tab"></span><span class="body"><span class="name">' + esc(w.label) + '</span><span class="net num" style="color:' + col + '">' + net + '</span></span></button>';
      });
      h += '</div></div>';
    } else {
      var w = weekOf(UI.wFrom);
      h += homeHeader(w.label, true, true);
      h += seg('Vista', [['week', 'Settimana'], ['month', 'Mese'], ['year', 'Anno']], 'week', 'view');
      h += contoCard(totals(w.from, w.to));
      var occ = allOcc(w.from, w.to);
      var sv = S.savings.filter(function (s) { return s.date >= w.from && s.date <= w.to; });
      if (!occ.length && !sv.length) {
        h += '<p class="empty">Nessun movimento in questa settimana.<br>Tocca + per aggiungerne uno.</p>';
      } else {
        var byDay = {};
        occ.forEach(function (o) { (byDay[o.date] = byDay[o.date] || []).push(o); });
        sv.forEach(function (s) { (byDay[s.date] = byDay[s.date] || []).push({ saving: s, date: s.date }); });
        h += '<div class="stack-lg">';
        Object.keys(byDay).sort().forEach(function (d) {
          h += '<div class="day"><span class="muted">' + dayLabel(d) + '</span>';
          byDay[d].forEach(function (o) {
            if (o.saving) {
              h += '<div class="mov"><span class="grow n">' + (o.saving.amount >= 0 ? 'Nel risparmio' : 'Preso dal risparmio') + '</span><span class="a num c-blue">' + fmt(Math.abs(o.saving.amount)) + '</span></div>';
              return;
            }
            var it = o.item, later = o.date > t;
            var extra = '';
            if (it.inv) extra = '<span class="chip-y">metti via ' + fmtUp(it.inv.via) + '</span>';
            else if (later) extra = '<span class="chip-g">in arrivo</span>';
            else if (it.freq === 'monthly') extra = '<span class="chip-g">ogni mese</span>';
            h += '<button type="button" class="mov' + (later ? ' later' : '') + '" data-a="edit" data-v="' + it.id + '"><span class="grow row" style="gap:8px;flex-wrap:wrap"><span class="n">' + esc(it.name) + '</span>' + extra + '</span><span class="a num ' + (it.kind === 'in' ? 'c-green' : 'c-red') + '">' + (it.kind === 'in' ? '+ ' : '− ') + fmt(it.amount) + '</span></button>';
          });
          h += '</div>';
        });
        h += '</div>';
      }
    }
    return h;
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ---------- aggiungi / modifica ---------- */
  function newForm(patch) {
    return Object.assign({ id: null, kind: 'out', inType: 'Stipendio', amount: '', name: '', cat: S.cats[0] || 'Altro', when: 'once', date: today(), remind: true, tax: false }, patch || {});
  }
  function formFromItem(it) {
    var when = it.freq === 'monthly' ? 'monthly' : it.date > today() ? 'future' : 'once';
    return newForm({ id: it.id, kind: it.kind, inType: it.inType || 'Altro', amount: fmtInput(it.inv ? it.inv.compenso : it.amount), name: it.name, cat: it.cat || 'Altro', when: when, date: it.date, remind: !!it.remind, tax: !!it.tax, freq: it.freq });
  }
  function invoiceHint(f) {
    var c = num(f.amount);
    if (!(c > 0)) return 'Scrivi quanto chiedi: ti dico quanto mettere via.';
    var v = invoice(c);
    return 'Ti pagano <b class="num">' + fmt(v.incasso) + '</b>. Metti via <b class="num">' + fmtUp(v.via) + '</b>.';
  }
  function renderAdd() {
    var f = UI.form;
    var h = '<div class="top"><h1>' + (f.id ? 'Modifica' : f.tax ? 'Pagamento tasse' : 'Nuovo movimento') + '</h1><button type="button" class="iconbtn" data-a="back" aria-label="Chiudi">' + I.close + '</button></div>';
    if (!f.tax) {
      h += '<div class="two" role="group" aria-label="Tipo di movimento">' +
        '<button type="button" class="big-choice in" data-a="kind" data-v="in" aria-pressed="' + (f.kind === 'in') + '">Entrata</button>' +
        '<button type="button" class="big-choice out" data-a="kind" data-v="out" aria-pressed="' + (f.kind === 'out') + '">Spesa</button></div>';
    }
    if (f.kind === 'in') {
      h += '<div class="field"><span class="label">Che entrata?</span><div class="chips">' + IN_TYPES.map(function (x) {
        return '<button type="button" class="chip" data-a="intype" data-v="' + x + '" aria-pressed="' + (f.inType === x) + '">' + x + '</button>';
      }).join('') + '</div></div>';
    }
    var isInv = f.kind === 'in' && f.inType === 'Fattura';
    h += '<div class="field"><label class="label" for="f-amount">' + (isInv ? 'Quanto chiedi?' : 'Quanto?') + '</label><div class="money"><input id="f-amount" inputmode="decimal" autocomplete="off" placeholder="0" value="' + esc(f.amount) + '" data-f="amount"><span>€</span></div></div>';
    if (isInv) h += '<p class="hint" id="inv-hint">' + invoiceHint(f) + '</p>';
    h += '<div class="field"><label class="label" for="f-name">Cos\'è?</label><input id="f-name" class="input" autocomplete="off" placeholder="' + esc(f.kind === 'in' ? f.inType : f.tax ? 'Tasse' : 'Es. spesa al supermercato') + '" value="' + esc(f.name) + '" data-f="name"></div>';
    if (f.kind === 'out' && !f.tax) {
      h += '<div class="field"><span class="label">Categoria</span><div class="chips">' + S.cats.map(function (c) {
        return '<button type="button" class="chip" data-a="cat" data-v="' + esc(c) + '" aria-pressed="' + (f.cat === c) + '">' + esc(c) + '</button>';
      }).join('') + '</div></div>';
    }
    h += '<div class="field"><span class="label">Quando?</span>' + seg('Quando', [['once', 'Una volta'], ['monthly', 'Ogni mese'], ['future', 'In futuro']], f.when, 'when');
    var dl = f.when === 'monthly' ? 'Dal giorno' : 'Giorno';
    h += '<label class="sr" for="f-date">' + dl + '</label><div class="row"><span class="muted" style="min-width:84px">' + dl + '</span><input id="f-date" type="date" class="input grow" value="' + esc(f.date) + '" data-f="date"></div>';
    if (f.when !== 'once') {
      h += '<div class="switch"><label for="f-remind">Avvisami il giorno prima</label><input id="f-remind" type="checkbox" data-f="remind"' + (f.remind ? ' checked' : '') + '></div>';
    }
    h += '</div>';
    h += '<button type="button" class="btn" data-a="save">Salva</button>';
    if (f.id) {
      if (f.freq === 'monthly') h += '<button type="button" class="btn ghost" data-a="stop">Smetti da oggi</button>';
      if (UI.confirm) h += '<div class="stack"><p>Vuoi davvero eliminarlo' + (f.freq === 'monthly' ? ', anche nei mesi passati' : '') + '?</p><div class="two"><button type="button" class="btn danger small" data-a="del-yes">Sì, elimina</button><button type="button" class="btn ghost" data-a="del-no">No</button></div></div>';
      else h += '<button type="button" class="link" data-a="del">Elimina</button>';
    }
    return h;
  }
  function saveForm() {
    var f = UI.form;
    var a = num(f.amount);
    if (!(a > 0)) { toast('Scrivi quanto'); focus('f-amount'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) { toast('Scegli il giorno'); focus('f-date'); return; }
    if (f.when === 'future' && f.date <= today()) { toast('Per "In futuro" scegli un giorno dopo oggi'); focus('f-date'); return; }
    var it = f.id ? S.items.filter(function (x) { return x.id === f.id; })[0] : null;
    var isInv = f.kind === 'in' && f.inType === 'Fattura';
    var item = {
      id: f.id || uid(), kind: f.kind,
      name: (f.name || '').trim() || (f.kind === 'in' ? f.inType : f.tax ? 'Tasse' : f.cat),
      date: f.date, freq: f.when === 'monthly' ? 'monthly' : f.when === 'future' ? 'future' : 'once',
      remind: f.when !== 'once' && !!f.remind
    };
    if (f.kind === 'in') {
      item.inType = f.inType;
      if (isInv) { item.inv = invoice(a); item.amount = item.inv.incasso; } else item.amount = r2(a);
    } else {
      item.cat = f.tax ? TAX_CAT : f.cat; item.amount = r2(a);
      if (f.tax) item.tax = true;
    }
    if (it && it.end) item.end = it.end;
    if (it) S.items = S.items.map(function (x) { return x.id === it.id ? item : x; });
    else S.items.push(item);
    save();
    var dest = weekOf(item.date > today() && item.freq !== 'future' ? today() : item.date);
    if (item.freq !== 'once' && !it) {
      UI.saved = item;
      go({ screen: 'saved', form: null }, true);
    } else {
      toast('Salvato');
      goHomeAfter(dest);
    }
  }
  function goHomeAfter(w) {
    stack = [];
    var d = parse(w.from);
    UI.form = null;
    go({ screen: 'home', view: 'week', wFrom: w.from, y: d.getFullYear(), m: d.getMonth() }, true);
  }

  /* ---------- salvato con calendario ---------- */
  function calLink(item) {
    var d = parse(item.date), e = parse(addDays(item.date, 1));
    var fmtD = function (x) { return x.getFullYear() + pad(x.getMonth() + 1) + pad(x.getDate()); };
    var p = 'action=TEMPLATE&text=' + encodeURIComponent(item.name + ' ' + fmt(item.amount)) + '&dates=' + fmtD(d) + '/' + fmtD(e) + '&details=' + encodeURIComponent('Promemoria dall\'app Conti');
    if (item.freq === 'monthly') p += '&recur=' + encodeURIComponent('RRULE:FREQ=MONTHLY');
    return 'https://calendar.google.com/calendar/render?' + p;
  }
  function renderSaved() {
    var it = UI.saved;
    return '<h1>Salvato</h1><div class="card"><p style="font-size:18px"><b>' + esc(it.name) + '</b> · <span class="num">' + fmt(it.amount) + '</span></p><p class="muted">' + (it.freq === 'monthly' ? 'Ogni mese, il giorno ' + parse(it.date).getDate() : 'Il ' + shortDate(it.date)) + '</p></div>' +
      '<p>Vuoi il promemoria anche nel calendario del telefono? Così suona sempre, anche con l\'app chiusa.</p>' +
      '<a class="btn" style="display:flex;align-items:center;justify-content:center;text-decoration:none" href="' + esc(calLink(it)) + '" target="_blank" rel="noopener">Aggiungi al calendario</a>' +
      '<button type="button" class="btn ghost" data-a="saved-done">No, va bene così</button>';
  }

  /* ---------- scadenze ---------- */
  function renderAlerts() {
    var list = upcoming(60);
    var h = '<div class="top"><h1>Scadenze</h1><button type="button" class="iconbtn" data-a="back" aria-label="Chiudi">' + I.close + '</button></div>';
    if (!list.length) h += '<p class="empty">Nessuna scadenza nei prossimi due mesi.<br>Abbonamenti e spese future compaiono qui.</p>';
    else {
      h += '<div class="stack">';
      list.forEach(function (o) {
        h += '<button type="button" class="mov" data-a="edit" data-v="' + o.item.id + '"><span class="grow stack" style="gap:0"><span class="n">' + esc(o.item.name) + '</span><span class="muted" style="font-size:15px">' + esc(whenText(o.date)) + '</span></span><span class="a num ' + (o.item.kind === 'in' ? 'c-green' : 'c-red') + '">' + fmt(o.item.amount) + '</span></button>';
      });
      h += '</div>';
    }
    if ('Notification' in window && Notification.permission === 'default') {
      h += '<button type="button" class="btn ghost" data-a="notify">Avvisami anche con una notifica</button>';
    }
    h += '<p class="muted" style="font-size:15px">La notifica arriva quando apri l\'app. Per un promemoria sicuro, aggiungilo al calendario quando salvi.</p>';
    return h;
  }

  /* ---------- barattoli ---------- */
  function renderJars() {
    var y = parse(today()).getFullYear();
    var jar = taxJar(y), st = S.settings;
    var fixed = st.mat + st.comm + Math.max(0, st.minSogg - jar.pens);
    var mf = isoYMD(y, parse(today()).getMonth(), 1), mt = isoYMD(y, parse(today()).getMonth(), dim(y, parse(today()).getMonth()));
    var monthSaved = S.savings.filter(function (s) { return s.date >= mf && s.date <= mt; }).reduce(function (a, s) { return a + s.amount; }, 0);
    var h = '<h1>Barattoli</h1>';
    h += '<div class="card" style="background:var(--yellow-bg);border-color:var(--yellow);gap:6px"><span class="label">Tasse ' + esc(eCassa()) + '</span><span class="big num">' + fmtUp(jar.keep) + '</span><p>Da tenere da parte per le tasse di quest\'anno.</p>' +
      '<p class="muted" style="font-size:15px">In più, le spese fisse dell\'anno: <b class="num">' + fmtUp(fixed) + '</b>.</p>' +
      '<button type="button" class="btn ghost small" style="background:var(--card)" data-a="paytax">Ho pagato tasse o ' + esc(st.cassa) + '</button></div>';
    h += '<div class="card" style="background:var(--green-bg);border-color:var(--green);gap:8px"><span class="label">Risparmio</span><span class="big num" style="color:var(--green-ink)">' + fmt(savedTotal()) + '</span>';
    if (S.saveGoal > 0) {
      var miss = r2(S.saveGoal - monthSaved);
      h += '<p>' + (miss > 0 ? 'Questo mese mancano <b class="num">' + fmt(miss) + '</b> al tuo obiettivo.' : 'Obiettivo del mese raggiunto.') + '</p>';
    }
    h += '<div class="row"><label class="sr" for="sv-amt">Quanto</label><input id="sv-amt" class="input grow" inputmode="decimal" placeholder="Quanto?" style="background:var(--card)"><span style="font-weight:700">€</span></div>' +
      '<div class="two"><button type="button" class="btn small" data-a="sv-add">Metti</button><button type="button" class="btn ghost small" style="background:var(--card)" data-a="sv-take">Prendi</button></div>' +
      '<div class="row"><label for="sv-goal" class="grow" style="font-size:16px">Obiettivo al mese</label><input id="sv-goal" class="input" style="width:110px;background:var(--card);text-align:right" inputmode="decimal" value="' + (S.saveGoal ? fmtInput(S.saveGoal) : '') + '" placeholder="0" data-s="goal"><span style="font-weight:700">€</span></div></div>';
    // budget
    h += '<div class="stack"><h2>Budget di ' + MESI[parse(today()).getMonth()] + '</h2>';
    var spent = {};
    allOcc(mf, today()).forEach(function (o) { if (o.item.kind === 'out' && !o.item.tax) spent[o.item.cat] = (spent[o.item.cat] || 0) + o.item.amount; });
    if (UI.budgetEdit) {
      h += '<div class="set">' + S.cats.map(function (c, i) {
        return '<div class="r"><label for="bud-' + i + '">' + esc(c) + '</label><span class="unit"><input id="bud-' + i + '" inputmode="decimal" placeholder="—" value="' + (S.budgets[c] ? fmtInput(S.budgets[c]) : '') + '" data-bud="' + esc(c) + '"><b>€</b></span></div>';
      }).join('') + '</div><button type="button" class="btn small" data-a="bud-done">Fatto</button>';
    } else {
      var cats = S.cats.filter(function (c) { return S.budgets[c] > 0; });
      if (!cats.length) h += '<p class="empty">Nessun budget. Puoi darti un limite per categoria.</p>';
      else {
        h += '<div class="card bud" style="padding:4px 16px;gap:0">' + cats.map(function (c) {
          var left = r2(S.budgets[c] - (spent[c] || 0));
          return '<div class="r"><span class="label" style="font-size:17px">' + esc(c) + '</span><span style="color:' + (left >= 0 ? 'var(--green-ink)' : 'var(--red-ink)') + '">' + (left >= 0 ? 'ti restano' : 'sei sopra di') + ' <b class="num">' + fmt(Math.abs(left)) + '</b></span></div>';
        }).join('') + '</div>';
      }
      h += '<button type="button" class="btn ghost" data-a="bud-edit">' + (cats.length ? 'Modifica budget' : 'Imposta un budget') + '</button>';
    }
    return h + '</div>';
  }

  /* ---------- impostazioni ---------- */
  function setRow(id, label, key, unit) {
    return '<div class="r"><label for="' + id + '">' + label + '</label><span class="unit"><input id="' + id + '" inputmode="decimal" value="' + fmtInput(S.settings[key]) + '" data-set="' + key + '"><b>' + unit + '</b></span></div>';
  }
  function renderSettings() {
    var st = S.settings, forf = st.regime === 'forfettario';
    var h = '<h1>Impostazioni</h1>';
    h += '<div class="set"><div class="r"><label for="s-name">Il tuo nome</label><input id="s-name" class="txt" value="' + esc(S.name) + '" data-name="1" autocomplete="off"></div></div>';
    h += '<div class="field"><span class="label">Regime fiscale</span>' + seg('Regime fiscale', [['forfettario', 'Forfettario'], ['ordinario', 'Ordinario']], st.regime, 'regime') + '</div>';
    h += '<div class="field"><span class="label">Tasse</span><div class="set">' +
      (forf ? setRow('s-al', 'Aliquota', 'aliquota', '%') + setRow('s-co', 'Imponibile (coefficiente)', 'coeff', '%')
            : setRow('s-ao', 'Aliquota IRPEF stimata', 'aliquotaOrd', '%')) +
      '<div class="r check"><label for="s-bo">Bollo 2 € sopra 77,47 €</label><input id="s-bo" type="checkbox" data-set-check="bollo"' + (st.bollo ? ' checked' : '') + '></div>' +
      '</div></div>';
    h += '<div class="field"><span class="label">Cassa previdenziale</span><div class="set">' +
      '<div class="r"><label for="s-ca">Cassa</label><input id="s-ca" class="txt" value="' + esc(st.cassa) + '" data-set-text="cassa" autocomplete="off"></div>' +
      setRow('s-so', 'Pensione (soggettivo)', 'sogg', '%') + setRow('s-in', 'In più in fattura (integrativo)', 'integr', '%') +
      setRow('s-mi', 'Pensione minima all\'anno', 'minSogg', '€') + setRow('s-ma', 'Maternità all\'anno', 'mat', '€') + '</div></div>';
    h += '<div class="set">' + setRow('s-cm', 'Commercialista all\'anno', 'comm', '€') + '</div>';
    h += '<button type="button" class="btn ghost" data-a="reset-set">Ripristina valori psicologa</button>';
    h += '<div class="field"><span class="label">Categorie di spesa</span><div class="chips">' + S.cats.map(function (c) {
      return '<button type="button" class="chip" data-a="cat-del" data-v="' + esc(c) + '" aria-label="Togli ' + esc(c) + '">' + esc(c) + ' ✕</button>';
    }).join('') + '</div><div class="row"><label class="sr" for="s-newcat">Nuova categoria</label><input id="s-newcat" class="input grow" placeholder="Nuova categoria" autocomplete="off"><button type="button" class="btn small" style="width:auto;padding:0 18px" data-a="cat-add">Aggiungi</button></div></div>';
    h += '<div class="field"><span class="label">Copia dei dati</span><p class="muted" style="font-size:15px">I dati sono solo su questo telefono. Salva una copia ogni tanto.</p>' +
      '<div class="two"><button type="button" class="btn small" data-a="export">Salva copia</button><button type="button" class="btn ghost small" data-a="import">Carica copia</button></div>' +
      '<input id="imp-file" type="file" accept="application/json,.json" hidden></div>';
    if (UI.confirm) h += '<div class="stack"><p>Cancello tutti i movimenti e le impostazioni da questo telefono?</p><div class="two"><button type="button" class="btn danger small" data-a="wipe-yes">Sì, cancella</button><button type="button" class="btn ghost" data-a="del-no">No</button></div></div>';
    else h += '<button type="button" class="link" data-a="wipe">Cancella tutti i dati</button>';
    return h;
  }

  /* ---------- menu e render ---------- */
  function renderNav() {
    var cur = UI.screen === 'home' ? (UI.view === 'week' ? 'mov' : 'home') : UI.screen;
    var b = function (id, label, icon) { return '<button type="button" data-a="nav" data-v="' + id + '"' + (cur === id ? ' aria-current="page"' : '') + '>' + icon + label + '</button>'; };
    document.getElementById('nav').innerHTML = '<div class="in">' + b('home', 'Casa', I.home) + b('mov', 'Movimenti', I.list) +
      '<button type="button" class="plus" data-a="add" aria-label="Aggiungi">' + I.plus + '</button>' + b('jars', 'Barattoli', I.jar) + b('settings', 'Impostazioni', I.gear) + '</div>';
  }
  function render() {
    var app = document.getElementById('app'), h;
    if (UI.screen === 'add') h = renderAdd();
    else if (UI.screen === 'saved') h = renderSaved();
    else if (UI.screen === 'alerts') h = renderAlerts();
    else if (UI.screen === 'jars') h = renderJars();
    else if (UI.screen === 'settings') h = renderSettings();
    else h = renderHome();
    app.innerHTML = h;
    renderNav();
  }
  function focus(id) { var el = document.getElementById(id); if (el) el.focus(); }
  var toastT;
  function toast(msg) {
    var el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 2200);
  }

  /* ---------- azioni ---------- */
  function step(dir) {
    if (UI.view === 'year') { UI.y += dir; }
    else if (UI.view === 'month') { UI.m += dir; if (UI.m < 0) { UI.m = 11; UI.y--; } if (UI.m > 11) { UI.m = 0; UI.y++; } }
    else {
      var w = weekOf(UI.wFrom);
      var d = dir < 0 ? addDays(w.from, -1) : addDays(w.to, 1);
      var nw = weekOf(d); UI.wFrom = nw.from; UI.y = parse(nw.from).getFullYear(); UI.m = parse(nw.from).getMonth();
    }
    render();
  }
  function savingMove(sign) {
    var el = document.getElementById('sv-amt'), a = num(el && el.value);
    if (!(a > 0)) { toast('Scrivi quanto'); focus('sv-amt'); return; }
    if (sign < 0 && a > savedTotal() + 0.001) { toast('Nel risparmio ci sono ' + fmt(savedTotal())); return; }
    S.savings.push({ id: uid(), date: today(), amount: r2(sign * a) });
    save(); toast(sign > 0 ? 'Messo nel risparmio' : 'Preso dal risparmio'); render();
  }
  function exportData() {
    try {
      var blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'conti-copia-' + today() + '.json';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('Copia salvata nei download');
    } catch (e) { toast('Non riesco a salvare la copia'); }
  }
  function importData(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var data = JSON.parse(r.result);
        if (!data || !Array.isArray(data.items)) throw new Error('formato');
        S = normalize(data); save(); toast('Copia caricata'); render();
      } catch (e) { toast('Questo file non è una copia di Conti'); }
    };
    r.readAsText(file);
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-a]');
    if (!el) return;
    var a = el.getAttribute('data-a'), v = el.getAttribute('data-v');
    switch (a) {
      case 'nav':
        if (v === 'home') { var ty = parse(today()); go({ screen: 'home', view: 'year', y: ty.getFullYear(), m: ty.getMonth() }); }
        else if (v === 'mov') { var w = weekOf(today()); go({ screen: 'home', view: 'week', wFrom: w.from, y: parse(w.from).getFullYear(), m: parse(w.from).getMonth() }); }
        else { UI.budgetEdit = false; go({ screen: v }); }
        break;
      case 'view':
        if (v === 'week') { var cw = today() >= isoYMD(UI.y, UI.m, 1) && today() <= isoYMD(UI.y, UI.m, dim(UI.y, UI.m)) ? weekOf(today()) : weeksOf(UI.y, UI.m)[0]; UI.wFrom = cw.from; }
        if (v === 'month' && UI.view === 'year') { var t0 = parse(today()); UI.m = UI.y === t0.getFullYear() ? t0.getMonth() : 0; }
        UI.view = v; render(); break;
      case 'prev': step(-1); break;
      case 'next': step(1); break;
      case 'month': go({ view: 'month', m: +v }); break;
      case 'week': go({ view: 'week', wFrom: v }); break;
      case 'alerts': go({ screen: 'alerts' }); break;
      case 'add': UI.form = newForm(); go({ screen: 'add' }); break;
      case 'paytax': UI.form = newForm({ tax: true, kind: 'out', name: '' }); go({ screen: 'add' }); break;
      case 'edit':
        var it = S.items.filter(function (x) { return x.id === v; })[0];
        if (it) { UI.form = formFromItem(it); go({ screen: 'add' }); }
        break;
      case 'back': history.back(); break;
      case 'kind': UI.form.kind = v; render(); break;
      case 'intype': UI.form.inType = v; render(); focus('f-amount'); break;
      case 'cat': UI.form.cat = v; render(); break;
      case 'when':
        UI.form.when = v;
        if (v === 'future' && UI.form.date <= today()) UI.form.date = addDays(today(), 1);
        if (v === 'once' && UI.form.date > today() && !UI.form.id) UI.form.date = today();
        render(); break;
      case 'save': saveForm(); break;
      case 'del': UI.confirm = true; render(); break;
      case 'del-no': UI.confirm = false; render(); break;
      case 'del-yes':
        S.items = S.items.filter(function (x) { return x.id !== UI.form.id; }); save(); toast('Eliminato');
        goHomeAfter(weekOf(UI.form.date > today() ? today() : UI.form.date)); break;
      case 'stop':
        S.items.forEach(function (x) { if (x.id === UI.form.id) x.end = today(); }); save(); toast('Fermato da oggi');
        goHomeAfter(weekOf(today())); break;
      case 'saved-done': UI.saved = null; goHomeAfter(weekOf(today())); break;
      case 'notify':
        try { Notification.requestPermission().then(function () { render(); checkNotify(); }); } catch (err) {}
        break;
      case 'sv-add': savingMove(1); break;
      case 'sv-take': savingMove(-1); break;
      case 'bud-edit': UI.budgetEdit = true; render(); break;
      case 'bud-done': UI.budgetEdit = false; render(); break;
      case 'regime': S.settings.regime = v; save(); render(); break;
      case 'reset-set':
        S.settings = copy(DEFAULT_SETTINGS); save(); toast('Valori ripristinati'); render(); break;
      case 'cat-del':
        if (S.cats.length <= 1) { toast('Serve almeno una categoria'); break; }
        S.cats = S.cats.filter(function (c) { return c !== v; }); save(); render(); break;
      case 'cat-add':
        var nc = (document.getElementById('s-newcat').value || '').trim();
        if (!nc) { toast('Scrivi il nome'); focus('s-newcat'); break; }
        if (S.cats.indexOf(nc) < 0) S.cats.push(nc);
        save(); render(); break;
      case 'export': exportData(); break;
      case 'import': document.getElementById('imp-file').click(); break;
      case 'wipe': UI.confirm = true; render(); break;
      case 'wipe-yes': S = fresh(); save(); UI.confirm = false; toast('Dati cancellati'); render(); break;
    }
  });

  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.hasAttribute('data-f') && UI.form) {
      var k = el.getAttribute('data-f');
      UI.form[k] = el.type === 'checkbox' ? el.checked : el.value;
      if (k === 'amount') { var hint = document.getElementById('inv-hint'); if (hint) hint.innerHTML = invoiceHint(UI.form); }
    } else if (el.hasAttribute('data-set')) {
      S.settings[el.getAttribute('data-set')] = numPlain(el.value); save();
    } else if (el.hasAttribute('data-set-text')) {
      S.settings[el.getAttribute('data-set-text')] = el.value.trim() || 'Cassa'; save();
    } else if (el.hasAttribute('data-name')) {
      S.name = el.value.trim(); save();
    } else if (el.hasAttribute('data-bud')) {
      var c = el.getAttribute('data-bud'), n = num(el.value);
      if (n > 0) S.budgets[c] = r2(n); else delete S.budgets[c];
      save();
    } else if (el.getAttribute('data-s') === 'goal') {
      S.saveGoal = r2(num(el.value)); save();
    }
  });
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.hasAttribute('data-set-check')) { S.settings[el.getAttribute('data-set-check')] = el.checked; save(); }
    if (el.id === 'f-remind' && UI.form) UI.form.remind = el.checked;
    if (el.id === 'imp-file' && el.files && el.files[0]) importData(el.files[0]);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.id === 'f-amount') { e.preventDefault(); focus('f-name'); }
    if (e.key === 'Enter' && e.target.id === 's-newcat') { e.preventDefault(); var b = document.querySelector('[data-a="cat-add"]'); if (b) b.click(); }
  });

  /* ---------- notifiche all'apertura ---------- */
  function checkNotify() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    var changed = false;
    dueSoon().forEach(function (o) {
      var key = o.item.id + '@' + o.date;
      if (S.notified[key]) return;
      S.notified[key] = 1; changed = true;
      var body = (o.date === today() ? 'Oggi' : 'Domani') + ': ' + o.item.name + ' ' + fmt(o.item.amount);
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(function (reg) { reg.showNotification('Conti', { body: body, icon: 'icons/icon-192.png', tag: key }); });
        else new Notification('Conti', { body: body });
      } catch (e) {}
    });
    if (changed) save();
  }

  /* ---------- avvio ---------- */
  try { history.replaceState({ n: 0 }, ''); } catch (e) {}
  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  checkNotify();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { checkNotify(); if (UI.screen === 'home') render(); } });

  window.__conti = { state: function () { return S; }, invoice: invoice, weeksOf: weeksOf, totals: totals };
})();

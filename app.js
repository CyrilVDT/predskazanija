(function () {
  const T = window.TEXTS, A = window.Astro, F = window.Forecast;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = s => s[0].toUpperCase() + s.slice(1);

  // ---------- Поиск городов ----------
  const cache = new Map();
  async function geocode(q) {
    const key = q.toLowerCase();
    if (cache.has(key)) return cache.get(key);
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=7&language=ru&format=json`);
    if (!r.ok) throw new Error('geo');
    const j = await r.json();
    const res = (j.results || []).filter(p => p.timezone).map(p => ({
      name: p.name, region: [p.admin1, p.country].filter(Boolean).join(', '), lat: p.latitude, lon: p.longitude, tz: p.timezone,
    }));
    cache.set(key, res);
    return res;
  }
  const placeLabel = p => p.region ? `${p.name}, ${p.region}` : p.name;

  function setupCity(input, list) {
    let timer, results = [], active = -1;
    const hide = () => { list.innerHTML = ''; active = -1; };
    const choose = p => { input.value = placeLabel(p); input._place = p; input.classList.add('ok'); hide(); };
    const render = () => {
      list.innerHTML = results.length
        ? results.map((p, i) => `<li role="option" data-i="${i}" class="${i === active ? 'active' : ''}"><b>${esc(p.name)}</b><span>${esc(p.region)}</span></li>`).join('')
        : '<li class="note">Ничего не нашлось — попробуйте иначе</li>';
    };
    input.addEventListener('input', () => {
      input._place = null; input.classList.remove('ok');
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) return hide();
      timer = setTimeout(async () => {
        try {
          const r = await geocode(q);
          if (input.value.trim() !== q) return;
          results = r; active = -1; render();
        } catch { list.innerHTML = '<li class="note">Нет связи с сервисом поиска городов</li>'; }
      }, 250);
    });
    input.addEventListener('keydown', e => {
      if (!list.children.length || !results.length) return;
      if (e.key === 'ArrowDown') { active = (active + 1) % results.length; render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = (active - 1 + results.length) % results.length; render(); e.preventDefault(); }
      else if (e.key === 'Enter') { choose(results[Math.max(active, 0)]); e.preventDefault(); }
      else if (e.key === 'Escape') hide();
    });
    list.addEventListener('mousedown', e => {
      const li = e.target.closest('li[data-i]');
      if (li) { e.preventDefault(); choose(results[+li.dataset.i]); }
    });
    input.addEventListener('blur', () => setTimeout(hide, 150));
    input.setPlace = choose;
  }
  async function resolvePlace(input) {
    if (input._place) return input._place;
    const q = input.value.trim();
    if (!q) return null;
    const r = await geocode(q.split(',')[0]);
    if (!r.length) return null;
    input.setPlace(r[0]);
    return r[0];
  }

  // ---------- Форма ----------
  const form = $('form'), birthCity = $('birthCity'), relocCity = $('relocCity');
  setupCity(birthCity, $('birthList'));
  setupCity(relocCity, $('relocList'));
  $('noTime').addEventListener('change', e => { $('time').disabled = e.target.checked; });
  $('sameCity').addEventListener('change', e => { $('relocWrap').hidden = e.target.checked; });

  const now = new Date();
  let selectedYear;
  const birthYear = () => $('date').value ? +$('date').value.slice(0, 4) : now.getFullYear() - 30;
  function defaultYear() {
    const v = $('date').value;
    if (!v) return now.getFullYear();
    const [, m, d] = v.split('-').map(Number);
    const bd = new Date(now.getFullYear(), m - 1, d);
    return bd < new Date(now.getFullYear(), now.getMonth(), now.getDate()) ? now.getFullYear() + 1 : now.getFullYear();
  }
  function renderYears(keep) {
    if (!keep) selectedYear = defaultYear();
    const near = defaultYear(), quick = [near - 1, near, near + 1];
    const by = birthYear(), all = [];
    for (let y = by; y <= by + 100; y++) all.push(y);
    $('years').innerHTML = quick.map(y =>
      `<button type="button" role="radio" aria-checked="${y === selectedYear}" data-y="${y}">${y}${y === near ? ' · ближайший' : ''}</button>`).join('') +
      `<select id="yearSel" aria-label="Другой год" class="${quick.includes(selectedYear) ? '' : 'on'}">
        <option value="">Другой год…</option>
        ${all.map(y => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y} · ${y - by} лет</option>`).join('')}
      </select>`;
  }
  $('years').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    selectedYear = +b.dataset.y; renderYears(true);
  });
  $('years').addEventListener('change', e => {
    if (e.target.id === 'yearSel' && e.target.value) { selectedYear = +e.target.value; renderYears(true); }
  });
  $('date').addEventListener('change', () => renderYears(false));
  renderYears(false);

  const showError = msg => { const el = $('error'); el.textContent = msg; el.hidden = !msg; };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    showError('');
    const date = $('date').value;
    if (!date) return showError('Укажите дату рождения');
    const btn = $('submit');
    btn.disabled = true; btn.textContent = 'Считаем звёзды…';
    try {
      const birth = await resolvePlace(birthCity);
      if (!birth) return showError('Не нашли город рождения — выберите его из списка');
      let reloc = birth;
      if (!$('sameCity').checked) {
        reloc = await resolvePlace(relocCity);
        if (!reloc) return showError('Не нашли город, где вы встретите день рождения');
      }
      run({
        name: $('name').value.trim(), date,
        time: $('noTime').checked ? '' : ($('time').value || '12:00'),
        birth, reloc, same: $('sameCity').checked, year: selectedYear,
      }, true);
    } catch (err) {
      console.error(err);
      showError(err.message === 'geo' || err instanceof TypeError && /fetch/i.test(err.message)
        ? 'Не получилось связаться с сервисом поиска городов. Проверьте интернет и попробуйте ещё раз.'
        : 'Что-то пошло не так при расчёте. Попробуйте обновить страницу.');
    } finally {
      btn.disabled = false; btn.textContent = 'Узнать свой год ✨';
    }
  });

  // ---------- Ссылка с данными ----------
  const packPlace = p => JSON.stringify([p.name, p.region, p.lat, p.lon, p.tz]);
  const unpackPlace = s => { const [name, region, lat, lon, tz] = JSON.parse(s); return { name, region, lat, lon, tz }; };
  function saveHash(d) {
    const p = new URLSearchParams({ n: d.name, d: d.date, t: d.time, y: d.year, b: packPlace(d.birth), tab: activeTab });
    if (!d.same) p.set('r', packPlace(d.reloc));
    history.replaceState(null, '', '#' + p.toString());
  }
  function loadHash() {
    if (location.hash.length < 3) return;
    try {
      const p = new URLSearchParams(location.hash.slice(1));
      $('name').value = p.get('n') || '';
      $('date').value = p.get('d') || '';
      const t = p.get('t');
      if (t) $('time').value = t; else { $('noTime').checked = true; $('time').disabled = true; }
      if (p.get('b')) birthCity.setPlace(unpackPlace(p.get('b')));
      if (p.get('r')) { $('sameCity').checked = false; $('relocWrap').hidden = false; relocCity.setPlace(unpackPlace(p.get('r'))); }
      if (TABS.some(([id]) => id === p.get('tab'))) activeTab = p.get('tab');
      selectedYear = +p.get('y') || defaultYear(); renderYears(true);
      if ($('date').value && birthCity._place) form.requestSubmit();
    } catch (e) { console.warn(e); }
  }

  // ---------- Общие помощники ----------
  const signOf = lon => Math.floor(A.norm(lon) / 30);
  const fmtDeg = lon => { const x = A.norm(lon) % 30; const d = Math.floor(x); return `${d}°${String(Math.floor((x - d) * 60)).padStart(2, '0')}′`; };
  const pos = lon => `${T.signGlyphs[signOf(lon)]} ${fmtDeg(lon)}`;
  const BENEFIC = ['venus', 'jupiter'], MALEFIC = ['mars', 'saturn', 'pluto', 'uranus'];
  const PERSONAL = ['sun', 'moon', 'mercury', 'venus', 'mars'];
  const pName = k => (T.planets[k] || T.pointNames[k]).name;
  const pGlyph = k => (T.planets[k] || T.pointNames[k]).glyph;
  function fmtDate(ms, tz, opts = {}) {
    return new Intl.DateTimeFormat('ru-RU', { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric', ...opts }).format(new Date(ms));
  }
  const ymdIn = (ms, tz) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    return { y: +p.year, m: +p.month, d: +p.day };
  };

  function aspectKind(x) {
    if (x.asp.key === 'tri' || x.asp.key === 'sext') return 'harm';
    if (x.asp.key === 'sq' || x.asp.key === 'opp') return 'tense';
    return 'conj';
  }
  function toneScore(aspects) {
    let s = 0;
    for (const x of aspects) {
      const keys = [x.a.key, x.b.key];
      const w = keys.some(k => k === 'sun' || k === 'moon') ? 1.5 : 1;
      const k = aspectKind(x);
      if (k === 'harm') s += w;
      else if (k === 'tense') s -= w;
      else if (keys.some(k => BENEFIC.includes(k))) s += w;
      else if (keys.some(k => MALEFIC.includes(k))) s -= w * 0.5;
    }
    return Math.max(6, Math.min(94, 50 + s * 5));
  }
  function aspectText(x) {
    const a = T.planets[x.a.key], b = T.planets[x.b.key], k = aspectKind(x);
    if (k === 'harm') return `${cap(a.kw)} и ${b.kw} поддерживают друг друга — здесь всё будет получаться легче.`;
    if (k === 'tense') return `${cap(a.kw)} и ${b.kw} тянут в разные стороны — источник напряжения, но и роста.`;
    const keys = [x.a.key, x.b.key];
    if (keys.some(k => BENEFIC.includes(k))) return `${cap(a.kw)} и ${b.kw} сливаются — приятная и заметная тема года.`;
    if (keys.some(k => MALEFIC.includes(k))) return `${cap(a.kw)} и ${b.kw} сливаются — мощно, но потребует контроля.`;
    return `${cap(a.kw)} и ${b.kw} сливаются — эта связка будет очень заметна.`;
  }
  const RULER = { sun: [4], moon: [3], mercury: [2, 5], venus: [1, 6], mars: [0, 7], jupiter: [8, 11], saturn: [9, 10], uranus: [10], neptune: [11], pluto: [7] };
  const EXALT = { sun: 0, moon: 1, mercury: 5, venus: 11, mars: 9, jupiter: 3, saturn: 6 };
  function dignity(key, sign) {
    if (RULER[key]?.includes(sign)) return ['обитель', 'good'];
    if (EXALT[key] === sign) return ['экзальтация', 'good'];
    if (RULER[key]?.some(s => (s + 6) % 12 === sign)) return ['изгнание', 'bad'];
    if (EXALT[key] !== undefined && (EXALT[key] + 6) % 12 === sign) return ['падение', 'bad'];
    return ['—', ''];
  }
  const toneLabel = t => t >= 62 ? 'Скорее лёгкий' : t >= 40 ? 'Сбалансированный' : 'Напряжённый';
  const miniBar = t => `<span class="mini" title="${toneLabel(t)}"><span style="width:${t}%"></span></span>`;

  // ---------- Расчёт ----------
  function birthMoment(d) {
    const [y, m, day] = d.date.split('-').map(Number);
    const [hh, mm] = (d.time || '12:00').split(':').map(Number);
    return A.jdFromMs(A.localToUtc(y, m, day, hh, mm, d.birth.tz));
  }
  function compute(d) {
    const timeKnown = !!d.time;
    const natalJd = birthMoment(d);
    const natal = A.chart(natalJd, d.birth.lat, d.birth.lon);
    // Без времени рождения — «солнечные дома»: 1‑й дом = знак Солнца
    const natalCusps = timeKnown ? natal.cusps : Array.from({ length: 12 }, (_, i) => (signOf(natal.planets[0].lon) + i) * 30 % 360);
    const srJd = A.solarReturn(natalJd, d.year);
    const chart = A.chart(srJd, d.reloc.lat, d.reloc.lon);
    const aspects = A.aspects(chart.planets);
    const P = Object.fromEntries(chart.planets.map(p => [p.key, p]));
    return { timeKnown, natalJd, natal, natalCusps, srJd, chart, aspects, P, srMs: A.msFromJd(srJd) };
  }

  // ---------- Состояние и вкладки ----------
  const TABS = [['year', '☀️ Год'], ['calendar', '📆 Календарь'], ['months', '📅 По месяцам'], ['chart', '🔭 Карта соляра'], ['years', '🗓️ Лента лет'], ['life', '🌌 Вся жизнь']];
  let activeTab = 'year', state = null;

  function run(data, scroll) {
    state = { d: data, r: compute(data), cache: {} };
    saveHash(data);
    renderShell();
    if (scroll) $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderShell() {
    const { d, r } = state;
    const n = r.natal.planets;
    const hello = d.name ? esc(d.name) : 'Ваш прогноз';
    $('result').innerHTML = `
      <div class="who">
        <div><b>${hello}</b> · ☉ ${T.signsIn[signOf(n[0].lon)]} · ☽ ${T.signsIn[signOf(n[1].lon)]}${r.timeKnown ? ` · AC ${T.signsIn[signOf(r.natal.asc)]}` : ''}</div>
        <div class="who-sub">${esc(d.birth.name)}, ${d.date.split('-').reverse().join('.')}${d.time ? ' ' + d.time : ''}</div>
      </div>
      <nav class="tabs" role="tablist">${TABS.map(([id, label]) => `<button role="tab" data-tab="${id}" aria-selected="${id === activeTab}">${label}</button>`).join('')}</nav>
      <div id="panel"></div>
      <div class="actions">
        <button class="btn ghost" data-act="share">🔗 Скопировать ссылку</button>
        <button class="btn ghost" data-act="again">✏️ Изменить данные</button>
      </div>`;
    $('result').hidden = false;
    renderPanel();
  }

  function renderPanel() {
    const fn = { year: panelYear, calendar: panelCalendar, months: panelMonths, chart: panelChart, years: panelYears, life: panelLife }[activeTab];
    if (activeTab === 'calendar') $('panel').innerHTML = fn();
    else {
      if (!state.cache[activeTab]) state.cache[activeTab] = fn();
      $('panel').innerHTML = state.cache[activeTab];
    }
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === activeTab));
  }

  $('result').addEventListener('click', async e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { activeTab = tab.dataset.tab; saveHash(state.d); renderPanel(); return; }
    const yr = e.target.closest('[data-year]');
    if (yr) {
      selectedYear = +yr.dataset.year; renderYears(true);
      activeTab = yr.dataset.goto || activeTab;
      run({ ...state.d, year: selectedYear }, false);
      document.querySelector('.tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const calNav = e.target.closest('[data-cal]');
    if (calNav) {
      const c = state.cal, m0 = c.m - 1 + (calNav.dataset.cal === 'next' ? 1 : calNav.dataset.cal === 'prev' ? -1 : 0);
      if (calNav.dataset.cal === 'today') { const t = ymdIn(Date.now(), state.d.reloc.tz); state.cal = { y: t.y, m: t.m, d: t.d }; }
      else state.cal = { y: c.y + Math.floor(m0 / 12), m: ((m0 % 12) + 12) % 12 + 1, d: 1 };
      renderPanel(); return;
    }
    const dayBtn = e.target.closest('[data-day]');
    if (dayBtn) {
      state.cal.d = +dayBtn.dataset.day; renderPanel();
      $('dayDetail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    if (e.target.closest('[data-act="more-years"]')) { state.allYears = true; state.cache.years = null; renderPanel(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'share') {
      try { await navigator.clipboard.writeText(location.href); toast('Ссылка скопирована'); }
      catch { prompt('Скопируйте ссылку:', location.href); }
    } else if (act === 'again') form.scrollIntoView({ behavior: 'smooth' });
    else if (act === 'rays') e.target.closest('.sky-card').classList.toggle('rays', e.target.checked);
  });

  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
  }

  const yearNav = y => `<div class="ynav">
      <button class="chipbtn" data-year="${y - 1}">← ${y - 1}</button>
      <span>Соляр ${y}</span>
      <button class="chipbtn" data-year="${y + 1}">${y + 1} →</button></div>`;
  const noTimeNote = `<div class="card note">⚠️ Без точного времени рождения момент соляра может сместиться на несколько часов, поэтому дома (сферы жизни) приблизительные. Узнаете время — пересчитайте.</div>`;

  // ---------- Вкладка «Год» ----------
  function panelYear() {
    const { d, r } = state, { chart, aspects, P } = r;
    const ascSign = signOf(chart.asc);
    const h = k => P[k].house - 1;
    const tone = toneScore(aspects);
    const verdict = tone >= 62 ? 'Скорее лёгкий и поддерживающий год' : tone >= 40 ? 'Сбалансированный год: и подарки, и задачи' : 'Насыщенный год, который потребует усилий — и даст рост';
    const keyAspects = aspects.filter(x => [x.a.key, x.b.key].some(k => PERSONAL.includes(k)))
      .filter(x => !(x.a.key === 'sun' && ['mercury', 'venus'].includes(x.b.key) && x.asp.key === 'conj')).slice(0, 6);
    const nextBd = fmtDate(r.srMs + 365.2422 * 864e5, d.reloc.tz);
    const cards = [
      ['🌅', 'Настроение года', `Асцендент ${T.signsIn[ascSign]}`, T.asc[ascSign] + (r.timeKnown
        ? ` Асцендент соляра попадает в ваш ${A.houseOf(chart.asc, r.natalCusps)}-й натальный дом — сфера «${T.topics[A.houseOf(chart.asc, r.natalCusps) - 1]}» будет волновать вас весь год.` : '')],
      ['🌙', 'Чувства и самочувствие', `Луна в ${P.moon.house}-м доме, ${T.signsIn[signOf(P.moon.lon)]}`, T.moon[h('moon')]],
      ['💗', 'Любовь и удовольствия', `Венера в ${P.venus.house}-м доме`, T.venus[h('venus')]],
      ['🔥', 'Куда пойдёт энергия', `Марс в ${P.mars.house}-м доме`, T.mars[h('mars')]],
      ['🍀', 'Где повезёт', `Юпитер в ${P.jupiter.house}-м доме`, T.jupiter[h('jupiter')]],
      ['⛰️', 'Где придётся потрудиться', `Сатурн в ${P.saturn.house}-м доме`, T.saturn[h('saturn')]],
    ];
    return `
      ${yearNav(d.year)}
      <div class="card summary">
        <div class="period">${fmtDate(r.srMs, d.reloc.tz)} — ${nextBd}</div>
        <h2>${T.ascAdj[ascSign]} год.<br>В центре — ${T.topics[h('sun')]}.</h2>
        <p>${T.sun[h('sun')]}</p>
        <div class="period" style="margin-top:10px">☀️ Солнце соляра в ${P.sun.house}-м доме · место: ${esc(d.reloc.name)}</div>
        <div class="chips">
          <span class="chip">Удача: <b>${T.topics[h('jupiter')]}</b></span>
          <span class="chip">Любовь: <b>${T.topics[h('venus')]}</b></span>
          <span class="chip">Испытание: <b>${T.topics[h('saturn')]}</b></span>
        </div>
        <div class="tone">
          <div class="label"><span>Непростой</span><span>Лёгкий</span></div>
          <div class="bar"><div class="dot" style="left:${tone}%"></div></div>
          <div class="verdict">${verdict}</div>
        </div>
      </div>
      ${r.timeKnown ? '' : noTimeNote}
      <div class="grid">
        ${cards.map(([ic, title, tag, text]) => `<div class="card item"><div class="ic">${ic}</div><h3>${title}</h3><div class="tag">${tag}</div><p>${text}</p></div>`).join('')}
      </div>
      <div class="card item">
        <div class="ic">🧭</div><h3>Совет на год</h3>
        <div class="advice">
          <div><span>✅</span><span>Делайте ставку на сферу «${T.topics[h('jupiter')]}» — там двери открываются легче.</span></div>
          <div><span>🎯</span><span>Главный фокус — «${T.topics[h('sun')]}».</span></div>
          <div><span>⏳</span><span>Не торопитесь в сфере «${T.topics[h('saturn')]}» — там всё решает терпение.</span></div>
        </div>
      </div>
      ${keyAspects.length ? `
      <div class="card item">
        <h3 style="margin-top:0">Ключевые связки года</h3>
        <div class="tag">Как планеты «договариваются» между собой</div>
        <ul class="aspects">
          ${keyAspects.map(x => `<li class="${aspectKind(x)}"><span class="sym">${x.asp.sym}</span><span>${aspectText(x)}<small>${pName(x.a.key)} — ${x.asp.name} — ${pName(x.b.key)}</small></span></li>`).join('')}
        </ul>
      </div>` : ''}
      <p class="hint center">Хотите подробности по месяцам? Откройте вкладку «По месяцам».</p>`;
  }

  // ---------- Вкладка «Календарь» ----------
  function monthDays(y, m) {
    const { d, r } = state, tz = d.reloc.tz;
    const key = `${y}-${m}`;
    state.days = state.days || {};
    if (state.days[key]) return state.days[key];
    const pts = F.natalPoints(r.natal, r.timeKnown);
    const nDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const start = A.jdFromMs(A.localToUtc(y, m, 1, 0, 0, tz)), end = A.jdFromMs(A.localToUtc(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1, 0, 0, tz));
    const exact = F.transitEvents(start, end, pts);
    const days = [];
    for (let dd = 1; dd <= nDays; dd++) {
      const d0 = A.jdFromMs(A.localToUtc(y, m, dd, 0, 0, tz)), d1 = dd < nDays ? A.jdFromMs(A.localToUtc(y, m, dd + 1, 0, 0, tz)) : end;
      const info = F.dayInfo((d0 + d1) / 2, pts);
      // фаза Луны: пересечение 0/90/180/270° между началом и концом дня
      const el = jd => A.norm(A.moonLon(A.ttFromUt(jd)) - A.sunLon(A.ttFromUt(jd)));
      const e0 = el(d0), e1 = el(d1);
      let phase = null;
      [0, 90, 180, 270].forEach((q, i) => { if (A.norm(q - e0) < A.norm(e1 - e0)) phase = i; });
      const ex = exact.filter(e => e.jd >= d0 && e.jd < d1);
      const s = info.score;
      days.push({ dd, info, phase, exact: ex, cls: s >= 1.6 ? 'good' : s <= -1.6 ? 'bad' : 'mid',
        moonSign: signOf(info.lon.moon), moonHouse: A.houseOf(info.lon.moon, r.natalCusps) });
    }
    return (state.days[key] = days);
  }

  const vash = k => ['moon', 'venus'].includes(k) ? 'ваша' : k === 'sun' ? 'ваше' : 'ваш';
  function panelCalendar() {
    const { d, r } = state, tz = d.reloc.tz;
    if (!state.cal) { const t = ymdIn(Date.now(), tz); state.cal = { y: t.y, m: t.m, d: t.d }; }
    const { y, m } = state.cal;
    const days = monthDays(y, m);
    const sel = days[Math.min(state.cal.d, days.length) - 1];
    const today = ymdIn(Date.now(), tz);
    const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
    const mName = cap(new Intl.DateTimeFormat('ru-RU', { month: 'long', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, 15)));
    const verdict = { good: ['👍', 'Благоприятный день'], mid: ['☁️', 'Обычный день'], bad: ['⚠️', 'Лучше не спешить'] };
    const evLine = (t, n, asp, k) => `${T.transitWhat[t][k]} — ${T.transitWhere[n]}<small>${pName(t)} ${asp.sym} ${vash(n)} ${pName(n)}</small>`;

    const cells = Array(lead).fill('<span class="cday empty"></span>').concat(days.map(x => {
      const isToday = today.y === y && today.m === m && today.d === x.dd;
      return `<button class="cday ${x.cls}${isToday ? ' today' : ''}${x.dd === sel.dd ? ' sel' : ''}" data-day="${x.dd}" aria-label="${x.dd} ${mName}: ${verdict[x.cls][1]}">
        <span class="cn">${x.dd}</span>
        <span class="cm">${x.phase !== null ? T.phases[x.phase][0] : T.signGlyphs[x.moonSign]}</span>
        ${x.exact.length ? `<span class="cdots">${x.exact.slice(0, 3).map(e => `<i class="${F.kindOf(e.asp, e.t)}"></i>`).join('')}</span>` : ''}
      </button>`;
    }));

    const bg = sel.info.active.filter(a => a.t !== 'moon' && !sel.exact.some(e => e.t === a.t && e.n === a.n && e.asp.key === a.asp.key));
    const moonAsp = sel.info.active.filter(a => a.t === 'moon').slice(0, 3);
    const notable = [...days].filter(x => x.cls !== 'mid').sort((a, b) => Math.abs(b.info.score) - Math.abs(a.info.score)).slice(0, 8).sort((a, b) => a.dd - b.dd);

    return `
      <div class="card cal">
        <div class="cal-head">
          <button class="chipbtn" data-cal="prev" aria-label="Предыдущий месяц">←</button>
          <b>${mName} ${y}</b>
          <button class="chipbtn" data-cal="next" aria-label="Следующий месяц">→</button>
        </div>
        <div class="cal-grid">
          ${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(w => `<span class="cw">${w}</span>`).join('')}
          ${cells.join('')}
        </div>
        <div class="legend">
          <span><i class="lg harm"></i>благоприятный</span><span><i class="lg tense"></i>лучше не спешить</span>
          <span>♈︎…♓︎ — знак Луны</span><span>🌑🌓🌕🌗 — фазы</span><span>• — точный транзит</span>
        </div>
        ${today.y === y && today.m === m ? '' : '<div class="center"><button class="chipbtn" data-cal="today">Вернуться к сегодня</button></div>'}
      </div>

      <div class="card item day ${sel.cls}" id="dayDetail">
        <div class="mhead"><h3>${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, sel.dd))}</h3>
          <span class="verdict-chip ${sel.cls}">${verdict[sel.cls].join(' ')}</span></div>
        <p class="mtheme">🌙 Луна ${T.signsIn[sel.moonSign]}, в вашем ${sel.moonHouse}-м доме. ${T.moonDay[sel.moonHouse - 1]}</p>
        ${sel.phase !== null ? `<p class="mtheme">${T.phases[sel.phase].join(' ')}.</p>` : ''}
        ${sel.exact.length ? `<div class="tag">Точно сегодня</div><ul class="events">${sel.exact.map(e => { const k = F.kindOf(e.asp, e.t); return `<li class="${k}"><span class="date">${new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(A.msFromJd(e.jd))}</span><span>${evLine(e.t, e.n, e.asp, k)}</span></li>`; }).join('')}</ul>` : ''}
        ${moonAsp.length ? `<div class="tag">Настроение дня (Луна)</div><ul class="events">${moonAsp.map(a => `<li class="${a.k}"><span class="date">${a.asp.sym}</span><span>${evLine('moon', a.n, a.asp, a.k)}</span></li>`).join('')}</ul>` : ''}
        ${bg.length ? `<div class="tag">Фон (действует несколько дней)</div><ul class="events">${bg.slice(0, 5).map(a => `<li class="${a.k}"><span class="date">${a.asp.sym}</span><span>${evLine(a.t, a.n, a.asp, a.k)}</span></li>`).join('')}</ul>` : ''}
        ${!sel.exact.length && !moonAsp.length && !bg.length ? '<p class="hint">Тихий день без заметных влияний — хорошо для обычных дел.</p>' : ''}
      </div>

      <div class="card item">
        <h3 style="margin-top:0">Заметные дни месяца</h3>
        ${notable.length ? `<ul class="daylist">${notable.map(x => {
          const top = x.info.active.find(a => a.k === (x.cls === 'good' ? 'harm' : 'tense')) || x.info.active[0];
          return `<li><button data-day="${x.dd}" class="${x.cls}"><b>${x.dd}</b><span>${verdict[x.cls][0]} ${top ? `${T.transitWhat[top.t][top.k]} — ${T.transitWhere[top.n]}` : verdict[x.cls][1]}</span></button></li>`;
        }).join('')}</ul>` : '<p class="hint">Ровный месяц без резких дней.</p>'}
        <p class="hint">Оценка дня складывается из аспектов Луны и планет к вашей карте рождения: чем точнее и «тяжелее» аспект, тем сильнее он влияет.${r.timeKnown ? '' : ' Без времени рождения дома и Луна в карте рождения приблизительны.'}</p>
      </div>`;
  }

  // ---------- Вкладка «По месяцам» ----------
  function panelMonths() {
    const { d, r } = state, tz = d.reloc.tz;
    const s = ymdIn(r.srMs, tz);
    const months = [];
    for (let i = 0; i < 12; i++) {
      const m0 = s.m - 1 + i, y = s.y + Math.floor(m0 / 12), m = (m0 % 12) + 1;
      const y2 = m === 12 ? y + 1 : y, mNext = m === 12 ? 1 : m + 1;
      months.push({ y, m, start: A.jdFromMs(A.localToUtc(y, m, 1, 0, 0, tz)), end: A.jdFromMs(A.localToUtc(y2, mNext, 1, 0, 0, tz)) });
    }
    const pts = F.natalPoints(r.natal, r.timeKnown);
    const events = F.transitEvents(months[0].start, months[11].end, pts);
    const lunars = r.timeKnown ? F.lunarReturns(r.natal.planets[1].lon, months[0].start - 30, months[11].end) : [];
    const monthName = (y, m) => cap(new Intl.DateTimeFormat('ru-RU', { month: 'long', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, 15))) + ' ' + y;
    const day = jd => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: tz }).format(A.msFromJd(jd)).replace('.', '');
    const uniqDays = evs => [...new Set(evs.map(e => day(e.jd)))].join(', ');

    const cards = months.map(mo => {
      const mid = mo.start + 14.5;
      const sunH = A.houseOf(A.sunLon(A.ttFromUt(mid)), r.natalCusps);
      const evs = events.filter(e => e.jd >= mo.start && e.jd < mo.end);
      let score = 0;
      for (const e of evs) { const k = F.kindOf(e.asp, e.t); score += (k === 'harm' ? 1 : k === 'tense' ? -1 : 0) * e.w; }
      const tone = Math.max(6, Math.min(94, 50 + score * 3));
      const top = [...evs].sort((a, b) => b.w - a.w).slice(0, 4).sort((a, b) => a.jd - b.jd);
      const good = evs.filter(e => F.kindOf(e.asp, e.t) === 'harm').sort((a, b) => b.w - a.w).slice(0, 3).sort((a, b) => a.jd - b.jd);
      const bad = evs.filter(e => F.kindOf(e.asp, e.t) === 'tense' && e.w >= 1.5).sort((a, b) => b.w - a.w).slice(0, 3).sort((a, b) => a.jd - b.jd);
      const lunar = lunars.filter(j => j <= mid).pop();
      let lunarLine = '';
      if (lunar) {
        const lc = A.chart(lunar, d.reloc.lat, d.reloc.lon);
        const ls = signOf(lc.asc);
        lunarLine = `<div class="tag">🌙 Лунар ${day(lunar)}: асцендент ${T.signsIn[ls]} — ${T.ascAdj[ls].toLowerCase()} настрой; Луна в ${lc.planets[1].house}-м доме (${T.topics[lc.planets[1].house - 1]})</div>`;
      }
      const nowJd = A.jdFromMs(Date.now());
      const current = nowJd >= mo.start && nowJd < mo.end;
      return `<div class="card month${current ? ' current' : ''}">
        <div class="mhead"><h3>${monthName(mo.y, mo.m)}${current ? ' <span class="now">сейчас</span>' : ''}</h3>${miniBar(tone)}</div>
        <p class="mtheme"><b>${cap(T.topics[sunH - 1])}.</b> ${T.monthTheme[sunH - 1]}</p>
        ${lunarLine}
        ${top.length ? `<ul class="events">${top.map(e => {
          const k = F.kindOf(e.asp, e.t);
          return `<li class="${k}"><span class="date">${day(e.jd)}</span><span>${T.transitWhat[e.t][k === 'conj' ? 'conj' : k]} — ${T.transitWhere[e.n]}<small>${pName(e.t)} ${e.asp.sym} ${['moon', 'venus'].includes(e.n) ? 'ваша' : e.n === 'sun' ? 'ваше' : 'ваш'} ${pName(e.n)}</small></span></li>`;
        }).join('')}</ul>` : '<p class="hint">Спокойный месяц без ярких событий — время для текущих дел.</p>'}
        <div class="days">
          ${good.length ? `<span class="chip good">👍 ${uniqDays(good)}</span>` : ''}
          ${bad.length ? `<span class="chip bad">⚠️ ${uniqDays(bad)}</span>` : ''}
        </div>
      </div>`;
    });
    return `${yearNav(d.year)}
      <div class="card item">
        <h3 style="margin-top:0">Как читать</h3>
        <p class="hint">Тема месяца — по дому вашей натальной карты, через который идёт Солнце. События — точные аспекты планет к вашей карте рождения (транзиты)${r.timeKnown ? ', настрой — по лунару (возвращению Луны)' : ''}. 👍 — удачные дни, ⚠️ — дни, когда лучше не спешить.${r.timeKnown ? '' : ' Без времени рождения дома считаются от знака Солнца.'}</p>
      </div>
      <div class="months">${cards.join('')}</div>`;
  }

  // ---------- Вкладка «Карта соляра» ----------
  function panelChart() {
    const { d, r } = state, { chart, aspects } = r;
    const tz = d.reloc.tz;
    const nh = lon => A.houseOf(lon, r.natalCusps);
    const counts = [0, 0, 0, 0], crosses = [0, 0, 0];
    const weighted = chart.planets.filter(p => !['uranus', 'neptune', 'pluto'].includes(p.key)).map(p => p.lon).concat([chart.asc, chart.mc]);
    weighted.forEach(l => { counts[signOf(l) % 4]++; crosses[signOf(l) % 3]++; });
    const total = weighted.length;
    const domEl = counts.indexOf(Math.max(...counts)), domCr = crosses.indexOf(Math.max(...crosses));
    const angular = chart.planets.filter(p => [1, 4, 7, 10].includes(p.house));
    const keys = A.KEYS;
    const aspMap = {};
    aspects.forEach(x => { aspMap[x.a.key + x.b.key] = x; aspMap[x.b.key + x.a.key] = x; });
    const hemis = { up: chart.planets.filter(p => p.house >= 7).length, east: chart.planets.filter(p => p.house >= 10 || p.house <= 3).length };

    return `${yearNav(d.year)}
      <div class="card">
        ${wheel(chart, aspects, r.natal.planets)}
        <div class="legend">
          <span><i class="lg in"></i>планеты соляра</span><span><i class="lg out"></i>натальные планеты (внешний круг)</span>
          <span><i class="lg harm"></i>гармоничный аспект</span><span><i class="lg tense"></i>напряжённый аспект</span>
        </div>
        <p class="meta">Момент соляра: <b>${fmtDate(r.srMs, tz, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</b> (${esc(tz)}) ·
          ${new Date(r.srMs).toISOString().slice(0, 16).replace('T', ' ')} UTC<br>
          Место: <b>${esc(d.reloc.name)}</b> ${d.reloc.lat.toFixed(4)}°, ${d.reloc.lon.toFixed(4)}° · дома: <b>${chart.system}</b><br>
          AC <b>${pos(chart.asc)}</b> · DC <b>${pos(chart.asc + 180)}</b> · MC <b>${pos(chart.mc)}</b> · IC <b>${pos(chart.mc + 180)}</b></p>
      </div>
      ${r.timeKnown ? '' : noTimeNote}
      ${skyCard(r.srJd, chart.asc, 'в момент соляра')}

      <div class="card">
        <h3 class="h">Планеты соляра</h3>
        <div class="tablewrap"><table>
          <thead><tr><th>Планета</th><th>Положение</th><th>Дом соляра</th><th>Натальный дом</th><th>Сила</th></tr></thead>
          <tbody>${chart.planets.map(p => {
            const [dg, cls] = dignity(p.key, signOf(p.lon));
            return `<tr><td><span class="g">${T.planets[p.key].glyph}</span>${T.planets[p.key].name}${p.retro ? ' <span class="retro" title="ретроградная">R</span>' : ''}</td>
              <td>${pos(p.lon)} <span class="muted">${T.signs[signOf(p.lon)]}</span></td><td>${p.house}</td><td>${nh(p.lon)}</td><td class="${cls}">${dg}</td></tr>`;
          }).join('')}</tbody>
        </table></div>
        <p class="hint">«Натальный дом» — в какую сферу вашей карты рождения попадает планета соляра. «Сила»: в обители и экзальтации планета работает в полную силу, в изгнании и падении — с трудом.</p>
      </div>

      <div class="card">
        <h3 class="h">Дома соляра</h3>
        <div class="tablewrap"><table>
          <thead><tr><th>Дом</th><th>Куспид</th><th>Управитель</th><th>Управитель в доме</th><th>В натальном доме</th></tr></thead>
          <tbody>${chart.cusps.map((c, i) => {
            const ru = T.signRuler[signOf(c)], rp = chart.planets.find(p => p.key === ru);
            return `<tr><td><b>${i + 1}</b> <span class="muted">${T.houseNames[i]}</span></td><td>${pos(c)}</td>
              <td><span class="g">${T.planets[ru].glyph}</span>${T.planets[ru].name}</td><td>${rp.house}</td><td>${nh(c)}</td></tr>`;
          }).join('')}</tbody>
        </table></div>
        <p class="hint">Проекция домов соляра на натальные дома показывает, через какую сферу жизни проявится тема каждого дома в этом году.</p>
      </div>

      <div class="card">
        <h3 class="h">Аспекты</h3>
        <div class="tablewrap"><table class="agrid">
          <tbody>${keys.map((k, i) => `<tr><th>${T.planets[k].glyph}</th>${keys.slice(0, i).map(k2 => {
            const x = aspMap[k + k2];
            return `<td class="${x ? aspectKind(x) : ''}" title="${x ? `${pName(x.a.key)} ${x.asp.name} ${pName(x.b.key)}, орб ${x.orb.toFixed(1)}°` : ''}">${x ? x.asp.sym : ''}</td>`;
          }).join('')}<td class="diag">${T.planets[k].glyph}</td></tr>`).join('')}</tbody>
        </table></div>
        <ul class="alist">${aspects.map(x => `<li class="${aspectKind(x)}"><span class="g2">${T.planets[x.a.key].glyph} ${x.asp.sym} ${T.planets[x.b.key].glyph}</span> ${pName(x.a.key)} — ${x.asp.name} — ${pName(x.b.key)} <span class="muted">орб ${x.orb.toFixed(1)}°</span></li>`).join('')}</ul>
      </div>

      <div class="card">
        <h3 class="h">Баланс и акценты</h3>
        <div class="bal">
          ${T.elements.map((e, i) => `<div class="balrow"><span>${e.icon} ${e.name}</span><span class="bbar"><span style="width:${counts[i] / total * 100}%"></span></span><b>${counts[i]}</b></div>`).join('')}
        </div>
        <div class="bal" style="margin-top:12px">
          ${T.crosses.map((c, i) => `<div class="balrow"><span>${c.name}</span><span class="bbar alt"><span style="width:${crosses[i] / total * 100}%"></span></span><b>${crosses[i]}</b></div>`).join('')}
        </div>
        <ul class="facts">
          <li>Преобладает <b>${T.elements[domEl].name.toLowerCase()}</b> — год про ${T.elements[domEl].text}; крест — <b>${T.crosses[domCr].name.toLowerCase()}</b>: ${T.crosses[domCr].text}.</li>
          <li>Угловые планеты (самые сильные в году): <b>${angular.length ? angular.map(p => T.planets[p.key].name + ` (${p.house} дом)`).join(', ') : 'нет'}</b>.</li>
          <li>Над горизонтом ${hemis.up} из 10 планет — ${hemis.up >= 6 ? 'год больше про внешний мир, карьеру и людей' : 'год больше про личную жизнь, дом и внутренние дела'}.</li>
          <li>В восточной половине ${hemis.east} из 10 — ${hemis.east >= 6 ? 'многое зависит от вашей инициативы' : 'многое придёт через других людей и обстоятельства'}.</li>
          <li>Управитель года (хозяин асцендента соляра): <b>${T.planets[T.signRuler[signOf(chart.asc)]].name}</b> в ${chart.planets.find(p => p.key === T.signRuler[signOf(chart.asc)]).house}-м доме — сфера «${T.topics[chart.planets.find(p => p.key === T.signRuler[signOf(chart.asc)]).house - 1]}» задаёт тон всему году.</li>
        </ul>
      </div>`;
  }

  // ---------- Вкладка «Лента лет» ----------
  function panelYears() {
    const { d, r } = state;
    const by = +d.date.slice(0, 4), cur = now.getFullYear();
    const from = state.allYears ? by + 1 : Math.max(by + 1, cur - 3), to = state.allYears ? by + 95 : cur + 15;
    const rows = [];
    for (let y = from; y <= to; y++) {
      const jd = A.solarReturn(r.natalJd, y);
      const c = A.chart(jd, d.reloc.lat, d.reloc.lon);
      const tone = toneScore(A.aspects(c.planets));
      const sh = c.planets[0].house - 1, as = signOf(c.asc);
      const jh = c.planets[5].house - 1;
      rows.push(`<button class="yrow${y === d.year ? ' sel' : ''}" data-year="${y}" data-goto="year">
        <span class="yy">${y}<small>${y - by} ${plural(y - by)}</small></span>
        <span class="yt"><b>${T.ascAdj[as]} год · ${T.topics[sh]}</b><small>Удача: ${T.topics[jh]} · AC ${T.signsIn[as]}</small></span>
        ${miniBar(tone)}</button>`);
    }
    return `<div class="card item">
        <h3 style="margin-top:0">Ваши годы одной строкой</h3>
        <p class="hint">Каждая строка — соляр от дня рождения до следующего (для места «${esc(d.reloc.name)}»). Полоска справа — насколько год лёгкий. Нажмите на год, чтобы открыть подробный прогноз.</p>
      </div>
      <div class="ylist">${rows.join('')}</div>
      ${state.allYears ? '' : '<button class="btn ghost wide" data-act="more-years">Показать все годы жизни</button>'}`;
  }
  const plural = n => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'год' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'года' : 'лет'; };

  // ---------- Вкладка «Вся жизнь» ----------
  function panelLife() {
    const { d, r } = state, natal = r.natal, tz = d.birth.tz;
    const n = Object.fromEntries(natal.planets.map(p => [p.key, p]));
    const cycles = F.lifeCycles(natal, r.natalJd, 90);
    const nowJd = A.jdFromMs(Date.now());
    const ageAt = jd => (jd - r.natalJd) / 365.25;
    const ymd = jd => new Intl.DateTimeFormat('ru-RU', { month: 'short', year: 'numeric', timeZone: tz }).format(A.msFromJd(jd));
    const natalAsp = A.aspects(natal.planets);
    const counts = [0, 0, 0, 0];
    natal.planets.filter(p => !['uranus', 'neptune', 'pluto'].includes(p.key)).forEach(p => counts[signOf(p.lon) % 4]++);
    const domEl = counts.indexOf(Math.max(...counts));
    const hh = k => n[k].house - 1;

    const portrait = [
      ['☀️', 'Суть личности', `Солнце ${T.signsIn[signOf(n.sun.lon)]}`, T.natalSun[signOf(n.sun.lon)]],
      ['🌙', 'Что нужно для счастья', `Луна ${T.signsIn[signOf(n.moon.lon)]}${r.timeKnown ? '' : ' (примерно)'}`, T.natalMoon[signOf(n.moon.lon)]],
    ];
    if (r.timeKnown) portrait.push(['🎭', 'Как вас видят', `Асцендент ${T.signsIn[signOf(natal.asc)]}`, T.natalAsc[signOf(natal.asc)]]);
    portrait.push(['✨', 'Ваша стихия', T.elements[domEl].name, `Больше всего планет в стихии ${T.elements[domEl].name.toLowerCase()} — по жизни вам важны ${T.elements[domEl].text}.`]);

    return `
      <div class="grid">${portrait.map(([ic, t, tag, text]) => `<div class="card item"><div class="ic">${ic}</div><h3>${t}</h3><div class="tag">${tag}</div><p>${text}</p></div>`).join('')}</div>
      ${r.timeKnown ? `<div class="card item">
        <h3 style="margin-top:0">Главные сферы жизни</h3>
        <div class="chips left">
          <span class="chip">Призвание: <b>${T.topics[hh('sun')]}</b></span>
          <span class="chip">Удача по жизни: <b>${T.topics[hh('jupiter')]}</b></span>
          <span class="chip">Главный урок: <b>${T.topics[hh('saturn')]}</b></span>
          <span class="chip">Любовь раскрывается через: <b>${T.topics[hh('venus')]}</b></span>
          <span class="chip">Энергия уходит в: <b>${T.topics[hh('mars')]}</b></span>
          <span class="chip">Карьера (MC): <b>${T.signs[signOf(natal.mc)]}</b></span>
        </div></div>` : `<div class="card note">Чтобы увидеть сферы жизни и асцендент, укажите время рождения.</div>`}

      <div class="card item">
        <h3 style="margin-top:0">Жизненные циклы</h3>
        <p class="hint">Медленные планеты возвращаются к своему положению в момент рождения или встают к нему в напряжённый угол — это узловые периоды жизни, которые чувствует почти каждый. Даты рассчитаны по вашей карте.</p>
        <ol class="timeline">${cycles.map(c => {
          const info = T.cycles[c.id], past = c.end < nowJd, curr = c.start - 120 <= nowJd && nowJd <= c.end + 120;
          return `<li class="${past ? 'past' : ''}${curr ? ' curr' : ''}">
            <span class="age">${Math.round(ageAt(c.peak))}<small>${plural(Math.round(ageAt(c.peak)))}</small></span>
            <div><b>${info.icon} ${info.title}</b>${curr ? ' <span class="now">сейчас</span>' : ''}
              <small>${ymd(c.start)}${c.end - c.start > 40 ? ' — ' + ymd(c.end) : ''}</small>
              <p>${info.text}</p></div></li>`;
        }).join('')}</ol>
      </div>

      <details class="card pro">
        <summary>Натальная карта для знатоков</summary>
        <div class="pro-body">
          ${wheel(natal, natalAsp, null)}
          ${skyCard(r.natalJd, natal.asc, 'в момент вашего рождения')}
          <div class="tablewrap"><table>
            <thead><tr><th>Планета</th><th>Положение</th>${r.timeKnown ? '<th>Дом</th>' : ''}<th>Сила</th></tr></thead>
            <tbody>${natal.planets.map(p => { const [dg, cls] = dignity(p.key, signOf(p.lon)); return `<tr><td><span class="g">${T.planets[p.key].glyph}</span>${T.planets[p.key].name}${p.retro ? ' <span class="retro">R</span>' : ''}</td><td>${pos(p.lon)} <span class="muted">${T.signs[signOf(p.lon)]}</span></td>${r.timeKnown ? `<td>${p.house}</td>` : ''}<td class="${cls}">${dg}</td></tr>`; }).join('')}</tbody>
          </table></div>
          ${r.timeKnown ? `<p class="meta">AC <b>${pos(natal.asc)}</b> · MC <b>${pos(natal.mc)}</b> · дома: ${natal.system}</p>` : ''}
        </div>
      </details>`;
  }

  // ---------- Реальное расположение планет (вид сверху на Солнечную систему) ----------
  const SKY_COL = { mercury: '#c9b8a6', venus: '#f5d38b', earth: '#6fb7ff', mars: '#ff7a5c', jupiter: '#e8b98a', saturn: '#e9d49a', uranus: '#8fe3e8', neptune: '#6f8dff', pluto: '#c7a0d8' };
  function skyMap(jdUT, rot, when) {
    const jd = A.ttFromUt(jdUT);
    const C = 280, RZ0 = 238, RZ1 = 266;
    const scale = a => 20 + 30 * Math.sqrt(a);
    const ang = lon => (180 + (lon - rot)) * Math.PI / 180;
    const xy = (lon, r) => [r * Math.cos(ang(lon)), -r * Math.sin(ang(lon))]; // относительно центра
    const f = n => n.toFixed(1);
    const helioKeys = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
    const H = Object.fromEntries(helioKeys.map(k => [k, A.helioPos(k, jd)]));
    const [ex, ey] = xy(H.earth.lon, scale(H.earth.a));
    // точка на кольце зодиака по лучу с Земли в направлении эклиптической долготы lon
    const rayEnd = (lon, R) => {
      const a = ang(lon), ux = Math.cos(a), uy = -Math.sin(a);
      const b = ex * ux + ey * uy, t = -b + Math.sqrt(b * b - (ex * ex + ey * ey) + R * R);
      return [ex + t * ux, ey + t * uy];
    };
    const angOf = ([x, y]) => Math.atan2(-y, x);
    const arcPt = (rad, R) => [C + R * Math.cos(rad), C - R * Math.sin(rad)];
    let s = `<svg class="wheel sky" viewBox="0 0 ${C * 2} ${C * 2}" role="img" aria-label="Расположение планет ${when}">`;
    s += `<defs><radialGradient id="sunglow"><stop offset="0" stop-color="#ffe9a8"/><stop offset=".45" stop-color="#f5c76b"/><stop offset="1" stop-color="#f5c76b" stop-opacity="0"/></radialGradient></defs>`;
    // Зодиак — так, как его видно с Земли (границы знаков по лучам из Земли)
    for (let i = 0; i < 12; i++) {
      const a0 = angOf(rayEnd(i * 30, RZ1)), a1 = angOf(rayEnd(i * 30 + 30, RZ1));
      const sweep = ((a1 - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      const big = sweep > Math.PI ? 1 : 0;
      const [x0, y0] = arcPt(a0, RZ1), [x1, y1] = arcPt(a0 + sweep, RZ1), [x2, y2] = arcPt(a0 + sweep, RZ0), [x3, y3] = arcPt(a0, RZ0);
      s += `<path class="el${i % 4}" d="M${f(x0)},${f(y0)} A${RZ1},${RZ1} 0 ${big} 0 ${f(x1)},${f(y1)} L${f(x2)},${f(y2)} A${RZ0},${RZ0} 0 ${big} 1 ${f(x3)},${f(y3)} Z"/>`;
      s += `<line class="cusp" x1="${f(x0)}" y1="${f(y0)}" x2="${f(x3)}" y2="${f(y3)}"/>`;
      const [gx, gy] = arcPt(a0 + sweep / 2, (RZ0 + RZ1) / 2);
      s += `<text class="sg" x="${f(gx)}" y="${f(gy)}" text-anchor="middle" dominant-baseline="central">${T.signGlyphs[i]}</text>`;
    }
    s += `<circle class="ring" cx="${C}" cy="${C}" r="${RZ0}"/><circle class="ring" cx="${C}" cy="${C}" r="${RZ1}"/>`;
    for (const k of helioKeys) s += `<circle class="orbit${k === 'earth' ? ' earth' : ''}" cx="${C}" cy="${C}" r="${f(scale(H[k].a))}"/>`;
    // Лучи с Земли: знак планеты в гороскопе = направление на неё с Земли
    const geoLon = Object.fromEntries(A.KEYS.map(k => [k, A.planetLon(k, jd)]));
    const ray = k => {
      const [rx, ry] = rayEnd(geoLon[k], RZ0);
      return `<line class="ray" x1="${f(C + ex)}" y1="${f(C + ey)}" x2="${f(C + rx)}" y2="${f(C + ry)}"/><circle class="rayend" cx="${f(C + rx)}" cy="${f(C + ry)}" r="3"/>`;
    };
    const title = k => `${T.planets[k].name}: ${fmtDeg(geoLon[k])} ${T.signsIn[signOf(geoLon[k])]} (вид с Земли)`;
    s += `<g class="sp" tabindex="0">${ray('sun')}<circle cx="${C}" cy="${C}" r="22" fill="url(#sunglow)"/><circle cx="${C}" cy="${C}" r="8" fill="#ffd77a"/><title>${title('sun')}</title></g>`;
    for (const k of helioKeys) {
      const [x, y] = xy(H[k].lon, scale(H[k].a)), rad = ['jupiter', 'saturn'].includes(k) ? 6.5 : k === 'earth' ? 5.5 : 4.5;
      const px = f(C + x), py = f(C + y);
      if (k === 'earth') {
        const [mx, my] = xy(geoLon.moon, 11);
        s += `<g class="sp" tabindex="0">${ray('moon')}<circle cx="${f(C + x + mx)}" cy="${f(C + y + my)}" r="2.6" fill="#d8d8e6"/><title>${title('moon')}</title></g>`;
        s += `<circle cx="${px}" cy="${py}" r="${rad}" fill="${SKY_COL.earth}" stroke="#fff" stroke-width="1.2"><title>Земля — отсюда мы смотрим на небо</title></circle>`;
        s += `<text class="skl earth" x="${px}" y="${f(C + y + 17)}" text-anchor="middle">Земля</text>`;
        continue;
      }
      const retro = A.diff(A.planetLon(k, jd + 0.5), A.planetLon(k, jd - 0.5)) < 0;
      const [lx, ly] = xy(H[k].lon, scale(H[k].a) + 14);
      s += `<g class="sp" tabindex="0">${ray(k)}`;
      if (k === 'saturn') s += `<ellipse cx="${px}" cy="${py}" rx="11" ry="3.5" fill="none" stroke="${SKY_COL.saturn}" stroke-width="1.2" transform="rotate(-20 ${px} ${py})"/>`;
      s += `<circle cx="${px}" cy="${py}" r="${rad}" fill="${SKY_COL[k]}"/>`;
      s += `<text class="skl${retro ? ' r' : ''}" x="${f(C + lx)}" y="${f(C + ly)}" text-anchor="middle" dominant-baseline="central">${T.planets[k].glyph}${retro ? 'R' : ''}</text>`;
      s += `<title>${title(k)}${retro ? ', ретроградность: Земля обгоняет планету, и кажется, что та идёт назад' : ''}</title></g>`;
    }
    return s + '</svg>';
  }
  function skyCard(jdUT, rot, when) {
    return `<div class="card sky-card">
        <h3 class="h">Как планеты на самом деле стояли ${when}</h3>
        <p class="meta">Вид сверху на Солнечную систему: в центре Солнце, вокруг орбиты планет, голубая точка — Земля, рядом с ней Луна. Расстояния сжаты, иначе дальние планеты не поместились бы.</p>
        ${skyMap(jdUT, rot, when)}
        <label class="sky-toggle"><input type="checkbox" data-act="rays"> Показать, как каждая планета видна с Земли</label>
        <p class="meta">Знак зодиака планеты в гороскопе — это направление, в котором её видно <b>с Земли</b>. Нажмите на планету (или включите галочку): линия от Земли покажет, на фоне какого знака она находится. Поэтому Солнце в гороскопе стоит в знаке напротив того, где находится Земля. <span class="r">R</span> — ретроградная планета: Земля обгоняет её по орбите, и с Земли кажется, что она пятится назад. Карта повёрнута так же, как круг гороскопа выше.</p>
      </div>`;
  }

  // ---------- Колесо карты (SVG) ----------
  function spread(items, gap) {
    const ps = items.map(p => ({ p, d: p.lon })).sort((a, b) => a.d - b.d);
    for (let it = 0; it < 500; it++) {
      let moved = false;
      for (let i = 0; i < ps.length; i++) {
        const a = ps[i], b = ps[(i + 1) % ps.length];
        let g = A.norm(b.d - a.d);
        if (g > 300) g -= 360;
        if (g < gap - 0.01) { const push = (gap - g) / 2 + 0.05; a.d -= push; b.d += push; moved = true; }
      }
      if (!moved) break;
    }
    return ps;
  }
  function wheel(chart, aspects, outer) {
    const C = 260, RO = 250, R1 = 212, R2 = 182, RP = 160, RD = 138, R3 = 78;
    const ang = lon => (180 + (lon - chart.asc)) * Math.PI / 180;
    const pt = (lon, r) => [C + r * Math.cos(ang(lon)), C - r * Math.sin(ang(lon))];
    const f = n => n.toFixed(1);
    let s = `<svg class="wheel" viewBox="0 0 ${C * 2} ${C * 2}" role="img" aria-label="Карта">`;
    if (outer) s += `<circle class="outerring" cx="${C}" cy="${C}" r="${RO}"/>`;
    for (let i = 0; i < 12; i++) {
      const a0 = i * 30, a1 = a0 + 30;
      const [x0, y0] = pt(a0, R1), [x1, y1] = pt(a1, R1), [x2, y2] = pt(a1, R2), [x3, y3] = pt(a0, R2);
      s += `<path class="el${i % 4}" d="M${f(x0)},${f(y0)} A${R1},${R1} 0 0 0 ${f(x1)},${f(y1)} L${f(x2)},${f(y2)} A${R2},${R2} 0 0 1 ${f(x3)},${f(y3)} Z"/>`;
      const [gx, gy] = pt(a0 + 15, (R1 + R2) / 2);
      s += `<text class="sg" x="${f(gx)}" y="${f(gy)}" text-anchor="middle" dominant-baseline="central">${T.signGlyphs[i]}</text>`;
      for (let dg = 0; dg < 30; dg += 5) {
        const [tx0, ty0] = pt(a0 + dg, R2), [tx1, ty1] = pt(a0 + dg, R2 + (dg === 0 ? 0 : dg % 10 ? 3 : 5));
        if (dg) s += `<line class="deg" x1="${f(tx0)}" y1="${f(ty0)}" x2="${f(tx1)}" y2="${f(ty1)}"/>`;
      }
    }
    s += `<circle class="ring" cx="${C}" cy="${C}" r="${R1}"/><circle class="ring" cx="${C}" cy="${C}" r="${R2}"/><circle class="ring" cx="${C}" cy="${C}" r="${R3}"/>`;
    chart.cusps.forEach((c, i) => {
      const axis = i % 3 === 0;
      const [x0, y0] = pt(c, R2), [x1, y1] = pt(c, R3);
      s += `<line class="${axis ? 'axis' : 'cusp'}" x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}"/>`;
      const mid = c + A.norm(chart.cusps[(i + 1) % 12] - c) / 2;
      const [hx, hy] = pt(mid, R3 - 11);
      s += `<text class="hn" x="${f(hx)}" y="${f(hy)}" text-anchor="middle" dominant-baseline="central">${i + 1}</text>`;
      if (!axis) {
        const [cx, cy] = pt(c + 2.2, R3 + 9);
        s += `<text class="cd" x="${f(cx)}" y="${f(cy)}" text-anchor="middle" dominant-baseline="central">${Math.floor(A.norm(c) % 30)}°</text>`;
      }
    });
    [['AC', chart.asc], ['DC', chart.asc + 180], ['MC', chart.mc], ['IC', chart.mc + 180]].forEach(([l, lon]) => {
      const [lx, ly] = pt(lon - 6, R3 + 14), [dx, dy] = pt(lon + 6, R3 + 14);
      s += `<text class="lab" x="${f(lx)}" y="${f(ly)}" text-anchor="middle" dominant-baseline="central">${l}</text>`;
      s += `<text class="cd2" x="${f(dx)}" y="${f(dy)}" text-anchor="middle" dominant-baseline="central">${Math.floor(A.norm(lon) % 30)}°</text>`;
    });
    for (const x of aspects) {
      if (x.asp.key === 'conj') continue;
      const [x0, y0] = pt(x.a.lon, R3), [x1, y1] = pt(x.b.lon, R3);
      s += `<line class="al ${aspectKind(x)}${x.asp.key === 'sext' ? ' dash' : ''}" x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}"/>`;
    }
    for (const { p, d } of spread(chart.planets, 9)) {
      const [tx0, ty0] = pt(p.lon, R2), [tx1, ty1] = pt(p.lon, R2 - 7);
      s += `<line class="tick" x1="${f(tx0)}" y1="${f(ty0)}" x2="${f(tx1)}" y2="${f(ty1)}"/>`;
      const [x, y] = pt(d, RP), [dx, dy] = pt(d, RD);
      s += `<text class="pl${p.retro ? ' r' : ''}" x="${f(x)}" y="${f(y)}" text-anchor="middle" dominant-baseline="central"><title>${T.planets[p.key].name} ${fmtDeg(p.lon)} ${T.signsIn[signOf(p.lon)]}</title>${T.planets[p.key].glyph}</text>`;
      s += `<text class="pd" x="${f(dx)}" y="${f(dy)}" text-anchor="middle" dominant-baseline="central">${Math.floor(A.norm(p.lon) % 30)}°${p.retro ? 'R' : ''}</text>`;
    }
    if (outer) {
      for (const { p, d } of spread(outer, 8)) {
        const [tx0, ty0] = pt(p.lon, R1), [tx1, ty1] = pt(p.lon, R1 + 6);
        s += `<line class="tick nat" x1="${f(tx0)}" y1="${f(ty0)}" x2="${f(tx1)}" y2="${f(ty1)}"/>`;
        const [x, y] = pt(d, (R1 + RO) / 2 + 2);
        s += `<text class="pl nat" x="${f(x)}" y="${f(y)}" text-anchor="middle" dominant-baseline="central"><title>Натальн. ${T.planets[p.key].name} ${fmtDeg(p.lon)} ${T.signsIn[signOf(p.lon)]}</title>${T.planets[p.key].glyph}</text>`;
      }
    }
    return s + '</svg>';
  }

  loadHash();
})();

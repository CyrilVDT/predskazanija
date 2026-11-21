// Прогнозные техники: транзиты к натальной карте, лунары, жизненные циклы.
(function (global) {
  const A = global.Astro;
  const TRANSITERS = ['sun', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
  const WEIGHT = { sun: 1.2, venus: 1.3, mars: 1.8, jupiter: 3, saturn: 3, uranus: 2.6, neptune: 2.4, pluto: 2.6 };
  const TARGET_W = { sun: 1.6, moon: 1.4, asc: 1.5, mc: 1.4, venus: 1.2, mars: 1.1, mercury: 1, jupiter: 0.9, saturn: 0.9 };

  // Точки натальной карты, к которым считаем транзиты
  function natalPoints(natal, timeKnown) {
    const keys = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
    const pts = natal.planets.filter(p => keys.includes(p.key) && (timeKnown || p.key !== 'moon')).map(p => ({ key: p.key, lon: p.lon }));
    if (timeKnown) pts.push({ key: 'asc', lon: natal.asc }, { key: 'mc', lon: natal.mc });
    return pts;
  }

  // Точные транзитные аспекты в интервале: ищем момент, когда планета проходит
  // точный градус аспекта (смена знака), шаг — сутки, затем линейная интерполяция.
  // Сверено с эфемеридами NASA JPL Horizons: расхождение по времени — часы.
  function transitEvents(jd0, jd1, pts) {
    const n = Math.ceil(jd1 - jd0) + 3;
    const L = {};
    for (const t of TRANSITERS) L[t] = Array.from({ length: n }, (_, i) => A.planetLon(t, A.ttFromUt(jd0 - 1 + i)));
    const out = [];
    for (const t of TRANSITERS) for (const p of pts) {
      if (t === 'sun' && p.key === 'sun') continue;
      for (const asp of A.ASPECTS) {
        for (const sgn of asp.angle === 0 || asp.angle === 180 ? [1] : [1, -1]) {
          const target = A.norm(p.lon + sgn * asp.angle);
          for (let i = 0; i < n - 1; i++) {
            const a = A.diff(L[t][i], target), b = A.diff(L[t][i + 1], target);
            if ((a < 0) === (b < 0) || Math.abs(a - b) > 20) continue;
            const jd = jd0 - 1 + i + a / (a - b);
            if (jd < jd0 || jd >= jd1) continue;
            out.push({ jd, t, n: p.key, asp, orb: 0, w: WEIGHT[t] * (TARGET_W[p.key] || 1) });
          }
        }
      }
    }
    return out.sort((x, y) => x.jd - y.jd);
  }

  // Состояние неба на конкретный момент относительно натальной карты (для календаря)
  const DAY_T = ['moon', 'sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
  const DAY_ORB = { moon: 5, sun: 1.5, mercury: 1.5, venus: 1.5, mars: 1.5, jupiter: 1, saturn: 1, uranus: 1, neptune: 1, pluto: 1 };
  const DAY_W = { ...WEIGHT, moon: 0.7, mercury: 0.9 };
  function dayInfo(jdUT, pts) {
    const jd = A.ttFromUt(jdUT);
    const lon = Object.fromEntries(DAY_T.map(t => [t, A.planetLon(t, jd)]));
    const active = [];
    let score = 0;
    for (const t of DAY_T) for (const p of pts) {
      if (t === 'sun' && p.key === 'sun') continue;
      for (const asp of A.ASPECTS) {
        const orb = Math.abs(Math.abs(A.diff(lon[t], p.lon)) - asp.angle);
        if (orb > DAY_ORB[t]) continue;
        const k = kindOf(asp, t), w = DAY_W[t] * (TARGET_W[p.key] || 1);
        // медленные планеты держат аспект неделями — в оценку конкретного дня берём их слабо
        const slow = ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto'].includes(t) ? 0.25 : 1;
        score += (k === 'harm' ? 1 : k === 'tense' ? -1 : 0) * w * slow * (1 - 0.5 * orb / DAY_ORB[t]);
        active.push({ t, n: p.key, asp, orb, k, w });
      }
    }
    return { lon, active: active.sort((a, b) => b.w - a.w), score };
  }

  function kindOf(asp, t) {
    if (asp.key === 'tri' || asp.key === 'sext') return 'harm';
    if (asp.key === 'sq' || asp.key === 'opp') return 'tense';
    return ['venus', 'jupiter', 'sun'].includes(t) ? 'harm' : ['mars', 'saturn', 'pluto', 'uranus'].includes(t) ? 'tense' : 'conj';
  }

  // Все лунары в интервале
  function lunarReturns(moonLon, jd0, jd1) {
    const out = [];
    let jd = A.lunarReturn(moonLon, jd0);
    while (jd < jd1) { out.push(jd); jd = A.lunarReturn(moonLon, jd + 20); }
    return out;
  }

  // Жизненные циклы: транзиты медленных планет к их же натальному положению
  const CYCLES = [
    { id: 'jup0', t: 'jupiter', angle: 0 },
    { id: 'sat90', t: 'saturn', angle: 90 },
    { id: 'sat180', t: 'saturn', angle: 180 },
    { id: 'sat0', t: 'saturn', angle: 0 },
    { id: 'ura90', t: 'uranus', angle: 90 },
    { id: 'ura180', t: 'uranus', angle: 180 },
    { id: 'nep90', t: 'neptune', angle: 90 },
    { id: 'plu90', t: 'pluto', angle: 90 },
  ];
  function lifeCycles(natal, natalJd, years = 90) {
    // первые 2 года пропускаем — это ещё «натальная» петля медленных планет
    const step = 4, start = natalJd + 730, end = natalJd + years * 365.25;
    const nLon = Object.fromEntries(natal.planets.map(p => [p.key, p.lon]));
    const series = {};
    for (const t of ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto']) {
      series[t] = [];
      for (let jd = start; jd <= end; jd += step) series[t].push(A.planetLon(t, A.ttFromUt(jd)));
    }
    const out = [];
    for (const c of CYCLES) {
      const s = series[c.t];
      let cur = null;
      s.forEach((lon, i) => {
        const orb = Math.abs(Math.abs(A.diff(lon, nLon[c.t])) - c.angle);
        const jd = start + i * step;
        if (orb < 1.5) {
          if (cur && jd - cur.end < 300) { cur.end = jd; if (orb < cur.best) { cur.best = orb; cur.peak = jd; } }
          else { cur = { ...c, start: jd, end: jd, peak: jd, best: orb }; out.push(cur); }
        }
      });
    }
    return out.sort((a, b) => a.peak - b.peak);
  }

  global.Forecast = { natalPoints, transitEvents, kindOf, lunarReturns, lifeCycles, dayInfo };
})(window);

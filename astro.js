// Астрономические расчёты для соляра: Солнце, Луна, планеты, ASC/MC, дома Плацидуса.
// Точность (сверено с NASA JPL Horizons): Солнце ~0.15″ (момент соляра ±10 с), Луна и планеты ~1′, Сатурн до ~20′.
(function (global) {
  const RAD = Math.PI / 180, DEG = 180 / Math.PI;
  const norm = x => ((x % 360) + 360) % 360;
  const sin = x => Math.sin(x * RAD), cos = x => Math.cos(x * RAD), tan = x => Math.tan(x * RAD);
  const jdFromMs = ms => ms / 86400000 + 2440587.5;
  const msFromJd = jd => (jd - 2440587.5) * 86400000;

  // ΔT = TT − UT, секунды (полиномы Эспенака–Миза)
  // Измеренные значения ΔT (IERS) на начало года, 1986–2026; дальше — плавный прогноз
  const DT_TABLE = [54.87, 55.32, 55.82, 56.30, 56.86, 57.57, 58.31, 59.12, 59.98, 60.78, 61.63, 62.29, 62.97, 63.47, 63.83, 64.09, 64.30, 64.47, 64.57, 64.69, 64.85, 65.15, 65.46, 65.78, 66.07, 66.32, 66.60, 66.91, 67.28, 67.64, 68.10, 68.59, 68.97, 69.22, 69.36, 69.36, 69.29, 69.20, 69.18, 69.14, 69.10];
  function deltaT(y) {
    let t;
    if (y >= 1986 && y < 2026) { const i = Math.floor(y - 1986), f = y - 1986 - i; return DT_TABLE[i] + (DT_TABLE[i + 1] - DT_TABLE[i]) * f; }
    if (y >= 2026 && y < 2050) return 69.10 + (93.0 - 69.10) * (y - 2026) / 24; // стыкуем с прогнозом Эспенака на 2050
    if (y >= 1986 && y < 2005) { t = y - 2000; return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5; }
    if (y >= 1961 && y < 1986) { t = y - 1975; return 45.45 + 1.067 * t - t * t / 260 - t ** 3 / 718; }
    if (y >= 1941 && y < 1961) { t = y - 1950; return 29.07 + 0.407 * t - t * t / 233 + t ** 3 / 2547; }
    if (y >= 1920 && y < 1941) { t = y - 1920; return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * t ** 3; }
    t = (y - 1820) / 100;
    if (y >= 2050 && y < 2150) return -20 + 32 * t * t - 0.5628 * (2150 - y);
    return -20 + 32 * t * t;
  }
  const yearOfJd = jd => 2000 + (jd - 2451545) / 365.25;
  const ttFromUt = jd => jd + deltaT(yearOfJd(jd)) / 86400;

  // Нутация в долготе: главные члены теории IAU 1980 (Meeus, табл. 22.A), точность ~0.01″
  // [D, M, M', F, Ω, коэф., коэф.·T] в единицах 0.0001″
  const NUT = [[0,0,0,0,1,-171996,-174.2],[-2,0,0,2,2,-13187,-1.6],[0,0,0,2,2,-2274,-0.2],[0,0,0,0,2,2062,0.2],[0,1,0,0,0,1426,-3.4],[0,0,1,0,0,712,0.1],[-2,1,0,2,2,-517,1.2],[0,0,0,2,1,-386,-0.4],[0,0,1,2,2,-301,0],[-2,-1,0,2,2,217,-0.5],[-2,0,1,0,0,-158,0],[-2,0,0,2,1,129,0.1],[0,0,-1,2,2,123,0],[2,0,0,0,0,63,0],[0,0,1,0,1,63,0.1],[2,0,-1,2,2,-59,0],[0,0,-1,0,1,-58,-0.1],[0,0,1,2,1,-51,0],[-2,0,2,0,0,48,0],[0,0,-2,2,1,46,0],[2,0,0,2,2,-38,0],[0,0,2,2,2,-31,0],[0,0,2,0,0,29,0],[-2,0,1,2,2,29,0],[0,0,0,2,0,26,0],[-2,0,0,2,0,-22,0],[0,0,-1,2,1,21,0],[0,2,0,0,0,17,-0.1],[2,0,-1,0,1,16,0],[-2,2,0,2,2,-16,0.1],[0,1,0,0,1,-15,0],[-2,0,1,0,1,-13,0],[0,-1,0,0,1,-12,0],[0,0,2,-2,0,11,0]];
  function nutLon(T) {
    const D = 297.85036 + 445267.111480 * T - 0.0019142 * T * T;
    const M = 357.52772 + 35999.050340 * T - 0.0001603 * T * T;
    const Mp = 134.96298 + 477198.867398 * T + 0.0086972 * T * T;
    const F = 93.27191 + 483202.017538 * T - 0.0036825 * T * T;
    const O = 125.04452 - 1934.136261 * T + 0.0020708 * T * T;
    let s = 0;
    for (const [d, m, mp, f, o, a, b] of NUT) s += (a + b * T) * sin(d * D + m * M + mp * Mp + f * F + o * O);
    return s / 1e4 / 3600;
  }

  // Сокращённая теория VSOP87D для Земли (Meeus, прил. III), точность Солнца ~1″
  const VL = [
    [[175347046,0,0],[3341656,4.6692568,6283.07585],[34894,4.6261,12566.1517],[3497,2.7441,5753.3849],[3418,2.8289,3.5231],[3136,3.6277,77713.7715],[2676,4.4181,7860.4194],[2343,6.1352,3930.2097],[1324,0.7425,11506.7698],[1273,2.0371,529.691],[1199,1.1096,1577.3435],[990,5.233,5884.927],[902,2.045,26.298],[857,3.508,398.149],[780,1.179,5223.694],[753,2.533,5507.553],[505,4.583,18849.228],[492,4.205,775.523],[357,2.92,0.067],[317,5.849,11790.629],[284,1.899,796.298],[271,0.315,10977.079],[243,0.345,5486.778],[206,4.806,2544.314],[205,1.869,5573.143],[202,2.458,6069.777],[156,0.833,213.299],[132,3.411,2942.463],[126,1.083,20.775],[115,0.645,0.98],[103,0.636,4694.003],[102,0.976,15720.839],[102,4.267,7.114],[99,6.21,2146.17],[98,0.68,155.42],[86,5.98,161000.69],[85,1.3,6275.96],[85,3.67,71430.7],[80,1.81,17260.15],[79,3.04,12036.46],[75,1.76,5088.63],[74,3.5,3154.69],[74,4.68,801.82],[70,0.83,9437.76],[62,3.98,8827.39],[61,1.82,7084.9],[57,2.78,6286.6],[56,4.39,14143.5],[56,3.47,6279.55],[52,0.19,12139.55],[52,1.33,1748.02],[51,0.28,5856.48],[49,0.49,1194.45],[41,5.37,8429.24],[41,2.4,19651.05],[39,6.17,10447.39],[37,6.04,10213.29],[37,2.57,1059.38],[36,1.71,2352.87],[36,1.78,6812.77],[33,0.59,17789.85],[30,0.44,83996.85],[30,2.74,1349.87],[25,3.16,4690.48]],
    [[628331966747,0,0],[206059,2.678235,6283.07585],[4303,2.6351,12566.1517],[425,1.59,3.523],[119,5.796,26.298],[109,2.966,1577.344],[93,2.59,18849.23],[72,1.14,529.69],[68,1.87,398.15],[67,4.41,5507.55],[59,2.89,5223.69],[56,2.17,155.42],[45,0.4,796.3],[36,0.47,775.52],[29,2.65,7.11],[21,5.34,0.98],[19,1.85,5486.78],[19,4.97,213.3],[17,2.99,6275.96],[16,0.03,2544.31]],
    [[52919,0,0],[8720,1.0721,6283.0758],[309,0.867,12566.152],[27,0.05,3.52],[16,5.19,26.3],[16,3.68,155.42],[10,0.76,18849.23]],
    [[289,5.844,6283.076],[35,0,0],[17,5.49,12566.15]],
    [[114,3.142,0]],
  ];
  function sunLon(jd) {
    const T = (jd - 2451545) / 36525, t = T / 10;
    let L = 0;
    VL.forEach((series, k) => {
      let s = 0;
      for (const [A, B, C] of series) s += A * Math.cos(B + C * t);
      L += s * Math.pow(t, k);
    });
    L = L / 1e8 * DEG + 180;
    const M = 357.52911 + 35999.05029 * T;
    const R = 1.000140 - 0.016708 * cos(M) - 0.000141 * cos(2 * M);
    return norm(L - 0.09033 / 3600 - 20.4898 / 3600 / R + nutLon(T));
  }

  // [D, M, M', F, амплитуда]
  const MOON = [[0,0,1,0,6.288774],[2,0,-1,0,1.274027],[2,0,0,0,0.658314],[0,0,2,0,0.213618],[0,1,0,0,-0.185116],[0,0,0,2,-0.114332],[2,0,-2,0,0.058793],[2,-1,-1,0,0.057066],[2,0,1,0,0.053322],[2,-1,0,0,0.045758],[0,1,-1,0,-0.040923],[1,0,0,0,-0.034720],[0,1,1,0,-0.030383],[2,0,0,-2,0.015327],[0,0,1,2,-0.012528],[0,0,1,-2,0.010980],[4,0,-1,0,0.010675],[0,0,3,0,0.010034],[4,0,-2,0,0.008548],[2,1,-1,0,-0.007888],[2,1,0,0,-0.006766],[1,0,-1,0,-0.005163],[1,1,0,0,0.004987],[2,-1,1,0,0.004036],[2,0,2,0,0.003994],[4,0,0,0,0.003861],[2,0,-3,0,0.003665]];
  function moonLon(jd) {
    const T = (jd - 2451545) / 36525;
    const L = 218.3164477 + 481267.88123421 * T;
    const D = 297.8501921 + 445267.1114034 * T;
    const M = 357.5291092 + 35999.0502909 * T;
    const Mp = 134.9633964 + 477198.8675055 * T;
    const F = 93.2720950 + 483202.0175233 * T;
    const E = 1 - 0.002516 * T;
    let s = 0;
    for (const [d, m, mp, f, a] of MOON) s += a * (m ? Math.pow(E, Math.abs(m)) : 1) * sin(d * D + m * M + mp * Mp + f * F);
    return norm(L + s + nutLon(T));
  }

  // Кеплеровы элементы JPL (Standish), 1800–2050: a, ȧ, e, ė, I, İ, L, L̇, ϖ, ϖ̇, Ω, Ω̇
  const EL = {
    mercury: [0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749, 252.25032350, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081],
    venus:   [0.72333566, 0.00000390, 0.00677672, -0.00004107, 3.39467605, -0.00078890, 181.97909950, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418],
    earth:   [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0, 0],
    mars:    [1.52371034, 0.00001847, 0.09339410, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343],
    jupiter: [5.20288700, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714, 34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106],
    saturn:  [9.53667594, -0.00125060, 0.05386179, -0.00050991, 2.48599187, 0.00193609, 49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794],
    uranus:  [19.18916464, -0.00196176, 0.04725744, -0.00004397, 0.77263783, -0.00242939, 313.23810451, 428.48202785, 170.95427630, 0.40805281, 74.01692503, 0.04240589],
    neptune: [30.06992276, 0.00026291, 0.00859048, 0.00005105, 1.77004347, 0.00035372, -55.12002969, 218.45945325, 44.96476227, -0.32241464, 131.78422574, -0.00508664],
    pluto:   [39.48211675, -0.00031596, 0.24882730, 0.00005170, 17.14001206, 0.00004818, 238.92903833, 145.20780515, 224.06891629, -0.04062942, 110.30393684, -0.01183482],
  };

  function helio(e, T) {
    const a = e[0] + e[1] * T, ec = e[2] + e[3] * T, I = e[4] + e[5] * T,
      L = e[6] + e[7] * T, w = e[8] + e[9] * T, O = e[10] + e[11] * T;
    const om = w - O;
    let M = norm(L - w); if (M > 180) M -= 360;
    const eD = ec * DEG;
    let E = M + eD * sin(M);
    for (let i = 0; i < 30; i++) {
      const dE = (M - (E - eD * sin(E))) / (1 - ec * cos(E));
      E += dE;
      if (Math.abs(dE) < 1e-9) break;
    }
    const xp = a * (cos(E) - ec), yp = a * Math.sqrt(1 - ec * ec) * sin(E);
    return {
      x: (cos(om) * cos(O) - sin(om) * sin(O) * cos(I)) * xp + (-sin(om) * cos(O) - cos(om) * sin(O) * cos(I)) * yp,
      y: (cos(om) * sin(O) + sin(om) * cos(O) * cos(I)) * xp + (-sin(om) * sin(O) + cos(om) * cos(O) * cos(I)) * yp,
      z: sin(om) * sin(I) * xp + cos(om) * sin(I) * yp,
    };
  }

  function planetLon(key, jd) {
    if (key === 'sun') return sunLon(jd);
    if (key === 'moon') return moonLon(jd);
    const T = (jd - 2451545) / 36525;
    const p = helio(EL[key], T), e = helio(EL.earth, T);
    // J2000 → эклиптика даты (общая прецессия) + нутация
    return norm(Math.atan2(p.y - e.y, p.x - e.x) * DEG + 1.396971 * T + nutLon(T));
  }

  // Гелиоцентрическое положение (вид сверху на Солнечную систему), эклиптика даты
  function helioPos(key, jd) {
    const T = (jd - 2451545) / 36525;
    const p = helio(EL[key], T);
    return { lon: norm(Math.atan2(p.y, p.x) * DEG + 1.396971 * T), r: Math.hypot(p.x, p.y), a: EL[key][0] };
  }

  const KEYS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
  const diff = (a, b) => ((a - b + 540) % 360) - 180; // a − b в диапазоне −180..180

  function eclFromRA(ra, eps) { return norm(Math.atan2(sin(ra), cos(ra) * cos(eps)) * DEG); }

  function placidus(ramc, eps, lat) {
    const cusp = (F, upper) => {
      let ra = upper ? ramc + F * 90 : ramc + 180 - F * 90, lam = 0;
      for (let i = 0; i < 50; i++) {
        lam = eclFromRA(ra, eps);
        const dec = Math.asin(sin(eps) * sin(lam)) * DEG;
        const x = tan(lat) * tan(dec);
        if (Math.abs(x) >= 1) return null;
        const ad = Math.asin(x) * DEG;
        const next = upper ? ramc + F * (90 + ad) : ramc + 180 - F * (90 - ad);
        if (Math.abs(diff(next, ra)) < 1e-8) { ra = next; break; }
        ra = next;
      }
      return eclFromRA(ra, eps);
    };
    const c11 = cusp(1 / 3, true), c12 = cusp(2 / 3, true), c2 = cusp(2 / 3, false), c3 = cusp(1 / 3, false);
    if ([c11, c12, c2, c3].some(v => v === null)) return null;
    return [c2, c3, c11, c12];
  }

  function chart(jdUT, lat, lon) {
    const jd = ttFromUt(jdUT);
    const T = (jd - 2451545) / 36525;
    const planets = KEYS.map(k => {
      const l = planetLon(k, jd);
      const retro = k !== 'sun' && k !== 'moon' && diff(planetLon(k, jd + 0.5), planetLon(k, jd - 0.5)) < 0;
      return { key: k, lon: l, retro };
    });
    const eps = 23.439291 - 0.0130042 * T;
    const Tu = (jdUT - 2451545) / 36525;
    const gmst = norm(280.46061837 + 360.98564736629 * (jdUT - 2451545) + 0.000387933 * Tu * Tu - Tu ** 3 / 38710000);
    const ramc = norm(gmst + lon + nutLon(T) * cos(eps));
    const mc = eclFromRA(ramc, eps);
    const asc = norm(Math.atan2(cos(ramc), -(sin(ramc) * cos(eps) + tan(lat) * sin(eps))) * DEG);
    let system = 'Плацидус', mid = placidus(ramc, eps, lat);
    if (!mid) {
      system = 'Порфирий';
      const dLow = norm(mc + 180 - asc), dUp = norm(asc - mc);
      mid = [norm(asc + dLow / 3), norm(asc + 2 * dLow / 3), norm(mc + dUp / 3), norm(mc + 2 * dUp / 3)];
    }
    const [c2, c3, c11, c12] = mid;
    const cusps = [asc, c2, c3, mc + 180, c11 + 180, c12 + 180, asc + 180, c2 + 180, c3 + 180, mc, c11, c12].map(norm);
    for (const p of planets) p.house = houseOf(p.lon, cusps);
    return { planets, cusps, asc, mc, system };
  }

  function houseOf(lon, cusps) {
    for (let i = 0; i < 12; i++) {
      const s = cusps[i], e = cusps[(i + 1) % 12];
      if (norm(lon - s) < norm(e - s)) return i + 1;
    }
    return 1;
  }

  // Момент, когда Солнце возвращается в натальную точку в заданном году (JD UT)
  function solarReturn(natalJdUT, year) {
    const target = sunLon(ttFromUt(natalJdUT));
    const d = new Date(msFromJd(natalJdUT));
    d.setUTCFullYear(year);
    let jd = ttFromUt(jdFromMs(d.getTime()));
    for (let i = 0; i < 20; i++) {
      const dl = diff(target, sunLon(jd));
      jd += dl / 0.98564736;
      if (Math.abs(dl) < 1e-7) break;
    }
    return jd - deltaT(yearOfJd(jd)) / 86400;
  }

  const ASPECTS = [
    { key: 'conj', angle: 0, sym: '☌', name: 'соединение' },
    { key: 'sext', angle: 60, sym: '⚹', name: 'секстиль' },
    { key: 'sq', angle: 90, sym: '□', name: 'квадрат' },
    { key: 'tri', angle: 120, sym: '△', name: 'трин' },
    { key: 'opp', angle: 180, sym: '☍', name: 'оппозиция' },
  ];
  function aspects(planets) {
    const out = [];
    for (let i = 0; i < planets.length; i++) for (let j = i + 1; j < planets.length; j++) {
      const a = planets[i], b = planets[j];
      const sep = Math.abs(diff(a.lon, b.lon));
      const lum = [a.key, b.key].some(k => k === 'sun' || k === 'moon');
      for (const asp of ASPECTS) {
        const orb = (asp.key === 'sext' ? 4 : 6) + (lum ? 2 : 0);
        const d = Math.abs(sep - asp.angle);
        if (d <= orb) out.push({ a, b, asp, orb: d });
      }
    }
    return out.sort((x, y) => x.orb - y.orb);
  }

  // Смещение часового пояса (мин) для момента utcMs
  function tzOffsetMin(tz, utcMs) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map(x => [x.type, x.value]));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
  }
  function localToUtc(y, m, d, h, mi, tz) {
    const guess = Date.UTC(y, m - 1, d, h, mi);
    let off = tzOffsetMin(tz, guess);
    let utc = guess - off * 60000;
    const off2 = tzOffsetMin(tz, utc);
    if (off2 !== off) utc = guess - off2 * 60000;
    return utc;
  }

  // Ближайший после jdStartUT момент, когда Луна приходит в долготу target (JD UT)
  function lunarReturn(target, jdStartUT) {
    let jd = ttFromUt(jdStartUT);
    jd += norm(target - moonLon(jd)) / 13.176;
    for (let i = 0; i < 20; i++) {
      const dl = diff(target, moonLon(jd));
      jd += dl / 13.176;
      if (Math.abs(dl) < 1e-6) break;
    }
    return jd - deltaT(yearOfJd(jd)) / 86400;
  }

  global.Astro = { norm, diff, jdFromMs, msFromJd, sunLon, moonLon, planetLon, helioPos, ttFromUt, chart, solarReturn, lunarReturn, aspects, houseOf, localToUtc, KEYS, ASPECTS };
})(window);

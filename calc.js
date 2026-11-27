// 계산 로직. 브라우저와 node 시험이 같은 코드를 씁니다. 날짜는 시간대 영향 없는 정수 계산.
(function (root) {
  'use strict';

  // 2026년 기준값 (출처와 확인일은 각 페이지 '근거'에 적음)
  var Y = {
    year: 2026,
    minWage: 10320,                 // 최저임금 시급
    ubMin: 66048, ubMax: 68100,     // 실업급여 1일 하한·상한 (2026-01-01 이후 퇴사자)
    pension: 0.0475,                // 국민연금 근로자
    pensionBaseMin: 400000, pensionBaseMax: 6370000, // 기준소득월액 하한·상한 (2025.7~2026.6)
    health: 0.03595,                // 건강보험 근로자
    care: 0.1314,                   // 장기요양 = 건강보험료의 13.14%
    employ: 0.009                   // 고용보험 근로자
  };

  var DAY = 86400000;
  function parse(s) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || '').trim());
    if (!m) return null;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    var d = new Date(t);
    if (d.getUTCMonth() !== +m[2] - 1) return null;
    return { y: +m[1], m: +m[2], d: +m[3], t: t };
  }
  function days(a, b) { return Math.round((b.t - a.t) / DAY); }
  function addDays(a, n) { var d = new Date(a.t + n * DAY); return parse(d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate()); }
  function addMonths(a, n) {
    var idx = a.y * 12 + (a.m - 1) + n, y = Math.floor(idx / 12), m = idx - y * 12 + 1;
    var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return parse(y + '-' + m + '-' + Math.min(a.d, last));
  }
  // 10원 미만 절사. 소수 계산 오차(26999.9999…)를 먼저 정리합니다.
  function floor10(x) { return Math.floor(Math.round(x * 100) / 100 / 10) * 10; }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[, 원%]/g, '')); return isFinite(n) ? n : NaN; }
  function need(cond, msg) { if (!cond) throw new Error(msg); }

  // 퇴직금: 평균임금 × 30 × 재직일수 / 365
  function severance(i) {
    var start = parse(i.start), last = parse(i.last);
    need(start && last, '입사일과 마지막 근무일을 YYYY-MM-DD로 넣어 주세요.');
    var end = addDays(last, 1); // 퇴직일 = 마지막 근무일 다음 날
    var served = days(start, end);
    need(served > 0, '마지막 근무일이 입사일보다 빠릅니다.');
    var pay3 = num(i.pay3), bonus = num(i.bonus) || 0, leave = num(i.leave) || 0;
    need(pay3 > 0, '최근 3개월 임금 총액을 넣어 주세요.');
    var d3 = days(addMonths(end, -3), end);
    var avgDaily = (pay3 + bonus * 3 / 12 + leave * 3 / 12) / d3;
    var eligible = served >= 365;
    var amount = eligible ? Math.floor(avgDaily * 30 * served / 365) : 0;
    return {
      eligible: eligible, servedDays: served, days3: d3, avgDaily: Math.floor(avgDaily), amount: amount,
      note: eligible ? '' : '계속근로기간이 1년 미만이면 퇴직금이 생기지 않습니다.'
    };
  }

  // 실업급여(구직급여): 평균임금 60%, 하한·상한, 소정급여일수
  var UB_DAYS = { under50: [120, 150, 180, 210, 240], over50: [120, 180, 210, 240, 270] };
  function unemployment(i) {
    var pay3 = num(i.pay3), d3 = num(i.days3) || 92, yrs = num(i.years), age = num(i.age);
    need(pay3 > 0, '퇴사 전 3개월 임금 총액을 넣어 주세요.');
    need(yrs >= 0 && age > 0, '가입 기간과 나이를 넣어 주세요.');
    var hours = num(i.hours) || 8;
    var avgDaily = pay3 / d3;
    var daily = avgDaily * 0.6;
    var min = Math.floor(Y.ubMin * Math.min(hours, 8) / 8);
    var capped = daily > Y.ubMax ? 'max' : daily < min ? 'min' : '';
    daily = Math.floor(Math.min(Y.ubMax, Math.max(min, daily)));
    var band = yrs < 1 ? 0 : yrs < 3 ? 1 : yrs < 5 ? 2 : yrs < 10 ? 3 : 4;
    var period = (age >= 50 || i.disabled ? UB_DAYS.over50 : UB_DAYS.under50)[band];
    return { avgDaily: Math.floor(avgDaily), daily: daily, capped: capped, period: period, total: daily * period, monthly: daily * 30 };
  }

  // 4대보험 근로자 부담 (월)
  function insurance(i) {
    var pay = num(i.pay);
    need(pay > 0, '월 보수(비과세 제외)를 넣어 주세요.');
    var base = Math.min(Y.pensionBaseMax, Math.max(Y.pensionBaseMin, Math.floor(pay / 1000) * 1000));
    var p = floor10(base * Y.pension);
    var h = floor10(pay * Y.health);
    var c = floor10(h * Y.care);
    var e = floor10(pay * Y.employ);
    return { pension: p, health: h, care: c, employ: e, total: p + h + c + e, net: pay - (p + h + c + e) };
  }

  // 주휴수당
  function weeklyHoliday(i) {
    var wage = num(i.wage), hours = num(i.hours);
    need(wage > 0 && hours > 0, '시급과 1주 근무시간을 넣어 주세요.');
    var eligible = hours >= 15;
    var hh = eligible ? Math.min(hours, 40) / 40 * 8 : 0;
    var weekly = Math.round(hh * wage);
    var monthHours = (Math.min(hours, 40) + hh) * 365 / 7 / 12;
    return { eligible: eligible, holidayHours: Math.round(hh * 100) / 100, weekly: weekly, monthly: Math.round(monthHours * wage), monthHours: Math.round(monthHours * 10) / 10, belowMin: wage < Y.minWage };
  }

  // 시급 ↔ 월급 (주 40시간 = 월 209시간)
  function wageConvert(i) {
    var hours = num(i.hours) || 40;
    var mh = (Math.min(hours, 40) + Math.min(hours, 40) / 40 * 8) * 365 / 7 / 12;
    mh = Math.round(mh);
    if (i.mode === 'monthly') {
      var monthly = num(i.amount); need(monthly > 0, '월급을 넣어 주세요.');
      var h = Math.floor(monthly / mh);
      return { monthHours: mh, hourly: h, monthly: monthly, annual: monthly * 12, belowMin: h < Y.minWage };
    }
    var wage = num(i.amount); need(wage > 0, '시급을 넣어 주세요.');
    return { monthHours: mh, hourly: wage, monthly: wage * mh, annual: wage * mh * 12, belowMin: wage < Y.minWage };
  }

  // 연차 (근로기준법 제60조)
  function annualLeave(i) {
    var start = parse(i.start), ref = parse(i.ref);
    need(start && ref, '입사일과 기준일을 넣어 주세요.');
    var served = days(start, ref);
    need(served >= 0, '기준일이 입사일보다 빠릅니다.');
    var yrs = 0; while (days(start, addMonths(start, 12 * (yrs + 1))) <= served) yrs++;
    var months = 0; while (days(start, addMonths(start, months + 1)) <= served) months++;
    var firstYear = Math.min(11, yrs >= 1 ? 11 : months);
    var thisYear = yrs >= 1 ? Math.min(25, 15 + Math.floor((yrs - 1) / 2)) : 0;
    return { years: yrs, months: months, firstYear: firstYear, thisYear: thisYear };
  }

  // 대출 이자
  function loan(i) {
    var P = num(i.principal), rate = num(i.rate) / 100, n = Math.round(num(i.months));
    need(P > 0 && rate >= 0 && n > 0, '대출금, 연 이자율, 기간(개월)을 넣어 주세요.');
    var r = rate / 12, type = i.type || 'annuity';
    if (type === 'equalPrincipal') {
      var first = Math.round(P / n + P * r);
      var interest = Math.round(P * r * (n + 1) / 2);
      return { first: first, last: Math.round(P / n + (P / n) * r), interest: interest, total: P + interest };
    }
    if (type === 'bullet') {
      var mi = Math.round(P * r);
      return { first: mi, last: mi + P, interest: mi * n, total: P + mi * n };
    }
    var pay = r === 0 ? P / n : P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
    pay = Math.round(pay);
    return { first: pay, last: pay, interest: pay * n - P, total: pay * n };
  }

  // 부가세
  function vat(i) {
    var a = num(i.amount); need(a > 0, '금액을 넣어 주세요.');
    if (i.mode === 'total') { var supply = Math.round(a / 1.1); return { supply: supply, tax: a - supply, total: a }; }
    var tax = Math.round(a * 0.1); return { supply: a, tax: tax, total: a + tax };
  }

  // 평수
  var PYEONG = 3.305785;
  function area(i) {
    var v = num(i.value); need(v > 0, '숫자를 넣어 주세요.');
    if (i.mode === 'pyeong') return { sqm: Math.round(v * PYEONG * 100) / 100, pyeong: v };
    return { sqm: v, pyeong: Math.round(v / PYEONG * 100) / 100 };
  }

  // 만 나이
  function age(i) {
    var b = parse(i.birth), ref = parse(i.ref);
    need(b && ref, '생년월일과 기준일을 넣어 주세요.');
    need(ref.t >= b.t, '기준일이 생일보다 빠릅니다.');
    var man = ref.y - b.y - ((ref.m < b.m || (ref.m === b.m && ref.d < b.d)) ? 1 : 0);
    var next = addMonths(b, (man + 1) * 12);
    return { man: man, yearAge: ref.y - b.y, toNext: days(ref, next) };
  }

  // 글자수 세기 (자기소개서 기준: 한글 등은 2바이트)
  function charCount(i) {
    var s = String(i.text || '');
    need(s.length > 0, '글자를 넣어 주세요.');
    var chars = Array.from ? Array.from(s) : s.split('');
    var noSpace = chars.filter(function (c) { return !/\s/.test(c); }).length;
    var bytes2 = 0, utf8 = 0;
    chars.forEach(function (c) {
      var code = c.codePointAt ? c.codePointAt(0) : c.charCodeAt(0);
      bytes2 += code > 127 ? 2 : (c === '\n' ? 2 : 1);
      utf8 += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    });
    var words = s.trim() ? s.trim().split(/\s+/).length : 0;
    return { withSpace: chars.length, noSpace: noSpace, bytes: bytes2, utf8: utf8, words: words, lines: s.split('\n').length };
  }

  // D-day·날짜 계산
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  function fmtDate(d) { return d.y + '-' + (d.m < 10 ? '0' : '') + d.m + '-' + (d.d < 10 ? '0' : '') + d.d + ' (' + DOW[new Date(d.t).getUTCDay()] + ')'; }
  function dday(i) {
    var a = parse(i.from);
    need(a, '기준 날짜를 넣어 주세요.');
    if (i.mode === 'add') {
      var n = Math.round(num(i.n)); need(isFinite(n), '더할 일수를 넣어 주세요.');
      var r = addDays(a, n);
      return { result: fmtDate(r), dlabel: n >= 0 ? n + '일 뒤' : (-n) + '일 전' };
    }
    var b = parse(i.to); need(b, '목표 날짜를 넣어 주세요.');
    var diff = days(a, b);
    return { diff: diff, dday: diff === 0 ? 'D-DAY' : diff > 0 ? 'D-' + diff : 'D+' + (-diff), inclusive: Math.abs(diff) + 1, weeks: Math.floor(Math.abs(diff) / 7) + '주 ' + (Math.abs(diff) % 7) + '일', target: fmtDate(b) };
  }

  // 부동산 중개보수(주택) 상한 — 2021.10.19 시행 요율표
  var SALE = [[50e6, 0.006, 250000], [200e6, 0.005, 800000], [900e6, 0.004, 0], [1200e6, 0.005, 0], [1500e6, 0.006, 0], [Infinity, 0.007, 0]];
  var LEASE = [[50e6, 0.005, 200000], [100e6, 0.004, 300000], [600e6, 0.003, 0], [1200e6, 0.004, 0], [1500e6, 0.005, 0], [Infinity, 0.006, 0]];
  function brokerage(i) {
    var type = i.type || 'sale';
    var price;
    if (type === 'monthly') {
      var dep = num(i.deposit) || 0, rent = num(i.rent) || 0;
      need(rent > 0, '보증금과 월세를 넣어 주세요.');
      price = dep + rent * 100;
      if (price < 50e6) price = dep + rent * 70;
    } else {
      price = num(i.price); need(price > 0, '거래금액을 넣어 주세요.');
    }
    var table = type === 'sale' ? SALE : LEASE, row = null;
    for (var k = 0; k < table.length; k++) if (price < table[k][0]) { row = table[k]; break; }
    var fee = Math.floor(price * row[1]);
    if (row[2] && fee > row[2]) fee = row[2];
    return { dealPrice: price, rate: (row[1] * 100).toFixed(1) + '%', fee: fee, feeVat: Math.floor(fee * 1.1), limit: row[2] ? Number(row[2]).toLocaleString('ko-KR') + '원' : '한도 없음' };
  }

  // 전월세 전환
  function rentConvert(i) {
    var rate = num(i.rate) / 100;
    need(rate > 0, '전환율(%)을 넣어 주세요.');
    if (i.mode === 'toJeonse') {
      var dep = num(i.deposit) || 0, rent = num(i.rent);
      need(rent > 0, '월세를 넣어 주세요.');
      return { jeonse: Math.round(dep + rent * 12 / rate), rent: rent, deposit: dep };
    }
    var j = num(i.jeonse), d = num(i.deposit) || 0;
    need(j > 0 && d < j, '전세보증금과 (더 적은) 월세보증금을 넣어 주세요.');
    return { rent: Math.round((j - d) * rate / 12), jeonse: j, deposit: d };
  }

  // 퍼센트
  function percent(i) {
    var a = num(i.a), b = num(i.b);
    need(isFinite(a) && isFinite(b), '두 숫자를 넣어 주세요.');
    var r2 = function (x) { return Math.round(x * 100) / 100; };
    if (i.mode === 'ratio') { need(b !== 0, '전체 값은 0이 될 수 없습니다.'); return { answer: r2(a / b * 100) + '%' }; }
    if (i.mode === 'change') { need(a !== 0, '처음 값은 0이 될 수 없습니다.'); var c = (b - a) / a * 100; return { answer: (c > 0 ? '+' : '') + r2(c) + '%', diff: r2(b - a) }; }
    return { answer: String(r2(a * b / 100)) };
  }

  // BMI (대한비만학회 기준)
  function bmi(i) {
    var h = num(i.height) / 100, w = num(i.weight);
    need(h > 0.5 && w > 0, '키(cm)와 몸무게(kg)를 넣어 주세요.');
    var v = Math.round(w / (h * h) * 10) / 10;
    var lv = v < 18.5 ? '저체중' : v < 23 ? '정상' : v < 25 ? '비만 전단계(과체중)' : v < 30 ? '1단계 비만' : v < 35 ? '2단계 비만' : '3단계 비만(고도비만)';
    return { bmi: String(v), level: lv, normal: Math.round(18.5 * h * h * 10) / 10 + ' ~ ' + Math.round(22.9 * h * h * 10) / 10 + 'kg' };
  }

  // 예금·적금 이자 (이자소득세 15.4% = 소득세 14% + 지방소득세 1.4%)
  var TAX = { normal: 0.154, free: 0, preferential: 0.095 };
  function taxOf(interest, kind) {
    var rate = TAX[kind] === undefined ? TAX.normal : TAX[kind];
    if (!rate) return 0;
    if (kind === 'preferential') return Math.floor(interest * 0.09 / 10) * 10 + Math.floor(interest * 0.005 / 10) * 10;
    return Math.floor(interest * 0.14 / 10) * 10 + Math.floor(interest * 0.014 / 10) * 10;
  }
  function deposit(i) {
    var P = num(i.principal), r = num(i.rate) / 100, n = Math.round(num(i.months));
    need(P > 0 && r >= 0 && n > 0, '예치금, 연 이자율, 기간(개월)을 넣어 주세요.');
    var interest = i.compound === 'monthly' ? P * (Math.pow(1 + r / 12, n) - 1) : P * r * n / 12;
    interest = Math.floor(interest);
    var tax = taxOf(interest, i.tax);
    return { interest: interest, tax: tax, net: interest - tax, total: P + interest - tax };
  }
  function savings(i) {
    var M = num(i.monthly), r = num(i.rate) / 100, n = Math.round(num(i.months));
    need(M > 0 && r >= 0 && n > 0, '월 납입액, 연 이자율, 기간(개월)을 넣어 주세요.');
    var interest = 0;
    if (i.compound === 'monthly') { for (var k = 1; k <= n; k++) interest += M * (Math.pow(1 + r / 12, k) - 1); }
    else interest = M * (r / 12) * n * (n + 1) / 2;
    interest = Math.floor(interest);
    var tax = taxOf(interest, i.tax);
    return { paid: M * n, interest: interest, tax: tax, net: interest - tax, total: M * n + interest - tax };
  }

  // 연차수당: 미사용 연차 × 1일 통상임금
  function leavePay(i) {
    var d = num(i.days);
    need(d > 0, '남은(쓰지 못한) 연차 일수를 넣어 주세요.');
    var hourly = i.mode === 'monthly' ? num(i.amount) / 209 : num(i.amount);
    need(hourly > 0, '통상임금(월급 또는 시급)을 넣어 주세요.');
    var hours = num(i.hours) || 8;
    var daily = Math.round(hourly * hours);
    return { daily: daily, hourly: Math.round(hourly), pay: Math.round(daily * d) };
  }

  // 근무시간 (하루): 연장(8시간 초과)·야간(22~06시) 시간과 가산 일당
  function hm(s) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); return m ? (+m[1]) * 60 + (+m[2]) : NaN; }
  function workHours(i) {
    var a = hm(i.start), b = hm(i.end);
    need(isFinite(a) && isFinite(b), '출근·퇴근 시각을 09:00 처럼 넣어 주세요.');
    if (b <= a) b += 24 * 60; // 밤을 넘기는 근무
    var brk = num(i.breakMin) || 0;
    var total = b - a - brk;
    need(total > 0, '휴게시간이 근무시간보다 깁니다.');
    var night = 0;
    for (var t = a; t < b; t++) { var h = Math.floor((t % 1440) / 60); if (h >= 22 || h < 6) night++; }
    night = Math.max(0, night - Math.max(0, brk - (b - a - night))); // 휴게는 주간에서 먼저 뺀다고 가정
    var over = Math.max(0, total - 8 * 60);
    var out = { hours: Math.round(total / 6) / 10, over: Math.round(over / 6) / 10, night: Math.round(night / 6) / 10 };
    var w = num(i.wage);
    if (w > 0) {
      out.basePay = Math.round(w * total / 60);
      out.extra = i.small === 'yes' ? 0 : Math.round(w * 0.5 * (over + night) / 60);
      out.dayPay = out.basePay + out.extra;
    }
    return out;
  }

  // 전역일: 입대일 + 복무기간(개월) − 1일
  var SERVICE = { army: 18, marine: 18, navy: 20, airforce: 21, social: 21 };
  function discharge(i) {
    var a = parse(i.enlist); need(a, '입대일을 넣어 주세요.');
    var months = SERVICE[i.branch] || 18;
    var end = addDays(addMonths(a, months), -1);
    var today = parse(i.today) || end;
    var total = days(a, end) + 1, done = Math.max(0, Math.min(total, days(a, today) + 1));
    var left = days(today, end);
    return { end: fmtDate(end), months: months + '개월', left: left > 0 ? left : 0, served: done, percent: Math.round(done / total * 1000) / 10 + '%', dday: left > 0 ? 'D-' + left : left === 0 ? 'D-DAY' : '전역 완료' };
  }

  // 출산 예정일: 마지막 생리 시작일 + 280일 (네겔레 법칙)
  function dueDate(i) {
    var l = parse(i.lmp); need(l, '마지막 생리 시작일을 넣어 주세요.');
    var cycle = num(i.cycle) || 28;
    need(cycle >= 20 && cycle <= 45, '생리 주기는 20~45일 사이로 넣어 주세요.');
    var due = addDays(l, 280 + (cycle - 28));
    var t = parse(i.today) || l;
    var g = days(l, t) - (cycle - 28);
    return { due: fmtDate(due), week: g >= 0 ? Math.floor(g / 7) + '주 ' + (g % 7) + '일' : '-', left: Math.max(0, days(t, due)) };
  }

  // 학점(평점) 계산: 과목별 학점·성적
  var GRADE45 = { 'A+': 4.5, 'A0': 4.0, 'A': 4.0, 'B+': 3.5, 'B0': 3.0, 'B': 3.0, 'C+': 2.5, 'C0': 2.0, 'C': 2.0, 'D+': 1.5, 'D0': 1.0, 'D': 1.0, 'F': 0 };
  function gpa(i) {
    var lines = String(i.list || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    need(lines.length > 0, '한 줄에 "학점 성적" 형식으로 넣어 주세요. 예: 3 A+');
    var cred = 0, pts = 0, majorDen = 0, pass = 0;
    lines.forEach(function (ln, k) {
      var m = /^(\d+(?:\.\d+)?)\s+([A-Da-d][+0]?|[Ff]|[Pp])$/.exec(ln.replace(/\s+/g, ' '));
      need(m, (k + 1) + '번째 줄을 "3 A+" 형식으로 고쳐 주세요.');
      var c = +m[1], g = m[2].toUpperCase();
      if (g === 'P') { pass += c; return; }
      cred += c; pts += c * GRADE45[g];
    });
    need(cred > 0, '평점에 들어가는 과목이 없습니다.');
    var avg = pts / cred;
    return { gpa45: (Math.round(avg * 100) / 100).toFixed(2), gpa43: (Math.round(avg / 4.5 * 4.3 * 100) / 100).toFixed(2), credits: cred + pass, percent: Math.round(avg / 4.5 * 1000) / 10 + '점 (단순 환산)' };
  }

  // 기초대사량(미플린-세인트 지어 공식)과 하루 필요 열량
  var ACT = { sit: 1.2, light: 1.375, mid: 1.55, high: 1.725 };
  function bmr(i) {
    var w = num(i.weight), h = num(i.height), a = num(i.age);
    need(w > 0 && h > 0 && a > 0, '몸무게, 키, 나이를 넣어 주세요.');
    var v = 10 * w + 6.25 * h - 5 * a + (i.sex === 'f' ? -161 : 5);
    var tdee = v * (ACT[i.activity] || 1.2);
    return { bmr: Math.round(v), tdee: Math.round(tdee), diet: Math.round(tdee - 500) };
  }

  var api = { Y: Y, parse: parse, discharge: discharge, dueDate: dueDate, gpa: gpa, bmr: bmr, deposit: deposit, savings: savings, leavePay: leavePay, workHours: workHours, charCount: charCount, dday: dday, brokerage: brokerage, rentConvert: rentConvert, percent: percent, bmi: bmi, severance: severance, unemployment: unemployment, insurance: insurance, weeklyHoliday: weeklyHoliday, wageConvert: wageConvert, annualLeave: annualLeave, loan: loan, vat: vat, area: area, age: age };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(this);

// 연봉 실수령액 계산기 v2: 입력 즉시 계산 · 계산 근거 · A/B 비교 · 역산 · 링크 공유 · 기기 내 저장
// 입력값은 이 브라우저 밖으로 보내지 않는다. 링크에는 #해시로 연봉·비과세만 담고 가족 정보는 넣지 않는다.
(function () {
  'use strict';
  var C = window.Calc;
  var form = document.getElementById('calc');
  var box = document.getElementById('result');
  var $ = function (id) { return document.getElementById(id); };
  var won = function (v) { return Math.round(v).toLocaleString('ko-KR') + '원'; };
  var digits = function (s) { return String(s || '').replace(/[^\d]/g, ''); };
  var KEY = 'ddok_salary_v2';

  // ---------- 화면 다시 짜기 ----------
  form.querySelector('button[type=submit]').hidden = true;
  form.parentNode.insertBefore(box, form); // 결과를 입력 위로
  var adv = document.createElement('details');
  adv.className = 'adv';
  adv.innerHTML = '<summary>세부 조건 (비과세 · 자녀 · 원천징수 비율)</summary>';
  ['nontax', 'kids', 'rate'].forEach(function (id) {
    var input = $('f-' + id), label = form.querySelector('label[for="f-' + id + '"]');
    if (label) adv.appendChild(label);
    if (input) adv.appendChild(input);
  });
  form.appendChild(adv);
  $('f-family').setAttribute('inputmode', 'numeric');
  $('f-kids').setAttribute('inputmode', 'numeric');

  var note = document.createElement('p');
  note.className = 'trust';
  note.textContent = '국세청 근로소득 간이세액표 · 2026년 4대보험 요율 · 입력값은 이 기기에서만 계산·저장됩니다';
  form.parentNode.insertBefore(note, box);

  var tools = document.createElement('div');
  tools.className = 'card tools';
  tools.innerHTML =
    '<div class="tabs" role="tablist">' +
    '<button type="button" data-tab="cmp" class="on">다른 연봉과 비교</button>' +
    '<button type="button" data-tab="rev">목표 실수령액 → 필요 연봉</button></div>' +
    '<div data-pane="cmp"><label for="f-b">비교할 연봉 (B안)</label><input id="f-b" type="text" inputmode="numeric" placeholder="예: 40,000,000"><div id="cmpOut"></div></div>' +
    '<div data-pane="rev" hidden><label for="f-target">받고 싶은 월 실수령액</label><input id="f-target" type="text" inputmode="numeric" placeholder="예: 3,000,000"><div id="revOut"></div></div>' +
    '<div class="share"><button type="button" id="copyLink" class="ghost">이 계산 링크 복사</button> <button type="button" id="cardBtn" class="ghost">결과 카드 이미지 저장</button><span id="copyMsg" class="note"></span></div>';
  form.parentNode.insertBefore(tools, form.nextSibling);

  Array.prototype.forEach.call(document.querySelectorAll('input[data-money], #f-b, #f-target'), function (el) {
    el.addEventListener('input', function () {
      var d = digits(el.value);
      el.value = d ? Number(d).toLocaleString('ko-KR') : '';
    });
  });

  // ---------- 입력 읽기·복원 ----------
  function read() {
    return {
      annual: digits($('f-annual').value),
      nontax: digits($('f-nontax').value),
      family: digits($('f-family').value) || '1',
      kids: digits($('f-kids').value) || '0',
      rate: $('f-rate').value || '100'
    };
  }
  function setMoney(id, v) { if (v) $(id).value = Number(v).toLocaleString('ko-KR'); }
  function restore() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { saved = {}; }
    var h = {};
    location.hash.replace(/^#/, '').split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) h[p[0]] = digits(p[1]); });
    var hasHash = !!h.a;
    setMoney('f-annual', hasHash ? h.a : saved.annual);
    if (hasHash && h.nt !== undefined) setMoney('f-nontax', h.nt); else if (saved.nontax) setMoney('f-nontax', saved.nontax);
    if (!hasHash) {
      if (saved.family) $('f-family').value = saved.family;
      if (saved.kids) $('f-kids').value = saved.kids;
      if (saved.rate) $('f-rate').value = saved.rate;
    }
    setMoney('f-b', hasHash ? h.b : saved.b);
    if (saved.kids > 0 || (saved.rate && saved.rate !== '100')) adv.open = true;
  }
  function save(i) {
    try { localStorage.setItem(KEY, JSON.stringify({ annual: i.annual, nontax: i.nontax, family: i.family, kids: i.kids, rate: i.rate, b: digits($('f-b').value) })); } catch (e) { /* 사생활 모드 등 */ }
  }

  // ---------- 계산·표시 ----------
  var lastA = null;
  function render() {
    var i = read();
    save(i);
    if (!i.annual) {
      box.hidden = false;
      box.innerHTML = '<p class="note">연봉을 넣으면 바로 계산됩니다. 예: 36,000,000</p>';
      $('cmpOut').innerHTML = ''; lastA = null; window.SALARY_CARD = null;
      return;
    }
    var e;
    try { e = C.salaryExplain(i); } catch (err) { box.hidden = false; box.innerHTML = '<p class="warn">' + err.message + '</p>'; return; }
    var r = e.result;
    lastA = r;
    var pct = (r.netYear / Number(i.annual) * 100).toFixed(1);
    var rows = e.lines.map(function (l) { return '<tr><th>' + l[0] + '<small>' + l[1] + '</small></th><td>' + won(l[2]) + '</td></tr>'; }).join('');
    box.hidden = false;
    box.innerHTML =
      '<p class="big">월 실수령액 <strong>' + won(r.net) + '</strong></p>' +
      '<p>1년 ' + won(r.netYear) + ' · 세전 대비 ' + pct + '% · 매달 공제 ' + won(r.deduct) + '</p>' +
      '<div class="bar" aria-hidden="true">' +
      seg(r.net, r.monthly, 'net') + seg(r.pension + r.health + r.care + r.employ, r.monthly, 'ins') + seg(r.incomeTax + r.localTax, r.monthly, 'tax') + '</div>' +
      '<p class="legend"><span class="k net"></span>실수령 <span class="k ins"></span>4대보험 <span class="k tax"></span>세금</p>' +
      '<details class="why"><summary>이 금액이 나온 계산 근거 보기</summary><table class="explain">' + rows + '</table>' +
      '<p class="note">근거: 소득세법 시행령 [별표 2] 근로소득 간이세액표, 국민연금법·국민건강보험법·고용보험법 2026년 요율. 계산 참고용이며 실제 급여는 회사 지급 기준과 연말정산에 따라 달라질 수 있습니다.</p></details>';
    window.SALARY_CARD = { title: '연봉 ' + Number(i.annual).toLocaleString('ko-KR') + '원', net: won(r.net), year: won(r.netYear), deduct: won(r.deduct), rate: pct, basis: '2026년 4대보험·간이세액표 · 비과세 ' + won(i.nontax || 0) + ' · 가족 ' + i.family + '명 기준' };
    renderCmp(i);
    renderRev(i);
  }
  function seg(v, total, cls) { var w = total > 0 ? Math.max(0, v / total * 100) : 0; return '<span class="' + cls + '" style="width:' + w.toFixed(1) + '%"></span>'; }

  function renderCmp(i) {
    var b = digits($('f-b').value);
    var out = $('cmpOut');
    if (!b || !lastA) { out.innerHTML = ''; return; }
    var rb;
    try { rb = C.salary({ annual: b, nontax: i.nontax, family: i.family, kids: i.kids, rate: i.rate }); } catch (e) { out.innerHTML = '<p class="warn">' + e.message + '</p>'; return; }
    var a = lastA, dm = rb.net - a.net, dy = rb.netYear - a.netYear, gross = Number(b) - Number(i.annual);
    var keep = gross !== 0 ? (dy / gross * 100).toFixed(1) : '0';
    var sign = function (v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + won(Math.abs(v)); };
    out.innerHTML =
      '<table class="tbl cmp"><tr><th></th><th>A안 (지금)</th><th>B안</th><th>차이</th></tr>' +
      '<tr><td>연봉</td><td>' + won(i.annual) + '</td><td>' + won(b) + '</td><td>' + sign(gross) + '</td></tr>' +
      '<tr><td>월 실수령</td><td>' + won(a.net) + '</td><td>' + won(rb.net) + '</td><td><strong>' + sign(dm) + '</strong></td></tr>' +
      '<tr><td>연 실수령</td><td>' + won(a.netYear) + '</td><td>' + won(rb.netYear) + '</td><td>' + sign(dy) + '</td></tr>' +
      '<tr><td>월 공제</td><td>' + won(a.deduct) + '</td><td>' + won(rb.deduct) + '</td><td>' + sign(rb.deduct - a.deduct) + '</td></tr></table>' +
      (gross !== 0 ? '<p class="note">세전 차이 ' + sign(gross) + ' 중 실제 통장에 남는 차이는 ' + sign(dy) + '(약 ' + keep + '%)입니다. 같은 가족·비과세 조건 기준.</p>' : '');
  }

  function renderRev(i) {
    var t = digits($('f-target').value), out = $('revOut');
    if (!t) { out.innerHTML = ''; return; }
    try {
      var r = C.reverseSalary({ target: t, nontax: i.nontax, family: i.family, kids: i.kids, rate: i.rate });
      out.innerHTML = '<p class="big">필요한 연봉 <strong>' + won(r.annual) + '</strong></p><p class="note">이 연봉이면 월 실수령 ' + won(r.result.net) + '(세전 월 ' + won(r.result.monthly) + '). 지금 입력한 비과세·가족 조건 기준, 1만 원 단위.</p>' +
        '<button type="button" class="ghost" id="useRev">이 연봉을 B안으로 비교하기</button>';
      $('useRev').onclick = function () { setMoney('f-b', String(r.annual)); showTab('cmp'); render(); };
    } catch (e) { out.innerHTML = '<p class="warn">' + e.message + '</p>'; }
  }

  function showTab(name) {
    Array.prototype.forEach.call(tools.querySelectorAll('[data-tab]'), function (b) { b.classList.toggle('on', b.dataset.tab === name); });
    Array.prototype.forEach.call(tools.querySelectorAll('[data-pane]'), function (p) { p.hidden = p.dataset.pane !== name; });
  }
  tools.querySelector('.tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });

  $('copyLink').addEventListener('click', function () {
    var i = read(), b = digits($('f-b').value);
    var hash = '#a=' + i.annual + (i.nontax ? '&nt=' + i.nontax : '') + (b ? '&b=' + b : '');
    var url = location.origin + location.pathname + hash;
    history.replaceState(null, '', hash);
    var done = function () { $('copyMsg').textContent = ' 링크를 복사했어요 (가족 정보는 링크에 넣지 않았어요)'; };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { prompt('이 링크를 복사하세요', url); });
    else prompt('이 링크를 복사하세요', url);
  });

  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('submit', function (e) { e.preventDefault(); render(); });
  $('f-b').addEventListener('input', function () { renderCmp(read()); save(read()); });
  $('f-target').addEventListener('input', function () { renderRev(read()); });

  restore();
  render();
})();

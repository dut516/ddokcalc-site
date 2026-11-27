// 페이지 공통 동작: 입력을 읽어 계산하고 결과를 표로 보여 줍니다.
(function () {
  'use strict';
  var cfg = window.PAGE;
  var form = document.getElementById('calc');
  var box = document.getElementById('result');
  var fmt = {
    won: function (v) { return Number(v).toLocaleString('ko-KR') + '원'; },
    day: function (v) { return Number(v).toLocaleString('ko-KR') + '일'; },
    hour: function (v) { return Number(v).toLocaleString('ko-KR') + '시간'; },
    num: function (v) { return Number(v).toLocaleString('ko-KR'); },
    text: function (v) { return String(v); },
    str: function (v) { return String(v); }
  };
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  // 날짜 기본값, 금액 칸 천 단위 쉼표
  Array.prototype.forEach.call(form.querySelectorAll('input[data-today]'), function (el) { if (!el.value) el.value = today(); });
  Array.prototype.forEach.call(form.querySelectorAll('input[data-money]'), function (el) {
    el.addEventListener('input', function () {
      var digits = el.value.replace(/[^\d]/g, '');
      el.value = digits ? Number(digits).toLocaleString('ko-KR') : '';
    });
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var input = {};
    Array.prototype.forEach.call(form.elements, function (el) { if (el.name) input[el.name] = el.value; });
    try {
      var r = window.Calc[cfg.fn](input);
      var html = '<table>';
      cfg.out.forEach(function (o) {
        var v = r[o[0]];
        if (v === undefined || v === '') return;
        if (o[2] === 'text') { html += '<tr><td colspan="2" class="note">' + v + '</td></tr>'; return; }
        html += '<tr><th>' + o[1] + '</th><td>' + fmt[o[2]](v) + '</td></tr>';
      });
      html += '</table>';
      if (r.belowMin) html += '<p class="warn">2026년 최저시급(10,320원)보다 낮습니다.</p>';
      if (r.capped === 'max') html += '<p class="note">계산값이 상한을 넘어 1일 상한액이 적용됐습니다.</p>';
      if (r.capped === 'min') html += '<p class="note">계산값이 하한보다 낮아 1일 하한액이 적용됐습니다.</p>';
      if (r.eligible === false && cfg.fn === 'weeklyHoliday') html += '<p class="warn">1주 15시간 미만이면 주휴수당이 생기지 않습니다.</p>';
      box.innerHTML = html;
    } catch (err) {
      box.innerHTML = '<p class="warn">' + err.message + '</p>';
    }
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
})();

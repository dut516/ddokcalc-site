// 결과 카드: 계산 결과를 공유하기 좋은 이미지(PNG)로 저장. 출처(사이트 주소)가 카드에 남는다.
(function () {
  var c = window.SALARY_CARD;
  var btn = document.getElementById('cardBtn');
  if (!c || !btn) return;
  btn.addEventListener('click', function () {
    var W = 1080, H = 1080, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    var grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#eef4ff'); grad.addColorStop(1, '#ffffff');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1f5eff'; g.fillRect(0, 0, W, 16);
    var font = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
    g.textAlign = 'center';
    g.fillStyle = '#5b6472'; g.font = '600 44px ' + font;
    g.fillText(c.title + ' 실수령액', W / 2, 250);
    g.fillStyle = '#5b6472'; g.font = '500 40px ' + font;
    g.fillText('매달 받는 돈', W / 2, 390);
    g.fillStyle = '#111827'; g.font = '800 120px ' + font;
    g.fillText(c.net, W / 2, 530);
    g.fillStyle = '#374151'; g.font = '500 40px ' + font;
    g.fillText('1년 ' + c.year + ' · 세전 대비 ' + c.rate + '%', W / 2, 640);
    g.fillText('매달 공제 ' + c.deduct, W / 2, 700);
    g.fillStyle = '#6b7280'; g.font = '400 30px ' + font;
    g.fillText('2026년 4대보험·간이세액표 · 비과세 20만 원 · 본인 1명 기준', W / 2, 860);
    g.fillStyle = '#1f5eff'; g.font = '700 40px ' + font;
    g.fillText('얼마셈 ddokcalc.com', W / 2, 960);
    var a = document.createElement('a');
    a.download = c.title.replace(/\s/g, '') + '_실수령액.png';
    a.href = cv.toDataURL('image/png');
    a.click();
  });
})();

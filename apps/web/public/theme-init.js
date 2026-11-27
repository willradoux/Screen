// Aplica fundo e modo antes da página aparecer (evita o "piscar" de cores).
// É um arquivo à parte porque a CSP do site não permite script dentro do HTML.
// Padrão: modo escuro e a cor do Screen (lima).
(function () {
  var colors = { screem: 1, synthwave: 1, sunset: 1, acelera: 1, gelo: 1 };
  var theme = 'screem';
  var mode = 'dark';
  var motion = 'on';
  try {
    var saved = localStorage.getItem('screem-theme');
    if (colors[saved]) theme = saved;
    if (localStorage.getItem('screem-mode') === 'light') mode = 'light';
    if (localStorage.getItem('screem-motion') === 'off') motion = 'off';
  } catch {
    /* sem armazenamento: segue o padrão */
  }
  var root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-mode', mode);
  root.setAttribute('data-motion', motion);
  var bars = {
    screem: '#070707',
    synthwave: '#0b0716',
    sunset: '#0d0809',
    acelera: '#05100f',
    gelo: '#060a14',
  };
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', mode === 'light' ? '#f2f2f4' : bars[theme]);
})();

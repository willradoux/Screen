// Aplica fundo e modo antes da página aparecer (evita o "piscar" de cores).
// É um arquivo à parte porque a CSP do site não permite script dentro do HTML.
// Padrão: modo escuro e a cor do Screen (laranja e rosa).
(function () {
  var colors = { screem: 1, verde: 1, acelera: 1 };
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
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', mode === 'light' ? '#e9e9ec' : '#000000');
})();

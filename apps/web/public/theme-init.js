// Aplica fundo e modo antes da página aparecer (evita o "piscar" de cores).
// É um arquivo à parte porque a CSP do site não permite script dentro do HTML.
// Padrão: fundo "screem" (cores do logo) e modo escuro (componentes pretos).
(function () {
  var bars = {
    screem: '#fde3da',
    acelera: '#cfeee4',
    brasil: '#f6ecc4',
    portugal: '#f3e6cf',
    alemanha: '#f5e6bd',
    mono: '#e6e6e6',
    preto: '#000000',
  };
  var theme = 'screem';
  var mode = 'dark';
  var motion = 'on';
  try {
    var saved = localStorage.getItem('screem-theme');
    if (bars[saved]) theme = saved;
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
  if (meta) meta.setAttribute('content', bars[theme]);
})();

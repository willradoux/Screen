// Aplica o tema antes da página aparecer (evita o "piscar" claro/escuro).
// É um arquivo à parte porque a CSP do site não permite script dentro do HTML.
(function () {
  var theme = 'dark';
  try {
    var saved = localStorage.getItem('screem-theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
    else if (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches)
      theme = 'light';
  } catch {
    /* sem armazenamento: segue o padrão */
  }
  document.documentElement.setAttribute('data-theme', theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#090b10');
})();

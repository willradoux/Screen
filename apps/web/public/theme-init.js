// Aplica o tema antes da página aparecer (evita o "piscar" claro/escuro).
// É um arquivo à parte porque a CSP do site não permite script dentro do HTML.
// O padrão é o tema claro; o escuro só vale se a pessoa escolheu.
(function () {
  var theme = 'light';
  try {
    if (localStorage.getItem('screem-theme') === 'dark') theme = 'dark';
  } catch {
    /* sem armazenamento: segue o padrão */
  }
  document.documentElement.setAttribute('data-theme', theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#000000');
})();

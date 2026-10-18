// Tema claro/escuro de todas as telas do hub. A escolha fica no localStorage, e como todas as
// paginas estao no mesmo dominio ela vale para todas. Sem escolha, segue o celular — exceto onde
// a pagina fixa um padrao (<html data-tema-padrao="claro">: a vitrine publica, que o cliente ve).
// Carregar no <head>, sem defer: tem que marcar o tema antes de pintar, senao a tela pisca.
// Botao: qualquer elemento com data-tema-botao vira o seletor.
(function () {
  var h = document.documentElement, t;
  try { t = localStorage.tema; } catch (e) {}
  if (t !== "claro" && t !== "escuro")
    t = h.dataset.temaPadrao || (matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro");
  h.dataset.theme = t;

  function pinta() {
    var m = document.querySelector("meta[name=theme-color]");
    if (m && document.body) m.content = getComputedStyle(document.body).backgroundColor;
    document.querySelectorAll("[data-tema-botao]").forEach(function (b) {
      b.textContent = h.dataset.theme === "escuro" ? "☀️ Claro" : "🌙 Escuro";
      b.title = "Trocar o tema de todas as telas";
      b.onclick = window.trocarTema;
    });
  }
  window.trocarTema = function () {
    h.dataset.theme = h.dataset.theme === "escuro" ? "claro" : "escuro";
    try { localStorage.tema = h.dataset.theme; } catch (e) {}
    pinta();
  };
  document.addEventListener("DOMContentLoaded", pinta);
})();

// Tema claro/escuro de todas as telas do hub. A escolha fica no localStorage, e como todas as
// paginas estao no mesmo dominio ela vale para todas. Sem escolha, segue o celular — exceto onde
// a pagina fixa um padrao (<html data-tema-padrao="claro">: a vitrine publica, que o cliente ve).
// Carregar no <head>, sem defer: tem que marcar o tema antes de pintar, senao a tela pisca.
// Botao: qualquer elemento com data-tema-botao vira o seletor.

// --- derrubar: o login do hub fica no localStorage (usuario/senha), que e UM SO para todas as
// paginas (mesmo dominio), e toda pagina com login carrega este arquivo no <head>, antes de ler o
// login. Trocar SESSAO e publicar desloga TODOS os aparelhos na proxima pagina do hub que abrirem
// (pedido do dono, 22/10/2026). As senhas continuam as mesmas; tema, carrinhos e rascunhos ficam.
(function () {
  var SESSAO = "2026-10-22";
  try {
    if (localStorage.sessaoHub !== SESSAO) {
      localStorage.removeItem("usuario");
      localStorage.removeItem("senha");
      localStorage.sessaoHub = SESSAO;
    }
  } catch (e) {}
})();
// --- fim derrubar

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

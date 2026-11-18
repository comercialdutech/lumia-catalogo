// Conta de preço da Shopee. Desde 15/10/2026 no modelo do Meli Promos (pedido do dono): a tela mostra o
// "Mín. p/ venda" = preço de LUCRO ZERO (margem de contribuição zero: só taxas da Shopee, imposto e frete —
// sem custo operacional, sem lucro) e a equipe digita o "Preço mínimo" de cada SKU. Sem preço salvo, nada muda.
// O worker e a tela usam o MESMO arquivo (site/shopee/logica.mjs é cópia; o testa_worker confere).
export const REGRA_PADRAO = {
  // desconto: só usado quando o preço mínimo passa do cheio atual (aí o cheio sobe para mínimo ÷ (1 − desconto))
  imposto: 7, frete: 0, desconto: 5,
  // frete 0: o frete grátis da Shopee já está dentro da comissão (decisão do dono, 15/10)
  faixas: [{ate: 79.99, com: 20, fixa: 4.5}, {ate: 99.99, com: 14, fixa: 16},
           {ate: 199.99, com: 14, fixa: 20}, {ate: null, com: 14, fixa: 26}],
};

const r2 = x => Math.round(x * 100) / 100;
// para cima no centavo; o round a 1e-4 de centavo tira o lixo de float (80.0000000001 não vira 80,01)
export const sobe = x => Math.ceil(Math.round(x * 1e6) / 1e4) / 100;
export const normSku = s => String(s ?? "").trim().toUpperCase();
const brl = n => Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");   // 16 -> "16", 4.5 -> "4,50"
export const faixaDe = (preco, faixas) => faixas.find(f => f.ate == null || preco <= f.ate);

// margem de contribuição de um preço de venda (o que o cliente paga na campanha)
export function conta(preco, custo, regra) {
  const f = faixaDe(preco, regra.faixas), frete = regra.frete || 0;
  const comissao = preco * f.com / 100, imposto = preco * regra.imposto / 100;
  const margem = custo > 0 ? preco - comissao - f.fixa - imposto - frete - custo : null;
  return {preco, custo, comissao: r2(comissao), fixa: f.fixa, imposto: r2(imposto), frete,
          margem: margem == null ? null : r2(margem), margem_pct: margem == null ? null : r2(margem / preco * 100),
          faixa: `${f.com}% + ${brl(f.fixa)}`};
}

// Mín. p/ venda: o menor preço que paga custo + taxas + imposto + frete (margem zero), na faixa em que ele cai
export function minimoVenda(custo, regra) {
  if (!(custo > 0)) return null;
  const fs = regra.faixas;
  for (let k = 0; k < fs.length; k++) {
    const f = fs[k], livre = 1 - (regra.imposto + f.com) / 100;
    if (livre <= 0) continue;
    let venda = sobe((custo + f.fixa + (regra.frete || 0)) / livre);
    if (f.ate != null && venda > f.ate) continue;
    if (k > 0 && venda <= fs[k - 1].ate) venda = r2(fs[k - 1].ate + 0.01);   // não cai na faixa de baixo
    return {...conta(venda, custo, regra), venda};
  }
  return null;
}

// preço mínimo salvo -> o que vai para a Shopee (dono, 18/11/2026): a campanha = preço salvo e o CHEIO NÃO MUDA;
// o desconto é o que der. Mexer no cheio esbarra no preço de atacado (a Shopee recusa cheio abaixo das faixas) e
// exige tirar do desconto e repor. Só quando o mínimo >= cheio (não há desconto possível) o cheio sobe.
export function alvoDe(anuncio, regra, salvo) {
  if (!(salvo > 0)) return null;
  const min = minimoVenda(anuncio.custo, regra);
  return {...conta(salvo, anuncio.custo, regra), venda: salvo, cheio: anuncio.cheio > salvo ? anuncio.cheio : sobe(salvo / (1 - regra.desconto / 100)),
          minimo: min ? min.venda : null};
}

const igual = (a, b) => a != null && b != null && Math.abs(a - b) < 0.005;
export function situacao(a, alvo) {
  if (!alvo) return a.custo > 0 ? "sem_preco" : "sem_custo";
  if (alvo.margem != null && alvo.margem < 0) return "prejuizo";
  if (a.campanha == null) return "fora_campanha";
  if (!igual(a.campanha, alvo.venda) || !igual(a.cheio, alvo.cheio)) return "pendente";
  if (a.custo_aplicado != null && a.custo > 0 && !igual(a.custo_aplicado, a.custo)) return "custo_mudou";
  return "ok";
}

// Aba Saúde (dono, 18/11/2026): o que faz perder venda sem ninguém ver. a = linha de anuncios; alvo = alvoDe(...) ou null
const real = n => brl(Math.round(n * 100) / 100);
export function alertas(a, alvo) {
  const out = [], ativo = a.status === "NORMAL";
  if (a.deboost) out.push({tipo: "rebaixado", grave: true,
    texto: "Rebaixado pela Shopee: confira a categoria (peça vai em 101986 \"Impressoras e Scanners > Outros\", nunca em \"Impressoras 3D\")"});
  if (ativo && a.estoque === 0) out.push({tipo: "sem_estoque", grave: a.campanha != null,
    texto: a.campanha != null ? "Sem estoque e na campanha: o desconto não vende nada" : "Sem estoque"});
  if (ativo && a.atacado_min != null) {
    if (alvo && a.atacado_min < alvo.venda) out.push({tipo: "atacado_prejuizo", grave: true,
      texto: `Atacado a R$ ${real(a.atacado_min)}, abaixo do preço mínimo R$ ${real(alvo.venda)}: suba ou apague as faixas`});
    else if (a.campanha != null && a.atacado_min >= a.campanha) out.push({tipo: "atacado_inutil", grave: false,
      texto: `Atacado a partir de R$ ${real(a.atacado_min)}, acima da campanha R$ ${real(a.campanha)}: as faixas não fazem efeito`});
  }
  return out;
}
// dias até a campanha acabar, só quando faltam ≤ 15 (0 = acaba hoje ou já acabou)
export function campanhaVence(fimMs, agoraMs) {
  if (!fimMs) return null;
  const d = Math.max(0, Math.ceil((fimMs - agoraMs) / 864e5));
  return d <= 15 ? d : null;
}

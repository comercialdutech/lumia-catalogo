// Conta de preço do TikTok Shop (Dutech), no modelo do Meli Promos / Shopee Promo: a tela mostra o
// "Mín. p/ venda" = lucro zero (taxas do TikTok + imposto + frete; sem custo operacional, sem lucro) e a equipe
// digita o "Preço mínimo" de cada SKU. Sem preço salvo, nada muda.
// O worker e a tela usam o MESMO arquivo (site/tiktok/logica.mjs é cópia; o testa_worker confere).
//
// Taxas MEDIDAS em 48 pedidos reais (19/11/2026, finance/statement_transactions):
//   fee = 6% da venda + R$ 6 por item (num item de R$ 26 a fixa foi R$ 4);
//   comissão da plataforma = 6%, mas ZERO desde 29/10 (isenção até R$ 17 mil por loja, ver tiktok-sem-comissao);
//   afiliado é cobrado à parte, só na venda por afiliado (não entra no mínimo);
//   o frete NÃO sai do vendedor (o TikTok cobre: settlement = venda − fee).
export const REGRA_PADRAO = {
  imposto: 7, frete: 0,
  comissao: 0,   // comissão da plataforma %: 0 na isenção; ao passar dos R$ 17 mil, pôr 6
  faixas: [{ate: 29.99, com: 6, fixa: 4}, {ate: null, com: 6, fixa: 6}],
};

const r2 = x => Math.round(x * 100) / 100;
// para cima no centavo; o round a 1e-4 de centavo tira o lixo de float (80.0000000001 não vira 80,01)
export const sobe = x => Math.ceil(Math.round(x * 1e6) / 1e4) / 100;
export const normSku = s => String(s ?? "").trim().toUpperCase();
const brl = n => Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
export const faixaDe = (preco, faixas) => faixas.find(f => f.ate == null || preco <= f.ate);

// margem de contribuição de um preço de venda (o que o cliente paga na campanha)
export function conta(preco, custo, regra) {
  const f = faixaDe(preco, regra.faixas), frete = regra.frete || 0, comPct = regra.comissao || 0;
  const taxa = preco * f.com / 100, comissao = preco * comPct / 100, imposto = preco * regra.imposto / 100;
  const margem = custo > 0 ? preco - taxa - comissao - f.fixa - imposto - frete - custo : null;
  return {preco, custo, taxa: r2(taxa), comissao: r2(comissao), fixa: f.fixa, imposto: r2(imposto), frete,
          margem: margem == null ? null : r2(margem), margem_pct: margem == null ? null : r2(margem / preco * 100),
          faixa: `${f.com}%${comPct ? ` + ${brl(comPct)}%` : ""} + ${brl(f.fixa)}`};
}

// Mín. p/ venda: o menor preço que paga custo + taxas + imposto + frete (margem zero), na faixa em que ele cai
export function minimoVenda(custo, regra) {
  if (!(custo > 0)) return null;
  const fs = regra.faixas;
  for (let k = 0; k < fs.length; k++) {
    const f = fs[k], livre = 1 - (regra.imposto + f.com + (regra.comissao || 0)) / 100;
    if (livre <= 0) continue;
    let venda = sobe((custo + f.fixa + (regra.frete || 0)) / livre);
    if (f.ate != null && venda > f.ate) continue;
    if (k > 0 && venda <= fs[k - 1].ate) venda = r2(fs[k - 1].ate + 0.01);   // não cai na faixa de baixo
    return {...conta(venda, custo, regra), venda};
  }
  return null;
}

// preço da campanha com desconto d% sobre o cheio (o TikTok arredonda no centavo: 110,37 × 0,70 = 77,26, medido)
export const precoCom = (cheio, d) => r2(cheio * (100 - d) / 100);

// preço mínimo salvo -> o que vai para o TikTok. MEDIDO 19/11/2026: a campanha "desconto direto" só aceita % INTEIRO
// ("Discount must be an int and greater than 0 and less than 100"). Então o cheio NÃO muda e o Rodar escolhe o MAIOR
// desconto inteiro que ainda deixa o cliente pagando >= o preço mínimo (fica até 1% do cheio acima do mínimo).
// desconto 0 = o mínimo está acima (ou a menos de 1%) do cheio: não dá desconto, nada é aplicado.
export function alvoDe(anuncio, regra, salvo) {
  if (!(salvo > 0)) return null;
  const cheio = anuncio.cheio, min = minimoVenda(anuncio.custo, regra);
  let d = cheio > 0 ? Math.max(0, Math.min(99, Math.floor((1 - salvo / cheio) * 100 + 1e-9))) : 0;
  while (d > 0 && precoCom(cheio, d) < salvo - 0.005) d--;
  const venda = d > 0 ? precoCom(cheio, d) : salvo;
  return {...conta(venda, anuncio.custo, regra), venda, desconto: d, cheio, salvo, minimo: min ? min.venda : null};
}

export function situacao(a, alvo) {
  if (!alvo) return a.custo > 0 ? "sem_preco" : "sem_custo";
  if (alvo.desconto < 1) return "acima_cheio";
  if (alvo.margem != null && alvo.margem < 0) return "prejuizo";
  if (a.desconto == null) return a.outra_campanha ? "outra_campanha" : "fora_campanha";
  if (a.desconto !== alvo.desconto) return "pendente";
  if (a.custo_aplicado != null && a.custo > 0 && Math.abs(a.custo_aplicado - a.custo) >= 0.005) return "custo_mudou";
  return "ok";
}

// Aba Saúde: o que faz perder venda sem ninguém ver. a = linha de anuncios; alvo = alvoDe(...) ou null
export function alertas(a, alvo) {
  const out = [], ativo = a.status === "ACTIVATE";
  if (a.auditoria && a.auditoria !== "APPROVED") out.push({tipo: "auditoria", grave: true,
    texto: `Anúncio em análise ou reprovado pelo TikTok (${a.auditoria}): confira no Seller Center`});
  if (ativo && a.estoque === 0) out.push({tipo: "sem_estoque", grave: a.desconto != null,
    texto: a.desconto != null ? "Sem estoque e na campanha: o desconto não vende nada" : "Sem estoque"});
  if (alvo && alvo.desconto < 1) out.push({tipo: "acima_cheio", grave: true,
    texto: `Preço mínimo R$ ${brl(alvo.salvo)} acima do cheio R$ ${brl(a.cheio)} (ou a menos de 1%): não dá desconto. Suba o cheio no Tiny ou baixe o mínimo`});
  return out;
}
// dias até a campanha acabar, só quando faltam ≤ 15 (0 = acaba hoje ou já acabou)
export function campanhaVence(fimMs, agoraMs) {
  if (!fimMs) return null;
  const d = Math.max(0, Math.ceil((fimMs - agoraMs) / 864e5));
  return d <= 15 ? d : null;
}

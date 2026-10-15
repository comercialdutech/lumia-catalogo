// Conta de preço da Shopee (regra do dono, 14/10/2026). Sem rede: o worker e a tela usam o MESMO
// arquivo (site/shopee/logica.mjs é cópia; o testa_worker confere que são iguais).
export const REGRA_PADRAO = {
  imposto: 7, operacional: 10, considerar_oper: true,
  lucro_modo: "pct", lucro_pct: 10, lucro_rs: 4,
  desconto: 30, trava: true,
  faixas: [{ate: 79.99, com: 20, fixa: 4.5}, {ate: 99.99, com: 14, fixa: 16},
           {ate: 199.99, com: 14, fixa: 20}, {ate: null, com: 14, fixa: 26}],
};

const r2 = x => Math.round(x * 100) / 100;
// para cima no centavo; o round a 1e-4 de centavo tira o lixo de float (80.0000000001 não vira 80,01)
export const sobe = x => Math.ceil(Math.round(x * 1e6) / 1e4) / 100;
export const normSku = s => String(s ?? "").trim().toUpperCase();
const brl = n => Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");   // 16 -> "16", 4.5 -> "4,50"
export const faixaDe = (preco, faixas) => faixas.find(f => f.ate == null || preco <= f.ate);

export function contaPreco(preco, custo, regra) {
  const f = faixaDe(preco, regra.faixas), oper = regra.considerar_oper ? regra.operacional : 0;
  const imposto = preco * regra.imposto / 100, operacional = preco * oper / 100, comissao = preco * f.com / 100;
  const lucro = preco - imposto - operacional - comissao - f.fixa - custo;
  return {preco, custo, imposto: r2(imposto), operacional: r2(operacional), comissao: r2(comissao),
          fixa: f.fixa, lucro: r2(lucro), lucro_pct: r2(lucro / preco * 100), faixa: `${f.com}% + ${brl(f.fixa)}`};
}

export function precoRegra(custo, regra) {
  if (!(custo > 0)) return null;
  const oper = regra.considerar_oper ? regra.operacional : 0;
  const pct = regra.lucro_modo === "pct" ? regra.lucro_pct : 0, rs = regra.lucro_modo === "rs" ? regra.lucro_rs : 0;
  const fs = regra.faixas;
  for (let k = 0; k < fs.length; k++) {
    const f = fs[k], livre = 1 - (regra.imposto + oper + f.com + pct) / 100;
    if (livre <= 0) continue;
    let venda = sobe((custo + f.fixa + rs) / livre);
    if (f.ate != null && venda > f.ate) continue;
    if (k > 0 && venda <= fs[k - 1].ate) venda = r2(fs[k - 1].ate + 0.01);  // não cai na faixa de baixo
    let travado = false;
    // trava no teto da faixa de baixo só se ali ainda sobrar pelo menos METADE do lucro-alvo (decisão
    // de 14/10: "lucro > 0" travava o PETG Xfull a 99,99 com 3% de lucro)
    if (regra.trava && k > 0) {
      const t = contaPreco(fs[k - 1].ate, custo, regra);
      if (pct ? t.lucro_pct >= pct / 2 : t.lucro >= rs / 2) { venda = fs[k - 1].ate; travado = true; }
    }
    return {...contaPreco(venda, custo, regra), venda, cheio: sobe(venda / (1 - regra.desconto / 100)), travado};
  }
  return null;
}

export function alvoDe(anuncio, regra, manual) {
  if (manual > 0) {
    const base = anuncio.custo > 0 ? contaPreco(manual, anuncio.custo, regra) : {};
    return {...base, venda: manual, cheio: sobe(manual / (1 - regra.desconto / 100)), travado: false, manual: true};
  }
  const p = precoRegra(anuncio.custo, regra);
  return p && {...p, manual: false};
}

export function situacao(a, alvo) {
  if (!(a.custo > 0) || !alvo) return "sem_custo";
  if (a.campanha == null) return "fora_campanha";
  if (a.custo_aplicado != null && Math.abs(a.custo_aplicado - a.custo) >= 0.005) return "custo_mudou";
  const d = (a.campanha - alvo.venda) / alvo.venda;
  return Math.abs(d) <= 0.02 ? "ok" : d < 0 ? "abaixo" : "acima";
}

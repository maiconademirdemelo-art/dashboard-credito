const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint seguro — a chave fica no servidor, nunca exposta ao browser
app.post('/api/extrair-pdf', async (req, res) => {
  const { pdfBase64 } = req.body;
  if (!pdfBase64) return res.status(400).json({ error: 'PDF não enviado' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Chave de API não configurada no servidor' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 }
            },
            {
              type: 'text',
              text: `Leia este PDF de simulação de crédito e extraia TODOS os dados em formato JSON puro, sem markdown, sem explicações, apenas o JSON.

O JSON deve ter exatamente esta estrutura:
{
  "cooperado": "nome do cooperado",
  "valorSolicitado": 411053.15,
  "valorLiquido": 400000,
  "parcelas": 24,
  "dataInicio": "08/04/2026",
  "primeiroVencimento": "08/05/2026",
  "ultimaParcela": "08/04/2028",
  "taxaOperacao": 0.35,
  "iof": 11053.15,
  "totalJuros": 78042.01,
  "indexador": "CDI",
  "tabela": [
    { "n": 1, "venc": "Mai/26", "juros": 1438.69, "jurosIdx": 4709.83, "seguro": 298.55 },
    ...todas as parcelas
  ]
}

Regras:
- valorLiquido = valorSolicitado - iof
- venc: abrevie o mês em português (Jan, Fev, Mar, Abr, Mai, Jun, Jul, Ago, Set, Out, Nov, Dez) + /AA
- juros: coluna "Juros" (taxa fixa)
- jurosIdx: coluna "Juros Indexador" se existir (CDI), caso contrário 0
- seguro: coluna "Seguro Prestamista"
- Inclua TODAS as parcelas, mesmo que estejam em páginas diferentes
- Retorne APENAS o JSON, sem nenhum texto antes ou depois`
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Erro na API Anthropic');
    }

    const data = await response.json();
    const text = data.content.map(c => c.text || '').join('').trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    res.json({ ok: true, dados: parsed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

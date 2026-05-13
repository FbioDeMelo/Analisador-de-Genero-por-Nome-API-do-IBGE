# 🔍 Analisador de Gênero por Nome — API do IBGE

Ferramenta web para identificar o gênero mais provável de um nome brasileiro, com base nos dados do **Censo IBGE**. Suporta consulta individual e **importação em lote via CSV** com suporte a listas de até 30k+ nomes.

---

## ✨ Funcionalidades

- **Consulta individual** — digite um nome e veja gênero, confiança e frequência em tempo real
- **Importação em lote via CSV** — arraste ou selecione um arquivo com até 30k nomes
- **Deduplicação automática** — listas com repetições fazem apenas uma requisição por nome único
- **Cache persistente** — nomes já consultados ficam salvos no `localStorage`; consultas futuras são instantâneas
- **Processamento paralelo** — até 20 requisições simultâneas configuráveis
- **Intervalo adaptativo** — detecta erros `429` e aumenta o intervalo automaticamente
- **Retry com backoff exponencial** — falhas são re-tentadas automaticamente
- **ETA em tempo real** — estima o tempo restante e exibe taxa de nomes/segundo
- **Paginação** — tabela de resultados com 50 linhas por página, sem travar o navegador
- **Filtros e ordenação** — filtre por gênero e ordene por nome, gênero ou confiança
- **Busca na tabela** — encontre um nome específico dentro dos resultados
- **Exportação CSV** — baixe o resultado completo com coluna de fonte (cache ou API)

---

## 🚀 Como usar

**Sem instalação.** Basta abrir o `index.html` no navegador.

```bash
git clone https://github.com/seu-usuario/analisador-genero-ibge.git
cd analisador-genero-ibge
# Abra o index.html no navegador
```

> Requer conexão com a internet para consultar a API do IBGE.  
> Compatível com Chrome, Firefox, Edge e Safari modernos.

---

## 📁 Estrutura do projeto

```
analisador-genero-ibge/
├── index.html     # Interface do usuário
├── styles.css     # Estilos responsivos
├── script.js      # Lógica principal (API, cache, processamento)
└── README.md
```

---

## 📋 Formato do CSV

O arquivo deve ter **uma coluna com os nomes**, com ou sem cabeçalho. Separadores suportados: vírgula, ponto-e-vírgula, pipe e tab.

```csv
nome
João
Maria Silva
Carlos
Ariel
```

> Apenas o **primeiro nome** de cada linha é considerado, conforme o comportamento da API do IBGE.

---

## ⚙️ Configurações de processamento

| Parâmetro | Padrão | Descrição |
|-----------|--------|-----------|
| Concorrência | 10 | Requisições simultâneas à API |
| Intervalo entre lotes | 100ms | Pausa entre rodadas (0ms só para listas pequenas) |
| Tentativas por erro | 3 | Retry com backoff exponencial |

**Recomendação para listas grandes (5k–30k nomes únicos):** concorrência 10–15, intervalo 100ms.  
Se receber erros frequentes, aumente o intervalo para 200–300ms.

---

## ⚡ Performance

| Cenário | Requisições à API | Tempo estimado |
|---------|------------------|----------------|
| 1.000 nomes, 446 únicos | 446 | ~30s |
| 17.000 nomes, 2.000 únicos | 2.000 | ~40–60s |
| 17.000 nomes (segunda vez) | 0 (cache) | ~2s |
| 30.000 nomes, 3.000 únicos | 3.000 | ~60–90s |

---

## 🔎 Como funciona a classificação

A API do IBGE retorna a frequência histórica de cada nome separada por sexo. O sistema calcula o percentual masculino e feminino e aplica a seguinte regra:

- **Masculino** — percentual masculino ≥ 65%
- **Feminino** — percentual feminino ≥ 65%
- **Indefinido** — nenhum ultrapassa 65% (nome ambíguo como *Ariel*, *Alex*)
- **Não encontrado** — nome ausente na base do IBGE

---

## 📡 API utilizada

[IBGE — Serviço de dados: Nomes](https://servicodados.ibge.gov.br/api/docs/nomes)

```
GET https://servicodados.ibge.gov.br/api/v2/censos/nomes/{nome}?sexo=M
GET https://servicodados.ibge.gov.br/api/v2/censos/nomes/{nome}?sexo=F
```

API pública, sem autenticação, sem custos.

---

## 📤 Resultado exportado (CSV)

| Coluna | Descrição |
|--------|-----------|
| `Nome` | Nome capitalizado |
| `Nome_Original` | Como veio no arquivo original |
| `Genero` | Masculino, Feminino, Indefinido ou Não encontrado |
| `Confianca_%` | Percentual de confiança da classificação |
| `Freq_Masculino` | Frequência histórica masculina no Censo |
| `Freq_Feminino` | Frequência histórica feminina no Censo |
| `Fonte` | `cache` (localStorage) ou `api` (consultado na sessão) |

---

## 🛠 Tecnologias

- HTML5, CSS3, JavaScript (ES2020+) — sem frameworks, sem dependências
- `localStorage` para cache persistente entre sessões
- `Promise.all` para requisições paralelas
- `Fetch API` para comunicação com a API do IBGE

---

## 📄 Licença

MIT — fique à vontade para usar, modificar e distribuir.

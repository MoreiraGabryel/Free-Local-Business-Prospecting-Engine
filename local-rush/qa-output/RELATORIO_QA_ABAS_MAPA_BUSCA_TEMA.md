# QA - Abas, mapa, busca, salvar/remover e tema

Data/hora do teste: 2026-06-04
URL testada: http://127.0.0.1:8000/
Ferramenta: Playwright headless Chromium
Observacao: o browser tool do ambiente nao abriu Chrome; foi usado fallback Playwright com Chromium `--no-sandbox`.

Arquivos de evidencia:
- Resultado JSON completo: C:/Users/Micro/Desktop/CodexSkillPack/local-rush/qa-output/localrush-tab-regression-result.json
- Screenshot inicial: C:/Users/Micro/Desktop/CodexSkillPack/local-rush/qa-output/screenshots/01-initial-dashboard.png
- Screenshot Historico apos cliques repetidos: C:/Users/Micro/Desktop/CodexSkillPack/local-rush/qa-output/screenshots/02-history-after-repeated-clicks.png
- Screenshot Dashboard apos Ajustar mapa: C:/Users/Micro/Desktop/CodexSkillPack/local-rush/qa-output/screenshots/03-dashboard-after-fit.png
- Screenshot apos busca: C:/Users/Micro/Desktop/CodexSkillPack/local-rush/qa-output/screenshots/04-after-search.png
- Screenshot apos alternar tema: C:/Users/Micro/Desktop/CodexSkillPack/local-rush/qa-output/screenshots/05-theme-after-toggle.png
- Screenshot mobile 390x844: C:/Users/Micro/Desktop/CodexSkillPack/local-rush/qa-output/screenshots/06-mobile-390x844.png

## Resumo executivo

Resultado geral: PASS

Nao encontrei regressao nas otimizacoes testadas agora.

Resumo tecnico:
- HTTP inicial `/`: 200 OK
- Console errors: 0
- Page errors: 0
- Console warnings: 0
- Busca UI: 2 resultados renderizados
- Salvar/remover: funcionou e sincronizou localStorage/listas
- Tema claro/escuro: alternou e persistiu apos reload
- Mobile 390x844: sem overflow horizontal global
- Mapa Leaflet: continuou ativo apos alternancia de abas e botao Ajustar funcionou

## Checklist solicitado

| Item | Resultado | Evidencia |
|---|---|---|
| Alternar rapido entre Dashboard, Historico, Empresas recentes e Empresas salvas | PASS | `activeTab` e `activePanel` mudaram corretamente em 8 alternancias rapidas. |
| Clicar varias vezes na mesma aba e confirmar que nao pisca nem parece recarregar | PASS | 8 cliques em Historico mantiveram `resourceCount=21`, navigation entry inalterada e painel ativo estavel. |
| Voltar para Dashboard e verificar se o mapa continua ajustando normalmente | PASS | Leaflet continuou carregado, `leafletContainerCount=1`, mapa visivel, botao Ajustar reposicionou marcador. |
| Fazer uma busca e confirmar resultados | PASS | `/api/search` retornou 200; UI exibiu 2 linhas e `2 empresa(s) encontrada(s).` |
| Confirmar salvar/remover | PASS | Salvar gerou `savedLength=1`; remover voltou para `savedLength=0`; botoes/listas sincronizaram. |
| Confirmar listas Historico/Recentes/Salvas | PASS | Historico=1 busca, Recentes=2 empresas, Salvas atualizou de 1 para estado vazio apos remover. |
| Testar tema claro/escuro depois das otimizacoes | PASS | light -> dark -> reload dark persistido -> light. |
| Verificar console | PASS | 0 erros, 0 warnings. |
| Verificar overflow mobile | PASS | 390x844: `docClientWidth=390`, `docScrollWidth=390`, `hasHorizontalOverflow=false`. |

## Resultado HTTP/API

### Teste 1 - Carregamento inicial

Request:
```http
GET http://127.0.0.1:8000/
```

Status code: 200

Body: HTML retornado corretamente. Inicio do body validado:
```html
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Local Rush</title>
    <link rel="stylesheet" href="/static/assets/vendor/leaflet/leaflet.css" />
    <link rel="stylesheet" href="/static/style.css?v=16" />
```

Veredito: PASS

Motivo tecnico: a pagina carregou com status 200 e inicializou Dashboard + Leaflet sem erro JS.

### Teste 2 - Busca direta API

Request:
```http
POST http://127.0.0.1:8000/api/search
Content-Type: application/json
```

JSON enviado:
```json
{
  "lat": -23.55052,
  "lng": -46.633308,
  "radius": 800,
  "category": "restaurant",
  "limit": 2,
  "only_with_site": false
}
```

Status code: 200

Body exato:
```json
{"total":2,"results":[{"name":"Alcachofra","category":"restaurant","address":"Rua da Quitanda 107 - São Paulo","phone":"","whatsapp":"","email":"","website":"","maps_link":"https://www.openstreetmap.org/?mlat=-23.547759&mlon=-46.635289&zoom=18","lat":-23.5477587,"lng":-46.635289,"opening_hours":"","opportunity_score":"Baixa"},{"name":"Badaró Sucos e Lanches","category":"restaurant","address":"Rua Líbero Badaró 456 - São Paulo","phone":"","whatsapp":"","email":"","website":"","maps_link":"https://www.openstreetmap.org/?mlat=-23.545764&mlon=-46.635762&zoom=18","lat":-23.5457636,"lng":-46.6357624,"opening_hours":"","opportunity_score":"Baixa"}],"attribution":"Dados © OpenStreetMap contributors, licença ODbL"}
```

Veredito: PASS

Motivo tecnico: API retornou 200 com `total=2`, array `results` com 2 empresas, coordenadas validas e links OSM.

## Detalhes por fluxo

### 1. Alternancia rapida de abas

Sequencia executada:
1. Historico
2. Empresas recentes
3. Empresas salvas
4. Dashboard
5. Historico
6. Empresas recentes
7. Empresas salvas
8. Dashboard

Evidencia DOM:
```text
rapid 1: activeTab=history, activePanel=history, title=Buscas realizadas
rapid 2: activeTab=recent, activePanel=recent, title=Empresas encontradas recentemente
rapid 3: activeTab=saved, activePanel=saved, title=Empresas salvas
rapid 4: activeTab=dashboard, activePanel=dashboard, title=Prospeccao local com dados abertos
rapid 5: activeTab=history, activePanel=history, title=Buscas realizadas
rapid 6: activeTab=recent, activePanel=recent, title=Empresas encontradas recentemente
rapid 7: activeTab=saved, activePanel=saved, title=Empresas salvas
rapid 8: activeTab=dashboard, activePanel=dashboard, title=Prospeccao local com dados abertos
```

Status: PASS

Observacao: nao houve reload de pagina nem erro JS durante a alternancia.

### 2. Cliques repetidos na mesma aba

Aba testada: Historico
Quantidade: 8 cliques consecutivos

Evidencia:
```text
beforeResourceCount=21
afterResourceCount=21
before navigation type=navigate
after navigation type=navigate
activeTab permaneceu history
activePanel permaneceu history
header permaneceu Buscas realizadas
```

Status: PASS

Motivo tecnico: o `activateTab()` aparentemente evita reprocessar quando a aba clicada ja esta ativa. O contador de recursos nao aumentou e a navigation entry nao mudou, indicando ausencia de recarregamento/reload.

### 3. Dashboard e mapa apos alternancia

Antes de clicar Ajustar:
```json
{
  "exists": true,
  "display": "block",
  "visibility": "visible",
  "status": "Centro e raio da busca no mapa.",
  "fallback": false,
  "leafletLoaded": true,
  "leafletContainerCount": 1,
  "markerCount": 1,
  "tileCount": 9
}
```

Depois de clicar Ajustar:
```json
{
  "exists": true,
  "display": "block",
  "visibility": "visible",
  "status": "Centro e raio da busca no mapa.",
  "fallback": false,
  "leafletLoaded": true,
  "leafletContainerCount": 1,
  "markerCount": 1,
  "tileCount": 9
}
```

Status: PASS

Observacao tecnica: o marcador mudou de posicao visual apos o ajuste, indicando que o Leaflet recalculou tamanho/posicionamento normalmente.

### 4. Busca, resultados e mapa

Busca feita pela UI:
```json
{
  "lat": -23.550520,
  "lng": -46.633308,
  "radius_level": "small",
  "category": "restaurant",
  "limit": 2,
  "location_query": "São Paulo Centro QA"
}
```

Resultado UI:
```text
results-count: 2 empresa(s) encontrada(s).
rowCount: 2
map-status: 2 marcador(es) no mapa.
markerCount: 3
```

Primeira linha renderizada:
```text
Alcachofra Rua da Quitanda 107 - São Paulo restaurant Sem contato Baixa Contato incompleto Ver no mapa Salvar empresa
```

Clique na primeira empresa:
```text
map-status: Empresa selecionada: Alcachofra.
selectedRows: [{ id: "alcachofra|restaurant|-23.547759|-46.635289", ariaSelected: "true" }]
```

Status: PASS

Motivo tecnico: resultados apareceram, marcadores foram criados, a linha selecionada recebeu estado `is-map-selected` e `aria-selected=true`.

### 5. Salvar/remover e listas

Antes de salvar:
```json
[]
```

Depois de salvar:
```json
[{"id":"alcachofra|restaurant|-23.547759|-46.635289","name":"Alcachofra","category":"restaurant","address":"Rua da Quitanda 107 - São Paulo","phone":"","whatsapp":"","email":"","website":"","maps_link":"https://www.openstreetmap.org/?mlat=-23.547759&mlon=-46.635289&zoom=18","opening_hours":"","opportunity_score":"Baixa","lat":-23.5477587,"lng":-46.635289,"saved_at":"2026-06-04T22:29:23.667Z"}]
```

Estado apos salvar:
```text
savedLength=1
botao na tabela: Remover salva
lista Salvas: Alcachofra restaurant • salvo em 04/06/2026, 19:29 Mapa Remover
lista Recentes: Alcachofra aparece com botao Remover salva
```

Depois de remover:
```json
[]
```

Estado apos remover:
```text
savedLength=0
botao na tabela voltou para: Salvar empresa
lista Salvas: Nenhuma empresa salva.
lista Recentes: Alcachofra voltou para botao Salvar
```

Status: PASS

Motivo tecnico: localStorage `localrush_saved`, tabela, lista de recentes e lista de salvas permaneceram sincronizados.

### 6. Historico e recentes

Historico depois da busca:
```text
Busca restaurant 04/06/2026, 19:29 • 2 resultado(s) Carregar filtros
```

Recentes depois da busca:
```text
Alcachofra restaurant • score Baixa Mapa Salvar
Badaró Sucos e Lanches restaurant • score Baixa Mapa Salvar
```

Status: PASS

Motivo tecnico: `localrush_history` ficou com 1 item e `localrush_recent` com 2 itens.

### 7. Tema claro/escuro

Sequencia:
```text
Antes: html=light, body=light, label=Tema escuro, aria-pressed=true
Depois do primeiro toggle: html=dark, body=dark, label=Tema claro, aria-pressed=false, storage=dark
Depois do reload: html=dark, body=dark, label=Tema claro, aria-pressed=false, storage=dark
Depois do segundo toggle: html=light, body=light, label=Tema escuro, aria-pressed=true, storage=light
```

Status: PASS

Motivo tecnico: tema alternou corretamente, atualizou label/aria-pressed e persistiu em `localrush_theme` apos reload.

### 8. Mobile 390x844

Metrica:
```json
{
  "innerWidth": 390,
  "innerHeight": 844,
  "docClientWidth": 390,
  "docScrollWidth": 390,
  "hasHorizontalOverflow": false
}
```

Status: PASS

Motivo tecnico: nao ha overflow horizontal global em 390x844.

## Bugs encontrados

Nenhum bug funcional novo encontrado neste escopo.

## Observacoes para o outro setor

1. O comportamento de abas esta correto e otimizado: clicar na aba ativa nao dispara reload nem adiciona recursos.
2. O mapa continua funcional apos esconder/exibir o Dashboard. O botao Ajustar ainda opera apos alternancia de abas.
3. A busca real segue integrando API, tabela, mapa, historico e recentes.
4. Salvar/remover esta consistente entre tabela, lista de recentes, lista de salvas e localStorage.
5. Tema claro/escuro esta persistente e nao quebrou o mapa.
6. Mobile 390x844 nao apresentou overflow horizontal global.

Recomendacao: liberar esta parte das otimizacoes. Nao ha bloqueador neste escopo.

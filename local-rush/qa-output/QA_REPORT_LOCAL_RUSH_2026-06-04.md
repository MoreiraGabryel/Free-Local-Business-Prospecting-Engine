# QA Report - Local Rush

Ambiente testado:
- Projeto: C:/Users/Micro/Desktop/CodexSkillPack/local-rush
- URL: http://127.0.0.1:8000
- Servidor: uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
- Automação: Playwright headless Chromium

Veredito geral: PARTIAL

Resumo:
- Desktop carregou sem erro visual crítico: PASS
- Abas da sidebar: PASS
- Tema claro/escuro + persistência após reload: PASS
- Busca simples com API real: PASS
- Mapa/resultados/score/links: PASS
- Mobile/sidebar como barra superior: PARTIAL/FAIL por overflow horizontal global
- Console JavaScript: PASS, 0 mensagens/erros capturados

Evidências geradas:
- Desktop inicial: C:/Users/Micro/Desktop/CodexSkillPack/local-rush/qa-output/playwright-runner/qa-output/01-load-desktop.png
- Tema claro: C:/Users/Micro/Desktop/CodexSkillPack/local-rush/qa-output/playwright-runner/qa-output/02-theme-light.png
- Busca com resultados: C:/Users/Micro/Desktop/CodexSkillPack/local-rush/qa-output/playwright-runner/qa-output/03-search-results.png
- Mobile: C:/Users/Micro/Desktop/CodexSkillPack/local-rush/qa-output/playwright-runner/qa-output/04-mobile.png
- JSON completo da execução: C:/Users/Micro/Desktop/CodexSkillPack/local-rush/qa-output/playwright-runner/qa-output/qa-result.json

## Testes executados

### 1. GET /api/health
- Request: GET http://127.0.0.1:8000/api/health
- HTTP status: 200
- Body:
```json
{"status":"ok","service":"local-rush","overpass_timeout_seconds":25,"geocoding_timeout_seconds":20}
```
- Resultado: PASS
- Motivo: backend respondeu saudável e porta 8000 estava operacional.

### 2. Carregamento visual desktop
- Request: GET http://127.0.0.1:8000/
- HTTP status: 200
- Evidência DOM:
```json
{
  "title": "Local Rush",
  "h1": "Prospecção local com dados abertos",
  "appFrame": true,
  "sidebar": true,
  "visiblePanels": 4,
  "horizontalOverflow": false
}
```
- Resultado: PASS
- Motivo: tela carregou com estrutura principal, sidebar, painéis e sem overflow horizontal desktop.

### 3. Abas da sidebar
- Ações: clique em Nova busca, Histórico, Empresas recentes, Empresas salvas.
- Resultado: PASS
- Evidência:
```json
[
  {"tab":"search","activeButton":true,"activeCard":true,"activeTitle":"Nova busca"},
  {"tab":"history","activeButton":true,"activeCard":true,"activeTitle":"Histórico"},
  {"tab":"recent","activeButton":true,"activeCard":true,"activeTitle":"Empresas recentes"},
  {"tab":"saved","activeButton":true,"activeCard":true,"activeTitle":"Empresas salvas"}
]
```
- Motivo: cada botão ativou corretamente o card correspondente.

### 4. Tema claro/escuro e persistência
- Ações: iniciar em dark, clicar para light, clicar para dark, recarregar página.
- Resultado: PASS
- Evidência:
```json
{
  "beforeTheme": {"theme":"dark","label":"Tema claro","stored":"dark"},
  "lightTheme": {"theme":"light","label":"Tema escuro","stored":"light","pressed":"true"},
  "darkTheme": {"theme":"dark","label":"Tema claro","stored":"dark","pressed":"false"},
  "afterReloadTheme": {"theme":"dark","label":"Tema claro","stored":"dark","pressed":"false"}
}
```
- Motivo: troca de tema altera `body[data-theme]`, `localStorage.localrush_theme`, label e `aria-pressed`; persistiu após reload.

### 5. Busca simples
- Request: POST http://127.0.0.1:8000/api/search
- Payload:
```json
{"lat":-23.55052,"lng":-46.633308,"radius":1500,"category":"restaurant","limit":5,"only_with_site":false}
```
- HTTP status: 200
- Body:
```json
{"total":5,"results":[{"name":"Estadão Bar & Lanches","category":"restaurant","address":"Viaduto Nove de Julho 193 - Centro, São Paulo","phone":"+55 11 3257-7121;+55 11 3256-3700","whatsapp":"","email":"comercial@estadaolanches.com.br","website":"http://www.estadaolanches.com.br/","maps_link":"https://www.openstreetmap.org/?mlat=-23.548750&mlon=-46.642632&zoom=18","lat":-23.5487497,"lng":-46.6426322,"opening_hours":"24/7","opportunity_score":"Alta"},{"name":"Apfel","category":"restaurant","address":"Rua Dom José de Barros 99 - São Paulo","phone":"+55 11 3256 7909","whatsapp":"","email":"","website":"https://www.apfel.com.br/","maps_link":"https://www.openstreetmap.org/?mlat=-23.544622&mlon=-46.641057&zoom=18","lat":-23.5446224,"lng":-46.641057,"opening_hours":"Mo-Sa 11:00-15:00","opportunity_score":"Média"},{"name":"Feijão de Corda","category":"restaurant","address":"Rua Jaceguai 428 - Bixiga, São Paulo","phone":"+55 11 3105-8463","whatsapp":"","email":"","website":"https://www.facebook.com/feijaodecordacentro/","maps_link":"https://www.openstreetmap.org/?mlat=-23.555288&mlon=-46.640324&zoom=18","lat":-23.5552879,"lng":-46.6403238,"opening_hours":"Mo-Su 11:00-23:00","opportunity_score":"Média"},{"name":"Lamen Kazu","category":"restaurant","address":"Rua Tomás Gonzaga 51 - Liberdade, São Paulo","phone":"+55 11 3277-4286","whatsapp":"","email":"","website":"https://lamenkazu.com.br/","maps_link":"https://www.openstreetmap.org/?mlat=-23.557680&mlon=-46.635899&zoom=18","lat":-23.55768,"lng":-46.635899,"opening_hours":"Mo-Sa 11:00-15:00,18:00-22:30; Su,PH 11:00-15:00,18:00-21:00","opportunity_score":"Média"},{"name":"Paribar","category":"restaurant","address":"praça dom josé gaspar 42 - São Paulo","phone":"+55 11 3159-0219","whatsapp":"","email":"","website":"https://www.paribar.com.br/","maps_link":"https://www.openstreetmap.org/?mlat=-23.546468&mlon=-46.641843&zoom=18","lat":-23.5464681,"lng":-46.6418431,"opening_hours":"","opportunity_score":"Média"}],"attribution":"Dados © OpenStreetMap contributors, licença ODbL"}
```
- Resultado: PASS
- Evidência UI:
```json
{
  "statusMessage":"Busca concluída com sucesso.",
  "errorMessage":"",
  "resultsCount":"5 empresa(s) encontrada(s).",
  "rowCount":5,
  "mapStatus":"5 marcador(es) no mapa.",
  "leafletMarkers":6,
  "historyCount":1,
  "recentCount":5
}
```
- Motivo: API retornou 5 resultados; UI renderizou 5 linhas, score com badges visuais, mapa com marcadores e histórico/recentes foram persistidos.

### 6. Score bonito
- Resultado: PASS
- Evidência:
```json
[
  {"text":"Alta","className":"badge badge-alta","bg":"linear-gradient(rgb(184, 255, 104), rgb(119, 223, 84))"},
  {"text":"Média","className":"badge badge-media","bg":"linear-gradient(rgb(255, 212, 138), rgb(239, 168, 77))"}
]
```
- Motivo: score aparece como badge colorido e semanticamente separado por classe.

### 7. Links de contato/mapa
- Resultado: PASS
- Evidência do primeiro resultado:
```json
[
  {"text":"Telefone: +55 11 3257-7121;+55 11 3256-3700","href":"tel:+551****7121+551****3700"},
  {"text":"Email: comercial@estadaolanches.com.br","href":"mailto:comercial@estadaolanches.com.br"},
  {"text":"Website","href":"http://www.estadaolanches.com.br/","target":"_blank","rel":"noopener noreferrer"},
  {"text":"Abrir mapa","href":"https://www.openstreetmap.org/?mlat=-23.548750&mlon=-46.642632&zoom=18","target":"_blank","rel":"noopener noreferrer"}
]
```
- Motivo: links continuam funcionais, com target/rel corretos para links externos.
- Observação técnica: o link tel juntou dois telefones em um único href. Não quebrou o teste, mas pode ser melhor separar telefones quando vierem delimitados por `;`.

### 8. Seleção de resultado e mapa
- Resultado: PASS
- Evidência:
```json
{
  "className":"is-map-selected",
  "ariaSelected":"true",
  "mapStatus":"Empresa selecionada: Estadão Bar & Lanches.",
  "iframeSrc":"https://www.openstreetmap.org/export/embed.html?bbox=-46.657331%2C-23.562224%2C-46.627933%2C-23.535275&layer=mapnik&marker=-23.548750%2C-46.642632"
}
```
- Motivo: clique no resultado selecionou a linha, marcou `aria-selected=true` e atualizou o mapa para a coordenada da empresa.

### 9. Mobile / sidebar superior rolável
- Viewport: 390x844
- Resultado: FAIL
- Evidência:
```json
{
  "appDisplay":"block",
  "sidebarFlexDirection":"row",
  "sidebarOverflowX":"auto",
  "tabsDisplay":"flex",
  "docClientWidth":390,
  "docScrollWidth":900,
  "hasPageHorizontalOverflow":true
}
```
- Motivo: a sidebar realmente vira barra superior rolável, mas a página inteira quebra em mobile com overflow horizontal global. `documentElement.scrollWidth` ficou 900px em viewport de 390px.
- Causa provável: elementos internos mantêm largura mínima maior que o viewport. Durante inspeção, `.topbar`, `.dashboard-grid`, `.search-panel` e cards internos aparecem com cerca de 890px; a tabela tem `min-width: 850px`, mas o wrapper deveria isolar esse overflow. Há falta de `min-width: 0`/`max-width: 100%` em containers de grid/flex no breakpoint mobile.

## Bug encontrado

### BUG-001 - Layout mobile gera overflow horizontal global
- Severidade: Medium
- Categoria: Responsividade / UI
- Status: Reproduzido
- Ambiente: Chromium headless, viewport 390x844

Passos para reproduzir:
1. Abrir http://127.0.0.1:8000.
2. Reduzir viewport para largura mobile, ex.: 390px.
3. Verificar largura do documento com `document.documentElement.scrollWidth`.
4. Comparar com `document.documentElement.clientWidth`.

Resultado esperado:
- Sidebar vira barra superior rolável.
- Conteúdo principal permanece dentro do viewport.
- Apenas tabela/lista, se necessário, rola dentro de `.results-wrap`, sem criar scroll horizontal global.

Resultado atual:
- Sidebar vira barra superior rolável, porém o documento inteiro fica com largura de 900px.
- `clientWidth`: 390
- `scrollWidth`: 900
- Há risco de usuário mobile ver conteúdo cortado ou precisar rolar lateralmente a página inteira.

Possível causa técnica:
- Containers em grid/flex preservam largura mínima do conteúdo.
- `.topbar`, `.dashboard-grid`, `.search-panel` e/ou `.results-panel` precisam de `min-width: 0`.
- A tabela possui `min-width: 850px`; isso é aceitável apenas se o overflow ficar encapsulado em `.results-wrap`, mas no estado atual contribui para largura global.

Solução sugerida para o setor responsável:
```css
@media (max-width: 760px) {
  html,
  body {
    max-width: 100%;
    overflow-x: hidden;
  }

  .app-frame,
  .app-shell,
  .topbar,
  .dashboard-grid,
  .panel,
  .results-panel,
  .activity-panel,
  .search-panel,
  .map-panel {
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }

  .topbar > *,
  .panel-header > *,
  .hero-kpi,
  .activity-grid,
  .form-grid {
    min-width: 0;
  }

  .results-wrap {
    max-width: 100%;
    overflow-x: auto;
  }

  .results-wrap table {
    min-width: 760px; /* ou manter 850px, desde que isolado no wrapper */
  }
}
```

Recomendação: aplicar o patch e retestar especificamente:
- viewport 390x844
- `document.documentElement.scrollWidth === document.documentElement.clientWidth`
- scroll horizontal apenas em `.results-wrap`, se a tabela precisar.

## Console
- Mensagens capturadas: 0
- Page errors: 0
- Resultado: PASS

# Prompt para o próximo setor - Melhorar identidade visual e logo do Local Rush

Contexto do produto:
O Local Rush é uma aplicação local de prospecção comercial baseada em OpenStreetMap + Overpass. A proposta do produto é ajudar o usuário a encontrar empresas locais, visualizar no mapa, avaliar oportunidade comercial e organizar histórico/recentes/salvas. O produto deve parecer uma ferramenta profissional de inteligência comercial local, não apenas um painel técnico.

Estado visual atual observado:
- Interface dark-mode first, com fundo preto/verde petróleo e grid sutil.
- Layout geral funcional e coerente: sidebar fixa, cards arredondados, mapa grande, formulário e tabela de resultados.
- Paleta atual usa ciano/turquesa como cor principal, com alguns verdes e amarelos nos scores.
- Logo atual é um ícone abstrato dentro de círculo turquesa, mas ainda parece genérico e não comunica claramente “local”, “rush”, “mapa”, “prospecção” ou “inteligência comercial”.
- A marca textual “Local Rush” está legível, mas a identidade ainda não tem um sistema visual forte o suficiente para ser memorável.
- O frontend tem boa base visual, porém ainda está com aparência de MVP/SaaS genérico escuro.

Objetivo:
Redesenhar e fortalecer a identidade visual do Local Rush, especialmente logo, marca, paleta, tipografia, ícones e detalhes de UI, mantendo a funcionalidade atual intacta.

Importante:
Não alterar fluxos, endpoints, estrutura funcional nem regras de negócio. O trabalho deve ser focado em identidade visual, refinamento estético, consistência de marca e percepção de produto premium.

Direção de marca desejada:
Local Rush deve transmitir:
- velocidade na descoberta de oportunidades locais;
- inteligência comercial/geográfica;
- confiança para prospecção B2B;
- tecnologia acessível, leve e objetiva;
- mapa, localização e movimento;
- ferramenta profissional, mas sem parecer corporativa pesada.

Referências de estilo recomendadas:
Usar como inspiração, sem copiar diretamente:
1. Linear
   - dark-mode preciso;
   - hierarquia limpa;
   - painéis escuros com bordas sutis;
   - uso econômico de cor de destaque;
   - sensação de produto premium e rápido.

2. Supabase
   - verde/ciano como assinatura técnica;
   - estética developer-friendly;
   - profundidade criada por bordas, não por excesso de sombra;
   - marca simples, reconhecível e aplicável em UI.

3. Mapbox / ferramentas geoespaciais
   - linguagem de mapa, pin, rota, radar, tiles, localização;
   - sensação de exploração territorial e precisão.

Problemas visuais atuais a resolver:
1. Logo pouco memorável
   - O símbolo atual é bonito, mas abstrato demais.
   - Precisa comunicar localização + velocidade + inteligência.
   - Deve funcionar em tamanhos pequenos na sidebar, favicon e botão mobile.

2. Identidade visual ainda genérica
   - O dashboard é funcional, mas poderia ter assinatura mais própria.
   - O ciano atual funciona, mas precisa de uma paleta mais sistemática.
   - Falta uma linguagem visual exclusiva: padrões, ícones, microdetalhes, motion ou textura de mapa.

3. Hierarquia visual pode ficar mais premium
   - Melhorar contraste entre títulos, labels, cards e ações primárias.
   - Reduzir excesso de “glow” genérico e usar acentos mais intencionais.
   - Refinar bordas, radius, estados ativos e badges.

4. Marca “Lead intelligence” pode ser melhor posicionada
   - Avaliar se o subtítulo deve continuar como “Lead intelligence” ou se deveria virar algo mais claro, como:
     - “Local lead intelligence”
     - “Prospecção geográfica”
     - “Mapeamento comercial local”
     - “Descubra leads no mapa”

Proposta de nova identidade:
Criar uma identidade chamada “Local Rush” com os seguintes elementos:

Logo:
- Criar símbolo simples e proprietário combinando 2 ou 3 conceitos:
  - pin de mapa;
  - seta/raio/movimento;
  - letra L ou R;
  - radar/círculo de alcance;
  - rota ou coordenada.
- Evitar ícone genérico de localização comum.
- Evitar logo complexo com muitos detalhes.
- Deve funcionar em:
  - 32x32 favicon;
  - 40x40 sidebar;
  - versão horizontal com texto;
  - versão monocromática;
  - fundo claro e escuro.

Sugestões de caminhos para o símbolo:
1. Pin + raio
   Um pin minimalista com um raio interno, comunicando localização rápida.

2. Rota + seta
   Uma linha de rota formando um “R” abstrato, terminando em seta.

3. Radar local
   Um círculo/radar com ponto central e seta diagonal, comunicando busca por oportunidade.

4. Monograma LR
   Letras L/R em formato geométrico, com corte diagonal sugerindo velocidade.

Paleta sugerida:
Manter dark-mode como principal, mas organizar tokens.

Dark:
- Background principal: #060B0D ou #070A0C
- Surface 1: #0B1417
- Surface 2: #102024
- Surface elevated: #152A2E
- Border subtle: rgba(137, 255, 238, 0.10)
- Border active: rgba(84, 235, 220, 0.42)

Accent:
- Primary aqua: #54EBDC
- Deep teal: #0EA5A3
- Electric mint: #9BFF8A
- Map blue: #3B82F6, somente para mapa/seleção

Status/score:
- Alta: verde-lima controlado, não neon excessivo
- Média: âmbar premium
- Baixa: coral/vermelho suave

Light theme:
- Background: #F4FAF8
- Surface: #FFFFFF
- Ink: #102024
- Muted: #5C7478
- Accent: #0EA5A3

Tipografia:
- Usar Inter, Geist ou Manrope.
- Evitar excesso de peso bold.
- Criar hierarquia mais refinada:
  - títulos: 600 ou 650, tracking levemente negativo;
  - labels técnicos: uppercase pequeno com letter-spacing controlado;
  - corpo: 400/500;
  - botões: 600.
- Considerar mono apenas para coordenadas, categorias técnicas e pequenos indicadores, não para todo o produto.

UI refinements esperados:
1. Sidebar
   - Melhorar presença da marca no topo.
   - Logo mais nítido e com leitura em tamanho pequeno.
   - Abas com estado ativo mais proprietário, talvez com barra lateral/acento ou pílula mais elegante.

2. Cards e painéis
   - Padronizar radius, bordas, backgrounds e sombras.
   - Reduzir sensação de caixas muito grandes e genéricas.
   - Dar mais profundidade com camadas sutis, não com glow exagerado.

3. Botões
   - Botão primário “Buscar empresas” deve ser o CTA mais forte da tela.
   - Botões secundários devem parecer menos importantes.
   - Estados hover/focus/disabled precisam estar consistentes.

4. Mapa
   - Integrar visualmente o mapa ao sistema, sem parecer um bloco externo solto.
   - Melhorar moldura, status e botão “Ajustar”.
   - Manter atribuições do OpenStreetMap visíveis.

5. Tabela/resultados
   - Melhorar legibilidade dos resultados.
   - Badges de score devem ficar mais premium e menos “chamativos demais”.
   - Links de contato/mapa podem virar chips consistentes.

6. Microdetalhes de marca
   - Criar padrão visual sutil inspirado em mapa/radar/grid.
   - Usar pequenos indicadores de coordenada/localização.
   - Criar set de ícones consistente para busca, histórico, recentes e salvas.

Entregáveis esperados:
1. Nova proposta de logo
   - SVG principal.
   - Versão horizontal com texto “Local Rush”.
   - Versão ícone isolado.
   - Versão monocromática.
   - Favicon.

2. Mini brand guide
   - Conceito da marca.
   - Paleta com tokens CSS.
   - Tipografia.
   - Regras de uso do logo.
   - Exemplos em fundo claro/escuro.

3. Aplicação no frontend atual
   - Atualizar visual sem quebrar funcionalidade.
   - Melhorar sidebar, botões, cards, badges, tabela e header.
   - Manter compatibilidade com tema claro/escuro.
   - Manter responsividade.

4. Arquivos finais
   - SVGs em `/frontend/assets/brand/`.
   - CSS atualizado em `/frontend/style.css`.
   - Se necessário, ajustes mínimos em `/frontend/index.html` para trocar logo/ícones.
   - Não alterar backend.

Critérios de aceitação:
- A tela deve continuar carregando em http://127.0.0.1:8000 sem erro de console.
- O logo deve ser reconhecível em 32px.
- O tema claro/escuro deve continuar funcionando e persistindo após reload.
- As abas da sidebar devem continuar funcionando.
- A busca deve continuar exibindo mapa, resultados, score e links.
- A responsividade mobile deve ser mantida ou melhorada.
- Não pode haver overflow horizontal global em mobile.
- O visual final deve parecer mais proprietário, premium e memorável do que o MVP atual.

Sugestão de execução em blocos:

Bloco 1 - Diagnóstico e proposta visual
- Analisar `frontend/index.html`, `frontend/style.css`, `frontend/script.js`.
- Propor 2 ou 3 direções de logo/identidade.
- Escolher uma direção principal.

Bloco 2 - Logo e assets
- Criar SVG do logo e favicon.
- Adicionar assets em `/frontend/assets/brand/`.
- Atualizar topo da sidebar para usar o novo logo.
- Testar leitura em desktop e mobile.

Bloco 3 - Tokens e CSS base
- Organizar tokens CSS de cor, radius, shadow, border e tipografia.
- Melhorar dark theme e light theme.
- Não alterar comportamento JS.

Bloco 4 - Componentes principais
- Refinar sidebar, botões, cards, inputs, mapa, tabela e badges.
- Garantir consistência dos estados ativos/hover/focus.

Bloco 5 - QA final
- Testar desktop.
- Testar mobile 390x844.
- Testar tema claro/escuro com reload.
- Testar busca real.
- Verificar console.
- Corrigir overflow horizontal se aparecer.

Prompt curto para iniciar o trabalho:

"Você é o setor de design/frontend. Redesenhe a identidade visual do Local Rush sem alterar funcionalidade. O produto é uma ferramenta de prospecção comercial local baseada em mapa/OpenStreetMap. Melhore logo, paleta, tipografia, sidebar, botões, cards, badges e tabela para parecer uma ferramenta premium de local lead intelligence. Use inspiração em Linear/Supabase/Mapbox, mas crie identidade própria. Entregue SVGs do logo, tokens CSS, aplicação no frontend atual e mantenha tema claro/escuro, busca, mapa, abas e responsividade funcionando. Corrija também qualquer overflow horizontal global em mobile. Trabalhe em blocos pequenos, testando e commitando entre blocos."

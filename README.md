# CodexSkillPack

Esta pasta contém um pacote de instruções para melhorar o desempenho do Codex em:

- landing pages modernas
- front-end com aparência menos genérica
- interfaces premium
- dashboards
- automações com logs, erros e testes
- copywriting com menos cara de IA

## Como usar no Codex App

O Codex não instala skills do Hermes diretamente. O caminho prático é usar um arquivo `AGENTS.md` dentro da raiz do seu projeto.

## Instalação em um projeto

1. Abra esta pasta:

```text
C:\Users\Micro\Desktop\CodexSkillPack
```

2. Copie o arquivo:

```text
AGENTS.md
```

3. Cole na raiz do projeto que você usa com o Codex.

Exemplo:

```text
meu-projeto/
├── AGENTS.md
├── package.json
├── src/
└── ...
```

4. Se o projeto usa GitHub, faça commit:

```bash
git add AGENTS.md
git commit -m "add codex project instructions"
git push
```

5. No Codex App, peça sempre:

```text
Siga o AGENTS.md.
```

## Prompt base recomendado

```text
Siga o AGENTS.md.

Quero criar uma landing page/interface/automaçao para [descreva seu produto].
Não quero resultado genérico de IA.
Antes de implementar, defina uma direção visual clara.
Se for visualmente importante, proponha 3 direções diferentes e depois implemente a mais forte.
Revise a copy para soar humana, direta e específica.
```

## Arquivos desta pasta

- `AGENTS.md`: arquivo principal para copiar para seus projetos.
- `PROMPTS.md`: prompts prontos para usar no Codex.
- `INSTALAR_NO_PROJETO.sh`: script para copiar o `AGENTS.md` desta pasta para um projeto.

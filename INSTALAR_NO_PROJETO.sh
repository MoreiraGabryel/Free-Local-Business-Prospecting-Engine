#!/usr/bin/env bash
set -euo pipefail

# Uso:
#   ./INSTALAR_NO_PROJETO.sh /c/Users/Micro/Desktop/meu-projeto
#
# Este script copia o AGENTS.md para a raiz do projeto escolhido.

if [ $# -lt 1 ]; then
  echo "Uso: $0 CAMINHO_DO_PROJETO"
  echo "Exemplo: $0 /c/Users/Micro/Desktop/meu-projeto"
  exit 1
fi

PROJETO="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -d "$PROJETO" ]; then
  echo "Erro: pasta do projeto não existe: $PROJETO"
  exit 1
fi

cp "$SCRIPT_DIR/AGENTS.md" "$PROJETO/AGENTS.md"

echo "AGENTS.md copiado para: $PROJETO/AGENTS.md"
echo "Agora abra o projeto no Codex e peça: Siga o AGENTS.md."

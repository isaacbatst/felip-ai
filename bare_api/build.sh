#!/bin/bash

# Script de build local para o projeto Felip AI
# Este script pode ser usado para testar o build localmente antes do deploy

set -e

echo "🔨 Iniciando build do Felip AI..."

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js não está instalado${NC}"
    exit 1
fi

# Verificar se npm está instalado
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm não está instalado${NC}"
    exit 1
fi

# Verificar versão do Node.js (deve ser 24.x)
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${YELLOW}⚠️  Node.js versão 18 ou superior recomendada${NC}"
fi

echo -e "${GREEN}✓${NC} Node.js $(node -v)"
echo -e "${GREEN}✓${NC} npm $(npm -v)"

# Limpar build anterior
echo ""
echo "🧹 Limpando build anterior..."
rm -rf dist
echo -e "${GREEN}✓${NC} Build anterior removido"

# Instalar dependências
echo ""
echo "📦 Instalando dependências..."
npm ci
echo -e "${GREEN}✓${NC} Dependências instaladas"

# Executar testes
echo ""
echo "🧪 Executando testes..."
if npm test; then
    echo -e "${GREEN}✓${NC} Testes passaram"
else
    echo -e "${RED}❌ Testes falharam${NC}"
    exit 1
fi

# Build do projeto
echo ""
echo "🔨 Compilando TypeScript..."
npm run build

# Verificar se o build foi bem-sucedido
if [ -d "dist" ] && [ -f "dist/index.js" ]; then
    echo -e "${GREEN}✓${NC} Build concluído com sucesso!"
    echo ""
    echo "📁 Arquivos gerados em: ./dist"
    echo ""
    echo "Para executar localmente:"
    echo "  npm start"
    echo ""
    echo "Para testar o Docker build:"
    echo "  docker build -t felip-ai:local ."
else
    echo -e "${RED}❌ Build falhou - dist/index.js não encontrado${NC}"
    exit 1
fi


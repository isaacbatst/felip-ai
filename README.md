# Felip AI - Bot Telegram com Integração Google Sheets

Bot Telegram que utiliza Google Sheets para gerenciar tabela de preços dinamicamente.

## 📋 Pré-requisitos

- Node.js (versão 18 ou superior)
- Conta Google com acesso ao Google Cloud Platform
- Planilha do Google Sheets configurada

## 🔧 Configuração

### 1. Formatação da Planilha do Google Sheets

A planilha deve seguir o seguinte formato:

| CPF | Quantidade (milhares) | Preço |
|-----|----------------------|-------|
| 1   | 30                   | 17    |
| 1   | 60                   | 16.5  |
| 1   | 90                   | 16.25 |
| 1   | 120                  | 16    |
| 2   | 30                   | 17.5  |
| 2   | 60                   | 17    |
| 2   | 90                   | 16.75 |
| 2   | 120                  | 16.25 |
| 3   | 60                   | 17    |
| 3   | 90                   | 17    |
| 3   | 120                  | 16.75 |
| 3   | 150                  | 16.5  |

**Regras importantes:**
- A primeira linha deve conter os cabeçalhos: `CPF`, `Quantidade (milhares)`, `Preço`
- A coluna **CPF** contém o número de CPFs (1, 2, 3, etc.)
- A coluna **Quantidade (milhares)** contém a quantidade em milhares (30, 60, 90, etc.)
- A coluna **Preço** contém o preço por milhar (use ponto ou vírgula como separador decimal)
- Linhas vazias ou com dados inválidos serão ignoradas
- Os dados devem estar na primeira aba (Sheet1) por padrão

### 2. Criar Service Account no Google Cloud Platform

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um novo projeto ou selecione um projeto existente
3. Ative a **Google Sheets API**:
   - Vá em "APIs & Services" > "Library"
   - Procure por "Google Sheets API"
   - Clique em "Enable"

4. Crie uma Service Account:
   - Vá em "APIs & Services" > "Credentials"
   - Clique em "Create Credentials" > "Service Account"
   - Preencha um nome para a service account (ex: "felip-ai-sheets")
   - Clique em "Create and Continue"
   - Você pode pular a etapa de permissões e clicar em "Done"

5. Gerar chave JSON:
   - Na lista de Service Accounts, clique na que você acabou de criar
   - Vá na aba "Keys"
   - Clique em "Add Key" > "Create new key"
   - Selecione "JSON" e clique em "Create"
   - O arquivo JSON será baixado automaticamente

6. Copie o email da Service Account:
   - Na página da Service Account, copie o email (formato: `nome@projeto.iam.gserviceaccount.com`)
   - Você precisará deste email para compartilhar a planilha

### 3. Compartilhar Planilha com Service Account

1. Abra sua planilha do Google Sheets
2. Clique no botão "Compartilhar" (canto superior direito)
3. Cole o email da Service Account que você copiou anteriormente
4. Dê permissão de **"Visualizador"** (Viewer) - apenas leitura é suficiente
5. Clique em "Enviar"
6. **Importante:** Desmarque a opção "Notificar pessoas" antes de enviar

### 4. Obter ID da Planilha

O ID da planilha está na URL do Google Sheets:

```
https://docs.google.com/spreadsheets/d/SEU_SPREADSHEET_ID_AQUI/edit
```

Copie apenas a parte `SEU_SPREADSHEET_ID_AQUI` (entre `/d/` e `/edit`).

### 5. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# Token do Telegram Bot
TELEGRAM_BOT_TOKEN=seu_token_aqui

# Configurações do Google Sheets
GOOGLE_SPREADSHEET_ID=seu_spreadsheet_id_aqui
GOOGLE_SPREADSHEET_RANGE=Sheet1
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=caminho/para/service-account-key.json

# Outras configurações (se necessário)
OPENAI_API_KEY=sua_chave_openai
```

**Explicação das variáveis:**
- `TELEGRAM_BOT_TOKEN`: Token do bot obtido no BotFather do Telegram
- `GOOGLE_SPREADSHEET_ID`: ID da planilha (obtido na etapa 4)
- `GOOGLE_SPREADSHEET_RANGE`: (Opcional) Range da planilha a ser lido
  - **Deixe vazio** para auto-detectar a primeira aba da planilha (recomendado)
  - **Ou especifique apenas o nome da aba**: `Sheet1` (o sistema tentará ler as colunas A:C automaticamente)
  - **Ou especifique range completo**: `Sheet1!A1:C1000` (se precisar de um range específico)
  - O sistema tentará automaticamente diferentes formatos se o primeiro falhar
- `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`: Caminho completo para o arquivo JSON da Service Account baixado na etapa 2

**Exemplo de caminho:**
```env
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/home/usuario/projetos/felip-ai/credentials/service-account-key.json
```

### 6. Instalar Dependências

```bash
npm install
```

## 🚀 Executando o Bot

### Modo Desenvolvimento

```bash
npm run dev
```

### Modo Produção (Local)

```bash
npm run build
npm start
```

Ou usando o script de build:

```bash
./build.sh
npm start
```

## 🚢 Deploy em Produção

O projeto está configurado para deploy automático usando Docker Swarm e GitHub Actions.

### Pré-requisitos para Deploy

1. **Repositório GitHub** configurado
2. **GitHub Container Registry (GHCR)** habilitado
3. **Servidor com Docker Swarm** configurado
4. **Traefik** como reverse proxy (mesmo ambiente do fingram-bot)
5. **SSH access** ao servidor de deploy

### Configuração do GitHub Secrets

Configure os seguintes secrets no repositório GitHub (Settings > Secrets and variables > Actions):

#### Secrets Obrigatórios:

- `TELEGRAM_BOT_TOKEN`: Token do bot Telegram obtido no BotFather
- `GOOGLE_SPREADSHEET_ID`: ID da planilha do Google Sheets
- `GOOGLE_SPREADSHEET_RANGE`: Range da planilha (opcional, pode deixar vazio)
- `OPENAI_API_KEY`: Chave da API da OpenAI
- `DEPLOY_SSH_PRIVATE_KEY`: Chave SSH privada para acesso ao servidor de deploy

#### Secrets Opcionais:

- `GOOGLE_SPREADSHEET_RANGE`: Se não configurado, será usado o padrão (deixe vazio para auto-detectar)

### Configuração do Servidor

#### 1. Criar usuário e diretórios no servidor

```bash
# Criar usuário (se ainda não existir)
sudo useradd -m -s /bin/bash felip-ai

# Criar diretório para o arquivo de service account
sudo mkdir -p /home/felip-ai
sudo chown felip-ai:felip-ai /home/felip-ai
```

#### 2. Copiar arquivo de Service Account

```bash
# No servidor, copie o arquivo JSON da Service Account
sudo cp service-account-key.json /home/felip-ai/service-account-key.json
sudo chown felip-ai:felip-ai /home/felip-ai/service-account-key.json
sudo chmod 600 /home/felip-ai/service-account-key.json
```

#### 3. Verificar Docker Swarm

Certifique-se de que o Docker Swarm está inicializado:

```bash
docker swarm init
```

### Arquivos de Deploy

O projeto inclui os seguintes arquivos para deploy:

- **`Dockerfile`**: Imagem Docker multi-stage para build e produção
- **`stack.yml`**: Configuração do Docker Swarm Stack
- **`.github/workflows/deploy.yml`**: Workflow do GitHub Actions para CI/CD
- **`build.sh`**: Script de build local para testes

### Processo de Deploy Automático

1. **Push para branch `main`**: O workflow do GitHub Actions é acionado automaticamente
2. **Testes**: Os testes são executados primeiro
3. **Build da imagem**: A imagem Docker é construída e enviada para o GHCR
4. **Deploy**: O stack é atualizado no servidor via SSH

### Deploy Manual

Se precisar fazer deploy manual:

```bash
# 1. Build local da imagem
docker build -t ghcr.io/isaacbatst/felip-ai:local .

# 2. Fazer login no GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# 3. Push da imagem
docker push ghcr.io/isaacbatst/felip-ai:local

# 4. No servidor, criar arquivo envfile
cat > envfile << EOF
TELEGRAM_BOT_TOKEN=seu_token
GOOGLE_SPREADSHEET_ID=seu_id
GOOGLE_SPREADSHEET_RANGE=
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/app/service-account-key.json
OPENAI_API_KEY=sua_chave
GIT_COMMIT_HASH=local
EOF

# 5. Deploy do stack
docker stack deploy -c stack.yml felip-ai --with-registry-auth
```

### Verificar Status do Deploy

```bash
# Verificar serviços do stack
docker stack services felip-ai

# Ver logs do serviço
docker service logs felip-ai_bot -f

# Verificar se o serviço está rodando
docker service ps felip-ai_bot
```

### Atualizar Configurações

Para atualizar variáveis de ambiente após o deploy inicial:

1. Atualize os secrets no GitHub (se necessário)
2. Faça um novo push para `main` (o workflow criará um novo `envfile`)
3. Ou edite manualmente o `envfile` no servidor e faça redeploy:

```bash
# No servidor
docker stack rm felip-ai
# Aguarde alguns segundos
docker stack deploy -c stack.yml felip-ai --with-registry-auth
```

### Troubleshooting do Deploy

#### Erro: "Image not found"
- Verifique se a imagem foi enviada corretamente para o GHCR
- Verifique se o usuário tem permissão para fazer pull da imagem
- Execute `docker login ghcr.io` no servidor

#### Erro: "Cannot connect to Docker daemon"
- Verifique se o Docker Swarm está inicializado: `docker swarm init`
- Verifique se o usuário SSH tem permissão para acessar o Docker


#### Erro: "Permission denied" ao ler service-account-key.json
- Verifique as permissões do arquivo no servidor: `chmod 644 /home/felip-ai/service-account-key.json`
- Ou remova a restrição `user: "1000:1000"` do `stack.yml` (já removido na versão atual)
- Verifique se o caminho no `stack.yml` está correto

#### Bot não está respondendo
- Verifique os logs: `docker service logs felip-ai_bot -f`
- Verifique se o `TELEGRAM_BOT_TOKEN` está correto
- Verifique se o arquivo `service-account-key.json` está acessível

## 📝 Estrutura de Dados

O bot espera que os dados da planilha sejam convertidos para o seguinte formato TypeScript:

```typescript
type PriceTableByCpf = {
  [cpfCount: number]: {
    [quantity: number]: number; // quantidade em milhares -> preço
  }
}
```

**Exemplo:**
```typescript
{
  1: {
    30: 17,
    60: 16.5,
    90: 16.25,
    120: 16
  },
  2: {
    30: 17.5,
    60: 17,
    90: 16.75,
    120: 16.25
  }
}
```

## 🔍 Troubleshooting

### Erro: "Planilha vazia ou não encontrada"
- Verifique se o `GOOGLE_SPREADSHEET_ID` está correto
- Verifique se a Service Account tem acesso à planilha
- Verifique se o range (`GOOGLE_SPREADSHEET_RANGE`) está correto ou deixe vazio para auto-detectar
- Verifique se a planilha tem dados nas colunas A, B e C

### Erro: "Unable to parse range"
- O sistema tentará automaticamente diferentes formatos de range
- Se o erro persistir, tente deixar `GOOGLE_SPREADSHEET_RANGE` vazio para auto-detectar
- Ou especifique apenas o nome da aba (ex: `Sheet1`) sem o formato `!A:C`

### Erro: "GOOGLE_SERVICE_ACCOUNT_KEY_FILE is not set"
- Verifique se a variável de ambiente está definida no arquivo `.env`
- Verifique se o caminho do arquivo está correto e o arquivo existe

### Erro: "Permission denied" ou "Access denied"
- Verifique se a Service Account foi compartilhada com a planilha
- Verifique se o email da Service Account está correto
- Aguarde alguns minutos após compartilhar a planilha (pode levar tempo para propagar)

### Dados não estão sendo carregados corretamente
- Verifique se a primeira linha contém os cabeçalhos corretos
- Verifique se os dados estão na formatação correta (números inteiros para CPF e Quantidade, número decimal para Preço)
- Verifique os logs do console para ver quais linhas estão sendo ignoradas

## 📚 Recursos Adicionais

- [Google Sheets API Documentation](https://developers.google.com/sheets/api)
- [Google Cloud Service Accounts](https://cloud.google.com/iam/docs/service-accounts)
- [Telegram Bot API](https://core.telegram.org/bots/api)

## 🔒 Segurança

- **Nunca** commite o arquivo JSON da Service Account no repositório
- Adicione `*.json` (ou especificamente o nome do arquivo) ao `.gitignore`
- Mantenha o arquivo `.env` fora do controle de versão
- Use apenas permissões de leitura (Viewer) para a Service Account na planilha


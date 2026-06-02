# 🧠 StudyMind AI — Extensão Chrome

Assistente de estudos com IA — sempre ao seu lado enquanto você navega.

## 📦 Instalação

### Método 1: Carregamento Manual (Desenvolvimento)

1. Abra o Google Chrome
2. Acesse `chrome://extensions`
3. Ative o **"Modo desenvolvedor"** no canto superior direito
4. Clique em **"Carregar sem compactação"**
5. Selecione a pasta `Extensão` (onde está o `manifest.json`)
6. A extensão será instalada automaticamente! 🎉

### ⚠️ Gerar os Ícones

Antes de carregar a extensão, gere os ícones:

1. Abra o arquivo `generate-icons.html` no Chrome
2. Clique em **"Gerar Ícones"**
3. Os arquivos `icon16.png`, `icon48.png` e `icon128.png` serão baixados
4. Mova-os para a pasta `icons/` da extensão

## 🔑 Configuração

1. Após instalar, clique no ícone da extensão ou acesse as **Configurações**
2. Adicione pelo menos uma chave de API:
   - **OpenAI**: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   - **Anthropic**: [console.anthropic.com](https://console.anthropic.com)
   - **Google AI**: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   - **Groq** (gratuito): [console.groq.com](https://console.groq.com)
3. Selecione o provedor e modelo padrão
4. Salve as configurações

## ✨ Funcionalidades

### 🗂️ Painel Lateral Persistente
- Abre ao clicar no ícone da extensão ou com `Ctrl+Shift+U`
- Fica sempre visível ao lado da página
- Chat completo com histórico e suporte a markdown

### ⚡ Chat Rápido (Ctrl+Shift+Y)
- Pressione `Ctrl+Shift+Y` em qualquer página
- Modal centralizado com resposta rápida da IA
- Feche com `Escape` ou clicando fora

### ✂️ Seleção Inteligente de Texto
- Selecione qualquer texto na página
- Tooltip flutuante com opções:
  - 📖 **Explicar** — explica o texto selecionado
  - 🌐 **Traduzir** — traduz para o idioma configurado
  - 📝 **Resumir** — resume o conteúdo
  - ✍️ **Reescrever** — simplifica o texto
  - 📋 **Copiar** — copia para a área de transferência

### 📄 Análise de Página
- Botão "Analisar esta página" no painel
- Gera resumo automático do conteúdo
- Faça perguntas sobre a página atual

### 📋 Menu de Contexto
- Clique com botão direito em texto selecionado
- Opções de Explicar, Traduzir e Resumir diretamente

### 💬 Chat Completo
- Histórico de conversa com scroll
- Suporte a markdown (negrito, listas, código)
- Exportar conversa como .txt
- Limpar e salvar histórico

## 🤖 Modelos Suportados

| Provider | Modelos |
|----------|---------|
| OpenAI | GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-3.5 Turbo |
| Anthropic | Claude Opus 4, Claude Sonnet 4, Claude Haiku |
| Google | Gemini 2.0 Flash, Gemini 1.5 Pro |
| Groq | Llama 3.3 70B, Mixtral 8x7B |

## ⌨️ Atalhos

| Atalho | Ação |
|--------|------|
| `Ctrl+Shift+Y` | Abrir chat rápido |
| `Ctrl+Shift+U` | Abrir/fechar painel lateral |

> Para personalizar atalhos: `chrome://extensions/shortcuts`

## ☁️ Sincronização em Nuvem (Supabase)

O StudyMind possui integração com o Supabase para autenticação e sincronização na nuvem.

1. Crie um projeto no [Supabase](https://supabase.com)
2. Execute o script `database_setup.sql` no SQL Editor do Supabase
3. Adicione a **URL** e **Chave Pública (Anon)** do Supabase nas Configurações da extensão
4. Faça login ou crie sua conta diretamente pela extensão para sincronizar seus dados

## 🔒 Segurança

- As chaves de API são armazenadas localmente via `chrome.storage.sync`
- Nenhum dado é enviado para servidores de terceiros além das APIs de IA configuradas
- Todas as chamadas de API são feitas no service worker (background.js) para segurança

## 📋 Requisitos

- Google Chrome 114+ (necessário para Side Panel API)
- Pelo menos uma chave de API configurada

## 📁 Estrutura do Projeto

```
studymind-extension/
├── manifest.json          # Configuração Manifest V3
├── background.js          # Service Worker
├── content.js             # Script injetado nas páginas
├── content.css            # Estilos do tooltip e quick chat
├── database_setup.sql     # Setup do banco de dados no Supabase
├── memoryManager.js       # Gerenciamento de memória e sync
├── supabaseClient.js      # Cliente de conexão com Supabase
├── popup/
│   ├── popup.html         # Popup da extensão
│   ├── popup.js           # Lógica do popup
│   └── popup.css          # Estilos do popup
├── sidebar/
│   ├── sidebar.html       # Painel lateral
│   ├── sidebar.js         # Lógica do painel
│   └── sidebar.css        # Estilos do painel
├── settings/
│   ├── settings.html      # Página de configurações
│   ├── settings.js        # Lógica das configurações
│   └── settings.css       # Estilos das configurações
├── icons/
│   ├── icon16.png         # Ícone 16x16
│   ├── icon48.png         # Ícone 48x48
│   └── icon128.png        # Ícone 128x128
└── README.md              # Este arquivo
```

## 📄 Licença

MIT License — Uso livre para estudos e aprendizado.

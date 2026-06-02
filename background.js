// ============================================================
// StudyMind AI — Service Worker (background.js)
// Gerencia eventos globais, chamadas de API e painel lateral
// ============================================================

// --- System Prompt ---
// O prompt agora é gerenciado pelo memoryManager.js e enviado dinamicamente pelo sidebar

// --- Instalação e inicialização ---
chrome.runtime.onInstalled.addListener(() => {
  // Configurar painel lateral
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Menu de contexto para texto selecionado
  chrome.contextMenus.create({
    id: "studymind-explain",
    title: "🧠 Explicar com StudyMind",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "studymind-translate",
    title: "🌐 Traduzir com StudyMind",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "studymind-summarize",
    title: "📝 Resumir com StudyMind",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "studymind-rewrite",
    title: "✍️ Reescrever com StudyMind",
    contexts: ["selection"]
  });

  // Configurações padrão na primeira instalação
  chrome.storage.sync.get(["settings"], ({ settings }) => {
    if (!settings) {
      chrome.storage.sync.set({
        settings: {
          provider: "openai",
          model: "gpt-4o",
          temperature: 0.7,
          language: "pt-BR",
          theme: "dark",
          openPanelOnStart: true,
          apiKeys: {}
        }
      });
    }
  });
});

// --- CORREÇÃO: Atalhos de teclado (Ctrl+Shift+Y / Ctrl+Shift+U) ---
// IMPORTANTE: NÃO usar async no listener principal — sidePanel.open() 
// exige contexto de gesto do usuário, que é perdido após qualquer await.
chrome.commands.onCommand.addListener((command) => {
  console.log("[StudyMind] Comando recebido:", command);

  if (command === "toggle-sidebar") {
    // sidePanel.open() DEVE ser chamado SEM await antes — usa callback
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.windowId) {
        chrome.sidePanel.open({ windowId: tab.windowId });
      }
    });
    return;
  }

  if (command === "open-quick-chat") {
    // Quick chat pode usar async pois não chama sidePanel.open diretamente
    handleOpenQuickChat();
  }
});

async function handleOpenQuickChat() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    console.warn("[StudyMind] Nenhuma aba ativa encontrada.");
    return;
  }

  const url = activeTab.url || "";
  const isChromeInternal = url.startsWith("chrome://") || 
                           url.startsWith("chrome-extension://") || 
                           url.startsWith("devtools://") ||
                           url.startsWith("edge://") ||
                           url === "" || url === "about:blank";

  if (isChromeInternal) {
    chrome.action.openPopup?.().catch(() => {});
    return;
  }

  try {
    await chrome.tabs.sendMessage(activeTab.id, { action: "openQuickChat" });
  } catch (err) {
    console.log("[StudyMind] Content script não encontrado, injetando...", err.message);
    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ["content.js"]
      });
      await chrome.scripting.insertCSS({
        target: { tabId: activeTab.id },
        files: ["content.css"]
      });
      await new Promise(resolve => setTimeout(resolve, 400));
      await chrome.tabs.sendMessage(activeTab.id, { action: "openQuickChat" });
    } catch (injectErr) {
      console.error("[StudyMind] Falha ao injetar content script:", injectErr.message);
    }
  }
}

// --- Menu de contexto ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const selectedText = info.selectionText;
  const actions = {
    "studymind-explain": "explain",
    "studymind-translate": "translate",
    "studymind-summarize": "summarize",
    "studymind-rewrite": "rewrite"
  };
  const action = actions[info.menuItemId];
  if (action && selectedText) {
    const prompts = {
      explain: `Explique o seguinte texto de forma clara e didática em português:\n\n"${selectedText}"`,
      translate: `Traduza o seguinte texto para o português brasileiro de forma natural:\n\n"${selectedText}"`,
      summarize: `Faça um resumo conciso e objetivo do seguinte texto em português:\n\n"${selectedText}"`,
      rewrite: `Reescreva o seguinte texto de forma mais simples e clara, mantendo o significado original, em português:\n\n"${selectedText}"`
    };

    await chrome.storage.session.set({
      pendingSelectionAction: {
        action,
        text: selectedText,
        prompt: prompts[action],
        timestamp: Date.now()
      }
    });
    await chrome.sidePanel.open({ windowId: tab.windowId });
    // Avisa o sidebar que tem ação pendente
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: "sidebarProcessPending" }).catch(() => {});
    }, 600);
  }
});

// --- Chamada de API de IA ---
async function callAI(messages, settings) {
  const { provider, model, temperature } = settings;
  const apiKey = settings.apiKeys?.[provider] || settings.apiKey;

  if (!apiKey) {
    throw new Error("Chave de API não configurada. Acesse as configurações para adicionar sua chave.");
  }

  const endpoints = {
    openai: "https://api.openai.com/v1/chat/completions",
    anthropic: "https://api.anthropic.com/v1/messages",
    groq: "https://api.groq.com/openai/v1/chat/completions",
    google: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  };

  // OpenAI & Groq (formato compatível)
  if (provider === "openai" || provider === "groq") {
    const response = await fetch(endpoints[provider], {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: temperature || 0.7,
        max_tokens: 4096,
        stream: false
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Erro ${response.status} na API ${provider}`);
    }
    const data = await response.json();
    return data.choices[0].message.content;
  }

  // Anthropic
  if (provider === "anthropic") {
    const systemMessage = messages.find(m => m.role === "system")?.content || "";
    const userMessages = messages.filter(m => m.role !== "system");

    const response = await fetch(endpoints.anthropic, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemMessage,
        messages: userMessages
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Erro ${response.status} na API Anthropic`);
    }
    const data = await response.json();
    return data.content[0].text;
  }

  // Google AI (Gemini)
  if (provider === "google") {
    const systemInstruction = messages.find(m => m.role === "system")?.content || "";
    const contents = messages
      .filter(m => m.role !== "system")
      .map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));

    const response = await fetch(endpoints.google, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: { temperature: temperature || 0.7, maxOutputTokens: 4096 }
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Erro ${response.status} na API Google AI`);
    }
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }

  throw new Error(`Provider "${provider}" não suportado.`);
}

// --- Streaming de API ---
async function callAIStream(messages, settings, sendChunk) {
  const { provider, model, temperature } = settings;
  const apiKey = settings.apiKeys?.[provider] || settings.apiKey;

  if (!apiKey) {
    throw new Error("Chave de API não configurada.");
  }

  // Streaming para OpenAI / Groq
  if (provider === "openai" || provider === "groq") {
    const endpoint = provider === "openai"
      ? "https://api.openai.com/v1/chat/completions"
      : "https://api.groq.com/openai/v1/chat/completions";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: temperature || 0.7,
        max_tokens: 4096,
        stream: true
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Erro ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") return;
          try {
            const json = JSON.parse(data);
            const content = json.choices[0]?.delta?.content;
            if (content) sendChunk(content);
          } catch (e) { /* skip malformed chunks */ }
        }
      }
    }
    return;
  }

  // Fallback: non-streaming for other providers
  const result = await callAI(messages, settings);
  sendChunk(result);
}

// --- Listener de mensagens ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // CORREÇÃO 2: Handler para ação vinda do tooltip de seleção
  if (message.action === "processSelectionAction") {
    const { prompt, text, selectionAction } = message;

    // Salva na session storage para o painel ler
    chrome.storage.session.set({
      pendingSelectionAction: {
        action: selectionAction,
        text: text,
        prompt: prompt,
        timestamp: Date.now()
      }
    });

    // Abre o painel lateral
    chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
      if (tab?.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
        // Aguarda o painel abrir, depois envia a mensagem
        setTimeout(() => {
          chrome.runtime.sendMessage({
            action: "sidebarProcessPending"
          }).catch(() => {}); // Ignora erro se painel ainda não está pronto
        }, 600);
      }
    });

    sendResponse({ success: true });
    return true;
  }

  // Handler: Ação de seleção de texto (legado, mantido para compatibilidade)
  if (message.action === "selectionAction") {
    const { selectionAction, text } = message;
    const prompts = {
      explain: `Explique o seguinte texto de forma clara e didática em português:\n\n"${text}"`,
      translate: `Traduza o seguinte texto para o português brasileiro de forma natural:\n\n"${text}"`,
      summarize: `Faça um resumo conciso e objetivo do seguinte texto em português:\n\n"${text}"`,
      rewrite: `Reescreva o seguinte texto de forma mais simples e clara, mantendo o significado original, em português:\n\n"${text}"`
    };

    chrome.storage.session.set({
      pendingSelectionAction: {
        action: selectionAction,
        text,
        prompt: prompts[selectionAction],
        timestamp: Date.now()
      }
    });

    chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
      if (tab?.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
        setTimeout(() => {
          chrome.runtime.sendMessage({ action: "sidebarProcessPending" }).catch(() => {});
        }, 600);
      }
    });

    return false;
  }

  // Chamada de IA simples (sem streaming)
  if (message.action === "callAI") {
    handleCallAI(message, sendResponse);
    return true;
  }

  // Chamada de IA com streaming
  if (message.action === "callAIStream") {
    handleCallAIStream(message, sender);
    return false;
  }

  // Obter conteúdo da página
  if (message.action === "getPageContent") {
    handleGetPageContent(sendResponse);
    return true;
  }

  // Abrir painel lateral com ação pendente (usado pelo tooltip Shadow DOM)
  if (message.action === "openSidebarWithPending") {
    chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
      if (!tab?.windowId) return;
      await chrome.sidePanel.open({ windowId: tab.windowId });
      // Aguarda o painel carregar antes de avisar
      setTimeout(() => {
        chrome.runtime.sendMessage({ action: "sidebarProcessPending" }).catch(() => {});
      }, 700);
    });
    sendResponse({ success: true });
    return true;
  }

  // Abrir painel lateral
  if (message.action === "openSidePanel") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]) {
        await chrome.sidePanel.open({ windowId: tabs[0].windowId });
      }
    });
    return false;
  }
});

async function handleCallAI(message, sendResponse) {
  try {
    const { settings: storedSettings } = await chrome.storage.sync.get(["settings"]);
    const settings = storedSettings || {};

    // As mensagens geralmente já vêm com o system prompt do sidebar
    // Se por acaso vier sem, não fazemos append estático aqui, pois sidebar.js sempre inclui.
    let messages = message.messages;

    const response = await callAI(messages, settings);
    sendResponse({ success: true, content: response });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleCallAIStream(message, sender) {
  try {
    const { settings: storedSettings } = await chrome.storage.sync.get(["settings"]);
    const settings = storedSettings || {};

    let messages = message.messages;

    await callAIStream(messages, settings, (chunk) => {
      chrome.runtime.sendMessage({
        action: "streamChunk",
        chunk,
        messageId: message.messageId
      }).catch(() => {});
    });

    chrome.runtime.sendMessage({
      action: "streamDone",
      messageId: message.messageId
    }).catch(() => {});

  } catch (error) {
    chrome.runtime.sendMessage({
      action: "streamError",
      error: error.message,
      messageId: message.messageId
    }).catch(() => {});
  }
}

async function handleGetPageContent(sendResponse) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          const article = document.querySelector("article") || document.querySelector("main") || document.body;
          const title = document.title;
          const text = article.innerText.substring(0, 8000);
          return { title, text, url: window.location.href };
        }
      });
      sendResponse({ success: true, data: results[0]?.result });
    }
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

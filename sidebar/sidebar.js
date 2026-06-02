// ============================================================
// StudyMind AI — Sidebar Logic (sidebar.js)
// Chat, resumo, histórico e integração com background
// VERSÃO CORRIGIDA — pendingSelectionAction + system prompt
// ============================================================

(function () {
  "use strict";

  // Check auth state immediately
  (async () => {
    const sidebarApp = document.getElementById("sidebar-app");
    const sidebarAuth = document.getElementById("sidebar-auth");

    try {
      const session = await supabase.auth.getSession();
      if (session) {
        sidebarApp.style.display = "flex";
        sidebarAuth.style.display = "none";
      } else {
        sidebarApp.style.display = "none";
        sidebarAuth.style.display = "flex";
      }
    } catch (err) {
      console.error("Auth check failed:", err);
      sidebarApp.style.display = "none";
      sidebarAuth.style.display = "flex";
    }

    // --- Auth UI Logic ---
    let isLogin = true;
    const tabLogin = document.getElementById("tab-login");
    const tabRegister = document.getElementById("tab-register");
    const btnSubmit = document.getElementById("btn-auth-submit");
    const emailInput = document.getElementById("auth-email");
    const passInput = document.getElementById("auth-password");
    const errorDiv = document.getElementById("auth-error");

    const switchTab = (toLogin) => {
      isLogin = toLogin;
      if (isLogin) {
        tabLogin.classList.add("active");
        tabLogin.style.background = "var(--bg-surface-3)";
        tabLogin.style.color = "var(--text-primary)";
        tabRegister.style.background = "transparent";
        tabRegister.style.color = "var(--text-secondary)";
        btnSubmit.textContent = "Entrar";
      } else {
        tabRegister.classList.add("active");
        tabRegister.style.background = "var(--bg-surface-3)";
        tabRegister.style.color = "var(--text-primary)";
        tabLogin.style.background = "transparent";
        tabLogin.style.color = "var(--text-secondary)";
        btnSubmit.textContent = "Criar Conta";
      }
      if (errorDiv) errorDiv.style.display = "none";
    };

    if (tabLogin) tabLogin.addEventListener("click", () => switchTab(true));
    if (tabRegister) tabRegister.addEventListener("click", () => switchTab(false));

    const authForm = document.getElementById("auth-form");
    if (authForm) {
      authForm.addEventListener("submit", async (e) => {
        e.preventDefault(); // Prevent default form submission
        const email = emailInput.value.trim();
        const password = passInput.value.trim();

        if (!email || !password) {
          errorDiv.textContent = "Preencha e-mail e senha";
          errorDiv.style.display = "block";
          return;
        }

        btnSubmit.disabled = true;
        btnSubmit.textContent = "Aguarde...";
        errorDiv.style.display = "none";

        try {
          if (isLogin) {
            await supabase.auth.signIn(email, password);
            location.reload();
          } else {
            await supabase.auth.signUp(email, password);
            
            // Show success message instead of reloading instantly
            errorDiv.style.color = "#10b981"; // green
            errorDiv.textContent = "Cadastro efetuado com sucesso! Entrando...";
            errorDiv.style.display = "block";
            
            setTimeout(() => {
              location.reload();
            }, 1500);
          }
        } catch (err) {
          errorDiv.style.color = "#ef4444"; // red
          errorDiv.textContent = err.message || "Erro de autenticação";
          errorDiv.style.display = "block";
          btnSubmit.disabled = false;
          btnSubmit.textContent = isLogin ? "Entrar" : "Criar Conta";
        }
      });
    }

    // Logout Handler
    const btnSidebarLogout = document.getElementById("btn-sidebar-logout");
    if (btnSidebarLogout) {
      btnSidebarLogout.addEventListener("click", async () => {
        if (typeof supabase !== 'undefined') {
          await supabase.auth.signOut();
          location.reload();
        }
      });
    }
  })();

  // System Prompt dinâmico gerado pelo memoryManager.js

  // --- State ---
  let chatHistory = [];
  let isProcessing = false;
  let pageContext = null;

  // --- DOM Elements ---
  const messagesContainer = document.getElementById("messages");
  const chatInput = document.getElementById("chat-input");
  const sendBtn = document.getElementById("send-btn");
  const modelSelector = document.getElementById("model-selector");

  // --- Init ---
  init();

  async function init() {
    loadSettings();
    setupEventListeners();
    loadChatHistory();
    // Check pending actions after a short delay to ensure sidebar is ready
    setTimeout(() => checkPendingAction(), 300);
  }

  // --- Settings ---
  function loadSettings() {
    chrome.storage.sync.get(["settings"], ({ settings }) => {
      if (settings) {
        const value = `${settings.provider}:${settings.model}`;
        const option = modelSelector?.querySelector(`option[value="${value}"]`);
        if (option) modelSelector.value = value;
        if (settings.theme === "light") document.body.classList.add("light");
      }
    });
  }

  // --- Event Listeners ---
  function setupEventListeners() {
    // Send message
    sendBtn?.addEventListener("click", sendMessage);
    chatInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Auto-resize textarea
    chatInput?.addEventListener("input", () => {
      chatInput.style.height = "auto";
      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
    });

    // Tabs
    document.querySelectorAll(".tab").forEach(tab => {
      tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });

    // Header buttons
    document.getElementById("btn-settings")?.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });
    document.getElementById("btn-clear")?.addEventListener("click", clearChat);
    document.getElementById("btn-export")?.addEventListener("click", exportChat);
    document.getElementById("btn-analyze")?.addEventListener("click", analyzePage);
    document.getElementById("btn-analyze-page")?.addEventListener("click", analyzePage);
    document.getElementById("btn-attach")?.addEventListener("click", attachPageContext);

    // Model selector
    modelSelector?.addEventListener("change", () => {
      const [provider, model] = modelSelector.value.split(":");
      chrome.storage.sync.get(["settings"], ({ settings }) => {
        settings = settings || {};
        settings.provider = provider;
        settings.model = model;
        chrome.storage.sync.set({ settings });
      });
    });

    // Welcome chips
    document.querySelectorAll(".chip").forEach(chip => {
      chip.addEventListener("click", () => {
        if (chatInput) chatInput.value = chip.dataset.prompt;
        sendMessage();
      });
    });

    // CORREÇÃO 3: Escuta mensagem do background (ação de seleção pendente)
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === "sidebarProcessPending") {
        processPendingAction();
      }
      if (message.action === "streamChunk") {
        appendStreamChunk(message.chunk, message.messageId);
      }
      if (message.action === "streamDone") {
        finishStream(message.messageId);
      }
      if (message.action === "streamError") {
        showStreamError(message.error, message.messageId);
      }
    });
  }

  // --- Tab Switching ---
  function switchTab(tabId) {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    document.querySelector(`.tab[data-tab="${tabId}"]`)?.classList.add("active");
    document.getElementById(`tab-${tabId}`)?.classList.add("active");
    if (tabId === "history") loadHistory();
  }

  // --- CORREÇÃO 3: Check Pending Action (usa pendingSelectionAction) ---
  async function checkPendingAction() {
    // Verifica o novo formato (pendingSelectionAction)
    const { pendingSelectionAction } = await chrome.storage.session.get(["pendingSelectionAction"]);
    if (pendingSelectionAction) {
      await chrome.storage.session.remove(["pendingSelectionAction"]);
      await processPendingSelectionAction(pendingSelectionAction);
      return;
    }

    // Verifica formato legado (pendingAction) para compatibilidade
    const { pendingAction } = await chrome.storage.session.get(["pendingAction"]);
    if (pendingAction) {
      await chrome.storage.session.remove(["pendingAction"]);
      const { action, text } = pendingAction;
      const prompts = {
        explain: `Explique o seguinte texto de forma clara e didática em português:\n\n"${text}"`,
        translate: `Traduza o seguinte texto para o português brasileiro de forma natural:\n\n"${text}"`,
        summarize: `Faça um resumo conciso e objetivo do seguinte texto em português:\n\n"${text}"`,
        rewrite: `Reescreva o seguinte texto de forma mais simples e clara, mantendo o significado original, em português:\n\n"${text}"`
      };
      await processPendingSelectionAction({
        action,
        text,
        prompt: prompts[action] || text
      });
    }
  }

  // Chamado pelo listener de mensagem sidebarProcessPending
  async function processPendingAction() {
    const { pendingSelectionAction } = await chrome.storage.session.get(["pendingSelectionAction"]);
    if (!pendingSelectionAction) return;
    await chrome.storage.session.remove(["pendingSelectionAction"]);
    await processPendingSelectionAction(pendingSelectionAction);
  }

  async function processPendingSelectionAction(pending) {
    const { action, text, prompt } = pending;

    const actionLabels = {
      explain: "📖 Explicar",
      translate: "🌐 Traduzir",
      summarize: "📝 Resumir",
      rewrite: "✍️ Reescrever"
    };

    // Switch to chat tab
    switchTab("chat");

    // Hide welcome
    const welcome = messagesContainer?.querySelector(".welcome-message");
    if (welcome) welcome.style.display = "none";

    const label = actionLabels[action] || action;
    const displayText = text.length > 80 ? text.slice(0, 80) + "…" : text;

    // Mostra a ação e o texto no chat
    addActionLabel(label);
    addMessage("user", displayText);

    // Mostra loading
    isProcessing = true;
    if (sendBtn) sendBtn.disabled = true;
    const typingEl = addTypingIndicator();

    // Monta as mensagens usando Memória
    const personalizedSystemPrompt = await buildPersonalizedSystemPrompt();
    const messages = [
      { role: "system", content: personalizedSystemPrompt },
      { role: "user", content: prompt || text }
    ];

    try {
      const response = await chrome.runtime.sendMessage({
        action: "callAI",
        messages
      });

      typingEl.remove();

      if (response?.success) {
        addMessage("assistant", response.content);
        chatHistory.push(
          { role: "user", content: displayText },
          { role: "assistant", content: response.content }
        );
        saveChatHistory();
        
        // ✨ Atualiza a memória com esta interação
        await updateMemoryAfterInteraction(displayText, response.content);
      } else {
        addMessage("assistant", `❌ **Erro:** ${response?.error || "Não foi possível obter resposta."}\n\nVerifique suas chaves de API nas configurações.`);
      }
    } catch (error) {
      typingEl.remove();
      addMessage("assistant", `❌ **Erro:** ${error.message}`);
    }

    isProcessing = false;
    if (sendBtn) sendBtn.disabled = false;
    scrollToBottom();
  }

  // --- Send Message ---
  async function sendMessage() {
    const text = chatInput?.value?.trim();
    if (!text || isProcessing) return;

    // Hide welcome
    const welcome = messagesContainer?.querySelector(".welcome-message");
    if (welcome) welcome.style.display = "none";

    addMessage("user", text);
    if (chatInput) {
      chatInput.value = "";
      chatInput.style.height = "auto";
    }

    await processAI(text);
  }

  // --- Process AI ---
  async function processAI(text) {
    isProcessing = true;
    if (sendBtn) sendBtn.disabled = true;

    // Show typing indicator
    const typingEl = addTypingIndicator();

    // Build messages with memory system prompt
    const personalizedSystemPrompt = await buildPersonalizedSystemPrompt();
    const messages = [
      { role: "system", content: personalizedSystemPrompt }
    ];

    // Add page context if attached
    if (pageContext) {
      messages.push({
        role: "user",
        content: `[Contexto da página: "${pageContext.title}"]\n${pageContext.text.substring(0, 4000)}`
      });
    }

    // Add chat history (last 10 messages for context)
    const recentHistory = chatHistory.slice(-10);
    messages.push(...recentHistory);
    messages.push({ role: "user", content: text });

    try {
      const response = await chrome.runtime.sendMessage({
        action: "callAI",
        messages
      });

      typingEl.remove();

      if (response?.success) {
        addMessage("assistant", response.content);
        chatHistory.push(
          { role: "user", content: text },
          { role: "assistant", content: response.content }
        );
        saveChatHistory();
        
        // ✨ Atualiza a memória com esta interação
        await updateMemoryAfterInteraction(text, response.content);
      } else {
        addMessage("assistant", `❌ **Erro:** ${response?.error || "Não foi possível obter resposta."}\n\nVerifique suas chaves de API nas configurações.`);
      }
    } catch (error) {
      typingEl.remove();
      addMessage("assistant", `❌ **Erro:** ${error.message}`);
    }

    isProcessing = false;
    if (sendBtn) sendBtn.disabled = false;
    scrollToBottom();
  }

  // --- UI Helpers ---
  function addMessage(role, content) {
    const msgEl = document.createElement("div");
    msgEl.className = `message ${role}`;

    if (role === "assistant") {
      const header = document.createElement("div");
      header.className = "msg-header";
      header.innerHTML = `<span class="msg-avatar">🧠</span> StudyMind`;
      msgEl.appendChild(header);

      const body = document.createElement("div");
      body.className = "msg-body";
      body.innerHTML = renderMarkdown(content);
      msgEl.appendChild(body);
    } else {
      msgEl.textContent = content;
    }

    messagesContainer?.appendChild(msgEl);
    scrollToBottom();
    return msgEl;
  }

  function addTypingIndicator() {
    const el = document.createElement("div");
    el.className = "typing-indicator";
    el.innerHTML = `
      <div class="typing-dots"><span></span><span></span><span></span></div>
      <span class="typing-text">Pensando...</span>
    `;
    messagesContainer?.appendChild(el);
    scrollToBottom();
    return el;
  }

  function addActionLabel(text) {
    const label = document.createElement("div");
    label.className = "action-label";
    label.textContent = text;
    messagesContainer?.appendChild(label);
  }

  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  // --- Markdown Renderer ---
  function renderMarkdown(text) {
    if (!text) return "";
    let html = escapeHtml(text);

    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code>${code}</code></pre>`;
    });
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Headers
    html = html.replace(/^#### (.*$)/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h2>$1</h2>');
    // Unordered lists
    html = html.replace(/^\- (.*$)/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
    // Ordered lists
    html = html.replace(/^\d+\. (.*$)/gm, '<li>$1</li>');
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    // Clean up extra <br> after block elements
    html = html.replace(/<\/(pre|h[1-4]|ul|ol|li)><br>/g, '</$1>');

    return html;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // --- Streaming ---
  let streamBuffers = {};

  function appendStreamChunk(chunk, messageId) {
    if (!streamBuffers[messageId]) {
      streamBuffers[messageId] = { el: addMessage("assistant", ""), content: "" };
    }
    streamBuffers[messageId].content += chunk;
    const body = streamBuffers[messageId].el.querySelector(".msg-body");
    if (body) body.innerHTML = renderMarkdown(streamBuffers[messageId].content);
    scrollToBottom();
  }

  function finishStream(messageId) {
    if (streamBuffers[messageId]) {
      chatHistory.push({ role: "assistant", content: streamBuffers[messageId].content });
      saveChatHistory();
      delete streamBuffers[messageId];
    }
    isProcessing = false;
    if (sendBtn) sendBtn.disabled = false;
  }

  function showStreamError(error, messageId) {
    if (streamBuffers[messageId]) {
      const body = streamBuffers[messageId].el.querySelector(".msg-body");
      if (body) body.innerHTML = `<span style="color: var(--error)">❌ ${error}</span>`;
      delete streamBuffers[messageId];
    }
    isProcessing = false;
    if (sendBtn) sendBtn.disabled = false;
  }

  // --- Page Analysis ---
  async function analyzePage() {
    switchTab("summary");
    const summaryEl = document.getElementById("summary-result");
    const emptyState = document.querySelector("#tab-summary .empty-state");

    if (emptyState) emptyState.style.display = "none";
    if (summaryEl) {
      summaryEl.style.display = "block";
      summaryEl.innerHTML = `
        <div class="typing-indicator">
          <div class="typing-dots"><span></span><span></span><span></span></div>
          <span class="typing-text">Analisando página...</span>
        </div>
      `;
    }

    try {
      const pageResponse = await chrome.runtime.sendMessage({ action: "getPageContent" });

      if (!pageResponse?.success) {
        if (summaryEl) summaryEl.innerHTML = `<p style="color: var(--error)">❌ Não foi possível acessar o conteúdo da página.</p>`;
        return;
      }

      const pageData = pageResponse.data;
      const response = await chrome.runtime.sendMessage({
        action: "callAI",
        messages: [
          { role: "system", content: "Analise o conteúdo da página e crie um resumo completo em português. Inclua: 1) Resumo geral, 2) Pontos-chave, 3) Conceitos importantes. Use markdown." },
          { role: "user", content: `Título: ${pageData.title}\nURL: ${pageData.url}\n\nConteúdo:\n${pageData.text}` }
        ]
      });

      if (response?.success) {
        if (summaryEl) summaryEl.innerHTML = `<div class="message assistant" style="max-width:100%;border:none;background:transparent;padding:0;">${renderMarkdown(response.content)}</div>`;
      } else {
        if (summaryEl) summaryEl.innerHTML = `<p style="color: var(--error)">❌ ${response?.error || "Erro na análise"}</p>`;
      }
    } catch (error) {
      if (summaryEl) summaryEl.innerHTML = `<p style="color: var(--error)">❌ ${error.message}</p>`;
    }
  }

  // --- Page Context ---
  async function attachPageContext() {
    try {
      const response = await chrome.runtime.sendMessage({ action: "getPageContent" });
      if (response?.success) {
        pageContext = response.data;
        showToast(`📄 Contexto anexado: "${pageContext.title}"`);
      } else {
        showToast("❌ Não foi possível obter conteúdo da página");
      }
    } catch (e) {
      showToast("❌ Erro ao obter conteúdo");
    }
  }

  // --- Chat Management ---
  function clearChat() {

    chatHistory = [];
    if (messagesContainer) {
      messagesContainer.innerHTML = "";
    }
    pageContext = null;

    // Restore welcome
    if (messagesContainer) {
      messagesContainer.innerHTML = `
        <div class="welcome-message">
          <div class="welcome-icon">🧠</div>
          <h2 class="welcome-title">Olá! Sou o StudyMind AI</h2>
          <p class="welcome-text">Seu assistente de estudos com IA. Selecione texto em qualquer página, faça perguntas ou analise conteúdos.</p>
          <div class="welcome-chips">
            <button class="chip" data-prompt="Explique o conceito de fotossíntese">🌱 Fotossíntese</button>
            <button class="chip" data-prompt="O que é a teoria da relatividade?">⚛️ Relatividade</button>
            <button class="chip" data-prompt="Resuma a Segunda Guerra Mundial">📚 História</button>
            <button class="chip" data-prompt="Como funciona a internet?">🌐 Internet</button>
          </div>
        </div>
      `;

      // Re-bind chip listeners
      document.querySelectorAll(".chip").forEach(chip => {
        chip.addEventListener("click", () => {
          if (chatInput) chatInput.value = chip.dataset.prompt;
          sendMessage();
        });
      });
    }

    chrome.storage.session.remove(["chatHistory"]);
    window.__studymindConvId = null; // Nova conversa terá um novo ID
    showToast("🗑️ Conversa limpa");
  }

  function exportChat() {
    if (chatHistory.length === 0) {
      showToast("Nenhuma conversa para exportar");
      return;
    }

    let text = "=== StudyMind AI — Conversa Exportada ===\n";
    text += `Data: ${new Date().toLocaleString("pt-BR")}\n\n`;

    chatHistory.forEach(msg => {
      const role = msg.role === "user" ? "👤 Você" : "🧠 StudyMind";
      text += `${role}:\n${msg.content}\n\n---\n\n`;
    });

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `studymind-chat-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("📥 Conversa exportada!");
  }

  // --- Persistence ---
  function saveChatHistory() {
    // Salva na session (conversa atual - para restaurar ao reabrir o painel)
    chrome.storage.session.set({ chatHistory: chatHistory.slice(-50) });
    // Também persiste no histórico local para não perder ao fechar
    saveToHistory();
  }

  function loadChatHistory() {
    chrome.storage.session.get(["chatHistory"], ({ chatHistory: saved }) => {
      if (saved && saved.length > 0) {
        chatHistory = saved;
        const welcome = messagesContainer?.querySelector(".welcome-message");
        if (welcome) welcome.style.display = "none";
        saved.forEach(msg => addMessage(msg.role, msg.content));
      }
    });
  }

  // Salva a conversa atual no histórico persistente (chrome.storage.local e Supabase)
  function saveToHistory() {
    if (chatHistory.length === 0) return;

    const firstUserMsg = chatHistory.find(m => m.role === "user");
    const currentConv = {
      id: window.__studymindConvId || Date.now().toString(),
      title: firstUserMsg?.content?.substring(0, 60) || "Conversa",
      date: new Date().toISOString(),
      messages: chatHistory,
      messageCount: chatHistory.length
    };

    // Guarda o ID da conversa atual para atualizar em vez de duplicar
    window.__studymindConvId = currentConv.id;

    chrome.storage.local.get(["conversationHistory"], async ({ conversationHistory }) => {
      const history = conversationHistory || [];

      // Atualiza conversa existente ou adiciona nova
      const existingIndex = history.findIndex(c => c.id === currentConv.id);
      if (existingIndex >= 0) {
        history[existingIndex] = currentConv;
      } else {
        history.unshift(currentConv);
      }

      // Mantém apenas as últimas 50 conversas
      chrome.storage.local.set({ conversationHistory: history.slice(0, 50) });

      // Supabase Sync
      try {
        if (typeof supabase !== 'undefined') {
          const session = await supabase.auth.getSession();
          if (session) {
            await supabase.db.upsert('chat_conversations', {
              id: currentConv.id,
              user_id: session.user.id,
              title: currentConv.title,
              messages: currentConv.messages,
              message_count: currentConv.messageCount,
              updated_at: new Date().toISOString()
            });
          }
        }
      } catch (err) {
        console.error("Erro ao salvar chat no Supabase:", err);
      }
    });
  }

  // Salva ao fechar o painel ou mudar de página
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && chatHistory.length > 0) {
      saveToHistory();
    }
  });

  function loadHistory() {
    const container = document.getElementById("history-content");
    if (!container) return;

    chrome.storage.local.get(["conversationHistory"], async ({ conversationHistory }) => {
      let history = conversationHistory || [];
      
      // Sync from Supabase
      try {
        if (typeof supabase !== 'undefined') {
          const session = await supabase.auth.getSession();
          if (session) {
            const dbHistory = await supabase.db.select('chat_conversations', `user_id=eq.${session.user.id}&order=updated_at.desc.nullslast&limit=50`);
            if (dbHistory && dbHistory.length > 0) {
              history = dbHistory.map(conv => ({
                id: conv.id,
                title: conv.title,
                date: conv.updated_at || conv.created_at,
                messages: conv.messages,
                messageCount: conv.message_count
              }));
              chrome.storage.local.set({ conversationHistory: history });
            }
          }
        }
      } catch (err) {
        console.error("Erro ao sincronizar histórico do Supabase:", err);
      }

      if (history.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📋</div>
            <h3>Sem histórico</h3>
            <p>Suas conversas anteriores aparecerão aqui.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = history.map(conv => `
        <div class="history-item" data-id="${conv.id}">
          <div class="history-item-title">${escapeHtml(conv.title)}</div>
          <div class="history-item-meta">
            <span>${new Date(conv.date).toLocaleDateString("pt-BR")}</span>
            <span>${conv.messageCount || 0} mensagens</span>
          </div>
        </div>
      `).join("");

      container.querySelectorAll(".history-item").forEach(item => {
        item.addEventListener("click", () => {
          const id = parseInt(item.dataset.id);
          const conv = history.find(c => c.id === id);
          if (conv) {
            chatHistory = conv.messages;
            if (messagesContainer) messagesContainer.innerHTML = "";
            conv.messages.forEach(msg => addMessage(msg.role, msg.content));
            switchTab("chat");
          }
        });
      });
    });
  }

  // --- Toast ---
  function showToast(message) {
    const existing = document.querySelector(".toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }
})();

// ============================================================
// StudyMind AI — Content Script (content.js)
// Injetado em todas as páginas
// v1.0.4 — Shadow DOM tooltip + Ctrl+Shift+Y quick chat
// ============================================================

(function () {
  "use strict";

  // --- SISTEMA DE RELOAD SEGURO ---
  // Quando a extensão recarrega, o Chrome re-injeta este script.
  // O AbortController cancela TODOS os listeners da instância anterior,
  // garantindo que nunca existam handlers duplicados.
  if (window.__studymindAbort) {
    window.__studymindAbort.abort(); // Cancela listeners da instância anterior
  }
  window.__studymindAbort = new AbortController();
  const signal = window.__studymindAbort.signal;

  // Limpa elementos DOM de instâncias anteriores
  document.getElementById("studymind-tooltip-host")?.remove();
  document.getElementById("studymind-quick-host")?.remove();

  // ================================================================
  // TOOLTIP DE SELEÇÃO — Shadow DOM (isolado de CSS/eventos da página)
  // ================================================================

  let tooltipHost = null;
  let tooltipShadow = null;
  let pendingText = "";
  let hideTimeout = null;
  let quickChatHost = null;

  // Detecta finalização da seleção
  document.addEventListener("mouseup", (e) => {
    // Não destrói se clicou dentro do próprio tooltip ou quick chat
    if (tooltipHost?.contains(e.target)) return;
    if (quickChatHost?.contains(e.target)) return;

    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text && text.length > 2) {
      pendingText = text;
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      showTooltip(rect, text);
    }
  }, { signal });

  // Esconde ao clicar fora do tooltip
  document.addEventListener("pointerdown", (e) => {
    if (tooltipHost && !tooltipHost.contains(e.target)) {
      scheduleHide(50);
    }
  }, { signal });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") destroyTooltip();
  }, { signal });

  function scheduleHide(delay = 200) {
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(destroyTooltip, delay);
  }

  function destroyTooltip() {
    clearTimeout(hideTimeout);
    // Também limpa qualquer tooltip órfão pelo ID
    document.getElementById("studymind-tooltip-host")?.remove();
    if (tooltipHost) {
      tooltipHost.remove();
      tooltipHost = null;
      tooltipShadow = null;
    }
  }

  // Renderiza o tooltip via Shadow DOM
  function showTooltip(rect, text) {
    destroyTooltip();

    const tooltipWidth = 340;
    const tooltipHeight = 46;

    // position:fixed usa coordenadas do VIEWPORT (não da página)
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    let top = rect.top - tooltipHeight - 10;

    // Evita sair da tela
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));
    if (top < 8) top = rect.bottom + 10;

    // Cria elemento host
    tooltipHost = document.createElement("div");
    tooltipHost.id = "studymind-tooltip-host";
    // IMPORTANTE: 'all: initial' DEVE vir PRIMEIRO, senão reseta position/top/left
    tooltipHost.style.cssText = `
      all: initial !important;
      position: fixed !important;
      top: ${top}px !important;
      left: ${left}px !important;
      width: ${tooltipWidth}px !important;
      height: ${tooltipHeight}px !important;
      z-index: 2147483647 !important;
      pointer-events: auto !important;
      display: block !important;
    `;

    // Shadow DOM — isola completamente do CSS da página
    tooltipShadow = tooltipHost.attachShadow({ mode: "open" });

    const buttons = [
      { icon: "📖", label: "Explicar",   action: "explain" },
      { icon: "🌐", label: "Traduzir",   action: "translate" },
      { icon: "📝", label: "Resumir",    action: "summarize" },
      { icon: "✍️", label: "Reescrever", action: "rewrite" },
      { icon: "📋", label: "Copiar",     action: "copy" },
    ];

    tooltipShadow.innerHTML = `
      <style>
        :host { all: initial; }

        .container {
          display: flex;
          align-items: center;
          gap: 2px;
          background: #16161f;
          border: 1px solid rgba(99,102,241,0.55);
          border-radius: 10px;
          padding: 5px 7px;
          box-shadow:
            0 8px 32px rgba(0,0,0,0.55),
            0 0 0 1px rgba(99,102,241,0.15),
            inset 0 1px 0 rgba(255,255,255,0.05);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          width: fit-content;
          max-width: 340px;
          animation: pop 0.13s cubic-bezier(.22,.68,0,1.3);
        }

        @keyframes pop {
          from { opacity: 0; transform: translateY(5px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }

        button {
          all: unset;
          display: flex;
          align-items: center;
          gap: 4px;
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 500;
          padding: 5px 9px;
          border-radius: 7px;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s, color 0.15s;
          user-select: none;
          -webkit-user-select: none;
        }

        button:hover {
          background: rgba(99,102,241,0.28);
          color: #e2e8f0;
        }

        button:active {
          background: rgba(99,102,241,0.45);
          transform: scale(0.96);
        }

        .sep {
          width: 1px;
          height: 20px;
          background: rgba(255,255,255,0.1);
          flex-shrink: 0;
        }
      </style>

      <div class="container">
        ${buttons.map((b, i) => `
          ${i > 0 ? '<div class="sep"></div>' : ""}
          <button data-action="${b.action}">${b.icon} ${b.label}</button>
        `).join("")}
      </div>
    `;

    // EVENTOS: usa pointerdown para disparar ANTES do mousedown do document
    tooltipShadow.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
      });

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const capturedText = pendingText;
        destroyTooltip();
        handleAction(action, capturedText);
      });
    });

    document.body.appendChild(tooltipHost);
  }

  // Processa a ação escolhida
  async function handleAction(action, text) {
    if (!text) return;

    // Copiar: sem IA
    if (action === "copy") {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      showToast("✅ Copiado!");
      return;
    }

    const prompts = {
      explain:   `Explique de forma profunda e didática, como professor de concursos, o seguinte trecho:\n\n"${text}"`,
      translate: `Traduza para o português brasileiro de forma natural e fluida:\n\n"${text}"`,
      summarize: `Faça um resumo completo e bem estruturado do seguinte texto, destacando os pontos principais:\n\n"${text}"`,
      rewrite:   `Reescreva o seguinte texto de forma mais clara, simples e didática, mantendo o significado original:\n\n"${text}"`,
    };

    const prompt = prompts[action];
    if (!prompt) return;

    // Envia para o background salvar na session e abrir o painel
    try {
      chrome.runtime.sendMessage({
        action: "processSelectionAction",
        selectionAction: action,
        text,
        prompt
      });
    } catch (err) {
      // Extension context invalidated — mostra mensagem ao usuário
      showToast("⚠️ Recarregue a página para reconectar o StudyMind");
    }
  }

  // Toast de notificação rápida (também Shadow DOM)
  function showToast(msg) {
    const host = document.createElement("div");
    host.style.cssText = `
      position: fixed !important;
      bottom: 24px !important;
      right: 24px !important;
      z-index: 2147483647 !important;
      all: initial !important;
      display: block !important;
    `;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        .toast {
          background: #16161f;
          color: #e2e8f0;
          border: 1px solid rgba(99,102,241,0.4);
          border-radius: 10px;
          padding: 10px 18px;
          font-size: 13px;
          font-family: -apple-system, sans-serif;
          box-shadow: 0 4px 20px rgba(0,0,0,0.4);
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      </style>
      <div class="toast">${msg}</div>
    `;
    document.body.appendChild(host);
    setTimeout(() => host.remove(), 2200);
  }

  // ================================================================
  // QUICK CHAT MODAL — via Shadow DOM, sem conflitos (Ctrl+Shift+Y)
  // ================================================================



  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "openQuickChat") {
      if (quickChatHost) {
        // Se já está aberto, foca o input
        quickChatHost.shadowRoot?.querySelector("textarea")?.focus();
        return;
      }
      openQuickChatModal();
    }
  });

  function openQuickChatModal() {
    quickChatHost = document.createElement("div");
    quickChatHost.id = "studymind-quick-host";
    quickChatHost.style.cssText = `
      all: initial !important;
      position: fixed !important;
      inset: 0 !important;
      z-index: 2147483647 !important;
      display: block !important;
      pointer-events: auto !important;
    `;

    const shadow = quickChatHost.attachShadow({ mode: "open" });

    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.55);
          backdrop-filter: blur(3px);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.15s ease;
        }

        .modal {
          background: #16161f;
          border: 1px solid rgba(99,102,241,0.5);
          border-radius: 16px;
          padding: 20px;
          width: 520px;
          max-width: calc(100vw - 40px);
          box-shadow: 0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15);
          animation: slideUp 0.18s cubic-bezier(.22,.68,0,1.2);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #e2e8f0;
          font-size: 15px;
          font-weight: 600;
        }

        .shortcut-hint {
          font-size: 11px;
          color: #64748b;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 5px;
          padding: 2px 7px;
        }

        textarea {
          width: 100%;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(99,102,241,0.3);
          border-radius: 10px;
          padding: 12px 14px;
          color: #e2e8f0;
          font-size: 14px;
          line-height: 1.6;
          resize: none;
          outline: none;
          min-height: 80px;
          font-family: inherit;
          transition: border-color 0.2s;
        }

        textarea:focus { border-color: rgba(99,102,241,0.7); }
        textarea::placeholder { color: #475569; }

        .footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 12px;
        }

        .hint { font-size: 11px; color: #475569; }
        kbd {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 4px;
          padding: 1px 5px;
          font-size: 10px;
          color: #94a3b8;
          font-family: inherit;
        }

        .send-btn {
          background: #6366f1;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 9px 18px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s, transform 0.1s;
        }
        .send-btn:hover { background: #818cf8; }
        .send-btn:active { transform: scale(0.97); }

        .response {
          margin-top: 14px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 10px;
          padding: 12px 14px;
          color: #cbd5e1;
          font-size: 13px;
          line-height: 1.7;
          max-height: 240px;
          overflow-y: auto;
          display: none;
        }

        .response.visible { display: block; }

        .open-panel-btn {
          display: none;
          margin-top: 10px;
          background: transparent;
          border: 1px solid rgba(99,102,241,0.4);
          border-radius: 8px;
          color: #818cf8;
          font-size: 12px;
          padding: 7px 14px;
          cursor: pointer;
          width: 100%;
          font-family: inherit;
          transition: background 0.15s;
        }
        .open-panel-btn:hover { background: rgba(99,102,241,0.1); }
        .open-panel-btn.visible { display: block; }

        @keyframes fadeIn {
          from { opacity: 0; } to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      </style>

      <div class="overlay" id="overlay">
        <div class="modal" id="modal">
          <div class="header">
            <div class="logo">🧠 StudyMind</div>
            <span class="shortcut-hint">Ctrl+Shift+Y</span>
          </div>

          <textarea
            id="quickInput"
            placeholder="Pergunte qualquer coisa para o seu assistente de estudos... (Enter para enviar)"
            rows="3"
          ></textarea>

          <div class="footer">
            <span class="hint"><kbd>Enter</kbd> enviar &nbsp;·&nbsp; <kbd>Esc</kbd> fechar</span>
            <button class="send-btn" id="sendBtn">Enviar ➤</button>
          </div>

          <div class="response" id="response"></div>
          <button class="open-panel-btn" id="openPanelBtn">Abrir resposta completa no painel →</button>
        </div>
      </div>
    `;

    document.body.appendChild(quickChatHost);

    const input = shadow.getElementById("quickInput");
    const sendBtn = shadow.getElementById("sendBtn");
    const responseDiv = shadow.getElementById("response");
    const openPanelBtn = shadow.getElementById("openPanelBtn");
    const overlay = shadow.getElementById("overlay");

    // Foca o input imediatamente
    requestAnimationFrame(() => input?.focus());

    // Fechar ao clicar no overlay (fora do modal)
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeQuickChat();
    });

    // Fechar com Escape
    document.addEventListener("keydown", handleQuickChatKey, true);

    // Enviar com Enter (Shift+Enter faz quebra de linha)
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendQuickMessage();
      }
    });

    sendBtn.addEventListener("click", sendQuickMessage);

    openPanelBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "openSidebarWithPending" });
      closeQuickChat();
    });

    async function sendQuickMessage() {
      const text = input.value.trim();
      if (!text) return;

      sendBtn.disabled = true;
      sendBtn.textContent = "⏳";
      responseDiv.className = "response visible";
      responseDiv.innerHTML = "<em style='color:#64748b'>🧠 Pensando...</em>";
      openPanelBtn.className = "open-panel-btn";

      const SYSTEM = `Você é o StudyMind, professor especialista em concursos públicos. Responda de forma profunda, didática e com exemplos. Use markdown básico (negrito, listas).`;

      const result = await chrome.runtime.sendMessage({
        action: "callAI",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: text }
        ]
      });

      sendBtn.disabled = false;
      sendBtn.textContent = "Enviar ➤";

      if (result?.success) {
        responseDiv.innerHTML = formatQuickMd(result.content);
        openPanelBtn.className = "open-panel-btn visible";

        // Salva para o painel abrir depois (via background)
        chrome.runtime.sendMessage({
          action: "processSelectionAction",
          selectionAction: "explain",
          text: text,
          prompt: text
        });
      } else {
        responseDiv.innerHTML = `<span style="color:#f87171">❌ ${result?.error || "Verifique sua API Key nas configurações."}</span>`;
      }
    }

    function formatQuickMd(text) {
      return text
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/`([^`]+)`/g, "<code style='background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px'>$1</code>")
        .replace(/^- (.+)/gm, "• $1")
        .replace(/\n/g, "<br>");
    }
  }

  function handleQuickChatKey(e) {
    if (e.key === "Escape") closeQuickChat();
  }

  function closeQuickChat() {
    if (quickChatHost) {
      quickChatHost.remove();
      quickChatHost = null;
      document.removeEventListener("keydown", handleQuickChatKey, true);
    }
  }
})();

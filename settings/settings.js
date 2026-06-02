// ============================================================
// StudyMind AI — Settings Logic (settings.js)
// ============================================================

(function () {
  "use strict";

  const MODELS = {
    openai: [
      { value: "gpt-4o", label: "GPT-4o", desc: "Modelo mais avançado da OpenAI" },
      { value: "gpt-4o-mini", label: "GPT-4o Mini", desc: "Rápido e econômico" },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo", desc: "Poderoso com janela de 128k" },
      { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", desc: "Rápido e acessível" }
    ],
    anthropic: [
      { value: "claude-opus-4", label: "Claude Opus 4", desc: "Modelo mais poderoso da Anthropic" },
      { value: "claude-sonnet-4", label: "Claude Sonnet 4", desc: "Equilíbrio entre velocidade e qualidade" },
      { value: "claude-haiku-4", label: "Claude Haiku", desc: "Ultra-rápido e econômico" }
    ],
    google: [
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash", desc: "Rápido e versátil" },
      { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro", desc: "Janela de contexto de 1M tokens" }
    ],
    groq: [
      { value: "llama-3.3-70b", label: "Llama 3.3 70B", desc: "Open source poderoso via Groq" },
      { value: "mixtral-8x7b", label: "Mixtral 8x7B", desc: "Modelo MoE rápido" }
    ]
  };

  const PROVIDER_ICONS = {
    openai: "⚡", anthropic: "🔮", google: "💎", groq: "🚀"
  };

  // DOM Elements
  const providerSelect = document.getElementById("select-provider");
  const modelSelect = document.getElementById("select-model");
  const modelInfo = document.getElementById("model-info");
  const languageSelect = document.getElementById("select-language");
  const themeSelect = document.getElementById("select-theme");
  const temperatureSlider = document.getElementById("slider-temperature");
  const temperatureValue = document.getElementById("temperature-value");
  const autoOpenCheck = document.getElementById("check-autoopen");
  const saveBar = document.getElementById("save-bar");
  const saveBtn = document.getElementById("btn-save");
  const saveStatus = document.getElementById("save-status");

  let hasChanges = false;

  // --- Init ---
  loadSettings();
  setupEventListeners();

  function loadSettings() {
    chrome.storage.sync.get(["settings"], async ({ settings }) => {
      let mergedSettings = settings || {};

      // Sync from Supabase
      try {
        if (typeof supabase !== 'undefined') {
          const session = await supabase.auth.getSession();
          if (session) {
            const dbSettings = await supabase.db.select('user_settings', `id=eq.${session.user.id}`);
            if (dbSettings && dbSettings.length > 0) {
              const cloud = dbSettings[0];
              mergedSettings = {
                ...mergedSettings,
                provider: cloud.provider || mergedSettings.provider,
                model: cloud.model || mergedSettings.model,
                language: cloud.language || mergedSettings.language,
                theme: cloud.theme || mergedSettings.theme,
                temperature: cloud.temperature ?? mergedSettings.temperature,
                openPanelOnStart: cloud.open_panel_on_start ?? mergedSettings.openPanelOnStart
              };
              chrome.storage.sync.set({ settings: mergedSettings });
            }
          }
        }
      } catch (err) {
        console.error("Erro ao sincronizar config do Supabase:", err);
      }

      if (!mergedSettings) return;

      // API Keys
      if (mergedSettings.apiKeys) {
        Object.keys(mergedSettings.apiKeys).forEach(provider => {
          const input = document.getElementById(`key-${provider}`);
          if (input) input.value = settings.apiKeys[provider] || "";
        });
      }

      // Provider & Model
      if (settings.provider) providerSelect.value = settings.provider;
      updateModelOptions();
      if (settings.model) modelSelect.value = settings.model;
      updateModelInfo();

      // Preferences
      if (settings.language) languageSelect.value = settings.language;
      if (settings.theme) themeSelect.value = settings.theme;
      if (settings.temperature !== undefined) {
        temperatureSlider.value = settings.temperature;
        temperatureValue.textContent = settings.temperature;
      }
      if (settings.openPanelOnStart !== undefined) {
        autoOpenCheck.checked = settings.openPanelOnStart;
      }
    });
  }

  function setupEventListeners() {
    // Provider change → update models
    providerSelect.addEventListener("change", () => {
      updateModelOptions();
      updateModelInfo();
      markChanged();
    });

    modelSelect.addEventListener("change", () => {
      updateModelInfo();
      markChanged();
    });

    // Temperature slider
    temperatureSlider.addEventListener("input", () => {
      temperatureValue.textContent = temperatureSlider.value;
      markChanged();
    });

    // Toggle visibility buttons
    document.querySelectorAll(".toggle-visibility").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = document.getElementById(btn.dataset.target);
        if (target) {
          target.type = target.type === "password" ? "text" : "password";
          btn.textContent = target.type === "password" ? "👁" : "🙈";
        }
      });
    });

    // Mark changes on any input
    document.querySelectorAll(".api-key-input, .form-select, .form-checkbox input").forEach(el => {
      el.addEventListener("change", markChanged);
      el.addEventListener("input", markChanged);
    });

    // Save button
    saveBtn.addEventListener("click", saveSettings);
  }

  function updateModelOptions() {
    const provider = providerSelect.value;
    const models = MODELS[provider] || [];
    modelSelect.innerHTML = models.map(m =>
      `<option value="${m.value}">${m.label}</option>`
    ).join("");
  }

  function updateModelInfo() {
    const provider = providerSelect.value;
    const model = modelSelect.value;
    const models = MODELS[provider] || [];
    const info = models.find(m => m.value === model);
    const icon = PROVIDER_ICONS[provider] || "🤖";

    if (info) {
      modelInfo.innerHTML = `
        <div class="model-card">
          <span class="model-card-icon">${icon}</span>
          <div>
            <strong>${info.label}</strong>
            <span>${info.desc}</span>
          </div>
        </div>
      `;
    }
  }

  function markChanged() {
    if (!hasChanges) {
      hasChanges = true;
      saveBar.classList.add("visible");
      saveStatus.textContent = "Alterações não salvas";
      saveBtn.textContent = "💾 Salvar Configurações";
      saveBtn.classList.remove("saved");
    }
  }

  function saveSettings() {
    const settings = {
      apiKeys: {
        openai: document.getElementById("key-openai")?.value?.trim() || "",
        anthropic: document.getElementById("key-anthropic")?.value?.trim() || "",
        google: document.getElementById("key-google")?.value?.trim() || "",
        groq: document.getElementById("key-groq")?.value?.trim() || ""
      },
      provider: providerSelect.value,
      model: modelSelect.value,
      language: languageSelect.value,
      theme: themeSelect.value,
      temperature: parseFloat(temperatureSlider.value),
      openPanelOnStart: autoOpenCheck.checked
    };

    chrome.storage.sync.set({ settings }, async () => {
      // Sync with Supabase (except API keys)
      try {
        if (typeof supabase !== 'undefined') {
          const session = await supabase.auth.getSession();
          if (session) {
            await supabase.db.upsert('user_settings', {
              id: session.user.id,
              provider: settings.provider,
              model: settings.model,
              language: settings.language,
              theme: settings.theme,
              temperature: settings.temperature,
              open_panel_on_start: settings.openPanelOnStart,
              updated_at: new Date().toISOString()
            });
          }
        }
      } catch (err) {
        console.error("Erro ao salvar config no Supabase:", err);
      }

      // Também salva o perfil se a função existir
      if (typeof saveProfile === "function") {
        await saveProfile({
          name: document.getElementById("profileName")?.value?.trim() || "",
          targetExam: document.getElementById("profileExam")?.value?.trim() || "",
          weakSubjects: document.getElementById("profileWeak")?.value?.split(",").map(s => s.trim()).filter(Boolean) || [],
          strongSubjects: document.getElementById("profileStrong")?.value?.split(",").map(s => s.trim()).filter(Boolean) || [],
        });
      }

      hasChanges = false;
      saveBtn.textContent = "✅ Salvo!";
      saveBtn.classList.add("saved");
      saveStatus.textContent = "Configurações salvas com sucesso";

      setTimeout(() => {
        saveBar.classList.remove("visible");
      }, 2000);
    });
  }

  // --- Sistema de Memória (Profile & Stats) ---
  document.addEventListener("DOMContentLoaded", async () => {
    // Carrega dados do perfil se a função existir
    if (typeof loadMemory === "function") {
      const memory = await loadMemory();
      
      const elName = document.getElementById("profileName");
      const elExam = document.getElementById("profileExam");
      const elWeak = document.getElementById("profileWeak");
      const elStrong = document.getElementById("profileStrong");

      if (elName) elName.value = memory.profile.name || "";
      if (elExam) elExam.value = memory.profile.targetExam || "";
      if (elWeak) elWeak.value = (memory.profile.weakSubjects || []).join(", ");
      if (elStrong) elStrong.value = (memory.profile.strongSubjects || []).join(", ");

      // Monitora mudanças nos campos do perfil
      [elName, elExam, elWeak, elStrong].forEach(el => {
        if (el) {
          el.addEventListener("input", markChanged);
          el.addEventListener("change", markChanged);
        }
      });

      // Renderiza as estatísticas
      const stats = await getMemoryStats();
      const statsGrid = document.getElementById("stats-grid");
      if (statsGrid) {
        const levelText = { iniciante: "Iniciante 🌱", intermediario: "Intermediário 📚", avancado: "Avançado 🏆" };
        statsGrid.innerHTML = `
          <div class="stat-card">
            <span class="stat-number">${stats.totalQuestions}</span>
            <span class="stat-label">Perguntas feitas</span>
          </div>
          <div class="stat-card">
            <span class="stat-number">${stats.topicsStudied}</span>
            <span class="stat-label">Tópicos estudados</span>
          </div>
          <div class="stat-card">
            <span class="stat-number">${stats.daysStudying}</span>
            <span class="stat-label">Dias estudando</span>
          </div>
          <div class="stat-card">
            <span class="stat-number" style="font-size: 18px; margin-top: 5px; margin-bottom: 9px;">${levelText[stats.studyLevel] || "Iniciante"}</span>
            <span class="stat-label">Nível atual</span>
          </div>
        `;
      }

      // Renderiza os detalhes da memória
      const detailsContainer = document.getElementById("memory-details-container");
      if (detailsContainer) {
        let detailsHTML = "";

        // Tópicos
        const topics = Object.entries(memory.topics || {});
        if (topics.length > 0) {
          detailsHTML += `
            <div class="memory-detail-group">
              <div class="memory-detail-title">📚 Tópicos Mapeados</div>
              <div class="memory-topics-wrap">
                ${topics.sort((a, b) => b[1].count - a[1].count).map(([name, data]) => `
                  <span class="topic-chip level-${data.depth}">
                    ${name} <span class="topic-count">${data.count}x</span>
                  </span>
                `).join("")}
              </div>
            </div>
          `;
        }

        // Erros
        if (memory.errors && memory.errors.length > 0) {
          detailsHTML += `
            <div class="memory-detail-group">
              <div class="memory-detail-title">⚠️ Dificuldades e Erros Recorrentes</div>
              <ul class="memory-list">
                ${memory.errors.slice(0, 5).map(err => `<li>${err}</li>`).join("")}
              </ul>
            </div>
          `;
        }

        // Perguntas Recentes
        if (memory.recentQuestions && memory.recentQuestions.length > 0) {
          detailsHTML += `
            <div class="memory-detail-group">
              <div class="memory-detail-title">💬 Últimas Perguntas Feitas</div>
              <ul class="memory-list">
                ${memory.recentQuestions.slice(0, 5).map(q => `<li>"${q}"</li>`).join("")}
              </ul>
            </div>
          `;
        }

        if (!detailsHTML) {
          detailsHTML = `
            <div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px;">
              A IA ainda não aprendeu o suficiente sobre você. Faça mais perguntas!
            </div>
          `;
        }

        detailsContainer.innerHTML = detailsHTML;
      }

      // Reset Memory Action
      const resetBtn = document.getElementById("btn-reset-memory");
      if (resetBtn) {
        resetBtn.addEventListener("click", async () => {
          if (confirm("Tem certeza? Isso apagará TODO o histórico de aprendizado da IA sobre você.")) {
            await resetMemory();
            alert("Memória resetada com sucesso!");
            location.reload();
          }
        });
      }
    }
  });
})();

// ============================================================
// StudyMind AI — Popup Logic (popup.js)
// ============================================================

// Check auth state and initialize UI
(async () => {
  const popupBody = document.querySelector(".popup-body");
  const popupAuth = document.getElementById("popup-auth");
  const btnLogout = document.getElementById("btn-logout");

  try {
    const session = await supabase.auth.getSession();
    if (session) {
      popupBody.style.display = "block";
      popupAuth.style.display = "none";
      btnLogout.style.display = "block";
    } else {
      popupBody.style.display = "none";
      popupAuth.style.display = "block";
      btnLogout.style.display = "none";
    }
  } catch (err) {
    console.error("Auth check failed:", err);
    popupBody.style.display = "none";
    popupAuth.style.display = "block";
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
    errorDiv.style.display = "none";
  };

  tabLogin?.addEventListener("click", () => switchTab(true));
  tabRegister?.addEventListener("click", () => switchTab(false));

  btnSubmit?.addEventListener("click", async () => {
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
      } else {
        await supabase.auth.signUp(email, password);
      }
      // Reload UI
      location.reload();
    } catch (err) {
      errorDiv.textContent = err.message || "Erro de autenticação";
      errorDiv.style.display = "block";
      btnSubmit.disabled = false;
      btnSubmit.textContent = isLogin ? "Entrar" : "Criar Conta";
    }
  });

  btnLogout?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    location.reload();
  });
})();

document.getElementById("btn-open-panel")?.addEventListener("click", async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    await chrome.sidePanel.open({ windowId: tabs[0].windowId });
    window.close();
  }
});

document.getElementById("btn-analyze")?.addEventListener("click", async () => {
  await chrome.storage.session.set({
    pendingAction: { action: "analyzePage", text: "" }
  });
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    await chrome.sidePanel.open({ windowId: tabs[0].windowId });
    window.close();
  }
});

document.getElementById("btn-settings")?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// ============================================================
// StudyMind AI — Supabase REST Client
// Interage com o backend Supabase via chamadas HTTPS nativas
// para evitar problemas de compatibilidade de módulos na extensão
// ============================================================

const SUPABASE_URL = "https://rnbmgtuoxjmwtrvndqpw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuYm1ndHVveGptd3Rydm5kcXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNjE4NjAsImV4cCI6MjA5NTkzNzg2MH0.PGWf3PeqogsMClVWp0v94A3WmuLHgJj7DyweKB0ieA8";

const supabase = {
  // ─── AUTH (GoTrue) ──────────────────────────────────────────────────────────
  auth: {
    async getSession() {
      return new Promise((resolve) => {
        chrome.storage.local.get(["sb_session"], (result) => {
          resolve(result.sb_session || null);
        });
      });
    },

    async _saveSession(sessionData) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ sb_session: sessionData }, resolve);
      });
    },

    async signUp(email, password) {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || data.error_description || "Erro ao cadastrar");
      
      // Auto login if email confirmation is disabled
      if (data.session) {
        await this._saveSession(data.session);
      }
      return data;
    },

    async signIn(email, password) {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error_description || "Email ou senha incorretos");
      
      await this._saveSession(data);
      return data;
    },

    async signOut() {
      const session = await this.getSession();
      if (session) {
        await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
          method: "POST",
          headers: {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${session.access_token}`
          }
        }).catch(() => {});
      }
      await this._saveSession(null);
    }
  },

  // ─── DATABASE (PostgREST) ───────────────────────────────────────────────────
  db: {
    async _request(method, path, body = null, additionalHeaders = {}) {
      const session = await supabase.auth.getSession();
      const token = session ? session.access_token : SUPABASE_ANON_KEY;

      const headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${token}`,
        ...additionalHeaders
      };

      if (body) {
        headers["Content-Type"] = "application/json";
        // Header for upsert if method is POST and we want upsert behavior
        if (additionalHeaders.Prefer) {
            headers["Prefer"] = additionalHeaders.Prefer;
        }
      }

      const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null
      });

      // No content response
      if (res.status === 204) return null;

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || data?.details || `DB Error: ${res.status}`);
      }
      return data;
    },

    async select(table, query = "select=*") {
      return this._request("GET", `${table}?${query}`);
    },

    async insert(table, data) {
      return this._request("POST", table, data);
    },

    async upsert(table, data) {
      return this._request("POST", table, data, { Prefer: "resolution=merge-duplicates" });
    },

    async update(table, data, matchQuery) {
      return this._request("PATCH", `${table}?${matchQuery}`, data);
    },

    async delete(table, matchQuery) {
      return this._request("DELETE", `${table}?${matchQuery}`);
    }
  }
};

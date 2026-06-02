// ============================================================
// MEMORY MANAGER — Gerencia a memória persistente do aluno
// StudyMind AI v1.0.4
// ============================================================

const MEMORY_KEY = "studymindMemory";

// Carrega a memória atual (ou cria do zero)
async function loadMemory() {
  return new Promise(async (resolve) => {
    chrome.storage.local.get([MEMORY_KEY], async (result) => {
      let memory = result[MEMORY_KEY] || getDefaultMemory();
      
      // Try to sync from Supabase if logged in
      try {
        if (typeof supabase !== 'undefined') {
          const session = await supabase.auth.getSession();
          if (session) {
            const userId = session.user.id;
            
            // Get profile
            const profileData = await supabase.db.select('profiles', `id=eq.${userId}`);
            if (profileData && profileData.length > 0) {
              const p = profileData[0];
              memory.profile = {
                name: p.name || "",
                targetExam: p.target_exam || "",
                studyLevel: p.study_level || "iniciante",
                weakSubjects: p.weak_subjects || [],
                strongSubjects: p.strong_subjects || [],
                totalQuestions: p.total_questions || 0,
                firstSeen: p.first_seen,
                lastSeen: p.last_seen
              };
              memory.recentQuestions = p.recent_questions || [];
              memory.errors = p.errors || [];
              memory.connections = p.connections || [];
            }

            // Get topics
            const topicsData = await supabase.db.select('memory_topics', `user_id=eq.${userId}`);
            if (topicsData) {
              memory.topics = {};
              topicsData.forEach(t => {
                memory.topics[t.topic_name] = {
                  count: t.count,
                  depth: t.depth,
                  lastAsked: t.last_asked,
                  subtopics: t.subtopics || [],
                  errors: t.errors || []
                };
              });
            }

            // Cache locally
            chrome.storage.local.set({ [MEMORY_KEY]: memory });
          }
        }
      } catch (err) {
        console.error("Erro ao sincronizar memória do Supabase:", err);
      }

      memory.profile.lastSeen = new Date().toISOString();
      if (!memory.profile.firstSeen) {
        memory.profile.firstSeen = new Date().toISOString();
      }
      resolve(memory);
    });
  });
}

// Salva a memória atualizada
async function saveMemory(memory) {
  // 1. Save locally for instant UI response
  chrome.storage.local.set({ [MEMORY_KEY]: memory });

  // 2. Sync to Supabase in background
  try {
    if (typeof supabase !== 'undefined') {
      const session = await supabase.auth.getSession();
      if (session) {
        const userId = session.user.id;
        
        // Upsert Profile
        await supabase.db.upsert('profiles', {
          id: userId,
          name: memory.profile.name,
          target_exam: memory.profile.targetExam,
          study_level: memory.profile.studyLevel,
          total_questions: memory.profile.totalQuestions,
          weak_subjects: memory.profile.weakSubjects,
          strong_subjects: memory.profile.strongSubjects,
          recent_questions: memory.recentQuestions,
          errors: memory.errors,
          connections: memory.connections,
          last_seen: new Date().toISOString()
        });

        // Upsert Topics (we do this one by one or batch if possible)
        // Note: For simplicity and since JS extension environment, we'll upsert sequentially
        // A better approach for scale is batching via PostgREST, but sequential is fine for personal use
        for (const [topicName, t] of Object.entries(memory.topics)) {
          await supabase.db.upsert('memory_topics', {
            user_id: userId,
            topic_name: topicName,
            count: t.count,
            depth: t.depth,
            last_asked: t.lastAsked,
            subtopics: t.subtopics,
            errors: t.errors
          });
        }
      }
    }
  } catch (err) {
    console.error("Erro ao salvar memória no Supabase:", err);
  }
}

// Retorna a estrutura padrão
function getDefaultMemory() {
  return {
    profile: {
      name: "",
      targetExam: "",
      studyLevel: "iniciante",
      weakSubjects: [],
      strongSubjects: [],
      totalQuestions: 0,
      firstSeen: null,
      lastSeen: null
    },
    topics: {},
    errors: [],
    recentQuestions: [],
    connections: [],
    schemaVersion: 1
  };
}

// ── Atualiza memória com base em uma interação ─────────────────
async function updateMemoryAfterInteraction(userMessage, aiResponse) {
  const memory = await loadMemory();

  // 1. Incrementa total de perguntas
  memory.profile.totalQuestions++;

  // 2. Salva nas perguntas recentes (mantém só as últimas 20)
  memory.recentQuestions.unshift(userMessage.slice(0, 120));
  if (memory.recentQuestions.length > 20) {
    memory.recentQuestions = memory.recentQuestions.slice(0, 20);
  }

  // 3. Extrai tópico da pergunta e atualiza o mapa de tópicos
  const topic = extractTopic(userMessage);
  if (topic) {
    if (!memory.topics[topic]) {
      memory.topics[topic] = {
        count: 0,
        lastAsked: null,
        depth: "basico",
        subtopics: [],
        errors: []
      };
    }
    memory.topics[topic].count++;
    memory.topics[topic].lastAsked = new Date().toISOString().split("T")[0];

    // Evolui o nível de profundidade conforme o aluno repete o tópico
    const count = memory.topics[topic].count;
    if (count >= 8) memory.topics[topic].depth = "avancado";
    else if (count >= 3) memory.topics[topic].depth = "intermediario";
  }

  // 4. Atualiza nível geral do aluno
  const totalTopics = Object.keys(memory.topics).length;
  const avgCount = totalTopics > 0
    ? Object.values(memory.topics).reduce((s, t) => s + t.count, 0) / totalTopics
    : 0;

  if (memory.profile.totalQuestions >= 50 || avgCount >= 5) {
    memory.profile.studyLevel = "avancado";
  } else if (memory.profile.totalQuestions >= 15 || avgCount >= 2) {
    memory.profile.studyLevel = "intermediario";
  }

  await saveMemory(memory);
}

// ── Extrai o tópico principal de uma pergunta ─────────────────
function extractTopic(question) {
  const q = question.toLowerCase();

  const topicMap = [
    // Português
    { keywords: ["acentu", "acento", "oxítona", "paroxítona", "proparoxítona", "tônica"], topic: "acentuação gráfica" },
    { keywords: ["crase", "à", "ao"], topic: "crase" },
    { keywords: ["concordância verbal", "verbo concorda", "sujeito e verbo"], topic: "concordância verbal" },
    { keywords: ["concordância nominal", "adjetivo concorda"], topic: "concordância nominal" },
    { keywords: ["regência verbal", "rege", "transitivo"], topic: "regência verbal" },
    { keywords: ["pontuação", "vírgula", "ponto e vírgula", "dois pontos"], topic: "pontuação" },
    { keywords: ["ortografia", "grafia", "escrita correta", "hífen"], topic: "ortografia" },
    { keywords: ["morfologia", "substantivo", "adjetivo", "advérbio", "pronome", "conjunção", "preposição", "artigo", "numeral", "interjeição"], topic: "morfologia" },
    { keywords: ["sintaxe", "sujeito", "predicado", "objeto direto", "objeto indireto", "adjunto", "aposto", "vocativo"], topic: "análise sintática" },
    { keywords: ["semântica", "sinoním", "antoním", "polissemia", "denotação", "conotação"], topic: "semântica" },
    { keywords: ["interpretação", "texto", "inferência", "implícito", "explícito"], topic: "interpretação de texto" },
    { keywords: ["redação oficial", "ofício", "memorando", "requerimento", "ata", "relatório"], topic: "redação oficial" },
    { keywords: ["ditongo", "hiato", "tritongo", "encontro vocálico", "encontro consonantal"], topic: "fonologia" },
    // Matemática
    { keywords: ["porcentagem", "percentual", "%", "desconto"], topic: "porcentagem" },
    { keywords: ["juros simples", "juros compostos", "capitalização", "montante"], topic: "juros" },
    { keywords: ["regra de três", "proporcional"], topic: "regra de três" },
    { keywords: ["equação", "inequação", "sistema linear"], topic: "álgebra" },
    { keywords: ["geometria", "área", "perímetro", "volume", "triângulo", "círculo"], topic: "geometria" },
    { keywords: ["probabilidade", "combinatória", "permutação", "combinação"], topic: "probabilidade" },
    { keywords: ["sequência", "progressão aritmética", "progressão geométrica", "pa ", "pg "], topic: "sequências e progressões" },
    // Raciocínio Lógico
    { keywords: ["lógica proposicional", "proposição", "conectivo", "conjunção lógica", "disjunção", "condicional", "bicondicional"], topic: "lógica proposicional" },
    { keywords: ["silogismo", "argumento válido", "premissa"], topic: "silogismo" },
    { keywords: ["diagrama lógico", "diagrama de euler", "conjunto"], topic: "diagramas lógicos" },
    // Direito
    { keywords: ["constituição", "constitucional", "cf/88", "art. 5", "direitos fundamentais", "garantias fundamentais"], topic: "direito constitucional" },
    { keywords: ["administrativo", "ato administrativo", "licitação", "contrato administrativo", "servidor público", "improbidade"], topic: "direito administrativo" },
    { keywords: ["penal", "crime", "pena", "delito", "código penal"], topic: "direito penal" },
    // Informática
    { keywords: ["excel", "planilha", "fórmula excel", "calc"], topic: "excel/planilhas" },
    { keywords: ["word", "editor de texto", "writer"], topic: "editores de texto" },
    { keywords: ["rede", "protocolo", "tcp/ip", "http", "dns", "vpn", "lan", "wan"], topic: "redes de computadores" },
    { keywords: ["segurança", "vírus", "malware", "phishing", "firewall", "antivírus"], topic: "segurança da informação" },
    { keywords: ["sistema operacional", "windows", "linux", "arquivo", "pasta", "diretório"], topic: "sistemas operacionais" },
  ];

  for (const { keywords, topic } of topicMap) {
    if (keywords.some(kw => q.includes(kw))) return topic;
  }

  // Fallback: extrai palavras significativas
  const words = q.split(/\s+/).filter(w => w.length > 4).slice(0, 2);
  return words.length > 0 ? words.join(" ") : null;
}

// ── Monta o system prompt personalizado com a memória ─────────
async function buildPersonalizedSystemPrompt() {
  const memory = await loadMemory();
  const { profile, topics, errors, recentQuestions, connections } = memory;

  // Tópicos mais estudados (top 5)
  const topTopics = Object.entries(topics)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([name, data]) => `${name} (nível: ${data.depth}, estudado ${data.count}x)`);

  // Tópicos fracos
  const weakTopics = profile.weakSubjects.length > 0
    ? profile.weakSubjects
    : Object.entries(topics)
        .filter(([, d]) => d.errors && d.errors.length > 0)
        .map(([name]) => name);

  const recentSample = recentQuestions.slice(0, 5);

  // Monta contexto do aluno
  let studentContext = "";

  if (profile.name || profile.targetExam || profile.totalQuestions > 0) {
    studentContext += `\n## PERFIL DO ALUNO\n`;
    if (profile.name) studentContext += `- Nome: ${profile.name}\n`;
    if (profile.targetExam) studentContext += `- Concurso alvo: ${profile.targetExam}\n`;
    studentContext += `- Nível atual: ${profile.studyLevel}\n`;
    studentContext += `- Total de perguntas feitas: ${profile.totalQuestions}\n`;
  }

  if (topTopics.length > 0) {
    studentContext += `\n## TÓPICOS JÁ ESTUDADOS PELO ALUNO\n`;
    studentContext += topTopics.map(t => `- ${t}`).join("\n") + "\n";
    studentContext += `\n> INSTRUÇÃO: Para esses tópicos, o aluno já tem base. Não repita o básico — vá direto para nuances, exceções e o que as bancas cobram. Eleve o nível conforme indicado.\n`;
  }

  if (weakTopics.length > 0) {
    studentContext += `\n## PONTOS FRACOS DO ALUNO\n`;
    studentContext += weakTopics.map(t => `- ${t}`).join("\n") + "\n";
    studentContext += `\n> INSTRUÇÃO: Use mais exemplos, analogias simples e reforce com macetes.\n`;
  }

  if (errors.length > 0) {
    studentContext += `\n## ERROS RECORRENTES\n`;
    studentContext += errors.slice(0, 5).map(e => `- ${e}`).join("\n") + "\n";
    studentContext += `\n> INSTRUÇÃO: Corrija proativamente se a pergunta tiver relação com esses erros.\n`;
  }

  if (recentSample.length > 0) {
    studentContext += `\n## ÚLTIMAS PERGUNTAS (para contexto)\n`;
    studentContext += recentSample.map(q => `- "${q}"`).join("\n") + "\n";
    studentContext += `\n> INSTRUÇÃO: Conecte a resposta atual com o que o aluno já estudou.\n`;
  }

  if (connections.length > 0) {
    studentContext += `\n## CONEXÕES ENTRE TÓPICOS\n`;
    studentContext += connections.slice(0, 5).map(c => `- ${c}`).join("\n") + "\n";
  }

  const levelInstructions = {
    iniciante: `O aluno é INICIANTE. Explique do zero, sem pressupor conhecimento prévio. Use linguagem simples e muitos exemplos do cotidiano.`,
    intermediario: `O aluno é INTERMEDIÁRIO. Já conhece o básico. Foque nas exceções, casos especiais e pegadinhas de prova. Use exemplos de questões reais.`,
    avancado: `O aluno está em nível AVANÇADO. Vá direto ao ponto. Foque em distinções finas e questões de alta dificuldade de bancas como CESPE e FCC.`
  };

  return `
Você é o StudyMind, o melhor professor de concursos públicos do Brasil.
Sua missão é preparar este aluno para passar no concurso com máxima eficiência.

${levelInstructions[profile.studyLevel] || levelInstructions.iniciante}

${studentContext}

---

## REGRAS DE RESPOSTA

### 1. PROFUNDIDADE OBRIGATÓRIA
Quando perguntado sobre qualquer tema, ensine COMPLETO:
- Regra principal + todas as subregras
- Mínimo de 5 exemplos por regra
- Exceções e casos especiais
- Como se relaciona com outros tópicos
- O que CESPE, FCC, VUNESP, FGV cobram
- Pelo menos 1 questão-modelo com gabarito comentado

### 2. ESTRUTURA
📌 **Conceito** — definição precisa
📚 **Explicação completa** — regras, subregras, casos especiais
✅ **Exemplos** — mínimo 5, variados e progressivos
⚠️ **Exceções e pegadinhas** — o que a banca cobra
🔗 **Conexão com outros temas** — especialmente os já estudados
📝 **Como cai em prova** — padrão das bancas
🧪 **Questão-modelo** — com gabarito comentado
💡 **Dica de ouro** — macete ou mnemônico
📋 **Resumo rápido** — 3 linhas para revisão
❓ **Próximos passos** — 2 temas relacionados

### 3. PROGRESSÃO INTELIGENTE
- Se o aluno já perguntou sobre o tema antes, avance para o nível seguinte.
- Conecte com o que ele já estudou.
- Corrija erros conceituais gentilmente.

### 4. LINGUAGEM
- Português claro, negrito para termos técnicos, tabelas para comparações.
- Nunca invente números de leis, datas ou jurisprudência.

Cada resposta sua pode ser o diferencial entre o aluno passar ou não no concurso.
`.trim();
}

// ── Funções auxiliares para configurações ────────────
async function saveProfile(profileData) {
  const memory = await loadMemory();
  memory.profile = { ...memory.profile, ...profileData };
  await saveMemory(memory);
}

async function addError(errorDescription) {
  const memory = await loadMemory();
  if (!memory.errors.includes(errorDescription)) {
    memory.errors.unshift(errorDescription);
    if (memory.errors.length > 20) memory.errors = memory.errors.slice(0, 20);
    await saveMemory(memory);
  }
}

async function getMemoryStats() {
  const memory = await loadMemory();
  return {
    totalQuestions: memory.profile.totalQuestions,
    topicsStudied: Object.keys(memory.topics).length,
    studyLevel: memory.profile.studyLevel,
    targetExam: memory.profile.targetExam,
    daysStudying: memory.profile.firstSeen
      ? Math.ceil((Date.now() - new Date(memory.profile.firstSeen)) / 86400000)
      : 0
  };
}

async function resetMemory() {
  return new Promise((resolve) => {
    chrome.storage.sync.remove(MEMORY_KEY, resolve);
  });
}

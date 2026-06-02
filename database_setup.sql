-- ==============================================================================
-- 1. CRIAR AS TABELAS
-- ==============================================================================

-- Tabela de Perfis do Estudante
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    name TEXT,
    target_exam TEXT,
    study_level TEXT DEFAULT 'iniciante',
    total_questions INTEGER DEFAULT 0,
    weak_subjects JSONB DEFAULT '[]'::jsonb,
    strong_subjects JSONB DEFAULT '[]'::jsonb,
    recent_questions JSONB DEFAULT '[]'::jsonb,
    errors JSONB DEFAULT '[]'::jsonb,
    connections JSONB DEFAULT '[]'::jsonb,
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Tópicos Estudados (Memória Detalhada)
CREATE TABLE public.memory_topics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    topic_name TEXT NOT NULL,
    count INTEGER DEFAULT 1,
    depth TEXT DEFAULT 'basico',
    last_asked DATE,
    subtopics JSONB DEFAULT '[]'::jsonb,
    errors JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, topic_name)
);

-- Tabela de Histórico de Conversas (Chat)
CREATE TABLE public.chat_conversations (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    messages JSONB DEFAULT '[]'::jsonb,
    message_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Configurações
CREATE TABLE public.user_settings (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    provider TEXT DEFAULT 'openai',
    model TEXT DEFAULT 'gpt-4o',
    language TEXT DEFAULT 'pt-BR',
    theme TEXT DEFAULT 'dark',
    temperature NUMERIC DEFAULT 0.7,
    open_panel_on_start BOOLEAN DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ==============================================================================
-- 2. POLÍTICAS DE SEGURANÇA (Row Level Security - RLS)
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver o próprio perfil" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Usuários podem atualizar o próprio perfil" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Usuários podem inserir o próprio perfil" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Ver próprios tópicos" ON public.memory_topics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Atualizar próprios tópicos" ON public.memory_topics FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Inserir próprios tópicos" ON public.memory_topics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Deletar próprios tópicos" ON public.memory_topics FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Ver próprio chat" ON public.chat_conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Atualizar próprio chat" ON public.chat_conversations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Inserir próprio chat" ON public.chat_conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Deletar próprio chat" ON public.chat_conversations FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Ver próprias configurações" ON public.user_settings FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Atualizar próprias configurações" ON public.user_settings FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Inserir próprias configurações" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = id);

-- ==============================================================================
-- 3. GATILHO PARA CRIAR PERFIL AUTOMATICAMENTE
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (new.id);
  INSERT INTO public.user_settings (id) VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ==============================================================================
-- 4. FUNÇÃO KEEP-ALIVE (Anti-Pausa)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.keep_alive()
RETURNS TEXT AS $$
BEGIN
  RETURN 'OK';
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.keep_alive() TO anon;

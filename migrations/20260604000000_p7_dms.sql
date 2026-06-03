CREATE TABLE IF NOT EXISTS public.school_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT,
    type TEXT NOT NULL, -- PRAVILNIK, ODLUKA, OBRAZAC, KURIKULUM, PLAN, ZAPISNIK, INTERNI, STRUCNI, ZAVRSNI
    category TEXT,
    school_year_id UUID REFERENCES public.school_years(id) ON DELETE SET NULL,
    author_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'NACRT', -- NACRT, ODOBREN, POTPISAN, ARHIVIRAN
    version INT DEFAULT 1,
    access_level TEXT DEFAULT 'INTERNAL', -- PRIVATE, INTERNAL, PUBLIC
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.school_document_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES public.school_documents(id) ON DELETE CASCADE,
    version INT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    author_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.school_document_signatures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES public.school_documents(id) ON DELETE CASCADE,
    version INT NOT NULL,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    role TEXT,
    signature_data TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE public.school_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_document_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for school users based on access level" ON public.school_documents
    FOR SELECT USING (
        (auth.uid() IN (SELECT user_id FROM public.user_roles)) AND
        (
            access_level = 'PUBLIC' OR
            (access_level = 'INTERNAL' AND auth.uid() IS NOT NULL) OR
            (access_level = 'PRIVATE' AND author_id = auth.uid()) OR
            EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('SUPERADMIN', 'ADMIN', 'PRINCIPAL'))
        )
    );

CREATE POLICY "Enable all for admins and authors" ON public.school_documents
    FOR ALL USING (
        author_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('SUPERADMIN', 'ADMIN', 'PRINCIPAL'))
    );

CREATE POLICY "Versions are redable by doc readers" ON public.school_document_versions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.school_documents sd WHERE sd.id = document_id)
    );

CREATE POLICY "Versions are writable by doc editors" ON public.school_document_versions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.school_documents sd WHERE sd.id = document_id AND 
            (sd.author_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('SUPERADMIN', 'ADMIN', 'PRINCIPAL')))
        )
    );

CREATE POLICY "Signatures redable by doc readers" ON public.school_document_signatures
    FOR SELECT USING (
       EXISTS (SELECT 1 FROM public.school_documents sd WHERE sd.id = document_id)
    );

CREATE POLICY "Signers can sign" ON public.school_document_signatures
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
    );

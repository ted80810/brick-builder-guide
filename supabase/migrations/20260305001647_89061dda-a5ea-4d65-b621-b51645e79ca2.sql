
CREATE TABLE public.prompt_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  page_count integer NOT NULL DEFAULT 5,
  difficulty text NOT NULL DEFAULT 'Beginner',
  piece_target integer,
  style text NOT NULL DEFAULT 'classic',
  manual_id uuid REFERENCES public.manuals(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.prompt_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own prompt history"
  ON public.prompt_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own prompt history"
  ON public.prompt_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own prompt history"
  ON public.prompt_history FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

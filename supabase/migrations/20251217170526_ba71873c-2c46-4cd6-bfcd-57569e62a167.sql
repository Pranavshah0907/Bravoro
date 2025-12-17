-- Create search_results table to store contact data per company per search
CREATE TABLE public.search_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  search_id UUID NOT NULL REFERENCES public.searches(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  domain TEXT,
  contact_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups by search_id
CREATE INDEX idx_search_results_search_id ON public.search_results(search_id);

-- Enable RLS
ALTER TABLE public.search_results ENABLE ROW LEVEL SECURITY;

-- Users can view results for their own searches
CREATE POLICY "Users can view own search results"
ON public.search_results
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.searches
    WHERE searches.id = search_results.search_id
    AND searches.user_id = auth.uid()
  )
);

-- Admins can view all search results
CREATE POLICY "Admins can view all search results"
ON public.search_results
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert (for edge function)
CREATE POLICY "Service role can insert search results"
ON public.search_results
FOR INSERT
WITH CHECK (true);

-- Service role can update search results
CREATE POLICY "Service role can update search results"
ON public.search_results
FOR UPDATE
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_search_results_updated_at
BEFORE UPDATE ON public.search_results
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
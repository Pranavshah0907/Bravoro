-- Create credit_usage table to track service credits
CREATE TABLE public.credit_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  search_id UUID REFERENCES public.searches(id) ON DELETE CASCADE,
  apollo_credits INTEGER NOT NULL DEFAULT 0,
  cleon1_credits INTEGER NOT NULL DEFAULT 0,
  lusha_credits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.credit_usage ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own credit usage"
ON public.credit_usage
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own credit usage"
ON public.credit_usage
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create index for better performance
CREATE INDEX idx_credit_usage_user_id ON public.credit_usage(user_id);
CREATE INDEX idx_credit_usage_created_at ON public.credit_usage(created_at DESC);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_credit_usage_updated_at
BEFORE UPDATE ON public.credit_usage
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- ============================================================
-- 1. Add credit columns to workspaces
-- ============================================================
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS credits_balance integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS low_credit_threshold integer NOT NULL DEFAULT 100;

COMMENT ON COLUMN public.workspaces.credits_balance IS 'Denormalized running total. Maintained by trigger on workspace_credit_transactions.';
COMMENT ON COLUMN public.workspaces.low_credit_threshold IS 'Admin-configurable threshold for low-credit warnings.';

-- ============================================================
-- 2. Create the ledger table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.workspace_credit_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('initial', 'topup', 'deduction', 'adjustment')),
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  note text,
  search_id uuid REFERENCES public.searches(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_wct_workspace_id ON public.workspace_credit_transactions(workspace_id);
CREATE INDEX idx_wct_created_at ON public.workspace_credit_transactions(created_at);
CREATE INDEX idx_wct_search_id ON public.workspace_credit_transactions(search_id) WHERE search_id IS NOT NULL;

-- ============================================================
-- 3. RLS policies for ledger
-- ============================================================
ALTER TABLE public.workspace_credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all transactions"
  ON public.workspace_credit_transactions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users can read own workspace transactions"
  ON public.workspace_credit_transactions FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT workspace_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Service role can insert transactions"
  ON public.workspace_credit_transactions FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- 4. Atomic deduction function (called by save-search-results)
-- ============================================================
CREATE OR REPLACE FUNCTION public.deduct_workspace_credits(
  p_workspace_id uuid,
  p_amount integer,
  p_search_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_current_balance integer;
  v_new_balance integer;
  v_txn_id uuid;
BEGIN
  SELECT credits_balance INTO v_current_balance
  FROM public.workspaces
  WHERE id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'workspace_not_found');
  END IF;

  v_new_balance := v_current_balance - p_amount;

  UPDATE public.workspaces
  SET credits_balance = v_new_balance, updated_at = now()
  WHERE id = p_workspace_id;

  INSERT INTO public.workspace_credit_transactions
    (workspace_id, type, amount, balance_after, search_id, note, created_by)
  VALUES
    (p_workspace_id, 'deduction', -p_amount, v_new_balance, p_search_id, p_note, NULL)
  RETURNING id INTO v_txn_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_txn_id,
    'previous_balance', v_current_balance,
    'new_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 5. Add credits function (called by admin top-up / initial allocation)
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_workspace_credits(
  p_workspace_id uuid,
  p_amount integer,
  p_type text DEFAULT 'topup',
  p_note text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_current_balance integer;
  v_new_balance integer;
  v_txn_id uuid;
BEGIN
  IF p_type NOT IN ('initial', 'topup', 'adjustment') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_type');
  END IF;

  SELECT credits_balance INTO v_current_balance
  FROM public.workspaces
  WHERE id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'workspace_not_found');
  END IF;

  v_new_balance := v_current_balance + p_amount;

  UPDATE public.workspaces
  SET credits_balance = v_new_balance, updated_at = now()
  WHERE id = p_workspace_id;

  INSERT INTO public.workspace_credit_transactions
    (workspace_id, type, amount, balance_after, note, created_by)
  VALUES
    (p_workspace_id, p_type, p_amount, v_new_balance, p_note, p_created_by)
  RETURNING id INTO v_txn_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_txn_id,
    'previous_balance', v_current_balance,
    'new_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 6. Check balance function (called by trigger-n8n-webhook)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_workspace_credit_balance(p_user_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_workspace_id uuid;
  v_balance integer;
  v_threshold integer;
  v_company_name text;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_workspace_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_workspace');
  END IF;

  SELECT credits_balance, low_credit_threshold, company_name
  INTO v_balance, v_threshold, v_company_name
  FROM public.workspaces
  WHERE id = v_workspace_id;

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', v_workspace_id,
    'company_name', v_company_name,
    'credits_balance', v_balance,
    'low_credit_threshold', v_threshold,
    'is_low', v_balance <= v_threshold AND v_balance > 0,
    'is_exhausted', v_balance <= 0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 7. Auto-create personal workspaces for orphan users
-- ============================================================
DO $$
DECLARE
  r RECORD;
  v_ws_id uuid;
BEGIN
  FOR r IN
    SELECT id, email, full_name
    FROM public.profiles
    WHERE workspace_id IS NULL
  LOOP
    INSERT INTO public.workspaces (company_name, primary_contact_name, primary_contact_email)
    VALUES (
      COALESCE(r.full_name, r.email) || ' (Personal)',
      COALESCE(r.full_name, r.email),
      r.email
    )
    RETURNING id INTO v_ws_id;

    UPDATE public.profiles SET workspace_id = v_ws_id WHERE id = r.id;
  END LOOP;
END;
$$;

-- ============================================================
-- 8. Drop old enrichment columns & function
-- ============================================================
DROP FUNCTION IF EXISTS public.increment_enrichment_used(uuid, integer);

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS enrichment_limit,
  DROP COLUMN IF EXISTS enrichment_used;

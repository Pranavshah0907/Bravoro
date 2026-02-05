import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

// Allowed domains for result file URLs (whitelist)
const ALLOWED_RESULT_DOMAINS = [
  'n8n.srv1081444.hstgr.cloud',
  // Add other trusted result storage domains as needed
];

// Validate that a result URL belongs to an allowed domain
function validateResultUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only allow HTTPS URLs
    if (parsed.protocol !== 'https:') {
      return false;
    }
    // Check if domain is in whitelist
    return ALLOWED_RESULT_DOMAINS.some(domain =>
      parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

const requestSchema = z.object({
  job_id: z.string().uuid({ message: "Invalid job_id: must be a valid UUID" }),
  status: z.enum(['pending', 'processing', 'completed', 'error'], {
    errorMap: () => ({ message: "Status must be one of: pending, processing, completed, error" }),
  }),
  result_file_path: z.string().max(500).optional(),
  error_message: z.string().max(1000).optional(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify webhook secret for authentication (matching save-search-results pattern)
    const webhookSecret = Deno.env.get('N8N_WEBHOOK_SECRET');
    const providedSecret = req.headers.get('x-webhook-secret');

    if (!webhookSecret) {
      console.error('N8N_WEBHOOK_SECRET not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!providedSecret || providedSecret !== webhookSecret) {
      console.error('Invalid or missing webhook secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Webhook authentication successful');

    const body = await req.json();
    const validationResult = requestSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error('Validation error:', validationResult.error.issues);
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validationResult.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { job_id, status, result_file_path, error_message } = validationResult.data;
    console.log('Updating job status:', { job_id, status, result_file_path });

    // Validate result_file_path domain if provided
    if (result_file_path) {
      if (!validateResultUrl(result_file_path)) {
        console.error('Invalid result URL domain:', result_file_path);
        return new Response(
          JSON.stringify({ error: 'Invalid result URL domain. URL must use HTTPS and belong to an allowed domain.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Prepare update data
    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
      if (result_file_path) {
        updateData.result_file_url = result_file_path;
      }
    }

    if (status === 'error' && error_message) {
      updateData.error_message = error_message;
    }

    // Update the job record
    const { data, error } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', job_id)
      .select()
      .single();

    if (error) {
      console.error('Error updating job:', error);
      throw error;
    }

    console.log('Job updated successfully:', data);

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in update-job-status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

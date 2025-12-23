import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const uuidSchema = z.string().uuid({ message: "Invalid UUID format" });

// Generate a unique request ID for tracking
function generateRequestId(): string {
  return crypto.randomUUID();
}

serve(async (req) => {
  const requestId = generateRequestId();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const searchId = formData.get('search_id') as string;
    const errorMessage = formData.get('error_message') as string | null;
    
    // Validate search_id is a valid UUID
    const searchIdValidation = uuidSchema.safeParse(searchId);
    if (!searchIdValidation.success) {
      console.error(`[${requestId}] Invalid search_id:`, searchIdValidation.error.issues);
      return new Response(
        JSON.stringify({ error: 'Invalid request format', request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate credit values with bounds (0-1000000)
    const apolloCredits = Math.max(0, Math.min(1000000, parseInt(formData.get('apollo_credits') as string || '0') || 0));
    const cleon1Credits = Math.max(0, Math.min(1000000, parseInt(formData.get('cleon1_credits') as string || '0') || 0));
    const lushaCredits = Math.max(0, Math.min(1000000, parseInt(formData.get('lusha_credits') as string || '0') || 0));

    // Handle error case (no file, just error message)
    if (errorMessage && !file) {
      console.log(`[${requestId}] Processing error case for search with message: ${errorMessage}`);
      
      const { error: updateError } = await supabaseClient
        .from('searches')
        .update({
          status: 'error',
          error_message: errorMessage,
          updated_at: new Date().toISOString()
        })
        .eq('id', searchId);

      if (updateError) {
        console.error(`[${requestId}] Update error:`, updateError);
        return new Response(
          JSON.stringify({ error: 'Service temporarily unavailable', request_id: requestId }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, status: 'error', request_id: requestId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle success case (file upload)
    if (!file) {
      console.error(`[${requestId}] Missing file for successful completion`);
      return new Response(
        JSON.stringify({ error: 'Missing required file', request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fileBuffer = await file.arrayBuffer();
    const fileName = `${searchId}_result.xlsx`;

    console.log(`[${requestId}] Uploading file:`, fileName);

    // Upload to storage
    const { error: uploadError } = await supabaseClient.storage
      .from('results')
      .upload(fileName, fileBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true
      });

    if (uploadError) {
      console.error(`[${requestId}] Upload error:`, uploadError);
      return new Response(
        JSON.stringify({ error: 'File upload failed', request_id: requestId }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user_id from search record
    const { data: searchRecord, error: searchError } = await supabaseClient
      .from('searches')
      .select('user_id')
      .eq('id', searchId)
      .single();

    if (searchError) {
      console.error(`[${requestId}] Search record error:`, searchError);
    }

    if (!searchRecord) {
      console.error(`[${requestId}] Search not found`);
      return new Response(
        JSON.stringify({ error: 'Resource not found', request_id: requestId }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update search status
    const { error: updateError } = await supabaseClient
      .from('searches')
      .update({
        status: 'completed',
        result_url: fileName,
        updated_at: new Date().toISOString()
      })
      .eq('id', searchId);

    if (updateError) {
      console.error(`[${requestId}] Update error:`, updateError);
      return new Response(
        JSON.stringify({ error: 'Service temporarily unavailable', request_id: requestId }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store credit usage if any credits were used
    if (apolloCredits > 0 || cleon1Credits > 0 || lushaCredits > 0) {
      const { error: creditError } = await supabaseClient
        .from('credit_usage')
        .insert({
          user_id: searchRecord.user_id,
          search_id: searchId,
          apollo_credits: apolloCredits,
          cleon1_credits: cleon1Credits,
          lusha_credits: lushaCredits,
        });

      if (creditError) {
        console.error(`[${requestId}] Credit tracking error:`, creditError);
        // Don't fail the whole request if credit tracking fails
      }
    }

    console.log(`[${requestId}] File uploaded successfully`);

    return new Response(
      JSON.stringify({ success: true, request_id: requestId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    return new Response(
      JSON.stringify({ error: 'Request processing failed', request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

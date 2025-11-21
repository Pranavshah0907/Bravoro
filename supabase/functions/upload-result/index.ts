import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const searchId = formData.get('search_id') as string;
    const apolloCredits = parseInt(formData.get('apollo_credits') as string || '0');
    const cleon1Credits = parseInt(formData.get('cleon1_credits') as string || '0');
    const lushaCredits = parseInt(formData.get('lusha_credits') as string || '0');

    if (!file || !searchId) {
      return new Response(
        JSON.stringify({ error: 'Missing file or search_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fileBuffer = await file.arrayBuffer();
    const fileName = `${searchId}_result.xlsx`;

    // Upload to storage
    const { error: uploadError } = await supabaseClient.storage
      .from('results')
      .upload(fileName, fileBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user_id from search record
    const { data: searchRecord } = await supabaseClient
      .from('searches')
      .select('user_id')
      .eq('id', searchId)
      .single();

    if (!searchRecord) {
      return new Response(
        JSON.stringify({ error: 'Search not found' }),
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
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
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
        console.error('Credit tracking error:', creditError);
        // Don't fail the whole request if credit tracking fails
      }
    }

    return new Response(
      JSON.stringify({ success: true, fileName }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
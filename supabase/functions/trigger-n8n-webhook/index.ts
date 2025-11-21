import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { searchData, searchId, entryType } = await req.json();
    console.log('Triggering N8N webhook with data:', searchData);

    const n8nWebhookUrl = 'https://n8n.srv1081444.hstgr.cloud/webhook-test/manual-entry';

    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'type_of_entry': entryType || 'manual_entry',
      },
      body: JSON.stringify(searchData),
    });

    if (!response.ok) {
      throw new Error(`N8N webhook failed with status: ${response.status}`);
    }

    const result = await response.json();
    console.log('N8N webhook response:', result);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update the search record based on n8n response
    if (result.status === 'error') {
      await supabase
        .from('searches')
        .update({
          status: 'error',
          error_message: result.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', searchId);
    } else if (result.status === 'completed' || result.status === 'success') {
      // Construct download URL from file_id
      const downloadUrl = `https://n8n.srv1081444.hstgr.cloud/webhook-test/download?fileId=${result.file_id}`;
      
      await supabase
        .from('searches')
        .update({
          status: 'completed',
          result_url: downloadUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', searchId);
    }

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error triggering N8N webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Try to update search status to error if we have searchId
    try {
      const { searchId } = await req.json();
      if (searchId) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        await supabase
          .from('searches')
          .update({
            status: 'error',
            error_message: errorMessage,
            updated_at: new Date().toISOString()
          })
          .eq('id', searchId);
      }
    } catch (updateError) {
      console.error('Error updating search status:', updateError);
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

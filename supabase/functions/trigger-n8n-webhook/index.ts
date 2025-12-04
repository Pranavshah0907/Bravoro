import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Schema for manual entry
const manualEntrySchema = z.object({
  searchId: z.string().uuid({ message: "Invalid searchId: must be a valid UUID" }),
  searchData: z.object({
    company_name: z.string().optional(),
    domain: z.string().optional(),
    functions: z.array(z.string()).optional(),
    geography: z.string().optional(),
    seniority: z.array(z.string()).optional(),
    results_per_function: z.number().int().positive().optional(),
  }),
  entryType: z.literal('manual_entry').optional(),
  apollo_credits: z.number().int().min(0).max(1000000).optional().default(0),
  cleon1_credits: z.number().int().min(0).max(1000000).optional().default(0),
  lusha_credits: z.number().int().min(0).max(1000000).optional().default(0),
});

// Schema for bulk upload - accepts any data structure from Excel
const bulkUploadSchema = z.object({
  searchId: z.string().uuid({ message: "Invalid searchId: must be a valid UUID" }),
  searchData: z.object({
    search_id: z.string().uuid().optional(),
    data: z.record(z.array(z.record(z.unknown()))).optional(), // Excel sheets as object with arrays of records
  }).passthrough(), // Allow additional fields
  entryType: z.literal('bulk_upload'),
  apollo_credits: z.number().int().min(0).max(1000000).optional().default(0),
  cleon1_credits: z.number().int().min(0).max(1000000).optional().default(0),
  lusha_credits: z.number().int().min(0).max(1000000).optional().default(0),
});

// Combined schema that accepts either format
const requestSchema = z.union([bulkUploadSchema, manualEntrySchema]);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log('Received request body:', JSON.stringify(body));
    
    const validationResult = requestSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error('Validation error:', validationResult.error.issues);
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validationResult.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { searchData, searchId, entryType, apollo_credits, cleon1_credits, lusha_credits } = validationResult.data;
    console.log('Entry type:', entryType);
    console.log('Search data keys:', Object.keys(searchData));

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user_id and email from the search record
    const { data: searchRecord, error: searchError } = await supabase
      .from('searches')
      .select('user_id')
      .eq('id', searchId)
      .maybeSingle();

    console.log('Search record:', searchRecord, 'Error:', searchError);

    let userEmail = '';
    if (searchRecord?.user_id) {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', searchRecord.user_id)
        .maybeSingle();
      
      console.log('Profile data:', profileData, 'Error:', profileError);
      userEmail = profileData?.email || '';
    }

    console.log('User email to send:', userEmail);

    const n8nWebhookUrl = 'https://n8n.srv1081444.hstgr.cloud/webhook/incoming_request';

    // Build payload based on entry type
    let payloadToSend: Record<string, unknown>;
    
    if (entryType === 'bulk_upload') {
      // For bulk upload, include the Excel data
      payloadToSend = {
        search_id: searchId,
        user_email: userEmail,
        data: (searchData as { data?: unknown }).data, // The parsed Excel content
      };
    } else {
      // For manual entry, spread the search data fields
      payloadToSend = {
        ...searchData,
        search_id: searchId,
        user_email: userEmail,
      };
    }

    console.log('Payload being sent to n8n:', JSON.stringify(payloadToSend));

    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'type_of_entry': entryType || 'manual_entry',
      },
      body: JSON.stringify(payloadToSend),
    });

    if (!response.ok) {
      throw new Error(`N8N webhook failed with status: ${response.status}`);
    }

    const result = await response.json();
    console.log('N8N webhook response:', result);

    // Store credit usage if credits are provided
    if ((apollo_credits > 0 || cleon1_credits > 0 || lusha_credits > 0) && searchRecord?.user_id) {
      await supabase
        .from('credit_usage')
        .insert({
          user_id: searchRecord.user_id,
          search_id: searchId,
          apollo_credits,
          cleon1_credits,
          lusha_credits,
        });
    }

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
      const downloadUrl = `https://n8n.srv1081444.hstgr.cloud/webhook/download?fileId=${result.file_id}`;
      
      await supabase
        .from('searches')
        .update({
          status: 'completed',
          result_url: downloadUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', searchId);

      // Store credit usage from n8n response if provided
      if ((result.apollo_credits > 0 || result.cleon1_credits > 0 || result.lusha_credits > 0) && searchRecord?.user_id) {
        await supabase
          .from('credit_usage')
          .insert({
            user_id: searchRecord.user_id,
            search_id: searchId,
            apollo_credits: result.apollo_credits || 0,
            cleon1_credits: result.cleon1_credits || 0,
            lusha_credits: result.lusha_credits || 0,
          });
      }
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

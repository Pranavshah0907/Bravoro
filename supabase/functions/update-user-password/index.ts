import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate a unique request ID for tracking
function generateRequestId(): string {
  return crypto.randomUUID();
}

Deno.serve(async (req) => {
  const requestId = generateRequestId();
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { userId, newPassword, tokenHash } = await req.json();

    if (!userId || !newPassword || !tokenHash) {
      console.error(`[${requestId}] Missing required fields`);
      return new Response(
        JSON.stringify({ error: 'Missing required fields', request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${requestId}] Processing password update for user:`, userId);

    // Verify token is still valid
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('password_reset_tokens')
      .select('id, user_id, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .eq('user_id', userId)
      .maybeSingle();

    if (tokenError || !tokenData) {
      console.error(`[${requestId}] Token validation failed:`, tokenError);
      return new Response(
        JSON.stringify({ error: 'Invalid reset token', request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (tokenData.used_at) {
      console.error(`[${requestId}] Token already used`);
      return new Response(
        JSON.stringify({ error: 'Reset token already used', request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const expiresAt = new Date(tokenData.expires_at);
    if (expiresAt < new Date()) {
      console.error(`[${requestId}] Token expired`);
      return new Response(
        JSON.stringify({ error: 'Reset token expired', request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update user password using admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      console.error(`[${requestId}] Password update failed:`, updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update password', request_id: requestId }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark token as used
    await supabaseAdmin
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenData.id);

    // Also clear requires_password_reset flag if it was set
    await supabaseAdmin
      .from('profiles')
      .update({ requires_password_reset: false })
      .eq('id', userId);

    console.log(`[${requestId}] Password updated successfully for user:`, userId);

    return new Response(
      JSON.stringify({ success: true, message: 'Password updated successfully', request_id: requestId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[${requestId}] Error in update-user-password:`, error);
    return new Response(
      JSON.stringify({ error: 'Request processing failed', request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

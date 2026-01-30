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
    const n8nWebhookSecret = Deno.env.get('N8N_WEBHOOK_SECRET');
    
    // Create Supabase client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the requesting user is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error(`[${requestId}] No authorization header`);
      return new Response(
        JSON.stringify({ error: 'Authentication required', request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error(`[${requestId}] User authentication failed:`, userError);
      return new Response(
        JSON.stringify({ error: 'Invalid credentials', request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has admin role
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError) {
      console.error(`[${requestId}] Role check error:`, roleError);
    }

    if (roleData?.role !== 'admin') {
      console.error(`[${requestId}] User is not an admin`);
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions', request_id: requestId }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the request body
    const { email, fullName, tempPassword, role = 'user', enrichmentLimit = 0 } = await req.json();

    console.log(`[${requestId}] Creating user with email:`, email, 'enrichmentLimit:', enrichmentLimit);

    // Create the new user
    let { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    });

    // Handle case where user exists but is soft-deleted
    if (authError && authError.message?.includes('already been registered')) {
      console.log(`[${requestId}] User email exists, attempting to find and permanently delete soft-deleted user`);
      
      try {
        // List all users (including deleted ones) to find the soft-deleted user
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (listError) {
          console.error(`[${requestId}] Error listing users:`, listError);
          throw authError; // Throw original error if we can't list users
        }

        // Find the user with this email (even if deleted)
        const existingUser = users?.find(u => u.email === email);
        
        if (existingUser) {
          console.log(`[${requestId}] Found existing user, deleting permanently`);
          
          // Permanently delete the user
          const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(existingUser.id);
          
          if (deleteError) {
            console.error(`[${requestId}] Error permanently deleting user:`, deleteError);
            throw authError; // Throw original error if deletion fails
          }

          console.log(`[${requestId}] User permanently deleted, retrying creation`);
          
          // Retry user creation
          const retry = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: {
              full_name: fullName,
            },
          });

          authData = retry.data;
          authError = retry.error;
        }
      } catch (retryError) {
        console.error(`[${requestId}] Error during retry logic:`, retryError);
        throw authError; // Throw original error if retry logic fails
      }
    }

    if (authError) {
      console.error(`[${requestId}] Error creating user:`, authError);
      return new Response(
        JSON.stringify({ error: 'Failed to create user', request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (authData.user) {
      // Update profile with password reset flag and enrichment limit
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ 
          requires_password_reset: true,
          enrichment_limit: enrichmentLimit,
          enrichment_used: 0
        })
        .eq('id', authData.user.id);

      if (profileError) {
        console.error(`[${requestId}] Error updating profile:`, profileError);
      }

      // Delete any existing role assignments (from trigger)
      await supabaseAdmin
        .from('user_roles')
        .delete()
        .eq('user_id', authData.user.id);

      // Assign the specified role
      await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: authData.user.id, role: role });

      console.log(`[${requestId}] User created successfully with role:`, role, 'enrichmentLimit:', enrichmentLimit);

      // Send welcome email via unified send-email function
      console.log(`[${requestId}] Sending welcome email via send-email function`);
      
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        
        const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            type: 'welcome',
            email: email,
            fullName: fullName,
            tempPassword: tempPassword,
          }),
        });

        const emailResult = await emailResponse.json();
        console.log(`[${requestId}] send-email response:`, emailResult);

        if (!emailResponse.ok || !emailResult.success) {
          console.error(`[${requestId}] send-email failed, rolling back user creation`);

          // Roll back created user so the email can be reused on retry
          if (authData.user) {
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            await supabaseAdmin.from('profiles').delete().eq('id', authData.user.id);
          }

          return new Response(
            JSON.stringify({ 
              success: false, 
              error: emailResult.error || 'Failed to send welcome email',
              userCreated: false,
              request_id: requestId,
            }),
            { 
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        // Both user creation and email sending succeeded
        return new Response(
          JSON.stringify({ 
            success: true, 
            user: authData.user,
            message: 'User created and welcome email sent successfully',
            request_id: requestId,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (emailError) {
        console.error(`[${requestId}] Error calling send-email, rolling back user creation:`, emailError);

        // Roll back created user on any unexpected error so email can be retried cleanly
        if (authData.user) {
          await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
          await supabaseAdmin.from('profiles').delete().eq('id', authData.user.id);
        }

        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Failed to send welcome email',
            userCreated: false,
            request_id: requestId,
          }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Failed to create user', request_id: requestId }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error(`[${requestId}] Error in admin-create-user:`, error);
    return new Response(
      JSON.stringify({ error: 'Request processing failed', request_id: requestId }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

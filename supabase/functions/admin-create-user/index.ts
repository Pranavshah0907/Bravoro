import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
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
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user has admin role
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleData?.role !== 'admin') {
      throw new Error('User is not an admin');
    }

    // Get the request body
    const { email, fullName, tempPassword } = await req.json();

    console.log('Creating user with email:', email);

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
      console.log('User email exists, attempting to find and permanently delete soft-deleted user');
      
      try {
        // List all users (including deleted ones) to find the soft-deleted user
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (listError) {
          console.error('Error listing users:', listError);
          throw authError; // Throw original error if we can't list users
        }

        // Find the user with this email (even if deleted)
        const existingUser = users?.find(u => u.email === email);
        
        if (existingUser) {
          console.log('Found existing user, deleting permanently:', existingUser.id);
          
          // Permanently delete the user
          const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(existingUser.id);
          
          if (deleteError) {
            console.error('Error permanently deleting user:', deleteError);
            throw authError; // Throw original error if deletion fails
          }

          console.log('User permanently deleted, retrying creation');
          
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
        console.error('Error during retry logic:', retryError);
        throw authError; // Throw original error if retry logic fails
      }
    }

    if (authError) {
      console.error('Error creating user:', authError);
      throw authError;
    }

    if (authData.user) {
      // Mark user as requiring password reset
      await supabaseAdmin
        .from('profiles')
        .update({ requires_password_reset: true })
        .eq('id', authData.user.id);

      console.log('User created successfully:', authData.user.id);

      // Send welcome email via n8n webhook
      const origin = req.headers.get('origin') || supabaseUrl;
      console.log('Calling n8n webhook to send welcome email');
      
      try {
        const webhookResponse = await fetch('https://n8n.srv1081444.hstgr.cloud/webhook-test/email-sender', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: email,
            fullName: fullName,
            tempPassword: tempPassword,
            websiteUrl: origin,
          }),
        });

        const webhookResult = await webhookResponse.json();
        console.log('n8n webhook response:', webhookResult);

        if (!webhookResult.success) {
          console.error('n8n reported failure, rolling back user creation');

          // Roll back created user so the email can be reused on retry
          if (authData.user) {
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            await supabaseAdmin.from('profiles').delete().eq('id', authData.user.id);
          }

          return new Response(
            JSON.stringify({ 
              success: false, 
              error: webhookResult.error || 'Failed to send welcome email',
              userCreated: false,
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
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (webhookError) {
        console.error('Error calling n8n webhook, rolling back user creation:', webhookError);

        // Roll back created user on any unexpected error so email can be retried cleanly
        if (authData.user) {
          await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
          await supabaseAdmin.from('profiles').delete().eq('id', authData.user.id);
        }

        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'User creation rolled back because welcome email failed: ' + (webhookError instanceof Error ? webhookError.message : 'Unknown error'),
            userCreated: false,
          }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Failed to create user' }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error in admin-create-user:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

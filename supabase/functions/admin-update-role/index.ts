import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
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

    // Check if requesting user has admin role
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleData?.role !== 'admin') {
      throw new Error('Insufficient permissions: Admin role required');
    }

    // Get the request body
    const { userId, newRole } = await req.json();

    if (!userId || !newRole) {
      throw new Error('Missing required fields: userId and newRole');
    }

    if (!['admin', 'user'].includes(newRole)) {
      throw new Error('Invalid role. Must be "admin" or "user"');
    }

    console.log(`Updating role for user ${userId} to ${newRole}`);

    // Delete existing role
    const { error: deleteError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.error('Error deleting old role:', deleteError);
      throw new Error('Failed to update role');
    }

    // Insert new role
    const { error: insertError } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: userId, role: newRole });

    if (insertError) {
      console.error('Error inserting new role:', insertError);
      throw new Error('Failed to update role');
    }

    console.log(`Successfully updated role for user ${userId} to ${newRole}`);

    return new Response(
      JSON.stringify({ success: true, message: `Role updated to ${newRole}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in admin-update-role:', error);
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

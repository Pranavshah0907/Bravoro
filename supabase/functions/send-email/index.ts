import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Email type definitions
type EmailType = 'welcome' | 'success' | 'error' | 'password-reset';

interface SendEmailRequest {
  type: EmailType;
  // For welcome emails
  email?: string;
  fullName?: string;
  tempPassword?: string;
  // For success/error emails
  userEmail?: string;
  searchType?: string;
  errorMessage?: string;
  // For password reset
  resetEmail?: string;
}

// Generate a unique request ID for tracking
function generateRequestId(): string {
  return crypto.randomUUID();
}

// Hash a token for secure storage
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Email templates
function getWelcomeEmailHtml(fullName: string, email: string, tempPassword: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Bravoro</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Welcome to Bravoro</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                Hi ${fullName || 'there'},
              </p>
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                Your Bravoro account has been created. Here are your login credentials:
              </p>
              <!-- Credentials Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; margin: 24px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px 0; color: #374151; font-size: 14px;">
                      <strong>Login Email:</strong><br>
                      <span style="color: #0d9488; font-size: 16px;">${email}</span>
                    </p>
                    <p style="margin: 0; color: #374151; font-size: 14px;">
                      <strong>Temporary Password:</strong><br>
                      <span style="color: #0d9488; font-size: 16px; font-family: monospace;">${tempPassword}</span>
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 24px 0; color: #dc2626; font-size: 14px; font-weight: 500;">
                ⚠️ Important: For security reasons, you will be required to set a new password on your first login.
              </p>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="https://app.bravoro.com/auth" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Sign In to Bravoro
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                Best regards,<br>
                <strong>The Bravoro Team</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function getSuccessEmailHtml(searchType?: string): string {
  const searchLabel = searchType || 'enrichment';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Enrichment Successful - Bravoro</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">✓ Enrichment Complete</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                Great news! Your ${searchLabel} request has been successfully processed.
              </p>
              <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                You can now view and download your results from the results page.
              </p>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="https://app.bravoro.com/results" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      View Results
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                Best regards,<br>
                <strong>The Bravoro Team</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function getErrorEmailHtml(errorMessage: string, searchType?: string): string {
  const searchLabel = searchType || 'enrichment';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Enrichment Error - Bravoro</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">⚠️ Enrichment Error</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                We encountered an issue processing your ${searchLabel} request.
              </p>
              <!-- Error Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; margin: 24px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0; color: #dc2626; font-size: 14px;">
                      <strong>Error Details:</strong><br><br>
                      <span style="color: #7f1d1d;">${errorMessage}</span>
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                Please try again or contact support if the issue persists.
              </p>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="https://app.bravoro.com/dashboard" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Try Again
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                Best regards,<br>
                <strong>The Bravoro Team</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function getPasswordResetEmailHtml(resetLink: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password - Bravoro</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Reset Your Password</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                You requested to reset your password. Click the button below to set a new password:
              </p>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                This link will expire in <strong>1 hour</strong>.
              </p>
              <p style="margin: 16px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                Best regards,<br>
                <strong>The Bravoro Team</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

serve(async (req: Request): Promise<Response> => {
  const requestId = generateRequestId();
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error(`[${requestId}] RESEND_API_KEY not configured`);
      return new Response(
        JSON.stringify({ success: false, error: "Email service not configured", request_id: requestId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(resendApiKey);
    const body: SendEmailRequest = await req.json();
    const { type } = body;

    console.log(`[${requestId}] Processing email request type: ${type}`);

    let emailResponse;

    switch (type) {
      case 'welcome': {
        const { email, fullName, tempPassword } = body;
        
        if (!email || !tempPassword) {
          return new Response(
            JSON.stringify({ success: false, error: "Missing required fields for welcome email", request_id: requestId }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[${requestId}] Sending welcome email to: ${email}`);

        emailResponse = await resend.emails.send({
          from: "Bravoro <welcome@mail.bravoro.com>",
          to: [email],
          subject: "Welcome to Bravoro - Your Account Details",
          html: getWelcomeEmailHtml(fullName || '', email, tempPassword),
        });
        break;
      }

      case 'success': {
        const { userEmail, searchType } = body;
        
        if (!userEmail) {
          return new Response(
            JSON.stringify({ success: false, error: "Missing userEmail for success email", request_id: requestId }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[${requestId}] Sending success email to: ${userEmail}`);

        emailResponse = await resend.emails.send({
          from: "Bravoro <service@mail.bravoro.com>",
          to: [userEmail],
          subject: "Bravoro Enrichment Successful",
          html: getSuccessEmailHtml(searchType),
        });
        break;
      }

      case 'error': {
        const { userEmail, searchType, errorMessage } = body;
        
        if (!userEmail || !errorMessage) {
          return new Response(
            JSON.stringify({ success: false, error: "Missing required fields for error email", request_id: requestId }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[${requestId}] Sending error email to: ${userEmail}`);

        emailResponse = await resend.emails.send({
          from: "Bravoro <service@mail.bravoro.com>",
          to: [userEmail],
          subject: "Bravoro Enrichment Error",
          html: getErrorEmailHtml(errorMessage, searchType),
        });
        break;
      }

      case 'password-reset': {
        const { resetEmail } = body;
        
        if (!resetEmail) {
          return new Response(
            JSON.stringify({ success: false, error: "Missing resetEmail for password reset", request_id: requestId }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[${requestId}] Processing password reset for: ${resetEmail}`);

        // Create Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Check if user exists
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, email')
          .eq('email', resetEmail)
          .maybeSingle();

        if (profileError) {
          console.error(`[${requestId}] Error checking profile:`, profileError);
          // Don't reveal if email exists - return success anyway
          return new Response(
            JSON.stringify({ success: true, message: "If the email exists, a reset link has been sent", request_id: requestId }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!profile) {
          console.log(`[${requestId}] No profile found for email: ${resetEmail}`);
          // Don't reveal if email exists - return success anyway
          return new Response(
            JSON.stringify({ success: true, message: "If the email exists, a reset link has been sent", request_id: requestId }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Generate secure token
        const token = crypto.randomUUID() + '-' + crypto.randomUUID();
        const tokenHash = await hashToken(token);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        // Invalidate existing unused tokens for this user
        await supabase
          .from('password_reset_tokens')
          .update({ used_at: new Date().toISOString() })
          .eq('user_id', profile.id)
          .is('used_at', null);

        // Store new token
        const { error: insertError } = await supabase
          .from('password_reset_tokens')
          .insert({
            user_id: profile.id,
            token_hash: tokenHash,
            email: resetEmail,
            expires_at: expiresAt.toISOString(),
          });

        if (insertError) {
          console.error(`[${requestId}] Error storing reset token:`, insertError);
          return new Response(
            JSON.stringify({ success: false, error: "Failed to generate reset link", request_id: requestId }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const resetLink = `https://app.bravoro.com/reset-password?token=${token}`;

        emailResponse = await resend.emails.send({
          from: "Bravoro <service@mail.bravoro.com>",
          to: [resetEmail],
          subject: "Reset Your Bravoro Password",
          html: getPasswordResetEmailHtml(resetLink),
        });
        break;
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown email type: ${type}`, request_id: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    console.log(`[${requestId}] Email sent successfully:`, emailResponse);

    return new Response(
      JSON.stringify({ success: true, data: emailResponse, request_id: requestId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error(`[${requestId}] Error in send-email function:`, error);
    return new Response(
      JSON.stringify({ success: false, error: error.message, request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

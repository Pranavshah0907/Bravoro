import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Email type definitions
type EmailType = 'welcome' | 'success' | 'error' | 'password-reset' | 'support';

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
  // Origin URL for generating reset links
  origin?: string;
  // For support emails
  userName?: string;
  message?: string;
  attachments?: Array<{ filename: string; content: string; type: string }>;
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
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #e8eeee; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #e8eeee;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <!-- Main Card -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0d222e 0%, #00686d 50%, #58dddd 100%); padding: 48px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: 1px;">
                Welcome to BRAVORO
              </h1>
            </td>
          </tr>
          
          <!-- Body Content -->
          <tr>
            <td style="padding: 48px 48px 32px 48px;">
              <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.7;">
                Hi ${fullName || 'there'},<br><br>
                Your account is ready! You can now start using Bravoro to enrich your leads and supercharge your prospecting.
              </p>
              
              <!-- Credentials Section -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 32px 0; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 24px 0;">
                    <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                      Here's your login information:
                    </p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 16px;">
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 140px;">Email</td>
                        <td style="padding: 8px 0; color: #0d222e; font-size: 14px; font-weight: 500;">${email}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 140px;">Temporary Password</td>
                        <td style="padding: 8px 0; color: #0d222e; font-size: 14px; font-weight: 600; font-family: 'SF Mono', 'Monaco', 'Consolas', monospace; background-color: #f3f4f6; padding: 8px 12px; border-radius: 6px; display: inline-block;">${tempPassword}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 8px 0 32px 0;">
                <tr>
                  <td>
                    <a href="https://bravoro-v2-test.vercel.app/auth" style="display: inline-block; padding: 16px 32px; background-color: #00686d; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 8px;">
                      Log In Now
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Divider and signature -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding-top: 24px;">
                    <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.6;">
                      Thanks for choosing Bravoro.<br>
                      <span style="color: #6b7280;">– The Bravoro Team</span>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        
        <!-- Footer -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; margin-top: 32px;">
          <tr>
            <td align="center">
              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px; font-weight: 600;">
                Questions?
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 13px;">
                Get in touch with us at <a href="mailto:support@bravoro.com" style="color: #009da5; text-decoration: none;">support@bravoro.com</a>
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top: 24px;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                Bravoro · Lead Enrichment Platform
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
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #e8eeee; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #e8eeee;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <!-- Main Card -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0d222e 0%, #00686d 50%, #58dddd 100%); padding: 48px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: 0.5px;">
                ✓ Enrichment Complete
              </h1>
            </td>
          </tr>
          
          <!-- Body Content -->
          <tr>
            <td style="padding: 48px;">
              <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.7;">
                Great news! Your ${searchLabel} request has been successfully processed.
              </p>
              <p style="margin: 0 0 32px 0; color: #4b5563; font-size: 16px; line-height: 1.7;">
                You can now view and download your results from the results page.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td>
                    <a href="https://bravoro-v2-test.vercel.app/results" style="display: inline-block; padding: 16px 32px; background-color: #00686d; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 8px;">
                      View Results
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Signature -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding-top: 24px;">
                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                      Best regards,<br>
                      <span style="color: #4b5563; font-weight: 500;">The Bravoro Team</span>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        
        <!-- Footer -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; margin-top: 32px;">
          <tr>
            <td align="center">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                Bravoro · Lead Enrichment Platform
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
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #e8eeee; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #e8eeee;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <!-- Main Card -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0d222e 0%, #4a1d1d 50%, #dc2626 100%); padding: 48px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: 0.5px;">
                ⚠ Enrichment Error
              </h1>
            </td>
          </tr>
          
          <!-- Body Content -->
          <tr>
            <td style="padding: 48px;">
              <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.7;">
                We encountered an issue processing your ${searchLabel} request.
              </p>
              
              <!-- Error Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; margin: 24px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px 0; color: #dc2626; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                      Error Details:
                    </p>
                    <p style="margin: 0; color: #7f1d1d; font-size: 14px; line-height: 1.6;">
                      ${errorMessage}
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 32px 0; color: #4b5563; font-size: 16px; line-height: 1.7;">
                Please try again or contact support if the issue persists.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td>
                    <a href="https://bravoro-v2-test.vercel.app/dashboard" style="display: inline-block; padding: 16px 32px; background-color: #00686d; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 8px;">
                      Try Again
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Signature -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding-top: 24px;">
                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                      Best regards,<br>
                      <span style="color: #4b5563; font-weight: 500;">The Bravoro Team</span>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        
        <!-- Footer -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; margin-top: 32px;">
          <tr>
            <td align="center">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                Bravoro · Lead Enrichment Platform
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
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #e8eeee; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #e8eeee;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <!-- Main Card -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0d222e 0%, #00686d 50%, #58dddd 100%); padding: 48px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: 0.5px;">
                Reset Your Password
              </h1>
            </td>
          </tr>
          
          <!-- Body Content -->
          <tr>
            <td style="padding: 48px;">
              <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.7;">
                You requested to reset your password. Click the button below to set a new password:
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 32px 0;">
                <tr>
                  <td>
                    <a href="${resetLink}" style="display: inline-block; padding: 16px 32px; background-color: #00686d; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 8px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 16px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                This link will expire in <strong style="color: #4b5563;">1 hour</strong>.
              </p>
              <p style="margin: 0 0 32px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
              </p>
              
              <!-- Signature -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding-top: 24px;">
                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                      Best regards,<br>
                      <span style="color: #4b5563; font-weight: 500;">The Bravoro Team</span>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        
        <!-- Footer -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; margin-top: 32px;">
          <tr>
            <td align="center">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                Bravoro · Lead Enrichment Platform
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

function getSupportEmailHtml(userName: string, userEmail: string, message: string, hasAttachments: boolean): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Support Request - Bravoro</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #e8eeee; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #e8eeee;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);">
          <tr>
            <td style="background: linear-gradient(135deg, #0d222e 0%, #b45309 50%, #f59e0b 100%); padding: 48px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: 0.5px;">
                Support Request
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 48px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px; background-color: #f9fafb; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">From</p>
                    <p style="margin: 0; color: #0d222e; font-size: 15px; font-weight: 500;">${userName}</p>
                    <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 14px;">${userEmail}</p>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Message</p>
              <div style="padding: 20px; background-color: #f9fafb; border-radius: 8px; border-left: 4px solid #f59e0b; margin-bottom: 24px;">
                <p style="margin: 0; color: #374151; font-size: 15px; line-height: 1.7; white-space: pre-wrap;">${message}</p>
              </div>
              ${hasAttachments ? '<p style="margin: 0; color: #6b7280; font-size: 14px; font-style: italic;">Screenshots are attached to this email.</p>' : ''}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top: 1px solid #e5e7eb; margin-top: 32px;">
                <tr>
                  <td style="padding-top: 24px;">
                    <p style="margin: 0; color: #6b7280; font-size: 13px;">
                      Sent via Bravoro in-app support widget
                    </p>
                  </td>
                </tr>
              </table>
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

        // Use the production Bravoro custom domain for reset links
        const resetLink = `https://bravoro-v2-test.vercel.app/reset-password?token=${token}`;

        emailResponse = await resend.emails.send({
          from: "Bravoro <service@mail.bravoro.com>",
          to: [resetEmail],
          subject: "Reset Your Bravoro Password",
          html: getPasswordResetEmailHtml(resetLink),
        });
        break;
      }

      case 'support': {
        const { userName, userEmail, message, attachments: supportAttachments } = body;

        if (!message && (!supportAttachments || supportAttachments.length === 0)) {
          return new Response(
            JSON.stringify({ success: false, error: "Message or attachments required", request_id: requestId }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const senderName = userName || 'Unknown User';
        const senderEmail = userEmail || 'unknown';
        const hasAttachments = !!(supportAttachments && supportAttachments.length > 0);

        console.log(`[${requestId}] Sending support email from: ${senderName} (${senderEmail})`);

        const emailAttachments = supportAttachments?.map((att: { filename: string; content: string; type: string }) => ({
          filename: att.filename,
          content: att.content,
        })) || [];

        emailResponse = await resend.emails.send({
          from: "Bravoro <service@mail.bravoro.com>",
          to: ["pranavshah0907@gmail.com", "sandy.s9995@gmail.com"],
          replyTo: senderEmail,
          subject: `URGENT - Support Request from ${senderName}`,
          html: getSupportEmailHtml(senderName, senderEmail, message || '(No message — see attachments)', hasAttachments),
          attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
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

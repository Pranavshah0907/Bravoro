
# Bravoro Email System Implementation

## Overview
This plan implements a unified email system using Resend with your verified domain `mail.bravoro.com`. The system will handle four email types through a single "switchboard" edge function.

## Email Types and Senders

| Email Type | From Address | Purpose |
|------------|-------------|---------|
| Welcome | welcome@mail.bravoro.com | New user onboarding with temporary password |
| Success | service@mail.bravoro.com | Search completed notification |
| Error | service@mail.bravoro.com | Search error notification |
| Password Reset | service@mail.bravoro.com | Self-service password reset link |

## Architecture

```text
Frontend / Edge Functions
        |
        v
+-------------------+
|   send-email      |  <-- Single unified edge function
|   (Switchboard)   |
+-------------------+
        |
        +---> type: 'welcome'  --> welcome@mail.bravoro.com
        |
        +---> type: 'success'  --> service@mail.bravoro.com
        |
        +---> type: 'error'    --> service@mail.bravoro.com
        |
        +---> type: 'password-reset' --> service@mail.bravoro.com
```

## Implementation Steps

### Phase 1: Unified Email Edge Function

**Create `supabase/functions/send-email/index.ts`**

A single edge function that accepts a `type` parameter and routes to the appropriate email template:

- `type: 'welcome'` - Sends welcome email with credentials from `welcome@mail.bravoro.com`
- `type: 'success'` - Sends enrichment success notification from `service@mail.bravoro.com`
- `type: 'error'` - Sends error notification from `service@mail.bravoro.com`
- `type: 'password-reset'` - Sends password reset link from `service@mail.bravoro.com`

Each template will be professionally styled with Bravoro branding (replacing all "LEAP" references).

### Phase 2: Database Changes

**Create `password_reset_tokens` table**

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | References profiles(id) |
| token | text | Secure random token (hashed) |
| email | text | User's email |
| expires_at | timestamp | Token expiration (1 hour) |
| used_at | timestamp | When token was used (nullable) |
| created_at | timestamp | Creation timestamp |

RLS policies will allow service role only (edge functions use service key).

### Phase 3: Forgot Password Flow

**Update Auth Page (`src/pages/Auth.tsx`)**

- Add "Forgot password?" link below the password field
- Clicking opens a dialog with email input
- Submit calls the `send-email` function with `type: 'password-reset'`

**Create Reset Password Page (`src/pages/ResetPassword.tsx`)**

- New route at `/reset-password`
- Validates token from URL query parameter
- Uses the existing `PasswordReset` component design pattern
- Consistent styling with the current password reset flow

**Update App Routes (`src/App.tsx`)**

- Add route for `/reset-password`

### Phase 4: Integration Updates

**Update `admin-create-user` function**

- Replace n8n webhook call with direct call to `send-email` function
- Type: 'welcome'
- This removes dependency on n8n for welcome emails

**Update `save-search-results` function**

- After successful completion, call `send-email` with type: 'success'
- After error, call `send-email` with type: 'error'
- Include relevant details (search type, error message, etc.)

### Phase 5: Cleanup

**Delete old function**

- Remove `send-welcome-email` function (replaced by unified `send-email`)

## Email Templates

### Welcome Email (welcome@mail.bravoro.com)

```text
Subject: Welcome to Bravoro - Your Account Details

Hi [Full Name],

Welcome to Bravoro!

Your account has been created. Here are your login details:

+---------------------------+
| Login email: [email]      |
| Temporary password: [pwd] |
+---------------------------+

Important: For security reasons, you must create a new password 
on your first login.

You can log in here: https://app.bravoro.com/auth

Best regards,
The Bravoro Team
```

### Success Email (service@mail.bravoro.com)

```text
Subject: Bravoro Enrichment Successful

Your enrichment request has been successfully processed. 
You can view and download your results anytime.

[View Results Button -> https://app.bravoro.com/results]

Best regards,
The Bravoro Team
```

### Error Email (service@mail.bravoro.com)

```text
Subject: Bravoro Enrichment Error

We encountered an issue processing your enrichment request.

Error: [error_message]

Please try again or contact support if the issue persists.

Best regards,
The Bravoro Team
```

### Password Reset Email (service@mail.bravoro.com)

```text
Subject: Reset Your Bravoro Password

You requested to reset your password. Click the link below:

[Reset Password Button -> https://app.bravoro.com/reset-password?token=xxx]

This link expires in 1 hour.

If you didn't request this, please ignore this email.

Best regards,
The Bravoro Team
```

## Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| Create | `supabase/functions/send-email/index.ts` | Unified email switchboard function |
| Create | `src/pages/ResetPassword.tsx` | New password reset page |
| Create | `src/components/ForgotPasswordDialog.tsx` | Forgot password dialog component |
| Modify | `src/pages/Auth.tsx` | Add forgot password link and dialog |
| Modify | `src/App.tsx` | Add /reset-password route |
| Modify | `supabase/functions/admin-create-user/index.ts` | Use send-email instead of n8n webhook |
| Modify | `supabase/functions/save-search-results/index.ts` | Add success/error email notifications |
| Delete | `supabase/functions/send-welcome-email/` | Remove old function (replaced) |

## Technical Details

### Token Generation

```typescript
// Generate secure token
const token = crypto.randomUUID() + '-' + crypto.randomUUID();

// Hash before storing (for security)
const tokenHash = await crypto.subtle.digest(
  'SHA-256',
  new TextEncoder().encode(token)
);
```

### send-email Function Interface

```typescript
interface SendEmailRequest {
  type: 'welcome' | 'success' | 'error' | 'password-reset';
  
  // For welcome emails
  email?: string;
  fullName?: string;
  tempPassword?: string;
  
  // For success/error emails
  userEmail?: string;
  searchType?: string;
  errorMessage?: string;
  
  // For password reset
  resetToken?: string;
}
```

### Security Considerations

- Password reset tokens expire after 1 hour
- Tokens are hashed before storage
- Each token can only be used once
- Rate limiting recommended for password reset requests (can add later)

## Summary

This implementation creates a clean, centralized email system that:
- Uses your verified Resend domain (mail.bravoro.com)
- Separates welcome emails (welcome@) from service emails (service@)
- Provides a complete forgot password flow
- Sends automated notifications for search results
- Replaces n8n dependency for email sending
- Maintains consistent Bravoro branding throughout

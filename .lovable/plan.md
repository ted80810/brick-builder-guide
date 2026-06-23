## Forgot Password Flow

Adds standard email-based password reset to the existing auth page. Works for any account (including the admin test account).

### 1. Update `src/pages/Auth.tsx`
- Add a third mode alongside Sign In / Sign Up: **Forgot password**.
- Add a "Forgot password?" link under the password field on the Sign In view.
- Forgot view: single email input + "Send reset link" button. On submit:
  ```ts
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  ```
- Show a toast: "Check your email for a reset link." Then return to Sign In view.

### 2. New page `src/pages/ResetPassword.tsx`
- Public route. Detects the Supabase recovery session (Supabase auto-consumes the `#access_token&type=recovery` hash via the existing `onAuthStateChange` listener).
- Shows a "Set new password" form (new password + confirm). On submit:
  ```ts
  await supabase.auth.updateUser({ password });
  ```
- On success: toast + redirect to `/`.
- If no recovery session is detected, show a "Link expired or invalid — request a new one" state with a link back to `/auth`.

### 3. Wire route in `src/App.tsx`
- Add `<Route path="/reset-password" element={<ResetPassword />} />` outside any auth guard.

### Email delivery
Uses Lovable's default auth emails out of the box — no domain or template setup required. Branded templates can be added later via Cloud → Emails if desired.

### Out of scope
- No changes to the user_roles / admin logic — this is a standard reset usable by every account.
- No custom-branded email templates in this pass.

// The sign-in extras' small rules and words, copied from the website (dash.html LoginForm) so the
// forgot-password and sign-up screens check exactly what the website checks before calling DASH.
// The server checks again (server.js /api/auth/signup, /forgot-password/reset): these only save a call.

/** dash.html fpLookup / checkEmail: `email.includes('@')` is the website's whole test. */
export const isValidEmail = (email: string) => email.includes('@') && email.trim().length > 2;

/** dash.html fpReset / doSignup: at least 4 characters (server.js:2622, :2723). */
export const MIN_PASSWORD = 4;
export const PASSWORDS_DIFFER = 'Passwords do not match.';

export const SOMETHING_WENT_WRONG = 'Something went wrong. Please try again.';
/** dash.html doSignup: the fallback when the server gives no reason. */
export const SIGNUP_FAILED = 'Sign-up failed. Please try again or contact your admin.';

/** The last 4 digits of the server's masked number ("•••••1234" → "1234"), or ''. */
export const lastFour = (masked: unknown) => {
  const d = typeof masked === 'string' ? masked.replace(/\D/g, '') : '';
  return d.length >= 4 ? d.slice(-4) : '';
};

/** "1234" → "+91 ••••• •1234" (no-break spaces, so it never splits), or null without digits. */
export const maskedNumber = (last4: string) => (last4 ? `+91 ••••• •${last4}` : null);

/** "9876543210" → "+91 98765 43210" (what the code screen shows; it masks the middle itself). */
export const prettyPhone = (digits: string) => `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;

/** Initials for the identity card, as the website draws them (first letter of each word, at most 2). */
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

// Nepali mobile numbers: 10 digits starting with 9 (matches the pattern already used on the contact form).
export const PHONE_PATTERN = '^9\\d{9}$'
export const PHONE_TITLE =
  'Enter a valid 10-digit mobile number starting with 9'

// Letters, spaces, apostrophes, and hyphens only. The hyphen is escaped —
// left unescaped inside this character class, some browsers silently treat
// the whole pattern attribute as a no-op instead of enforcing it.
export const NAME_PATTERN = "^[A-Za-z][A-Za-z '.\\-]{1,49}$"
export const NAME_TITLE = 'Enter a valid name using letters only'

// Stricter than the browser's own type="email" check, which happily accepts
// "sita@gmail" with no domain ending. Requires a dot-separated domain ending
// in 2+ letters. Hyphens are escaped for the same reason as NAME_PATTERN.
export const EMAIL_PATTERN =
  '^[A-Za-z0-9._%+\\-]+@[A-Za-z0-9\\-]+(\\.[A-Za-z0-9\\-]+)*\\.[A-Za-z]{2,}$'
export const EMAIL_TITLE = 'Enter a valid email address, e.g. sita@gmail.com'

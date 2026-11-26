# Backend changes needed: Sign in with Apple (iOS app)

For Manoj. The iOS app (bundle id `com.runconquest.app`) is ready on the
frontend; these backend changes are needed before Apple login and App Store
review will work. Audited against `origin/feature/territory-game`
(`AuthController`, `AppleIdTokenVerifierService`, `AuthServiceImpl`,
`UserController`, `application.properties`).

## Summary

| #   | Priority                | Change                                                            | Why                                                           |
| --- | ----------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | **Blocker**             | Allow the iOS bundle id in `apple.oauth.client.ids`               | Every iOS Apple login currently fails (audience mismatch)     |
| 2   | **Blocker (App Store)** | Self-service account deletion for the logged-in user              | Apple guideline 5.1.1(v)                                      |
| 3   | High                    | Verify the nonce                                                  | The app sends one; it is ignored today (no replay protection) |
| 4   | High                    | Accept `authorizationCode` and revoke the Apple token on deletion | Apple requires revocation when an account is deleted          |
| 5   | Low                     | Optional `email` field on the request                             | Apple sends it only on first authorization                    |
| 6   | Low                     | Distinct error for unverified email                               | Better message than the generic one                           |

---

## 1. Allow the iOS bundle id (blocker)

`application.properties`:

```properties
# now
apple.oauth.client.ids={"com.runconquest.game"}
```

The native iOS sheet issues identity tokens whose `aud` is the **app bundle
id**, `com.runconquest.app`. The verifier (`AbstractIdTokenVerifierService`)
rejects anything not in this list with `AUDIENCE_MISMATCH`.

```properties
# change to (keep .game if the Android/web flow ever uses it)
apple.oauth.client.ids={"com.runconquest.app","com.runconquest.game"}
```

Also enable "Sign in with Apple" on the `com.runconquest.app` App ID in the
Apple Developer portal. Apply the same change to the test deployment
(`fahhkit-test`) config.

## 2. Self-service account deletion (blocker for App Store)

Today the only delete is `POST /v1/user/delete` with `{ "userId": "..." }`.
It is an admin/moderator action and **refuses to delete the caller**
(`AuthErrorCode.SELF_DELETE_ERROR`, "Cannot delete oneself!"). It also only
sets the status to `INACTIVE`.

Needed: an authenticated endpoint that deletes **the logged-in user's own
account**, e.g.

```
DELETE /v1/user/me          (or POST /v1/user/delete-account)
Authorization: Bearer <token>
Body (optional, Apple users): { "authorizationCode": "<code from the sign-in sheet>" }
```

- Uses `AppContext.getUserId()`; no `userId` in the body.
- Must be allowed for athletes (not admin-only).
- Deactivate/anonymise the account and personal data per the privacy policy
  (we promise "delete or anonymise your data, except records we must keep by
  law"), invalidate tokens/device tokens, and return success.
- Block deletion of ADMIN accounts as today.

Until this exists the app's Settings -> Delete account only opens a prefilled
email to `runconquest.game@gmail.com`. Once the endpoint exists, tell the
frontend and it will call it directly (with a confirm dialog).

## 3. Verify the nonce (replay protection)

The app generates a random raw nonce, sends **SHA-256(nonce)** to Apple (it
ends up as the `nonce` claim in the identity token) and sends the **raw
nonce** to us. Today `AppleAuthRequest` has no `nonce` field and the verifier
never checks the claim.

```java
// AppleAuthRequest
private String nonce;   // raw nonce

// after signature/exp/iss/aud checks, in the Apple path:
String claim = claims.getStringClaim("nonce");
if (nonce == null || claim == null
        || !claim.equalsIgnoreCase(sha256Hex(nonce))) {
    throw oauthException(OAuthErrorCode.NONCE_MISMATCH);
}
```

Compare in constant time. Add `NONCE_MISMATCH` to `OAuthErrorCode`. During
rollout accept a missing nonce from old app builds (log it), then make it
mandatory.

## 4. `authorizationCode` and token revocation

The app also sends `authorizationCode` (single-use, short-lived). `AppleAuthRequest`
has no such field, so it is dropped. Add:

```java
private String authorizationCode;   // optional
```

- On first link/sign-up, exchange it at `https://appleid.apple.com/auth/token`
  (client secret = ES256 JWT signed with the Sign in with Apple key) and store
  the refresh token against the user.
- On account deletion (item 2), call
  `https://appleid.apple.com/auth/revoke` with that token. Apple requires this
  for apps that offer Sign in with Apple.
- For deletion by an Apple user the app can send a fresh `authorizationCode`
  in the delete request if a stored token is not available.

Needs a Sign in with Apple key (Key ID, Team ID, `.p8`) in backend config.

## 5. Optional `email` on the request

The app sends `email` when Apple provides it (first authorization only). It
is ignored because the backend reads the email from the identity token, which
normally already contains it (possibly a private-relay address). Just make
sure unknown fields are tolerated (Jackson `FAIL_ON_UNKNOWN_PROPERTIES` off)
or add `private String email;`.

Note `AbstractIdTokenVerifierService` throws `MALFORMED_TOKEN` when the token
has no `email` claim. Apple normally includes it on every login; please
confirm with a test account that has "Hide My Email" on and a second login.

## 6. Clearer error when the email is not verified

Linking Apple to an existing email account with an unverified email throws
`EMAIL_NOT_VERIFIED`, but the app can only show its generic error. Return a
stable `errorCode` (already present) and the frontend can map it to a clear
message. No payload change needed.

---

## Current request/response (for reference)

```
POST /v1/auth/apple          (no auth required, already whitelisted)
{
  "identityToken": "<JWT from Apple>",     // required
  "fullName": "Ada Lovelace",              // optional, first login only
  // proposed additions:
  "nonce": "<raw nonce>",
  "authorizationCode": "<code>",
  "email": "a@b.c"
}
-> 200 { "status": 200, "data": AuthResponse }   // same as /v1/auth/google
```

## Test checklist

- iOS build (bundle `com.runconquest.app`) signs in successfully.
- Second login (no name/email in the sheet) works and does not overwrite the
  stored name.
- "Hide My Email" account works.
- Wrong nonce is rejected; replayed token is rejected.
- Delete account (own) works for an Apple user and revokes the Apple token;
  signing in again creates a fresh account.

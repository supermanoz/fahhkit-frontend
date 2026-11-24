# Fahhcoin / Khalti payment: items for Manoj

Context: on iOS, the app opens the Fahhkit site for "Buy Fahhcoin". After that, tapping to pay doesn't take the user to the Khalti app. Our frontend code never opens the Khalti app (no `khalti://` or deep link). The Khalti checkout page decides that. Frontend fixes are done on our side. These are the items that need you.

## 1. Confirm the deployed backend branch

`CoinPurchaseController` and `CoinPurchaseServiceImpl` exist only on `origin/feature/territory-game`. They are not on `main` or `fix/prod-payment-urls`. Please confirm the production backend is built from the branch that has them, otherwise `/v1/coin-purchase/*` won't exist in prod.

## 2. Add `GET /v1/coin-purchase/{id}`

`CoinPurchaseService.getPurchaseById` exists but has no endpoint. The frontend `/payment-status` page only reads `?purchaseId=&status=` from the URL. Anyone can type `?purchaseId=x&status=PAID` and see a fake "Fahhcoin added" screen. It's cosmetic (no coins are credited and the balance shown is real), but a GET endpoint would let the page confirm the real status. It should return the same `CoinPurchaseResponse` and only for the logged-in owner.

## 3. Send distinct Expired and Refunded statuses

`KhaltiStatusMapper` maps everything except Completed / Pending / Initiated / User canceled to `FAILED`. That includes Expired and Refunded. The frontend now has separate screens for `EXPIRED` and `REFUNDED`, but they only show if the backend sends those values in the callback redirect (`status=`). That needs new `PaymentStatusConstant` values (and a DB column or enum change if one is used).

## 4. Pending payments

Khalti's docs say for Pending: hold, don't provide service, and contact the Khalti team. Please check there is a way to re-check a Pending purchase later (re-run lookup by `pidx`), since the buyer sees "payment pending" and can't retry it from the page.

## 5. Questions for Khalti

- Does the web checkout (`payment_url`, `pay.khalti.com`) hand off to the Khalti mobile app on iOS or Android, or is it web login (Khalti ID + PIN/OTP) only? Their e-payment docs say nothing about mobile or deep links.
- Is there a supported way to open the Khalti app from the web checkout, or an app-return flow for merchants?
- Their docs say `return_url` "should support GET" and give no https requirement. Confirm our https backend callback URL is fine in production.
- Their callback samples use `txnId` in one place and `transaction_id` in another. Confirm which is real (we don't depend on it, since the backend verifies with lookup).

## 6. Config checks (prod)

These look correct in the repo. Please double-check them on the server:

- `khalti.base.url=https://khalti.com/api/v2` (live, not `dev.khalti.com`)
- `khalti.secret.key` is the live key (starts with `live_secret_`)
- `fks.backend.base.url=https://cafebizarre.com.np/fahhkit`
- `fks.frontend.base.url=https://fahhkit.netlify.app`
- `fks.payment.redirect.url=https://fahhkit.netlify.app/payment-status`

## 7. Heads-up: App Store risk

Selling Fahhcoin (a virtual currency) through an external web page from the iOS app can be rejected under App Store guideline 3.1.1. It is fine for TestFlight, but before public release we need either Apple In-App Purchase or to remove the iOS link. Backend impact: if we go IAP, we'd need an endpoint to verify Apple receipts and credit Fahhcoin.

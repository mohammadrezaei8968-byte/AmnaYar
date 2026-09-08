# Zero initial credits fix

Newly registered users always start with **0 credits** in the backend, regardless of any stale Render environment override.

Existing users are NOT modified, so previously purchased credits are preserved.

After deploying the backend, create a brand-new test account. It must show 0 credits.

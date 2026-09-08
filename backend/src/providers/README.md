# Payment providers

## Saman / SEP

`providers/saman.js` implements the current REST/JSON token + verify flow used by SEP integrations. The production values are configurable through environment variables and no merchant credential is stored in the Android app.

Required production values:
- `SAMAN_TERMINAL_ID`
- `PUBLIC_API_URL` (HTTPS)
- `SAMAN_CALLBACK_URL` (HTTPS and registered with the provider)

Default operational endpoints are configurable with `SAMAN_TOKEN_URL`, `SAMAN_PAYMENT_URL`, and `SAMAN_VERIFY_URL`.

The callback uses `ResNum` to find the local order and `RefNum` to verify. The server compares the verified amount against the order amount and credits the package only inside an idempotent database transaction.

SEP does not provide a real public sandbox in the current public integration references; production testing therefore requires a real merchant terminal and the server IP registered with SEP. Confirm the exact endpoint/version with the technical document supplied by SEP when the merchant account is issued.

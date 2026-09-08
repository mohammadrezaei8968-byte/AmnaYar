# Backend — Amna Yar v5.9.0

Node.js/Express + SQLite backend.

## Run

```bash
npm install
cp .env.example .env
npm start
```

## Production requirements

- Set a random `JWT_SECRET` (32+ chars).
- Set `ADMIN_PASSWORD_HASH`; do not keep a plaintext admin password in source/env.
- Restrict `CORS_ORIGINS` to the real admin origin(s).
- Put the API behind HTTPS/reverse proxy.
- Configure real payment provider credentials and webhook secrets before accepting money.
- Do not enable a payment webhook until its provider signature scheme has been implemented/tested against the provider's official documentation.
- Configure Google Play Integrity server-side before enforcing Google Play verdicts.
- Replace sample BIN/bank tables with verified production data.
- For owner/name matching and bank conversions, connect an authorized banking/API provider; algorithmic validation is not identity verification.

## Payment architecture

`POST /api/purchases/create` creates an internal order. Provider callbacks land at:

`POST /api/payments/webhook/:provider`

The callback is idempotent through `payment_events`, and credits are added exactly once for a paid order.

Bazaar/Myket integration is intentionally adapter-based: their current merchant SDK/API credentials and exact verification flow must be configured from the merchant's official account documentation rather than being guessed.

## حساب مدیر آماده پروژه
نام کاربری مدیر در تنظیمات نمونه پروژه روی `amna` قرار گرفته است. رمز ورود به‌صورت plaintext در کد ذخیره نشده و فقط هش bcrypt آن در فایل تنظیمات نمونه قرار دارد.

برای محیط واقعی، مقدار `JWT_SECRET` را با یک مقدار تصادفی قوی جایگزین کنید و فایل env را خارج از کنترل نسخه نگه دارید.

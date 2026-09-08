# استقرار رایگان امنا یار — نسخه 5.10.0

این بسته برای تست آنلاین نسخه فعلی «امنا یار» روی Render آماده شده است.

## سرویس‌ها
- `amnayar-web` → سایت اصلی، Static Site رایگان
- `amnayar-api` → API Node.js رایگان
- `amnayar-admin` → پنل مدیریت روی URL رایگان Render

## دامنه‌ها
- سایت: `https://amnayar.ir`
- API: `https://api.amnayar.ir`
- پنل: ابتدا `https://amnayar-admin.onrender.com`

## نکته مهم درباره رایگان بودن
این محیط برای تست و راه‌اندازی اولیه است، نه محیط تجاری نهایی. سرویس رایگان Render بعد از 15 دقیقه بدون درخواست Sleep می‌شود و حدود یک دقیقه برای بیدار شدن زمان می‌برد. فایل محلی نیز پایدار نیست؛ بنابراین SQLite این نسخه ممکن است با restart/sleep/redeploy از بین برود.

در این محیط پرداخت سامان عمداً فعال نشده و API بانکی واقعی نیز متصل نیست.

## مراحل
1. این پروژه را در یک GitHub repository قرار دهید.
2. در Render گزینه New → Blueprint را بزنید.
3. repository را انتخاب کنید و `render.yaml` را Deploy کنید.
4. در زمان درخواست Secretها:
   - `JWT_SECRET`: یک مقدار تصادفی حداقل 32 کاراکتری
   - `ADMIN_PASSWORD_HASH`: هش bcrypt موجود در فایل `backend/.env.production.example`
5. بعد از Deploy، در DNS وب‌رمز این رکوردها را بسازید:
   - `@` → A → `216.24.57.1`
   - `www` → CNAME → hostname سایت Render
   - `api` → CNAME → hostname سرویس API Render
6. در Render برای دامنه‌ها Verify را بزنید.

Render برای custom domain گواهی TLS را خودکار صادر و تمدید می‌کند.

## وضعیت داده
`INITIAL_CREDITS=100` فقط برای تست اولیه تنظیم شده است. برای محیط واقعی باید صفر شود و دیتابیس پایدار استفاده شود.

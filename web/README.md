# AmnaYar Web v1.3.0

سایت عمومی امنا یار با طراحی RTL، احراز هویت، خدمات استعلام، خرید اعتبار و اتصال به API.

## آدرس‌ها
- https://amnayar.ir
- https://www.amnayar.ir
- API: https://api.amnayar.ir/api
- Admin: https://admin.amnayar.ir

## انتشار
فایل `nginx-amnayar.conf` برای سایت عمومی و فایل `../deploy/nginx-amnayar-all.conf` برای کل دامنه‌ها آماده شده‌اند.

قبل از فعال‌سازی HTTPS، DNS دامنه و زیردامنه‌ها باید به IP سرور اشاره کنند و پورت 80/443 در دسترس باشد. سپس Certbot را اجرا کنید.

## نکات تولید
- `AMNA_API` را در صورت نیاز با مقدار واقعی API جایگزین کنید.
- اطلاعات پذیرنده و کلیدهای پرداخت فقط روی سرور قرار بگیرند.
- CORS و rate limit سمت API فعال باشند.
- سرویس‌های مالکیت حساب فقط با provider رسمی و مجاز فعال شوند.

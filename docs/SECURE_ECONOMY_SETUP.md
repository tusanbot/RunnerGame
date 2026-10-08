# Secure Runner Economy

این بخش برای جلوگیری از افزایش مستقیم Coins و XP از داخل مرورگر طراحی شده است.

## SQL
فایل supabase/migrations/20261008130000_runner_economy.sql را در SQL Editor پروژه RunnerGame اجرا کنید.

این migration دو جدول می‌سازد:
- runner_run_sessions
- runner_reward_events

همچنین RLS را فعال می‌کند و دسترسی مستقیم کاربر به ستون‌های اقتصادی coins، xp و best_distance را می‌بندد.

## Edge Functions
دو تابع زیر باید روی Supabase پروژه RunnerGame deploy شوند:
- start-run
- finish-run

این توابع JWT کاربر را بررسی می‌کنند و برای ثبت موجودی از کلید server-side استفاده می‌کنند.

هرگز SUPABASE_SERVICE_ROLE_KEY را در Vite env یا کد مرورگر قرار ندهید.

## مدل پاداش
سرور session بازی را ایجاد می‌کند، سپس هنگام پایان بازی زمان واقعی session را بررسی می‌کند. نتیجه شامل کنترل مسافت، سقف سکه هر بازی، سقف تعداد ثبت در ساعت و جلوگیری از ثبت دوباره همان run است.

این یک لایه پایه ضدتقلب است و بعداً می‌توان telemetry و اعتبارسنجی حرکت را دقیق‌تر کرد.

## تنظیمات لازم
Frontend:
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY

Supabase Functions:
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

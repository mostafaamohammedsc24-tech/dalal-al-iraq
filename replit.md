# شبكة دلال العراق

منصة إعلانات عقارية وسيارات عراقية كاملة — بيع وشراء العقارات والسيارات مع نظام مصادقة وحجرة رسائل ولوحة إدارة.

## Run & Operate

- Workflow `API Server` — `PORT=8080 pnpm --filter @workspace/api-server run dev`
- Workflow `Frontend` — `PORT=5000 pnpm --filter @workspace/dalal-app run dev` (webview, port 5000)
- `pnpm run typecheck` — فحص TypeScript كامل
- `pnpm run build` — بناء كامل
- `pnpm --filter @workspace/db run push` — تطبيق تغييرات schema قاعدة البيانات
- `pnpm --filter @workspace/scripts run seed:admin` — إنشاء/تحديث حساب الأدمن (07740080310) بصلاحية admin (سكربت آمن للتكرار)
- Required env: `DATABASE_URL` (متوفر عبر قاعدة بيانات Replit), `SESSION_SECRET` (متوفر)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- **Frontend**: React 19 + Vite + wouter (routing) + @tanstack/react-query + Tailwind CSS v4
- **API**: Express 5 (api-server, port 8080)
- **DB**: PostgreSQL + Drizzle ORM (lib/db)
- **Auth**: JWT via jose + bcryptjs (stored in localStorage)
- Build: esbuild (CJS bundle) for API, Vite for frontend

## شبكة المكاتب العقارية والمحامين (مكتملة)

شبكتا "المكاتب العقارية" و"المحامين" مبنيتان بالكامل: قاعدة بيانات + أدوار + API + واجهات أمامية كاملة.

- **الأدوار**: `role` في الـ JWT يقبل `user | admin | office | lawyer`. حسابات المكاتب/المحامين تُنشأ من الأدمن فقط وتُعرَّف بمعرف تسلسلي (`OF-001`, `LW-001`, ...) بدل الهاتف، مع كلمة مرور عشوائية تُولَّد تلقائياً وتُجبر على التغيير أول دخول (`mustChangePassword`).
- **توليد المعرفات**: `nextSequentialId(prefix)` في `lib/db/src/index.ts` (مدعوم بجدول `id_counters`) يولّد `OF-XXX` / `LW-XXX` بأمان عند التزامن.
- **مسارات API**: `office/auth`, `lawyer/auth`, `network-properties` (عقارات الشبكة + وساطة + إحالات)، `deals` (صفقات وعمولات)، `finance` (سجل مالي + طلبات سحب)، `workshops`، `network-notifications`، `inspections` (طلبات فحص + تقارير)، `contracts` (طلبات صياغة عقد + محرر + خدمات المحامي)، وامتدادات في `admin` (نظرة عامة على الشبكة، طلبات السحب، تعليق/تفعيل الحسابات، إعادة تعيين كلمة المرور).
- **جداول قاعدة البيانات** (`lib/db/src/schema/`): `lawyers`, `lawyer-reviews`, `id-counters`, `workshops`, `network-properties` (+ `mediation_requests` + `referrals`), `deals`, `inspections` (`inspection_requests` + `inspection_reports`), `contracts` (`contract_requests` + `contracts` + `lawyer_services`), `finance` (`payments_ledger` + `payout_requests`), `network-notifications`.
- **صفحات الواجهة**: `office-login`, `lawyer-login`, `change-password`, `office-dashboard` (`/office`)، `office-network` (`/office/network` — تصفح/وساطة/إحالة/محامون/ورش/طلب عقد)، `office-deals`، `office-wallet`، `lawyer-dashboard` (`/lawyer`)، `lawyer-inspections`، `lawyer-contracts`، `lawyer-wallet`، `network-notifications` (`/network-notifications-page`)، `inspection-report/:id` (عرض تقرير الفحص، قابل للطباعة). وامتدت لوحة الأدمن بتبويبات "المحامون" و"طلبات السحب" وأزرار تعليق/تفعيل وإعادة تعيين كلمة المرور للمكاتب.
- **قرارات تبسيط مقصودة**:
  - العمولة: `TOTAL_COMMISSION_RATE = 0.02` من قيمة الصفقة، تُقسم `NETWORK_SHARE = 0.3` للشبكة (المُحيل/الوسيط) و 70% يبقى للمكتب المُنفِّذ، تُحسب فقط عند تحويل حالة الصفقة إلى `completed`.
  - مكافأة الإحالة: قيمة ثابتة (افتراضي 100) وليست نسبة من الصفقة.
  - "تقرير الفحص القانوني" هو نموذج داخلي (HTML قابل للطباعة على `/inspection-report/:id`) وليس ملف PDF حقيقي — `pdfUrl` المخزّن هو رابط داخلي بمعرف الطلب.
  - طلب السحب: عند موافقة الأدمن بحالة `paid`، تُعلَّم **كل** مستحقات ذلك الحساب المعلّقة كمدفوعة دفعة واحدة (لا صرف جزئي).

## Where things live

- `dalal-app/` — React + Vite SPA (Arabic RTL, orange theme)
  - `src/pages/` — صفحات: home, listings, listing-detail, login, register, add-listing, profile, chat, admin, privacy، وصفحات شبكة المكاتب/المحامين (انظر القسم أعلاه)
  - `src/components/` — navigation.tsx, listing-card.tsx + shadcn UI components
  - `src/lib/api.ts` — fetch wrapper with JWT Bearer auth
  - `src/lib/utils.ts` — formatPrice, timeAgo, CITIES, CAR_BRANDS, REAL_ESTATE_TYPES
  - `prisma/schema.prisma` — leftover from a previous iteration; not used (the app uses Drizzle via `lib/db`)
- `api-server/src/routes/` — auth, listings, chats, admin routes
- `api-server/src/lib/auth.ts` — JWT sign/verify + authMiddleware
- `lib/db/src/schema/` — users, listings, chats, messages tables

## Architecture decisions

- **React + Vite SPA** instead of Next.js (Next.js 15.1.6 is blocked by Replit package firewall)
- **JWT in localStorage** for auth (SPA pattern, no server-side sessions)
- **Vite proxy** `/api` → `http://localhost:8080` for development
- **Port 5000** for the Frontend workflow (webview requires port 5000); API server runs on port 8080
- **No PostCSS config file** — Tailwind v4 uses `@tailwindcss/vite` plugin directly (no postcss.config.mjs needed)

## Product

- الصفحة الرئيسية مع بحث وإعلانات مميزة
- تصفح إعلانات بفلاتر (فئة، مدينة، نوع، سعر)
- إضافة إعلان بـ 3 خطوات (الفئة → التفاصيل → الموقع والصور)
- تفاصيل الإعلان مع اتصال، واتساب، ورسائل
- نظام رسائل بين المشترين والبائعين
- لوحة أدمن لإدارة الإعلانات والمستخدمين

## User preferences

- اللغة: عربية كاملة، اتجاه RTL
- الألوان: برتقالي (#f97316) كلون رئيسي
- الخط: Cairo (Google Fonts)
- بيانات الأدمن: هاتف 07740080310، كلمة المرور sofydono3?

## Gotchas

- **لا تستخدم Next.js** — محظور في Replit package firewall (403 على next-15.1.6.tgz)
- **Port 23352 غير مدعوم** من نظام workflows — استخدم المنافذ المدعومة فقط: 3000, 3001, 3002, 3003, 4200, 5000, 5173, 6000, 6800, 8000, 8008, 8080, 8099, 9000
- **احذف postcss.config.mjs** إذا وجد — يتعارض مع Tailwind v4 ويسبب خطأ 'autoprefixer not found'
- **pnpm-workspace.yaml وroot package.json يشيران إلى `dalal-app`/`api-server` مباشرة** (وليس `artifacts/*`) — هذا هيكل المشروع الفعلي بعد الاستيراد من GitHub

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

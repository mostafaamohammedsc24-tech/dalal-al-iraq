#!/usr/bin/env bash
#
# dalal-upgrade.sh — one-shot local upgrade & setup for شبكة دلال العراق.
#
# It applies every upgrade shipped in this repo to a local checkout:
#   - installs dependencies (pnpm)
#   - ensures a .env file exists
#   - starts local PostgreSQL (if PGDATA is configured)
#   - applies the Drizzle schema (areas, AI history, office attribution, rich chat)
#   - seeds the Iraqi area classifications (idempotent)
#   - optionally installs Ollama and pulls the local Qwen2.5 model
#   - builds the frontend and backend
#
# Safe to re-run. It never prints or commits secrets.
#
# Usage:
#   ./dalal-upgrade.sh            # full upgrade (installs Ollama if missing)
#   SKIP_OLLAMA=1 ./dalal-upgrade.sh   # skip all AI/Ollama steps
#   SKIP_BUILD=1  ./dalal-upgrade.sh   # skip the production build
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

OLLAMA_MODEL_DEFAULT="qwen2.5:1.5b-instruct"

log()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m  ✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m  ! \033[0m%s\n' "$*"; }

# ---------------------------------------------------------------------------
# 1) Prerequisites
# ---------------------------------------------------------------------------
log "التحقق من المتطلبات (Node / pnpm)"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js غير مثبّت. ثبّت Node 22+ (https://nodejs.org) ثم أعد التشغيل." >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node $(node -v) قديم. هذا المشروع يتطلّب Node 22 فأحدث." >&2
  exit 1
fi
ok "Node $(node -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  warn "pnpm غير موجود — سأحاول تفعيله عبر corepack"
  corepack enable >/dev/null 2>&1 || true
  corepack prepare pnpm@11.13.1 --activate >/dev/null 2>&1 || true
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm غير متوفّر. ثبّته: npm i -g pnpm@11.13.1" >&2
  exit 1
fi
ok "pnpm $(pnpm -v)"

# ---------------------------------------------------------------------------
# 2) .env
# ---------------------------------------------------------------------------
log "تهيئة ملف البيئة .env"
if [ ! -f .env ]; then
  cp .env.example .env
  warn "أُنشئ .env من .env.example — حدّث DATABASE_URL و SESSION_SECRET قبل التشغيل."
else
  ok ".env موجود"
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

# ---------------------------------------------------------------------------
# 3) Dependencies
# ---------------------------------------------------------------------------
log "تثبيت الاعتماديات (pnpm install)"
pnpm install
ok "تم تثبيت الاعتماديات"

# ---------------------------------------------------------------------------
# 4) Local PostgreSQL (only if PGDATA is configured)
# ---------------------------------------------------------------------------
if [ -n "${PGDATA:-}" ] && command -v pg_ctl >/dev/null 2>&1; then
  log "تشغيل PostgreSQL المحلي"
  PGPORT="${PGPORT:-5433}"
  export PGDATA PGPORT
  PGSOCK="${PGSOCK:-$HOME/.local/share/pgsock}"
  mkdir -p "$PGSOCK"
  if ! pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
    if [ ! -f "$PGDATA/PG_VERSION" ]; then
      log "تهيئة مجلد بيانات PostgreSQL في $PGDATA"
      initdb -D "$PGDATA" >/dev/null
    fi
    pg_ctl -D "$PGDATA" -l "$PGDATA/postgres.log" -w start \
      -o "-p $PGPORT -h 127.0.0.1 -k $PGSOCK" >/dev/null
    ok "PostgreSQL يعمل على المنفذ $PGPORT"
  else
    ok "PostgreSQL يعمل مسبقاً"
  fi
else
  warn "تخطّي إدارة PostgreSQL (PGDATA غير مضبوط أو pg_ctl غير متوفّر) — تأكّد أن DATABASE_URL يشير لقاعدة عاملة."
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL مطلوب في .env قبل تطبيق المخطط." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 5) Schema + seed
# ---------------------------------------------------------------------------
log "تطبيق مخطط قاعدة البيانات (Drizzle push)"
pnpm --filter @workspace/db run push
ok "تم تطبيق المخطط"

log "زراعة تصنيفات المناطق العراقية (idempotent)"
pnpm --filter @workspace/scripts run seed:areas
ok "تمت زراعة المناطق"

# ---------------------------------------------------------------------------
# 6) Ollama + Qwen2.5 (local AI assistant) — best effort
# ---------------------------------------------------------------------------
MODEL="${OLLAMA_MODEL:-$OLLAMA_MODEL_DEFAULT}"
if [ "${SKIP_OLLAMA:-0}" = "1" ]; then
  warn "تخطّي إعداد Ollama (SKIP_OLLAMA=1). المساعد الذكي سيعمل بوضع البحث الاحتياطي فقط."
else
  log "إعداد المساعد الذكي المحلي (Ollama + $MODEL)"
  if ! command -v ollama >/dev/null 2>&1; then
    warn "Ollama غير مثبّت — محاولة التثبيت التلقائي"
    if curl -fsSL https://ollama.com/install.sh 2>/dev/null | sh; then
      ok "تم تثبيت Ollama"
    else
      warn "تعذّر تثبيت Ollama تلقائياً. ثبّته يدوياً من https://ollama.com ثم شغّل: ollama pull $MODEL"
    fi
  fi

  if command -v ollama >/dev/null 2>&1; then
    # Make sure the daemon is up (ignore if already running or managed by systemd).
    if ! curl -fsS "${OLLAMA_URL:-http://127.0.0.1:11434}/api/tags" >/dev/null 2>&1; then
      log "تشغيل خدمة Ollama في الخلفية"
      nohup ollama serve >/tmp/ollama.log 2>&1 &
      for _ in $(seq 1 20); do
        curl -fsS "${OLLAMA_URL:-http://127.0.0.1:11434}/api/tags" >/dev/null 2>&1 && break
        sleep 1
      done
    fi
    log "سحب النموذج $MODEL (قد يستغرق بعض الوقت أول مرة)"
    if ollama pull "$MODEL"; then
      ok "النموذج جاهز: $MODEL"
    else
      warn "تعذّر سحب النموذج. المساعد سيعمل بوضع البحث الاحتياطي حتى يتوفّر النموذج."
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 7) Build
# ---------------------------------------------------------------------------
if [ "${SKIP_BUILD:-0}" = "1" ]; then
  warn "تخطّي البناء (SKIP_BUILD=1)"
else
  log "التحقق من الأنواع (typecheck)"
  pnpm run typecheck
  ok "الأنواع سليمة"

  log "بناء الواجهة الأمامية"
  pnpm --filter @workspace/dalal-app run build
  ok "تم بناء الواجهة"

  log "بناء خادم الـ API"
  pnpm --filter @workspace/api-server run build
  ok "تم بناء الخادم"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo
log "اكتمل التحديث بنجاح 🎉"
cat <<'EOF'

الخطوات التالية:
  • للتشغيل محلياً (خادم واحد يخدم الواجهة والـ API):
        ./run-local.sh
    ثم افتح: http://localhost:8080

  • الميزات المضافة:
      1) خيار الرهن في الإعلانات والبحث
      2) تقدير سعر السوق حسب المتر داخل المنطقة
      3) تصنيفات المناطق العراقية (قابلة للإدارة من لوحة الأدمن › المناطق)
      4) بحث بالوصف والمساحة وعدد الغرف والمنطقة
      5) ليبل مصدر الإعلان (شبكة دلال العراق / مكتب معتمد: الاسم)
      6) رفع الفيديو عبر التخزين المحلي (STORAGE_DRIVER=local)
      7) اختيار الموقع مع زر «موافق» وإدخال إحداثيات يدوي
      8) باركود ثابت لكل مكتب معتمد (لوحة الأدمن / لوحة المكتب)
      9) محادثة أغنى: صور، صوت، وروابط
     10) مساعد ذكي محلي (Ollama + Qwen2.5) يبحث في PostgreSQL فقط
     11) إضافة/حذف المناطق من لوحة الأدمن
     12) كتابة المساحة والمنطقة نصياً مع بقاء البحث الرقمي

  • المساعد الذكي: إن لم يُثبّت Ollama، يعمل المساعد بوضع بحث احتياطي
    (يبحث في قاعدة البيانات ويعرض النتائج بدون صياغة الذكاء الاصطناعي).
EOF

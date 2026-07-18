#!/usr/bin/env bash
# =============================================================================
# dalal.sh — سكربت واحد يُنفّذ كل شيء: الإعداد → قاعدة البيانات → البناء → التشغيل → الإطلاق
# One-file automation for "شبكة دلال العراق" (dalal-al-iraq):
# prerequisites → dependencies → PostgreSQL → schema → admin seed → build → run → publish.
#
# الاستخدام / Usage:
#   ./dalal.sh                 إعداد كامل + بناء + تشغيل الإنتاج (API + الواجهة على منفذ واحد)
#   ./dalal.sh --dev           تشغيل وضع التطوير (API على 8080 + Vite على 5000)
#   ./dalal.sh --publish       نفس الوضع الافتراضي + نشر عبر نفق Cloudflare سريع (رابط مؤقت بدون حساب)
#   ./dalal.sh --tunnel-token=XXXX   نشر عبر نفق Cloudflare مُسمّى باستخدام رمز (token) من لوحة Cloudflare
#                              (أو ضع الرمز في ملف .env.local كـ CLOUDFLARE_TUNNEL_TOKEN=... ثم شغّل ./dalal.sh مباشرة)
#   ./dalal.sh --skip-install  تخطّي تثبيت المتطلبات (Node/pnpm/PostgreSQL/cloudflared)
#   ./dalal.sh --skip-build    تخطّي خطوة البناء (استخدم البناء الموجود)
#   ./dalal.sh --setup-only    تنفيذ الإعداد فقط (تثبيت + قاعدة بيانات + بناء) بدون تشغيل
#   ./dalal.sh --help          عرض هذه المساعدة
#
# متغيّرات يمكن ضبطها عبر .env أو البيئة / Overridable via .env or environment:
#   PORT (افتراضي 8080)، PGPORT (افتراضي 5433)، PGDATA، DATABASE_URL، SESSION_SECRET
# =============================================================================

set -Eeuo pipefail

# ----------------------------------------------------------------------------
# ثوابت ومسارات / Constants & paths
# ----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="$SCRIPT_DIR/.env"

# قيم افتراضية / Defaults (used only if not already in .env or environment)
DEFAULT_PORT=8080
DEFAULT_PGPORT=5433
DEFAULT_DB_USER="dalal_user"
DEFAULT_DB_PASSWORD="dalal_password"
DEFAULT_DB_NAME="dalal_al_iraq"
DEFAULT_PGDATA="$HOME/.local/share/dalal_al_iraq_pgdata"

# أعلام / Flags
MODE="prod"          # prod | dev
DO_INSTALL=1
DO_BUILD=1
DO_PUBLISH=0
SETUP_ONLY=0
TUNNEL_TOKEN=""

# ----------------------------------------------------------------------------
# أدوات الطباعة / Logging helpers
# ----------------------------------------------------------------------------
if [ -t 1 ]; then
  C_RESET="\033[0m"; C_BOLD="\033[1m"; C_BLUE="\033[34m"
  C_GREEN="\033[32m"; C_YELLOW="\033[33m"; C_RED="\033[31m"
else
  C_RESET=""; C_BOLD=""; C_BLUE=""; C_GREEN=""; C_YELLOW=""; C_RED=""
fi

step() { echo -e "\n${C_BOLD}${C_BLUE}==> $*${C_RESET}"; }
info() { echo -e "${C_GREEN}  •${C_RESET} $*"; }
warn() { echo -e "${C_YELLOW}  ! $*${C_RESET}"; }
err()  { echo -e "${C_RED}  ✗ $*${C_RESET}" >&2; }
die()  { err "$*"; exit 1; }

on_error() {
  local exit_code=$?
  err "فشل التنفيذ عند السطر $1 (رمز الخروج $exit_code)."
  err "Execution failed at line $1 (exit code $exit_code)."
  exit "$exit_code"
}
trap 'on_error $LINENO' ERR

# ----------------------------------------------------------------------------
# تحليل المعطيات / Parse arguments
# ----------------------------------------------------------------------------
usage() { awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"; exit 0; }

for arg in "$@"; do
  case "$arg" in
    --dev) MODE="dev" ;;
    --publish|--tunnel) DO_PUBLISH=1 ;;
    --tunnel-token=*) DO_PUBLISH=1; TUNNEL_TOKEN="${arg#*=}" ;;
    --skip-install|--no-install) DO_INSTALL=0 ;;
    --skip-build|--no-build) DO_BUILD=0 ;;
    --setup-only) SETUP_ONLY=1 ;;
    -h|--help) usage ;;
    *) die "معطى غير معروف: $arg (استخدم --help)" ;;
  esac
done

# ----------------------------------------------------------------------------
# مساعدات نظام التشغيل / OS helpers
# ----------------------------------------------------------------------------
OS="$(uname -s)"
have() { command -v "$1" >/dev/null 2>&1; }

SUDO=""
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  if have sudo; then SUDO="sudo"; fi
fi

apt_install() {
  # $@ = package names
  if [ -n "$SUDO" ] || [ "${EUID:-$(id -u)}" -eq 0 ]; then
    $SUDO DEBIAN_FRONTEND=noninteractive apt-get update -y >/dev/null
    $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
  else
    die "الحزم التالية مفقودة ولا تتوفر صلاحية sudo لتثبيتها: $*"
  fi
}

# ----------------------------------------------------------------------------
# 1) المتطلبات الأساسية / Prerequisites
# ----------------------------------------------------------------------------
# pnpm@11 (المحدد في packageManager) يتطلب Node.js 22.13+
NODE_MIN_MAJOR=22
ensure_node() {
  if have node; then
    local major; major="$(node -p 'process.versions.node.split(".")[0]')"
    if [ "$major" -ge "$NODE_MIN_MAJOR" ]; then info "Node.js $(node -v) موجود"; return; fi
    warn "إصدار Node.js قديم ($(node -v))، المطلوب $NODE_MIN_MAJOR+ (لتوافق pnpm)."
  fi
  [ "$DO_INSTALL" -eq 1 ] || die "Node.js $NODE_MIN_MAJOR+ مطلوب. ثبّته يدوياً أو أزل --skip-install."
  step "تثبيت Node.js 22"
  if [ "$OS" = "Linux" ] && have apt-get; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash -
    apt_install nodejs
  elif [ "$OS" = "Darwin" ] && have brew; then
    brew install node@22
  else
    die "تعذّر تثبيت Node.js تلقائياً على هذا النظام. ثبّته يدوياً (22+)."
  fi
  info "تم تثبيت Node.js $(node -v)"
}

# استخرج نسخة pnpm من حقل packageManager في package.json (fallback 11.13.1)
pnpm_wanted_version() {
  local v
  v="$(node -p "(require('./package.json').packageManager||'').split('@')[1]||''" 2>/dev/null)"
  printf '%s' "${v:-11.13.1}"
}

pnpm_ok() { have pnpm && pnpm -v >/dev/null 2>&1; }

ensure_pnpm() {
  if pnpm_ok; then info "pnpm $(pnpm -v) موجود"; return; fi
  step "تجهيز pnpm"
  local want; want="$(pnpm_wanted_version)"
  # حدّث corepack أولاً لتفادي أخطاء التحقق من توقيع المفاتيح في الإصدارات القديمة
  $SUDO npm install -g corepack@latest >/dev/null 2>&1 || npm install -g corepack@latest >/dev/null 2>&1 || true
  if have corepack; then
    $SUDO corepack enable >/dev/null 2>&1 || corepack enable >/dev/null 2>&1 || true
    corepack prepare "pnpm@$want" --activate >/dev/null 2>&1 || true
  fi
  if ! pnpm_ok; then
    warn "corepack غير كافٍ، سيتم تثبيت pnpm@$want عبر npm."
    $SUDO npm install -g "pnpm@$want" >/dev/null 2>&1 || npm install -g "pnpm@$want"
  fi
  pnpm_ok || die "تعذّر تجهيز pnpm."
  info "pnpm $(pnpm -v) جاهز"
}

# اكتشاف مجلد ثنائيات PostgreSQL وإضافته إلى PATH (على أوبنتو غير موجودة افتراضياً)
detect_pg_bin() {
  if have pg_ctl && have initdb && have psql; then return 0; fi
  local d
  for d in /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql*/bin /usr/local/opt/postgresql*/bin; do
    if [ -x "$d/pg_ctl" ]; then
      export PATH="$d:$PATH"
      return 0
    fi
  done
  return 1
}

ensure_postgres() {
  if detect_pg_bin; then info "أدوات PostgreSQL موجودة ($(pg_ctl --version 2>/dev/null | head -1))"; return; fi
  [ "$DO_INSTALL" -eq 1 ] || die "PostgreSQL غير مثبّت. ثبّته يدوياً أو أزل --skip-install."
  step "تثبيت PostgreSQL"
  if [ "$OS" = "Linux" ] && have apt-get; then
    apt_install postgresql postgresql-contrib
  elif [ "$OS" = "Darwin" ] && have brew; then
    brew install postgresql
  else
    die "تعذّر تثبيت PostgreSQL تلقائياً. ثبّته يدوياً."
  fi
  detect_pg_bin || die "تعذّر العثور على أدوات PostgreSQL بعد التثبيت."
  info "تم تثبيت PostgreSQL ($(pg_ctl --version 2>/dev/null | head -1))"
}

ensure_cloudflared() {
  if have cloudflared; then info "cloudflared موجود"; return; fi
  [ "$DO_INSTALL" -eq 1 ] || { warn "cloudflared غير مثبّت وتم تخطّي التثبيت."; return 1; }
  step "تثبيت cloudflared"
  if [ "$OS" = "Linux" ]; then
    local arch pkg; arch="$(uname -m)"
    case "$arch" in
      x86_64|amd64) pkg="amd64" ;;
      aarch64|arm64) pkg="arm64" ;;
      *) pkg="amd64" ;;
    esac
    local url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${pkg}"
    $SUDO curl -fsSL "$url" -o /usr/local/bin/cloudflared
    $SUDO chmod +x /usr/local/bin/cloudflared
  elif [ "$OS" = "Darwin" ] && have brew; then
    brew install cloudflared
  else
    warn "تعذّر تثبيت cloudflared تلقائياً."; return 1
  fi
  have cloudflared && info "تم تثبيت cloudflared" || return 1
}

# ----------------------------------------------------------------------------
# 2) ملف البيئة / Environment file
# ----------------------------------------------------------------------------
ensure_env_file() {
  step "التأكد من ملف البيئة (.env)"
  if [ ! -f "$ENV_FILE" ]; then
    local secret
    secret="$( (openssl rand -hex 32 2>/dev/null) || (head -c32 /dev/urandom | od -An -tx1 | tr -d ' \n') )"
    cat > "$ENV_FILE" <<EOF
PGDATA=$DEFAULT_PGDATA
PGPORT=$DEFAULT_PGPORT
DATABASE_URL=postgresql://$DEFAULT_DB_USER:$DEFAULT_DB_PASSWORD@localhost:$DEFAULT_PGPORT/$DEFAULT_DB_NAME
SESSION_SECRET=$secret
PORT=$DEFAULT_PORT
EOF
    info "تم إنشاء .env جديد بقيم افتراضية آمنة."
  else
    info "ملف .env موجود، سيُستخدم كما هو."
  fi

  # حمّل المتغيّرات إلى البيئة الحالية / load into environment
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  # ملف أسرار محلي اختياري لا يُرفع إلى git (رمز Cloudflare مثلاً)
  if [ -f "$SCRIPT_DIR/.env.local" ]; then
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/.env.local"
    info "تم تحميل .env.local (أسرار محلية)."
  fi
  set +a

  # رمز نفق Cloudflare (اختياري): من --tunnel-token= أو من .env/.env.local
  TUNNEL_TOKEN="${TUNNEL_TOKEN:-${CLOUDFLARE_TUNNEL_TOKEN:-${CF_TUNNEL_TOKEN:-}}}"
  if [ -n "$TUNNEL_TOKEN" ]; then
    DO_PUBLISH=1
    info "تم العثور على رمز نفق Cloudflare — سيُنشر تلقائياً عبر نفق مُسمّى."
  fi

  # عيّن القيم الافتراضية للمتغيّرات الناقصة
  export PORT="${PORT:-$DEFAULT_PORT}"
  export PGPORT="${PGPORT:-$DEFAULT_PGPORT}"
  export PGDATA="${PGDATA:-$DEFAULT_PGDATA}"
  export SESSION_SECRET="${SESSION_SECRET:-$DEFAULT_DB_PASSWORD}"
  if [ -z "${DATABASE_URL:-}" ]; then
    export DATABASE_URL="postgresql://$DEFAULT_DB_USER:$DEFAULT_DB_PASSWORD@localhost:$PGPORT/$DEFAULT_DB_NAME"
  fi

  # استخرج بيانات الاتصال من DATABASE_URL
  DB_USER="$(printf '%s' "$DATABASE_URL" | sed -n 's#.*://\([^:]*\):.*#\1#p')"
  DB_PASSWORD="$(printf '%s' "$DATABASE_URL" | sed -n 's#.*://[^:]*:\([^@]*\)@.*#\1#p')"
  DB_NAME="$(printf '%s' "$DATABASE_URL" | sed -n 's#.*/\([^/?]*\)\(?.*\)\{0,1\}$#\1#p')"
  DB_USER="${DB_USER:-$DEFAULT_DB_USER}"
  DB_PASSWORD="${DB_PASSWORD:-$DEFAULT_DB_PASSWORD}"
  DB_NAME="${DB_NAME:-$DEFAULT_DB_NAME}"
  info "قاعدة البيانات: $DB_NAME | المستخدم: $DB_USER | المنفذ: $PGPORT | منفذ التطبيق: $PORT"
}

# ----------------------------------------------------------------------------
# 3) تثبيت الحزم / Install dependencies
# ----------------------------------------------------------------------------
install_deps() {
  step "تثبيت حزم المشروع (pnpm install)"
  pnpm install
  info "تم تثبيت الحزم."
}

# ----------------------------------------------------------------------------
# 4) قاعدة البيانات المحلية / Local PostgreSQL cluster + role + database
# ----------------------------------------------------------------------------
start_postgres() {
  step "تهيئة وتشغيل PostgreSQL محلياً"
  detect_pg_bin || die "أدوات PostgreSQL غير متاحة."

  if [ ! -d "$PGDATA" ] || [ ! -f "$PGDATA/PG_VERSION" ]; then
    info "تهيئة مجلد بيانات جديد في $PGDATA"
    mkdir -p "$PGDATA"
    initdb -D "$PGDATA" -U postgres >/dev/null
  fi

  if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
    info "خادم PostgreSQL يعمل بالفعل."
  else
    info "تشغيل خادم PostgreSQL على المنفذ $PGPORT"
    pg_ctl -D "$PGDATA" -l "$PGDATA/postgres.log" -w start \
      -o "-p $PGPORT -h 127.0.0.1 -k /tmp" >/dev/null
  fi

  # انتظر الجاهزية
  local tries=0
  until pg_isready -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1; do
    tries=$((tries+1)); [ "$tries" -gt 30 ] && die "تعذّر الاتصال بـ PostgreSQL."
    sleep 1
  done
  info "PostgreSQL جاهز."
}

setup_database() {
  step "إنشاء المستخدم وقاعدة البيانات إن لزم"
  local psql_admin="psql -h 127.0.0.1 -p $PGPORT -U postgres -v ON_ERROR_STOP=1 -tAc"

  # أنشئ الدور/المستخدم إن لم يكن موجوداً
  if [ "$($psql_admin "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'")" != "1" ]; then
    info "إنشاء المستخدم $DB_USER"
    psql -h 127.0.0.1 -p "$PGPORT" -U postgres -v ON_ERROR_STOP=1 \
      -c "CREATE ROLE \"$DB_USER\" WITH LOGIN PASSWORD '$DB_PASSWORD' CREATEDB;" >/dev/null
  else
    info "المستخدم $DB_USER موجود، تحديث كلمة المرور."
    psql -h 127.0.0.1 -p "$PGPORT" -U postgres -v ON_ERROR_STOP=1 \
      -c "ALTER ROLE \"$DB_USER\" WITH LOGIN PASSWORD '$DB_PASSWORD' CREATEDB;" >/dev/null
  fi

  # أنشئ قاعدة البيانات إن لم تكن موجودة
  if [ "$($psql_admin "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")" != "1" ]; then
    info "إنشاء قاعدة البيانات $DB_NAME"
    psql -h 127.0.0.1 -p "$PGPORT" -U postgres -v ON_ERROR_STOP=1 \
      -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";" >/dev/null
  else
    info "قاعدة البيانات $DB_NAME موجودة."
  fi
  info "قاعدة البيانات جاهزة."
}

push_schema() {
  step "تطبيق مخطط قاعدة البيانات (Drizzle push)"
  pnpm --filter @workspace/db run push
  info "تم تطبيق المخطط."
}

seed_admin() {
  step "إنشاء/تحديث حساب الأدمن"
  pnpm --filter @workspace/scripts run seed:admin
  info "حساب الأدمن جاهز (الهاتف: 07740080310)."
}

# ----------------------------------------------------------------------------
# 5) البناء / Build
# ----------------------------------------------------------------------------
build_app() {
  [ "$DO_BUILD" -eq 1 ] || { warn "تم تخطّي البناء (--skip-build)."; return; }
  step "بناء الواجهة الأمامية والخادم الخلفي"
  pnpm --filter @workspace/dalal-app run build
  pnpm --filter @workspace/api-server run build
  info "اكتمل البناء."
}

# ----------------------------------------------------------------------------
# 6) الإطلاق عبر Cloudflare Tunnel / Publish
# ----------------------------------------------------------------------------
TUNNEL_PID=""
start_tunnel() {
  [ "$DO_PUBLISH" -eq 1 ] || return 0
  ensure_cloudflared || { warn "تعذّر تجهيز cloudflared، سيستمر التشغيل محلياً فقط."; return 0; }
  step "إطلاق التطبيق عبر Cloudflare Tunnel"
  if [ -n "$TUNNEL_TOKEN" ]; then
    info "تشغيل نفق مُسمّى باستخدام الرمز (token)."
    cloudflared tunnel --no-autoupdate run --token "$TUNNEL_TOKEN" &
    TUNNEL_PID=$!
  else
    info "تشغيل نفق سريع مؤقت (trycloudflare) — سيظهر الرابط العام أدناه:"
    cloudflared tunnel --no-autoupdate --url "http://localhost:$PORT" &
    TUNNEL_PID=$!
  fi
  info "معرّف عملية النفق: $TUNNEL_PID"
}

# ----------------------------------------------------------------------------
# 7) التشغيل / Run
# ----------------------------------------------------------------------------
cleanup() {
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

run_prod() {
  start_tunnel
  step "تشغيل خادم الإنتاج (الواجهة + الـ API على منفذ واحد)"
  info "افتح: http://localhost:$PORT"
  export NODE_ENV=production
  exec pnpm --filter @workspace/api-server run start
}

run_dev() {
  start_tunnel
  step "تشغيل وضع التطوير (API على $PORT + Vite على 5000)"
  export NODE_ENV=development
  PORT="$PORT" pnpm --filter @workspace/api-server run dev &
  local api_pid=$!
  info "الـ API يعمل (pid $api_pid) على المنفذ $PORT"
  info "الواجهة: http://localhost:5000"
  PORT=5000 exec pnpm --filter @workspace/dalal-app run dev
}

# ----------------------------------------------------------------------------
# المسار الرئيسي / Main
# ----------------------------------------------------------------------------
main() {
  step "شبكة دلال العراق — الإعداد والتشغيل التلقائي"
  echo "الوضع: $MODE | التثبيت: $DO_INSTALL | البناء: $DO_BUILD | النشر: $DO_PUBLISH"

  if [ "$DO_INSTALL" -eq 1 ]; then
    step "التحقق من المتطلبات الأساسية"
    ensure_node
    ensure_pnpm
    ensure_postgres
  else
    warn "تم تخطّي تثبيت المتطلبات (--skip-install)."
    pnpm_ok || die "pnpm غير متاح. أعد التشغيل بدون --skip-install."
    detect_pg_bin || true
  fi

  ensure_env_file
  install_deps
  start_postgres
  setup_database
  push_schema
  seed_admin
  build_app

  if [ "$SETUP_ONLY" -eq 1 ]; then
    step "اكتمل الإعداد (--setup-only). للتشغيل: ./dalal.sh"
    exit 0
  fi

  if [ "$MODE" = "dev" ]; then
    run_dev
  else
    run_prod
  fi
}

main "$@"

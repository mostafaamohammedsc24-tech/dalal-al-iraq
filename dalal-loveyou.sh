#!/usr/bin/env bash
#
# dalal-loveyou.sh — ربط النطاق عبر Cloudflare Tunnel تلقائياً لسيرفر أوراكل
#
# ماذا يفعل:
#   - يثبّت cloudflared (أحدث إصدار رسمي) إن لم يكن موجوداً، لأي معمارية (x86_64/ARM).
#   - يشغّل نفق Cloudflare بالتوكن الخاص بك كخدمة systemd دائمة:
#       * تبدأ تلقائياً بعد كل إقلاع (enable).
#       * تعيد الاتصال تلقائياً (Restart=always) مهما تغيّر الجهاز أو الشبكة أو الـIP.
#   - النفق صادر (outbound) بالكامل، فلا يحتاج IP عاماً ثابتاً ولا فتح منافذ واردة،
#     لذلك يظل النطاق يعمل حتى لو تبدّل الـPublic IP عند الانتقال إلى أوراكل.
#   - يكشف ويعرض الـPublic IP الحالي للسيرفر (للعلم فقط).
#
# آمن لإعادة التشغيل (idempotent): يعيد تثبيت/تشغيل الخدمة عند كل تشغيل.
#
# التشغيل:
#   bash dalal-loveyou.sh
#   (يحتاج صلاحية root؛ سيستخدم sudo تلقائياً عند الحاجة)
#
set -euo pipefail

# ==================== إعدادات المستخدم ====================
# توكن Cloudflare Tunnel الخاص بك (مضمّن بإذنك).
CF_TUNNEL_TOKEN="eyJhIjoiNzc5YzAzOTgzNjkwODM2YTM3OGMzYTdkNzdkNjRkYjEiLCJ0IjoiOGVjZWJjNzEtYjIwNC00ZGFjLTllNTctMDE4NTg3OGJhMWNiIiwicyI6Ik5HVmpNR1UxTkRFdFpXUTFNUzAwTldSaUxXRTNNR1V0WTJNelpUSXhaR1ppWkRBeiJ9"

CF_BIN="/usr/local/bin/cloudflared"
SERVICE_NAME="cloudflared"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
# =========================================================

# --- تحديد أمر الصلاحيات (root أو sudo) ---
if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
elif command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
else
  echo "خطأ: يلزم تشغيل السكربت بصلاحية root (أو توفّر sudo)." >&2
  exit 1
fi

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

# --- أداة التنزيل ---
if command -v curl >/dev/null 2>&1; then
  DL() { curl -fsSL "$1" -o "$2"; }
  FETCH() { curl -fsS --max-time 6 "$1"; }
elif command -v wget >/dev/null 2>&1; then
  DL() { wget -qO "$2" "$1"; }
  FETCH() { wget -qO- --timeout=6 "$1"; }
else
  log "تثبيت curl..."
  if command -v dnf >/dev/null 2>&1; then $SUDO dnf install -y curl;
  elif command -v yum >/dev/null 2>&1; then $SUDO yum install -y curl;
  elif command -v apt-get >/dev/null 2>&1; then $SUDO apt-get update -y && $SUDO apt-get install -y curl;
  else echo "خطأ: لا يوجد curl/wget ولا مدير حزم معروف." >&2; exit 1; fi
  DL() { curl -fsSL "$1" -o "$2"; }
  FETCH() { curl -fsS --max-time 6 "$1"; }
fi

# --- كشف المعمارية واختيار الملف الثنائي المناسب ---
detect_arch() {
  local m; m="$(uname -m)"
  case "$m" in
    x86_64|amd64)   echo "amd64" ;;
    aarch64|arm64)  echo "arm64" ;;
    armv7l|armhf)   echo "arm" ;;
    i386|i686)      echo "386" ;;
    *) echo "unsupported:$m" ;;
  esac
}

install_cloudflared() {
  local arch url
  arch="$(detect_arch)"
  if [[ "$arch" == unsupported:* ]]; then
    echo "خطأ: معمارية غير مدعومة (${arch#unsupported:})." >&2
    exit 1
  fi
  url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}"
  log "تنزيل cloudflared (linux-${arch})..."
  local tmp; tmp="$(mktemp)"
  DL "$url" "$tmp"
  $SUDO install -m 0755 "$tmp" "$CF_BIN"
  rm -f "$tmp"
  log "تم تثبيت: $($CF_BIN --version 2>/dev/null || echo cloudflared)"
}

# --- تثبيت/تحديث cloudflared ---
if [ -x "$CF_BIN" ] || command -v cloudflared >/dev/null 2>&1; then
  CF_BIN="$(command -v cloudflared || echo "$CF_BIN")"
  log "cloudflared موجود مسبقاً: $CF_BIN"
else
  install_cloudflared
fi

# --- كتابة خدمة systemd (تعمل بالتوكن، دائمة، وتعيد الاتصال تلقائياً) ---
log "إعداد خدمة systemd الدائمة..."
$SUDO tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=Cloudflare Tunnel (dalal-loveyou)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${CF_BIN} tunnel --no-autoupdate run --token ${CF_TUNNEL_TOKEN}
Restart=always
RestartSec=5
User=root
# إعادة التشغيل عند أي انقطاع شبكة/تغيّر IP دون حدّ أقصى
StartLimitIntervalSec=0

[Install]
WantedBy=multi-user.target
EOF

# --- تفعيل وتشغيل الخدمة ---
if command -v systemctl >/dev/null 2>&1; then
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
  $SUDO systemctl restart "$SERVICE_NAME"
  sleep 2
  log "حالة الخدمة:"
  $SUDO systemctl --no-pager --full status "$SERVICE_NAME" | head -n 12 || true
else
  echo "تنبيه: systemd غير متوفر. شغّل النفق يدوياً:" >&2
  echo "  ${CF_BIN} tunnel --no-autoupdate run --token <TOKEN>" >&2
fi

# --- عرض الـPublic IP الحالي (للعلم) ---
PUBLIC_IP="$(FETCH https://api.ipify.org 2>/dev/null || FETCH https://ifconfig.me 2>/dev/null || FETCH https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]' || true)"
echo ""
log "الـPublic IP الحالي للسيرفر: ${PUBLIC_IP:-غير معروف}"
echo ""
echo "تم ✅ النطاق مرتبط عبر Cloudflare Tunnel كخدمة دائمة."
echo "  • تبدأ تلقائياً بعد كل إقلاع، وتعيد الاتصال مهما تغيّر الجهاز/الشبكة/الـIP."
echo "  • لا حاجة لفتح منافذ واردة أو IP ثابت (النفق صادر بالكامل)."
echo ""
echo "أوامر مفيدة:"
echo "  ${SUDO} systemctl status ${SERVICE_NAME}     # الحالة"
echo "  ${SUDO} journalctl -u ${SERVICE_NAME} -f     # السجلّات الحيّة"
echo "  ${SUDO} systemctl restart ${SERVICE_NAME}    # إعادة التشغيل"
echo ""
echo "تذكير: في لوحة Cloudflare Zero Trust > Tunnels، اجعل Public Hostname"
echo "لنطاقك يوجّه إلى خدمة التطبيق المحلية (مثال: http://localhost:3000)."

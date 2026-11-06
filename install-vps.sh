#!/bin/bash
set -e

clear
echo "====================================================="
echo "   INSTALASI PANEL SSH & XRAY DINAMIS (NAT VPS)      "
echo "====================================================="
echo "Masukkan jatah Port NAT VPS Anda."
echo "(Contoh: Jika jatah port Anda 21071-21080, ketik 21071)"
echo "-----------------------------------------------------"

# 1. Input Interaktif Port Pertama (UI & V2Ray)
read -p "Masukkan Port Utama (Web UI & V2Ray WS) [default: 21071]: " INPUT_UI_PORT
NAT_UI_PORT="${INPUT_UI_PORT:-21071}"

if ! [[ "$NAT_UI_PORT" =~ ^[0-9]+$ ]]; then
    echo "[!] Input bukan angka valid. Menggunakan default: 21071"
    NAT_UI_PORT=21071
fi

# Hitung saran port berikutnya secara otomatis (+1 dan +2)
DEF_MUX_PORT=$((NAT_UI_PORT + 1))
DEF_UDPGW_PORT=$((NAT_UI_PORT + 2))

# 2. Input Interaktif Port Kedua (SSH Multiplexer)
read -p "Masukkan Port SSH WS & SSL (Mux) [Enter = ${DEF_MUX_PORT}]: " INPUT_MUX_PORT
NAT_MUX_PORT="${INPUT_MUX_PORT:-$DEF_MUX_PORT}"

# 3. Input Interaktif Port Ketiga (BadVPN UDPGW)
read -p "Masukkan Port BadVPN UDPGW [Enter = ${DEF_UDPGW_PORT}]: " INPUT_UDPGW_PORT
NAT_UDPGW_PORT="${INPUT_UDPGW_PORT:-$DEF_UDPGW_PORT}"

# 4. Input Password Admin Sekaligus
read -p "Buat Password Admin Panel [Enter = 'admin123']: " INPUT_ADMIN_PASS
ADMIN_PASS="${INPUT_ADMIN_PASS:-admin123}"

NAT_SSH_INT="2222"

echo "-----------------------------------------------------"
echo "Konfigurasi Port yang akan dipasang:"
echo "  - Web Panel & V2Ray WS : Port ${NAT_UI_PORT}"
echo "  - SSH WS & SSL (Mux)   : Port ${NAT_MUX_PORT}"
echo "  - BadVPN UDPGW         : Port ${NAT_UDPGW_PORT}"
echo "  - Password Admin       : ${ADMIN_PASS}"
echo "-----------------------------------------------------"
sleep 2

# 5. Buat Swap 512MB otomatis jika belum ada (Penting untuk NAT VPS RAM kecil)
if [ $(free -m | awk '/^Swap:/ {print $2}') -eq 0 ]; then
    echo "[*] Membuat Swap Memory 512MB..."
    dd if=/dev/zero of=/swapfile bs=1M count=512 status=none 2>/dev/null || true
    chmod 600 /swapfile 2>/dev/null || true
    mkswap /swapfile 2>/dev/null || true
    swapon /swapfile 2>/dev/null || true
fi

# 6. Install dependensi sistem
echo "[*] Menginstal paket pendukung..."
apt-get update -y
apt-get install -y curl dropbear stunnel4 openssl ca-certificates procps net-tools bash jq psmisc git

# 7. Install Node.js 20 & PM2
if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
    npm install -g pm2
fi

# 8. Unduh Cloudflared sesuai arsitektur
ARCH=$(uname -m)
if [ ! -f /usr/local/bin/cloudflared ]; then
    if [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
        curl -fsSL -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64
    else
        curl -fsSL -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
    fi
    chmod +x /usr/local/bin/cloudflared
fi

# 9. Unduh BadVPN UDPGW
if [ ! -f /usr/local/bin/badvpn-udpgw ]; then
    curl -fsSL -o /usr/local/bin/badvpn-udpgw https://raw.githubusercontent.com/daybreakersx/premscript/master/badvpn-udpgw64
    chmod +x /usr/local/bin/badvpn-udpgw
fi

systemctl stop dropbear stunnel4 2>/dev/null || true
systemctl disable dropbear stunnel4 2>/dev/null || true

# 10. Simpan Konfigurasi Port ke ./data/nat_ports.env & JSON
mkdir -p ./data

cat <<EOF > ./data/nat_ports.env
export UI_PORT="${NAT_UI_PORT}"
export MUX_PORT="${NAT_MUX_PORT}"
export UDPGW_PORT="${NAT_UDPGW_PORT}"
export DROPBEAR_PORT="${NAT_SSH_INT}"
EOF

echo -n "${ADMIN_PASS}" > ./data/admin_pass.txt

cat <<EOF > ./data/system_config.json
{
  "banner": "",
  "enable_bbr": "true",
  "udpgw_port": "${NAT_UDPGW_PORT}",
  "udpgw_max_clients": "1000"
}
EOF

cat <<EOF > ./data/ws_proxy_config.json
{
  "sshPort": ${NAT_SSH_INT},
  "keepAlive": 15000,
  "maxBuffer": 32768
}
EOF

# Tambahkan otomatis opsi port tersebut ke dropdown index.html
if [ -f index.html ]; then
    if ! grep -q "value=\"${NAT_UDPGW_PORT}\"" index.html; then
        sed -i "s/<select id=\"udpgwPortSelect\" class=\"input-ssh\" style=\"font-weight:bold;\">/<select id=\"udpgwPortSelect\" class=\"input-ssh\" style=\"font-weight:bold;\">\n                                        <option value=\"${NAT_UDPGW_PORT}\">Port ${NAT_UDPGW_PORT} (NAT UDPGW)<\/option>/" index.html
    fi
    if ! grep -q "value=\"${NAT_UI_PORT}\"" index.html; then
        sed -i "s/<select id=\"portSelect\" class=\"input-ssh\" style=\"font-family: ui-monospace, monospace; font-weight: bold;\">/<select id=\"portSelect\" class=\"input-ssh\" style=\"font-family: ui-monospace, monospace; font-weight: bold;\">\n                        <option value=\"${NAT_UI_PORT}\">Port ${NAT_UI_PORT} (Direct NAT Non-TLS)<\/option>/" index.html
    fi
fi

# 11. Install NPM & Jalankan via PM2
npm install

chmod +x start.sh
pm2 delete vpn-panel 2>/dev/null || true
pm2 start ./start.sh --name "vpn-panel"
pm2 save
pm2 startup | tail -n 1 | bash 2>/dev/null || true

PUBLIC_IP=$(curl -s4 https://api.ip.sb/ip || hostname -I | awk '{print $1}')

echo "====================================================="
echo " INSTALASI NAT VPS SELESAI!"
echo "-----------------------------------------------------"
echo " Web Panel & V2Ray WS : http://${PUBLIC_IP}:${NAT_UI_PORT}"
echo " SSH WS & SSL (Mux)   : ${PUBLIC_IP}:${NAT_MUX_PORT}"
echo " BadVPN UDPGW Port    : ${NAT_UDPGW_PORT}"
echo " Password Admin       : ${ADMIN_PASS}"
echo "-----------------------------------------------------"
echo " Tips: Jika ingin mengganti port lagi nanti, cukup"
echo " jalankan ulang: bash install-vps.sh"
echo "====================================================="

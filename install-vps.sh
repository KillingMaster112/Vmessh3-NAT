#!/bin/bash
echo "[*] Menginstal dependensi sistem untuk VPS..."
apt-get update && apt-get install -y curl dropbear stunnel4 openssl ca-certificates procps net-tools bash jq psmisc

# Install Node.js 20 & PM2
if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
npm install -g pm2

# Download Cloudflared
curl -fsSL -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x /usr/local/bin/cloudflared

# Download BadVPN UDPGW pre-compiled binary
curl -fsSL -o /usr/local/bin/badvpn-udpgw https://raw.githubusercontent.com/daybreakersx/premscript/master/badvpn-udpgw64
chmod +x /usr/local/bin/badvpn-udpgw

# Matikan service bawaan agar tidak bentrok dengan start.sh
systemctl stop dropbear stunnel4 2>/dev/null
systemctl disable dropbear stunnel4 2>/dev/null

# Install package npm & jalankan dengan PM2
npm install
chmod +x start.sh
pm2 delete vpn-panel 2>/dev/null
pm2 start ./start.sh --name "vpn-panel"
pm2 save
pm2 startup

echo "====================================================="
echo " INSTALASI SELESAI! Panel berjalan di latar belakang."
echo "====================================================="
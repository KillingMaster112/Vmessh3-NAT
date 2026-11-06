#!/bin/bash

# =================================================================
# ⚙️ BACA PORT DINAMIS DARI ./data/nat_ports.env
# =================================================================
mkdir -p ./data
if [ -f "./data/nat_ports.env" ]; then
    source ./data/nat_ports.env
fi

export UI_PORT="${UI_PORT:-21071}"       # Port Publik untuk Web Panel & V2Ray WS
export MUX_PORT="${MUX_PORT:-21072}"     # Port Publik untuk SSH WS & SSH SSL (Stunnel)
export UDPGW_PORT="${UDPGW_PORT:-21073}" # Port Publik untuk BadVPN UDPGW
export DROPBEAR_PORT="${DROPBEAR_PORT:-2222}"
export VPS_PUBLIC_ADDR="${VPS_PUBLIC_ADDR:-}"

# Port Internal (Bekerja di 127.0.0.1)
export WS_PORT="8880"                    # Internal WS-Proxy SSH
export SSL_TARGET_PORT="2443"            # Internal Stunnel4
export ARGO_PORT="8001"                  # Internal Xray Core

ulimit -n 65535 2>/dev/null
ulimit -s unlimited 2>/dev/null

SYS_CFG="./data/system_config.json"
WS_CFG="./data/ws_proxy_config.json"

if [ ! -f "$WS_CFG" ]; then
    echo "{\"sshPort\": $DROPBEAR_PORT, \"keepAlive\": 15000, \"maxBuffer\": 32768}" > "$WS_CFG"
fi

# =================================================================
# 🧹 PEMBERSIHAN PROSES LAMA
# =================================================================
echo "[*] Membersihkan proses panel lama & port yang tersangkut..."
pkill -9 -f "node server.js" 2>/dev/null
pkill -9 -f "node mux.js" 2>/dev/null
pkill -9 -f "node ws-proxy.js" 2>/dev/null
pkill -9 dropbear 2>/dev/null
pkill -9 stunnel4 2>/dev/null
pkill -9 cloudflared 2>/dev/null
pkill -9 badvpn-udpgw 2>/dev/null

fuser -k ${WS_PORT}/tcp 2>/dev/null
fuser -k ${MUX_PORT}/tcp 2>/dev/null
fuser -k ${UI_PORT}/tcp 2>/dev/null
sleep 1

# =================================================================
# 🔍 BACA KONFIGURASI DINAMIS DARI FILE JSON ./data
# =================================================================
if [ -f "$SYS_CFG" ] && command -v jq >/dev/null 2>&1; then
    CUSTOM_BANNER=$(jq -r '.banner // empty' "$SYS_CFG")
    ENABLE_BBR=$(jq -r '.enable_bbr // "true"' "$SYS_CFG")
    CFG_UDPGW_PORT=$(jq -r '.udpgw_port // empty' "$SYS_CFG")
    UDPGW_MAX_CLIENTS=$(jq -r '.udpgw_max_clients // "1000"' "$SYS_CFG")
    if [ -n "$CFG_UDPGW_PORT" ]; then
        export UDPGW_PORT="$CFG_UDPGW_PORT"
    fi
else
    CUSTOM_BANNER=""
    ENABLE_BBR="true"
    UDPGW_MAX_CLIENTS="1000"
fi

if [ -f "$WS_CFG" ] && command -v jq >/dev/null 2>&1; then
    SAVED_SSH_PORT=$(jq -r '.sshPort // empty' "$WS_CFG")
    if [ -n "$SAVED_SSH_PORT" ] && [ "$SAVED_SSH_PORT" != "22" ]; then
        export DROPBEAR_PORT="$SAVED_SSH_PORT"
    fi
fi

# =================================================================
# 🚀 KERNEL TWEAKS & BBR SWITCH
# =================================================================
sysctl -w net.ipv4.tcp_tw_reuse=1 2>/dev/null
sysctl -w net.ipv4.tcp_fin_timeout=10 2>/dev/null
sysctl -w net.core.default_qdisc=fq 2>/dev/null

if [ "$ENABLE_BBR" = "true" ]; then
    sysctl -w net.ipv4.tcp_congestion_control=bbr 2>/dev/null
else
    sysctl -w net.ipv4.tcp_congestion_control=cubic 2>/dev/null
fi

sysctl -w net.ipv4.tcp_rmem="4096 8388608 16777216" 2>/dev/null
sysctl -w net.ipv4.tcp_wmem="4096 8388608 16777216" 2>/dev/null
sysctl -w net.core.rmem_max=16777216 2>/dev/null
sysctl -w net.core.wmem_max=16777216 2>/dev/null
sysctl -w net.core.netdev_max_backlog=50000 2>/dev/null
sysctl -w net.ipv4.tcp_max_syn_backlog=8192 2>/dev/null

# =================================================================
# 🎨 PEMBUATAN BANNER DROPBEAR
# =================================================================
if [ -n "$CUSTOM_BANNER" ]; then
    echo -e "$CUSTOM_BANNER" > /etc/dropbear_banner
else
    cat << 'EOF' > /etc/dropbear_banner
==================================================
          👑 SELAMAT MENIKMATI 👑
       🥳 SSH & XRAY SERVER NAT VPS 🥳
==================================================
 🔹 MULTIPLEXER : NODE.JS JAVASCRIPT ENGINE
 🔹 OS PLATFORM : UBUNTU / DEBIAN
 🔹 SSH SERVICE : DROPBEAR ENHANCED BUFFER
==================================================
 powered by : d e d e f a t h u
==================================================
EOF
fi

# =================================================================
# 🔒 KONFIGURASI DROPBEAR, STUNNEL4, WS-PROXY & UDPGW
# =================================================================
mkdir -p /etc/stunnel /var/run/stunnel4
if [ ! -f /etc/stunnel/stunnel.pem ]; then
    openssl req -new -newkey rsa:2048 -days 3650 -nodes -x509 \
        -subj "/C=ID/ST=Jakarta/L=Jakarta/O=NATSSH/CN=localhost" \
        -keyout /etc/stunnel/stunnel.pem -out /etc/stunnel/stunnel.pem 2>/dev/null
    chmod 600 /etc/stunnel/stunnel.pem
fi

echo "[*] Memulai Dropbear di Port Internal 127.0.0.1:${DROPBEAR_PORT}..."
/usr/sbin/dropbear -p 127.0.0.1:${DROPBEAR_PORT} -b /etc/dropbear_banner -W 1048576 -K 15 -I 300
sleep 1

echo "[*] Memulai Stunnel4 di Port Internal ${SSL_TARGET_PORT} -> ${DROPBEAR_PORT}..."
cat <<EOF > /etc/stunnel/stunnel.conf
pid = /var/run/stunnel4/stunnel.pid
foreground = no
debug = 0

[ssh-ssl]
accept = 127.0.0.1:${SSL_TARGET_PORT}
connect = 127.0.0.1:${DROPBEAR_PORT}
cert = /etc/stunnel/stunnel.pem
EOF

rm -f /var/run/stunnel4/stunnel.pid 2>/dev/null
stunnel4 /etc/stunnel/stunnel.conf

echo "[*] Memulai WS-Proxy untuk SSH Dropbear di Port Lokal ${WS_PORT}..."
nohup node ws-proxy.js >/dev/null 2>&1 &

if [ -f /usr/local/bin/badvpn-udpgw ]; then
    echo "[*] Memulai BadVPN UDPGW di Port ${UDPGW_PORT}..."
    nohup /usr/local/bin/badvpn-udpgw --listen-addr 0.0.0.0:${UDPGW_PORT} --max-clients ${UDPGW_MAX_CLIENTS} --max-connections-for-client 50 >/dev/null 2>&1 &
fi

if [ -n "$TOKEN" ]; then
    echo "$TOKEN" > ./data/zt_single_token.txt
    /usr/local/bin/cloudflared tunnel run --protocol http2 --no-tls-verify --token "$TOKEN" > ./data/named_tunnel.log 2>&1 &
fi

sleep 1

echo "[*] Memulai Mux.js (Traffic Splitter SSH WS/SSL) di Port Publik ${MUX_PORT}..."
nohup node mux.js >/dev/null 2>&1 &

sleep 1

echo "[*] Menjalankan Server Utama UI & Gateway V2Ray di Port Publik ${UI_PORT}..."
PORT=${UI_PORT} UI_PORT=${UI_PORT} MUX_PORT=${MUX_PORT} UDPGW_PORT=${UDPGW_PORT} exec node server.js

#!/usr/bin/env node

const http = require("http");
const url = require("url");
const axios = require("axios");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const net = require("net");
const { exec, execSync } = require("child_process");

// ========================================================
// DIREKTORI PENYIMPANAN PERMANEN (./data) & PORT KUSTOM
// ========================================================
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const FILE_PATH = process.env.FILE_PATH || path.join(DATA_DIR, "core");
if (!fs.existsSync(FILE_PATH)) {
    fs.mkdirSync(FILE_PATH, { recursive: true });
}

const SUB_PATH = process.env.SUB_PATH || "sub";
const PORT = parseInt(process.env.UI_PORT || process.env.PORT || "20681", 10);
const MUX_PORT = parseInt(process.env.MUX_PORT || "20682", 10);
const ARGO_PORT = parseInt(process.env.ARGO_PORT || "8001", 10);
const DEFAULT_SSH_PORT = parseInt(process.env.DROPBEAR_PORT || "2222", 10);
const CFPORT = process.env.CFPORT || 443;
const NAME = process.env.NAME || "VPS-NODE";

const LOG_PATH = path.join(DATA_DIR, "boot.log");
const ZT_LOG_PATH = path.join(DATA_DIR, "named_tunnel.log");
const ZT_SINGLE_TOKEN_FILE = path.join(DATA_DIR, "zt_single_token.txt");
const CFIP_FILE = path.join(DATA_DIR, "cfip.txt");
const NET_SETTING_FILE = path.join(DATA_DIR, "net_settings.json");
const WS_PROXY_CONFIG_FILE = path.join(DATA_DIR, "ws_proxy_config.json");
const SYSTEM_CONFIG_FILE = path.join(DATA_DIR, "system_config.json");

const ADMIN_PASS_FILE = path.join(DATA_DIR, "admin_pass.txt");
const STATS_PATH = path.join(DATA_DIR, "server_stats.json");
const DB_PATH = path.join(DATA_DIR, "ssh_details.json");
const V2RAY_DB_PATH = path.join(DATA_DIR, "v2ray_users.json");

// Dummy UUID acak internal hanya dipakai saat tabel V2Ray kosong agar Xray tidak gagal booting
const INTERNAL_DUMMY_UUID = crypto.randomUUID();

let cachedDiskUsage = "0%";
let cachedSshOnline = "0 User";
let cachedUserListDetails = "Semua user offline";
let detectedPublicIp = process.env.VPS_PUBLIC_ADDR || "";

// ========================================================
// FUNGSI PENGATURAN & DATABASE PERMANEN
// ========================================================
function getNetworkSettings() {
    try {
        if (fs.existsSync(NET_SETTING_FILE)) {
            return JSON.parse(fs.readFileSync(NET_SETTING_FILE, "utf8"));
        }
    } catch (e) {}
    return { dns_type: "udp", custom_dns: "1.1.1.1", engine: "ws" };
}

function saveNetworkSettings(dns_type, custom_dns, engine) {
    try {
        fs.writeFileSync(NET_SETTING_FILE, JSON.stringify({ dns_type: dns_type, custom_dns: custom_dns, engine: engine }, null, 2));
    } catch (e) {}
}

function getWsProxyConfig() {
    try {
        if (fs.existsSync(WS_PROXY_CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(WS_PROXY_CONFIG_FILE, "utf8"));
        }
    } catch (e) {}
    return { sshPort: DEFAULT_SSH_PORT, keepAlive: 15000, maxBuffer: 32768 };
}

function saveWsProxyConfig(sshPort, keepAlive, maxBuffer) {
    try {
        const data = {
            sshPort: parseInt(sshPort, 10) || DEFAULT_SSH_PORT,
            keepAlive: parseInt(keepAlive, 10) || 15000,
            maxBuffer: parseInt(maxBuffer, 10) || 32768
        };
        fs.writeFileSync(WS_PROXY_CONFIG_FILE, JSON.stringify(data, null, 2));
    } catch (e) {}
}

function getSystemSettings() {
    try {
        if (fs.existsSync(SYSTEM_CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(SYSTEM_CONFIG_FILE, "utf8"));
        }
    } catch (e) {}
    return { banner: "", enable_bbr: "true", udpgw_port: "7300", udpgw_max_clients: "1000" };
}

function saveSystemSettings(banner, enable_bbr, udpgw_port, udpgw_max_clients) {
    try {
        const data = {
            banner: banner || "",
            enable_bbr: enable_bbr || "true",
            udpgw_port: udpgw_port || "7300",
            udpgw_max_clients: udpgw_max_clients || "1000"
        };
        fs.writeFileSync(SYSTEM_CONFIG_FILE, JSON.stringify(data, null, 2));
    } catch (e) {}
}

function getActiveCfip() {
    try {
        if (fs.existsSync(CFIP_FILE)) {
            const savedIp = fs.readFileSync(CFIP_FILE, "utf8").trim();
            if (savedIp) return savedIp;
        }
    } catch (e) {}
    return process.env.CFIP || "104.17.3.81";
}

function getAdminPassword() {
    try {
        if (fs.existsSync(ADMIN_PASS_FILE)) {
            return fs.readFileSync(ADMIN_PASS_FILE, "utf8").trim();
        }
    } catch (e) {}
    return process.env.ADMIN_PASSWORD || null;
}

function verifyAdminPassword(passInput) {
    const currentPass = getAdminPassword();
    if (!currentPass || !passInput) return false;
    return currentPass === passInput;
}

let subContent = null;
const webName = "xray-core-bin";
const botName = "cloudflared-bin";
let webPath = path.join(FILE_PATH, webName);
let botPath = path.join(FILE_PATH, botName);
let subPath = path.join(DATA_DIR, "sub.txt");

function loadDb() {
    if (fs.existsSync(DB_PATH)) {
        try { return JSON.parse(fs.readFileSync(DB_PATH, "utf8")); } catch (e) { return {}; }
    }
    return {};
}

function saveDb(data) {
    try { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); } catch (e) {}
}

function loadV2rayDb() {
    if (fs.existsSync(V2RAY_DB_PATH)) {
        try { return JSON.parse(fs.readFileSync(V2RAY_DB_PATH, "utf8")); } catch (e) { return {}; }
    }
    return {};
}

function saveV2rayDb(data) {
    try { fs.writeFileSync(V2RAY_DB_PATH, JSON.stringify(data, null, 2)); } catch (e) {}
}

function formatDateStr(timestamp) {
    if (!timestamp) return "Unlimited";
    const d = new Date(timestamp);
    return d.toISOString().split("T")[0];
}

// ========================================================
// AUTO-RESTORE AKUN SSH DARI DATABASE SAAT BOOTING
// ========================================================
function restoreSshUsersOnBoot() {
    try {
        const dbInfo = loadDb();
        const now = Date.now();
        const passwdContent = fs.readFileSync("/etc/passwd", "utf8");
        const usernames = Object.keys(dbInfo);

        for (let i = 0; i < usernames.length; i++) {
            const username = usernames[i];
            const info = dbInfo[username];
            if (info.exp_timestamp && now >= info.exp_timestamp) continue;

            const exists = passwdContent.split("\n").some(function(line) {
                return line.startsWith(username + ":");
            });

            if (!exists && info.password && info.password !== "-") {
                const expFlag = info.exp_date && info.exp_date !== "Unlimited" ? ("-e " + info.exp_date + " ") : "";
                try {
                    execSync("useradd " + expFlag + "-m -s /bin/bash " + username + " 2>/dev/null");
                    execSync("echo '" + username + ":" + info.password + "' | chpasswd 2>/dev/null");
                    console.log("[Boot-Restore] Akun SSH '" + username + "' berhasil dipulihkan dari ./data.");
                } catch (err) {}
            }
        }
    } catch (e) {}
}

let currentActiveDomain = "";

// ========================================================
// KONTROL SERVICE (TUNNEL & XRAY)
// ========================================================
function restartSingleTunnel(newToken) {
    exec("pkill -9 -f '" + botName + "' 2>/dev/null; pkill -9 -f 'cloudflared' 2>/dev/null", function() {
        setTimeout(function() {
            if (newToken && newToken.trim()) {
                fs.writeFileSync(ZT_SINGLE_TOKEN_FILE, newToken.trim());
                exec("nohup " + botPath + " tunnel run --protocol http2 --no-tls-verify --token \"" + newToken.trim() + "\" > " + ZT_LOG_PATH + " 2>&1 &");
            } else {
                if (fs.existsSync(ZT_SINGLE_TOKEN_FILE)) fs.unlinkSync(ZT_SINGLE_TOKEN_FILE);
                if (fs.existsSync(ZT_LOG_PATH)) fs.writeFileSync(ZT_LOG_PATH, "Token Dihapus.");
                let args = "tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile " + LOG_PATH + " --loglevel info --url http://localhost:" + ARGO_PORT;
                exec("nohup " + botPath + " " + args + " >/dev/null 2>&1 &");
            }
        }, 1000);
    });
}

function restartXrayEngine() {
    exec("pkill -9 -f '" + webName + "'", function() {
        setTimeout(function() {
            if (fs.existsSync(webPath)) {
                exec("nohup " + webPath + " -c " + FILE_PATH + "/config.json >/dev/null 2>&1 &");
            }
        }, 500);
    });
}

function getDomainsByPort(targetPorts) {
    const domains = [];
    try {
        if (fs.existsSync(ZT_LOG_PATH)) {
            const logContent = fs.readFileSync(ZT_LOG_PATH, "utf8");
            const portRegexStr = targetPorts.join("|");

            const regexIngress = new RegExp('(?:\\\\?"|")hostname(?:\\\\?"|")\\s*:\\s*(?:\\\\?"|")([^"\\\\]+)(?:\\\\?"|")[^}]*?localhost:(' + portRegexStr + ')', "g");
            let match;
            while ((match = regexIngress.exec(logContent)) !== null) {
                const domainName = match[1].trim();
                const portNum = match[2];
                if (!domains.some(function(d) { return d.domain === domainName; })) {
                    domains.push({ domain: domainName, port: portNum });
                }
            }

            if (domains.length === 0) {
                const regexIngressReverse = new RegExp('localhost:(' + portRegexStr + ')[^}]*?(?:\\\\?"|")hostname(?:\\\\?"|")\\s*:\\s*(?:\\\\?"|")([^"\\\\]+)(?:\\\\?"|")', "g");
                while ((match = regexIngressReverse.exec(logContent)) !== null) {
                    const portNum = match[1];
                    const domainName = match[2].trim();
                    if (!domains.some(function(d) { return d.domain === domainName; })) {
                        domains.push({ domain: domainName, port: portNum });
                    }
                }
            }
        }
    } catch (e) {}
    return domains;
}

function getCurrentHosts() {
    const ztDomains = getDomainsByPort(["8880", "8881", String(MUX_PORT)]);
    const namedUrl = ztDomains.length > 0 ? ztDomains[0].domain : "";
    const hostAddr = detectedPublicIp || "IP-VPS";

    let hostOutput = hostAddr + ":" + MUX_PORT + " (Direct WS/SSL)";
    if (namedUrl && !namedUrl.includes("Menghubungkan")) {
        hostOutput += " | " + namedUrl.replace(/https?:\/\//, "") + " (Argo WS)";
    }
    return hostOutput;
}

// ========================================================
// MANAJEMEN AKUN SSH + EXPIRED (KHUSUS ADMIN)
// ========================================================
function listSsh() {
    try {
        const users = [];
        const dbInfo = loadDb();
        const passwdContent = fs.readFileSync("/etc/passwd", "utf8");
        const lines = passwdContent.split("\n");

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const parts = line.split(":");
            const username = parts[0];
            const uid = parseInt(parts[2], 10);
            const shell = parts[parts.length - 1];

            if (uid >= 1000 && !["nobody", "ubuntu", "debian", "sshd", "dropbear", "stunnel", "stunnel4"].includes(username)) {
                const extra = dbInfo[username] || { password: "-", ip: "Unknown", user_agent: "Unknown", exp_date: "Unlimited", exp_timestamp: null };
                users.push(Object.assign({ username: username, uid: uid, shell: shell }, extra));
            }
        }
        return { status: "success", total: users.length, users: users };
    } catch (e) {
        return { status: "error", message: e.message };
    }
}

function addSsh(username, password, expDays, ipAddr, userAgent) {
    if (!username || !password) return { status: "error", message: "Username dan password wajib diisi!" };
    if (!/^[a-zA-Z0-9_-]+$/.test(username) || !/^[a-zA-Z0-9_@.-]+$/.test(password)) {
        return { status: "error", message: "Username/Password mengandung karakter ilegal!" };
    }

    const days = parseInt(expDays, 10) || 7;
    const expTimestamp = Date.now() + (days * 86400000);
    const expDateStr = formatDateStr(expTimestamp);

    try {
        execSync("useradd -e " + expDateStr + " -m -s /bin/bash " + username);
        execSync("echo '" + username + ":" + password + "' | chpasswd");

        const dbInfo = loadDb();
        dbInfo[username] = {
            password: password,
            ip: ipAddr,
            user_agent: userAgent,
            exp_timestamp: expTimestamp,
            exp_date: expDateStr
        };
        saveDb(dbInfo);

        const activeHost = getCurrentHosts();
        const accountDetails =
            "================================\n" +
            "       SSH ACCOUNT CREATED      \n" +
            "================================\n" +
            "Host SSH  : " + activeHost + "\n" +
            "Port Mux  : " + MUX_PORT + " (WS & SSL)\n" +
            "Port CF   : 443 (TLS) / 80 (NTLS)\n" +
            "Username  : " + username + "\n" +
            "Password  : " + password + "\n" +
            "Expired   : " + expDateStr + " (" + days + " Hari)\n" +
            "================================\n" +
            " powered by : d e d e f a t h u\n" +
            "================================";
        return { status: "success", message: accountDetails };
    } catch (e) {
        return { status: "error", message: "Gagal membuat user. Username mungkin sudah terpakai." };
    }
}

function deleteSsh(username) {
    if (!username || !/^[a-zA-Z0-9_-]+$/.test(username)) return { status: "error", message: "Username ilegal!" };
    try {
        execSync("pkill -9 -u " + username + " 2>/dev/null || true");
        execSync("userdel -r -f " + username + " 2>/dev/null || userdel -f " + username);
        const dbInfo = loadDb();
        if (dbInfo[username]) {
            delete dbInfo[username];
            saveDb(dbInfo);
        }
        return { status: "success", message: "User SSH " + username + " berhasil dihapus!" };
    } catch (e) {
        return { status: "error", message: "Gagal menghapus user." };
    }
}

// ========================================================
// MANAJEMEN AKUN V2RAY + EXPIRED (MASTER UUID NONAKTIF)
// ========================================================
function listV2ray() {
    try {
        const db = loadV2rayDb();
        const users = Object.keys(db).map(function(u) {
            return {
                username: u,
                uuid: db[u].uuid,
                exp_date: db[u].exp_date || "Unlimited",
                exp_timestamp: db[u].exp_timestamp || null,
                created_at: db[u].created_at || "-"
            };
        });
        return { status: "success", total: users.length, users: users };
    } catch (e) {
        return { status: "error", message: e.message };
    }
}

async function addV2ray(username, customUuid, expDays) {
    if (!username || !/^[a-zA-Z0-9_-]+$/.test(username)) {
        return { status: "error", message: "Username wajib diisi (huruf/angka/strip)!" };
    }
    const db = loadV2rayDb();
    if (db[username]) {
        return { status: "error", message: "Username V2Ray sudah terdaftar!" };
    }

    const days = parseInt(expDays, 10) || 7;
    const expTimestamp = Date.now() + (days * 86400000);
    const expDateStr = formatDateStr(expTimestamp);
    const newUuid = (customUuid && customUuid.trim().length >= 6) ? customUuid.trim() : crypto.randomUUID();

    db[username] = {
        uuid: newUuid,
        exp_timestamp: expTimestamp,
        exp_date: expDateStr,
        created_at: formatDateStr(Date.now())
    };
    saveV2rayDb(db);

    await generateConfig();
    restartXrayEngine();

    if (currentActiveDomain) {
        await generateLinks(currentActiveDomain);
    }

    const detailMsg =
        "================================\n" +
        "     V2RAY ACCOUNT CREATED      \n" +
        "================================\n" +
        "Username  : " + username + "\n" +
        "UUID/Pass : " + newUuid + "\n" +
        "Protokol  : VLESS / VMess / Trojan\n" +
        "Port VPS  : " + PORT + " (Direct WS)\n" +
        "Expired   : " + expDateStr + " (" + days + " Hari)\n" +
        "================================\n" +
        "Klik tombol [PAKAI UUID] pada tabel di bawah\n" +
        "untuk generate config V2Ray / Clash / SingBox.\n" +
        "================================";

    return { status: "success", uuid: newUuid, exp_date: expDateStr, message: detailMsg };
}

async function deleteV2ray(username) {
    if (!username) return { status: "error", message: "Username kosong!" };
    const db = loadV2rayDb();
    if (!db[username]) return { status: "error", message: "Akun tidak ditemukan!" };

    delete db[username];
    saveV2rayDb(db);

    await generateConfig();
    restartXrayEngine();

    return { status: "success", message: "Akun V2Ray " + username + " berhasil dihapus!" };
}

// ========================================================
// AUTO-CLEANUP EXPIRED ACCOUNTS (CRON JOB)
// ========================================================
async function checkAndCleanExpiredAccounts() {
    const now = Date.now();

    const sshDb = loadDb();
    let sshChanged = false;
    const sshUsers = Object.keys(sshDb);
    for (let i = 0; i < sshUsers.length; i++) {
        const username = sshUsers[i];
        const info = sshDb[username];
        if (info.exp_timestamp && now >= info.exp_timestamp) {
            try {
                execSync("pkill -9 -u " + username + " 2>/dev/null || true");
                execSync("userdel -r -f " + username + " 2>/dev/null || true");
            } catch (e) {}
            delete sshDb[username];
            sshChanged = true;
            console.log("[Auto-Expire] Akun SSH " + username + " telah kedaluwarsa dan dihapus.");
        }
    }
    if (sshChanged) saveDb(sshDb);

    const v2rayDb = loadV2rayDb();
    let v2rayChanged = false;
    const v2rayUsers = Object.keys(v2rayDb);
    for (let j = 0; j < v2rayUsers.length; j++) {
        const vUser = v2rayUsers[j];
        const vInfo = v2rayDb[vUser];
        if (vInfo.exp_timestamp && now >= vInfo.exp_timestamp) {
            delete v2rayDb[vUser];
            v2rayChanged = true;
            console.log("[Auto-Expire] Akun V2Ray " + vUser + " telah kedaluwarsa dan dihapus.");
        }
    }
    if (v2rayChanged) {
        saveV2rayDb(v2rayDb);
        await generateConfig();
        restartXrayEngine();
    }
}

// ========================================================
// GENERATOR CONFIG XRAY (MASTER UUID SUDAH DINONAKTIFKAN)
// ========================================================
function readPathsFromFile(filename, defaultPath) {
    try {
        if (fs.existsSync(filename)) {
            const content = fs.readFileSync(filename, "utf-8");
            const paths = content.split("\n").map(function(p) { return p.trim(); }).filter(function(p) { return p.startsWith("/"); });
            if (paths.length > 0) return paths;
        }
    } catch (e) {}
    return [defaultPath];
}

function getAllActiveXrayUuids() {
    const v2rayDb = loadV2rayDb();
    const now = Date.now();
    const uuidSet = new Set(); // Master UUID sudah tidak disertakan

    const keys = Object.keys(v2rayDb);
    for (let i = 0; i < keys.length; i++) {
        const info = v2rayDb[keys[i]];
        if (!info.exp_timestamp || now < info.exp_timestamp) {
            if (info.uuid) uuidSet.add(info.uuid);
        }
    }

    // Jika belum ada akun V2Ray yang dibuat sama sekali, gunakan dummy UUID rahasia agar Xray tetap hidup
    if (uuidSet.size === 0) {
        uuidSet.add(INTERNAL_DUMMY_UUID);
    }

    return Array.from(uuidSet);
}

async function generateConfig() {
    const netSettings = getNetworkSettings();
    const vlessPaths = readPathsFromFile("pathvless.txt", "/vless-argo");
    const vmessPaths = readPathsFromFile("pathvmess.txt", "/vmess-argo");
    const trojanPaths = readPathsFromFile("pathtrojan.txt", "/trojan-argo");

    const activeUuids = getAllActiveXrayUuids();
    const vlessClients = activeUuids.map(function(id) { return { id: id, level: 0 }; });
    const vmessClients = activeUuids.map(function(id) { return { id: id, alterId: 0 }; });
    const trojanClients = activeUuids.map(function(password) { return { password: password }; });

    const fallbacksList = [];
    const inboundsList = [];
    let nextPort = 3100;

    const engine = netSettings.engine || "ws";

    let streamSettingsObj = {};
    if (engine === "grpc") {
        streamSettingsObj = { network: "grpc", security: "none", grpcSettings: { serviceName: "grpc-service" } };
    } else if (engine === "h2") {
        streamSettingsObj = { network: "h2", security: "none", httpSettings: { path: "/h2-path", host: ["localhost"] } };
    } else if (engine === "tcp") {
        streamSettingsObj = { network: "tcp", security: "none" };
    } else {
        streamSettingsObj = { network: "ws", security: "none" };
    }

    vlessPaths.forEach(function(p) {
        const cp = nextPort++;
        fallbacksList.push({ path: p, dest: cp });
        let st = JSON.parse(JSON.stringify(streamSettingsObj));
        if (engine === "ws") st.wsSettings = { path: p };

        inboundsList.push({
            port: cp,
            listen: "127.0.0.1",
            protocol: "vless",
            settings: { clients: vlessClients, decryption: "none" },
            streamSettings: st,
            sniffing: { enabled: true, destOverride: ["http", "tls", "quic"] }
        });
    });

    vmessPaths.forEach(function(p) {
        const cp = nextPort++;
        fallbacksList.push({ path: p, dest: cp });
        let st = JSON.parse(JSON.stringify(streamSettingsObj));
        if (engine === "ws") st.wsSettings = { path: p };

        inboundsList.push({
            port: cp,
            listen: "127.0.0.1",
            protocol: "vmess",
            settings: { clients: vmessClients },
            streamSettings: st,
            sniffing: { enabled: true, destOverride: ["http", "tls", "quic"] }
        });
    });

    trojanPaths.forEach(function(p) {
        const cp = nextPort++;
        fallbacksList.push({ path: p, dest: cp });
        let st = JSON.parse(JSON.stringify(streamSettingsObj));
        if (engine === "ws") st.wsSettings = { path: p };

        inboundsList.push({
            port: cp,
            listen: "127.0.0.1",
            protocol: "trojan",
            settings: { clients: trojanClients },
            streamSettings: st,
            sniffing: { enabled: true, destOverride: ["http", "tls", "quic"] }
        });
    });

    inboundsList.unshift({
        port: ARGO_PORT,
        protocol: "vless",
        settings: { clients: vlessClients, decryption: "none", fallbacks: fallbacksList },
        streamSettings: { network: "tcp", security: "none" },
        sniffing: { enabled: true, destOverride: ["http", "tls", "quic"] }
    });

    let dnsValue = (netSettings.custom_dns || "").trim();
    let dnsServers = [];

    if (netSettings.dns_type === "doh") {
        if (!dnsValue.startsWith("http")) dnsValue = "https://1.1.1.1/dns-query";
        dnsServers = [dnsValue, "1.1.1.1"];
    } else {
        if (!dnsValue || dnsValue.startsWith("http")) dnsValue = "1.1.1.1";
        dnsServers = [dnsValue, "8.8.8.8"];
    }

    const config = {
        log: { access: "/dev/null", error: "/dev/null", loglevel: "none" },
        inbounds: inboundsList,
        dns: { servers: dnsServers },
        outbounds: [{ protocol: "freedom", tag: "direct" }]
    };

    fs.writeFileSync(path.join(FILE_PATH, "config.json"), JSON.stringify(config, null, 2));
}

function getSystemArchitecture() {
    return os.arch().includes("arm") ? "arm" : "amd";
}

function downloadFile(fileName, fileUrl, callback) {
    if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH, { recursive: true });
    // Jika binary sudah ada di ./data/core, tidak perlu unduh ulang setiap restart
    if (fs.existsSync(fileName) && fs.statSync(fileName).size > 1000000) {
        return callback(null, fileName);
    }
    const writer = fs.createWriteStream(fileName);
    axios({ method: "get", url: fileUrl, responseType: "stream" }).then(function(response) {
        response.data.pipe(writer);
        writer.on("finish", function() { writer.close(); callback(null, fileName); });
        writer.on("error", function(err) { fs.unlink(fileName, function() {}); callback(err.message); });
    }).catch(function(err) { callback(err.message); });
}

async function downloadFilesAndRun() {
    const architecture = getSystemArchitecture();
    const filesToDownload = architecture === "arm"
        ? [{ fileName: webPath, fileUrl: "https://arm64.ssss.nyc.mn/web" }, { fileName: botPath, fileUrl: "https://arm64.ssss.nyc.mn/bot" }]
        : [{ fileName: webPath, fileUrl: "https://amd64.ssss.nyc.mn/web" }, { fileName: botPath, fileUrl: "https://amd64.ssss.nyc.mn/bot" }];

    for (let i = 0; i < filesToDownload.length; i++) {
        const fileInfo = filesToDownload[i];
        await new Promise(function(resolve, reject) {
            downloadFile(fileInfo.fileName, fileInfo.fileUrl, function(err) {
                if (err) reject(err); else resolve();
            });
        });
    }
    fs.chmodSync(webPath, 0o775);
    fs.chmodSync(botPath, 0o775);

    exec("nohup " + webPath + " -c " + FILE_PATH + "/config.json >/dev/null 2>&1 &");

    if (fs.existsSync(ZT_SINGLE_TOKEN_FILE)) {
        const singleToken = fs.readFileSync(ZT_SINGLE_TOKEN_FILE, "utf8").trim();
        if (singleToken) {
            restartSingleTunnel(singleToken);
        } else {
            let args = "tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile " + LOG_PATH + " --loglevel info --url http://localhost:" + ARGO_PORT;
            exec("nohup " + botPath + " " + args + " >/dev/null 2>&1 &");
        }
    } else {
        let args = "tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile " + LOG_PATH + " --loglevel info --url http://localhost:" + ARGO_PORT;
        exec("nohup " + botPath + " " + args + " >/dev/null 2>&1 &");
    }

    await new Promise(function(r) { setTimeout(r, 3000); });
}

async function extractDomains() {
    try {
        if (fs.existsSync(LOG_PATH)) {
            const logContent = fs.readFileSync(LOG_PATH, "utf-8");
            const match = logContent.match(/https:\/\/([a-zA-Z0-9-]+\.trycloudflare\.com)/);
            if (match && match[1] !== currentActiveDomain) {
                currentActiveDomain = match[1];
                await generateLinks(currentActiveDomain);
            }
        }
    } catch (e) {}
}

async function getMetaInfo() {
    try {
        const res = await axios.get("https://api.ip.sb/geoip", { timeout: 5000 });
        if (!detectedPublicIp && res.data && res.data.ip) {
            detectedPublicIp = res.data.ip;
        }
        return (res.data.country_code + "-" + res.data.isp).replace(/\s+/g, "_");
    } catch (e) {
        return "VPSServer";
    }
}

async function generateLinks(argoDomain) {
    const v2rayDb = loadV2rayDb();
    const keys = Object.keys(v2rayDb);
    if (keys.length === 0) {
        subContent = Buffer.from("Belum ada akun V2Ray aktif. Silakan buat akun di panel Admin.").toString("base64");
        fs.writeFileSync(subPath, subContent);
        return;
    }

    const firstAccountUuid = v2rayDb[keys[0]].uuid;
    const ISP = await getMetaInfo();
    const nodeName = NAME + "-" + ISP;
    const activeCfip = getActiveCfip();
    const defaultVless = readPathsFromFile("pathvless.txt", "/vless-argo")[0];
    const defaultVmess = readPathsFromFile("pathvmess.txt", "/vmess-argo")[0];
    const defaultTrojan = readPathsFromFile("pathtrojan.txt", "/trojan-argo")[0];

    const vmessObj = {
        v: "2",
        ps: nodeName,
        add: activeCfip,
        port: String(CFPORT),
        id: firstAccountUuid,
        aid: "0",
        scy: "auto",
        net: "ws",
        type: "none",
        host: argoDomain,
        path: defaultVmess,
        tls: "tls",
        sni: argoDomain
    };

    const vmessLink = "vmess://" + Buffer.from(JSON.stringify(vmessObj)).toString("base64");
    const vlessLink = "vless://" + firstAccountUuid + "@" + activeCfip + ":" + CFPORT + "?encryption=none&security=tls&sni=" + argoDomain + "&type=ws&host=" + argoDomain + "&path=" + encodeURIComponent(defaultVless) + "#" + encodeURIComponent(nodeName);
    const trojanLink = "trojan://" + firstAccountUuid + "@" + activeCfip + ":" + CFPORT + "?security=tls&sni=" + argoDomain + "&type=ws&host=" + argoDomain + "&path=" + encodeURIComponent(defaultTrojan) + "#" + encodeURIComponent(nodeName);

    const subTxt = vlessLink + "\n" + vmessLink + "\n" + trojanLink;
    subContent = Buffer.from(subTxt).toString("base64");
    fs.writeFileSync(subPath, subContent);
}

// ========================================================
// HTTP SERVER (API & STATIC FILES HANDLER)
// ========================================================
const server = http.createServer(async function(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathName = parsedUrl.pathname;
    const query = parsedUrl.query;
    const ipAddr = req.headers["cf-connecting-ip"] || req.socket.remoteAddress || "Unknown IP";
    const userAgent = req.headers["user-agent"] || "Unknown UA";

    res.setHeader("Access-Control-Allow-Origin", "*");

    if (pathName === "/" + SUB_PATH) {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end(subContent || (fs.existsSync(subPath) ? fs.readFileSync(subPath, "utf-8") : "Loading sub..."));
    }

    if (pathName === "/__info") {
        res.writeHead(200, { "Content-Type": "application/json" });
        const defaultVless = readPathsFromFile("pathvless.txt", "/vless-argo")[0];
        const defaultVmess = readPathsFromFile("pathvmess.txt", "/vmess-argo")[0];
        const defaultTrojan = readPathsFromFile("pathtrojan.txt", "/trojan-argo")[0];
        return res.end(JSON.stringify({
            uuid: "", // Master UUID dinonaktifkan, wajib pilih akun dari tabel V2Ray
            cfip: getActiveCfip(),
            domain: currentActiveDomain || "Menunggu Quick Tunnel...",
            paths: { vless: defaultVless, vmess: defaultVmess, trojan: defaultTrojan }
        }));
    }

    if (pathName === "/api/logtunnel") {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end(fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, "utf8") : "Log belum siap.");
    }

    if (pathName === "/api/lognamed") {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        if (fs.existsSync(ZT_LOG_PATH)) {
            return res.end(fs.readFileSync(ZT_LOG_PATH, "utf8"));
        } else {
            return res.end("Log Zero Trust belum terbuat di ./data/named_tunnel.log");
        }
    }

    if (pathName === "/api/setup-pass") {
        res.writeHead(200, { "Content-Type": "application/json" });
        const newPass = query.pass ? query.pass.trim() : "";
        const oldPass = query.old_pass ? query.old_pass.trim() : "";
        const currentPass = getAdminPassword();

        if (currentPass) {
            if (oldPass !== currentPass) {
                return res.end(JSON.stringify({ status: "error", message: "Password Admin Lama Salah!" }));
            }
        }

        if (!newPass || newPass.length < 4) {
            return res.end(JSON.stringify({ status: "error", message: "Password minimal 4 karakter!" }));
        }

        fs.writeFileSync(ADMIN_PASS_FILE, newPass);
        return res.end(JSON.stringify({ status: "success", message: "Password Admin Berhasil Disimpan Permanen di ./data!" }));
    }

    if (pathName === "/api/set-network") {
        res.writeHead(200, { "Content-Type": "application/json" });
        if (!verifyAdminPassword(query.pass)) {
            return res.end(JSON.stringify({ status: "error", message: "Akses Ditolak! Anda harus Login Admin terlebih dahulu." }));
        }
        const dns_type = query.dns_type || "udp";
        const custom_dns = query.custom_dns ? decodeURIComponent(query.custom_dns) : "1.1.1.1";
        const engine = query.engine || "ws";

        saveNetworkSettings(dns_type, custom_dns, engine);
        await generateConfig();
        restartXrayEngine();

        return res.end(JSON.stringify({
            status: "success",
            message: "Setting V2Ray Disimpan! DNS: [" + dns_type.toUpperCase() + "] " + custom_dns + ", Engine: " + engine.toUpperCase() + ". Engine restarted!"
        }));
    }

    if (pathName === "/api/set-wsproxy") {
        res.writeHead(200, { "Content-Type": "application/json" });
        if (!verifyAdminPassword(query.pass)) {
            return res.end(JSON.stringify({ status: "error", message: "Akses Ditolak! Anda harus Login Admin terlebih dahulu." }));
        }

        saveWsProxyConfig(query.ssh_port, query.keep_alive, query.max_buffer);
        return res.end(JSON.stringify({
            status: "success",
            message: "Setting SSH Disimpan! Target Port Dropbear: " + (query.ssh_port || DEFAULT_SSH_PORT) + ", KeepAlive: " + (query.keep_alive || 15000) + "ms"
        }));
    }

    if (pathName === "/api/set-system") {
        res.writeHead(200, { "Content-Type": "application/json" });
        if (!verifyAdminPassword(query.pass)) {
            return res.end(JSON.stringify({ status: "error", message: "Akses Ditolak! Anda harus Login Admin terlebih dahulu." }));
        }

        const banner = query.banner ? decodeURIComponent(query.banner) : "";
        const enable_bbr = query.enable_bbr || "true";
        const udpgw_port = query.udpgw_port || "7300";
        const udpgw_max_clients = query.udpgw_max_clients || "1000";

        saveSystemSettings(banner, enable_bbr, udpgw_port, udpgw_max_clients);

        if (banner) {
            try { fs.writeFileSync("/etc/dropbear_banner", banner); } catch (e) {}
        } else {
            const defaultBanner =
                "==================================================\n" +
                "                 SSH SERVER PANEL                 \n" +
                "==================================================\n" +
                " powered by : d e d e f a t h u\n" +
                "==================================================\n";
            try { fs.writeFileSync("/etc/dropbear_banner", defaultBanner); } catch (e) {}
        }

        exec("pkill -9 dropbear", function() {
            setTimeout(function() {
                const wsCfg = getWsProxyConfig();
                const sshPort = wsCfg.sshPort || DEFAULT_SSH_PORT;
                exec("/usr/sbin/dropbear -p 127.0.0.1:" + sshPort + " -b /etc/dropbear_banner -W 1048576 -K 15 -I 300", function() {});
            }, 1000);
        });

        exec("pkill -9 badvpn-udpgw", function() {
            setTimeout(function() {
                if (fs.existsSync("/usr/local/bin/badvpn-udpgw")) {
                    exec("nohup /usr/local/bin/badvpn-udpgw --listen-addr 0.0.0.0:" + udpgw_port + " --max-clients " + udpgw_max_clients + " --max-connections-for-client 50 >/dev/null 2>&1 &");
                }
            }, 1000);
        });

        try {
            if (enable_bbr === "true") {
                exec("sysctl -w net.ipv4.tcp_congestion_control=bbr 2>/dev/null");
            } else {
                exec("sysctl -w net.ipv4.tcp_congestion_control=cubic 2>/dev/null");
            }
        } catch (e) {}

        return res.end(JSON.stringify({
            status: "success",
            message: "System Config (Banner/BBR/UDPGW:" + udpgw_port + ") Berhasil Disimpan & Di-apply!"
        }));
    }

    if (pathName === "/api/set-token") {
        res.writeHead(200, { "Content-Type": "application/json" });
        if (!verifyAdminPassword(query.pass)) {
            return res.end(JSON.stringify({ status: "error", message: "Akses Ditolak! Anda harus Login Admin terlebih dahulu." }));
        }

        const singleToken = query.token !== undefined ? query.token.trim() : null;
        if (singleToken !== null) restartSingleTunnel(singleToken);

        return res.end(JSON.stringify({ status: "success", message: "Perintah restart tunnel terkirim! Tunggu 10 detik..." }));
    }

    if (pathName === "/api/set-cfip") {
        res.writeHead(200, { "Content-Type": "application/json" });
        if (!verifyAdminPassword(query.pass)) {
            return res.end(JSON.stringify({ status: "error", message: "Akses Ditolak! Anda harus Login Admin terlebih dahulu." }));
        }
        const newIp = query.ip ? query.ip.trim() : "";
        if (newIp) {
            fs.writeFileSync(CFIP_FILE, newIp);
            if (currentActiveDomain) generateLinks(currentActiveDomain);
            return res.end(JSON.stringify({ status: "success", message: "CFIP Berhasil Diperbarui ke: " + newIp }));
        } else {
            if (fs.existsSync(CFIP_FILE)) fs.unlinkSync(CFIP_FILE);
            return res.end(JSON.stringify({ status: "success", message: "CFIP Direset ke Default." }));
        }
    }

    // --- API AKUN SSH (WAJIB ADMIN) ---
    if (pathName === "/api/add") {
        res.writeHead(200, { "Content-Type": "application/json" });
        if (!verifyAdminPassword(query.token)) {
            return res.end(JSON.stringify({ status: "error", message: "Akses Ditolak! Hanya Admin yang bisa membuat akun SSH." }));
        }
        return res.end(JSON.stringify(addSsh(query.user, query.pass, query.exp, ipAddr, userAgent)));
    }

    if (pathName === "/api/delete") {
        res.writeHead(200, { "Content-Type": "application/json" });
        if (!verifyAdminPassword(query.token)) return res.end(JSON.stringify({ status: "error", message: "Akses Ditolak!" }));
        return res.end(JSON.stringify(deleteSsh(query.user)));
    }

    if (pathName === "/api/list") {
        res.writeHead(200, { "Content-Type": "application/json" });
        if (!verifyAdminPassword(query.token)) {
            return res.end(JSON.stringify({ status: "error", message: "Unauthorized", users: [] }));
        }
        return res.end(JSON.stringify(listSsh()));
    }

    // --- API AKUN V2RAY (WAJIB ADMIN) ---
    if (pathName === "/api/v2ray/add") {
        res.writeHead(200, { "Content-Type": "application/json" });
        if (!verifyAdminPassword(query.token)) {
            return res.end(JSON.stringify({ status: "error", message: "Akses Ditolak! Hanya Admin yang bisa membuat akun V2Ray." }));
        }
        const result = await addV2ray(query.user, query.uuid, query.exp);
        return res.end(JSON.stringify(result));
    }

    if (pathName === "/api/v2ray/delete") {
        res.writeHead(200, { "Content-Type": "application/json" });
        if (!verifyAdminPassword(query.token)) return res.end(JSON.stringify({ status: "error", message: "Akses Ditolak!" }));
        const result = await deleteV2ray(query.user);
        return res.end(JSON.stringify(result));
    }

    if (pathName === "/api/v2ray/list") {
        res.writeHead(200, { "Content-Type": "application/json" });
        if (!verifyAdminPassword(query.token)) {
            return res.end(JSON.stringify({ status: "error", message: "Unauthorized", users: [] }));
        }
        return res.end(JSON.stringify(listV2ray()));
    }

    if (pathName === "/api/login") {
        res.writeHead(200, { "Content-Type": "application/json" });
        const isPassConfigured = getAdminPassword() !== null;
        if (!isPassConfigured) {
            return res.end(JSON.stringify({ status: "not_configured", message: "Password Admin belum pernah dibuat!" }));
        }
        return res.end(JSON.stringify(verifyAdminPassword(query.pass) ? { status: "success", token: query.pass } : { status: "error", message: "Password Salah!" }));
    }

    if (pathName === "/api/stats") {
        res.writeHead(200, { "Content-Type": "application/json" });

        let hwInfo = {
            cpu_model: os.cpus()[0] ? os.cpus()[0].model : "Unknown Core",
            ram_total: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2) + " GB",
            ram_used: ((os.totalmem() - os.freemem()) / 1024 / 1024 / 1024).toFixed(2) + " GB",
            disk_usage: cachedDiskUsage,
            uptime: (os.uptime() / 3600).toFixed(2) + " Hours",
            ssh_online: cachedSshOnline,
            user_list_details: cachedUserListDetails
        };

        if (fs.existsSync(STATS_PATH)) {
            try { hwInfo = Object.assign({}, hwInfo, JSON.parse(fs.readFileSync(STATS_PATH, "utf8"))); } catch (e) {}
        }

        let quickUrl = currentActiveDomain || "Menunggu Quick Tunnel...";
        let ztSshDomains = getDomainsByPort(["8880", "8881", String(MUX_PORT)]);
        let ztVmessDomains = getDomainsByPort(["8001", String(PORT)]);
        let passConfigured = getAdminPassword() !== null;
        let netSettings = getNetworkSettings();
        let wsProxyCfg = getWsProxyConfig();
        let sysSettings = getSystemSettings();

        let hostAddr = detectedPublicIp || (req.headers.host ? req.headers.host.split(":")[0] : "");
        let vpsV2rayEndpoint = process.env.RAILWAY_PUBLIC_DOMAIN || (hostAddr ? (hostAddr + ":" + PORT) : "Tidak Aktif");
        let vpsSshEndpoint = (process.env.RAILWAY_TCP_PROXY_DOMAIN && process.env.RAILWAY_TCP_PROXY_PORT)
            ? (process.env.RAILWAY_TCP_PROXY_DOMAIN + ":" + process.env.RAILWAY_TCP_PROXY_PORT)
            : (hostAddr ? (hostAddr + ":" + MUX_PORT) : "Tidak Aktif");

        let cleanOnlineStr = String(hwInfo.ssh_online).replace(/Active/g, "").replace(/Users/g, "").trim();

        const responseData = Object.assign({
            active_cfip: getActiveCfip(),
            quick_url: quickUrl,
            zt_domains: ztSshDomains,
            zt_vmess_domains: ztVmessDomains,
            pass_configured: passConfigured,
            railway_public: vpsV2rayEndpoint,
            railway_sni: vpsSshEndpoint,
            status: "ONLINE",
            dns_type: netSettings.dns_type,
            custom_dns: netSettings.custom_dns,
            engine_mode: netSettings.engine,
            ws_proxy_cfg: wsProxyCfg,
            sys_settings: sysSettings
        }, hwInfo, {
            ssh_online: cleanOnlineStr || "0"
        });

        return res.end(JSON.stringify(responseData));
    }

    // --- SERVING FILE STATIS (HTML, CSS, JS) ---
    if (pathName === "/" || pathName === "/index.html") {
        const filePath = path.join(__dirname, "index.html");
        if (fs.existsSync(filePath)) {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            return res.end(fs.readFileSync(filePath, "utf-8"));
        } else {
            res.writeHead(404, { "Content-Type": "text/plain" });
            return res.end("index.html tidak ditemukan!");
        }
    }

    if (pathName === "/style.css") {
        const filePath = path.join(__dirname, "style.css");
        if (fs.existsSync(filePath)) {
            res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
            return res.end(fs.readFileSync(filePath, "utf-8"));
        } else {
            res.writeHead(404, { "Content-Type": "text/plain" });
            return res.end("style.css tidak ditemukan!");
        }
    }

    if (pathName === "/app.js") {
        const filePath = path.join(__dirname, "app.js");
        if (fs.existsSync(filePath)) {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            return res.end(fs.readFileSync(filePath, "utf-8"));
        } else {
            res.writeHead(404, { "Content-Type": "text/plain" });
            return res.end("app.js tidak ditemukan!");
        }
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
});

// ========================================================
// HANDLER WEBSOCKET DUAL-MODE (UI WEB & VPN XRAY FORWARDING)
// ========================================================
function forwardWebsocket(targetPort, req, socket, head) {
    const targetConn = net.createConnection({ port: targetPort, host: "127.0.0.1" }, function() {
        let rawHeaders = req.method + " " + req.url + " HTTP/" + req.httpVersion + "\r\n";
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
            rawHeaders += req.rawHeaders[i] + ": " + req.rawHeaders[i + 1] + "\r\n";
        }
        rawHeaders += "\r\n";

        targetConn.write(rawHeaders);
        if (head && head.length > 0) targetConn.write(head);

        socket.pipe(targetConn);
        targetConn.pipe(socket);
    });

    targetConn.on("error", function() {
        try { socket.destroy(); } catch (e) {}
    });

    socket.on("error", function() {
        try { targetConn.destroy(); } catch (e) {}
    });
}

server.on("upgrade", function(req, socket, head) {
    const urlPath = req.url.split("?")[0];

    if (urlPath === "/ssh-ws" || urlPath.startsWith("/ssh")) {
        const wsCfg = getWsProxyConfig();
        const targetPort = wsCfg.sshPort || DEFAULT_SSH_PORT;
        return forwardWebsocket(targetPort, req, socket, head);
    }

    return forwardWebsocket(ARGO_PORT, req, socket, head);
});

// ========================================================
// START LISTEN SERVER
// ========================================================
server.listen(PORT, function() {
    console.log("[VPS Panel & Xray Gateway] Aktif di Port UI/V2Ray: " + PORT + " | Port SSH Mux: " + MUX_PORT);
    restoreSshUsersOnBoot();
    getMetaInfo();

    generateConfig()
        .then(function() { return downloadFilesAndRun(); })
        .then(function() { return extractDomains(); })
        .catch(function(e) { console.error(e); });

    if (fs.existsSync(ZT_SINGLE_TOKEN_FILE)) {
        try {
            const savedToken = fs.readFileSync(ZT_SINGLE_TOKEN_FILE, "utf8").trim();
            if (savedToken) restartSingleTunnel(savedToken);
        } catch (e) {}
    }

    setInterval(function() {
        extractDomains();
    }, 5000);

    setInterval(function() {
        checkAndCleanExpiredAccounts();
    }, 60000);

    setInterval(function() {
        exec("df -h / | awk 'NR==2 {print $5}'", function(err, stdout) {
            if (!err && stdout.trim()) cachedDiskUsage = stdout.trim();
        });

        exec("netstat -anp 2>/dev/null | grep dropbear | grep ESTABLISHED | awk '{print $5}' | cut -d: -f1 | sort -u", function(err, stdout) {
            if (!err && stdout.trim()) {
                const ipLines = stdout.trim().split("\n").filter(Boolean);
                if (ipLines.length > 0) {
                    cachedSshOnline = ipLines.length + " User";
                    cachedUserListDetails = "IP Active: " + ipLines.join(", ");
                } else {
                    cachedSshOnline = "0 User";
                    cachedUserListDetails = "Semua user offline";
                }
            } else {
                cachedSshOnline = "0 User";
                cachedUserListDetails = "Semua user offline";
            }
        });
    }, 4000);
});
let adminToken = localStorage.getItem("admin_session_token") || "";
let savedUsersData = []; 
let savedV2rayUsersData = [];
let isPassConfigured = false;
let railwayDomainStored = "";

function copyToClipboard(textToCopy, onSuccess) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(textToCopy)
            .then(function() { if (onSuccess) onSuccess(); })
            .catch(function() { fallbackCopyText(textToCopy, onSuccess); });
    } else {
        fallbackCopyText(textToCopy, onSuccess);
    }
}

function fallbackCopyText(text, onSuccess) {
    var textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "-9999px";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        var successful = document.execCommand('copy');
        if (successful && onSuccess) onSuccess();
    } catch (err) {
        alert("Browser tidak mendukung copy otomatis!");
    }
    document.body.removeChild(textArea);
}

function toBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

function toggleSidebar() {
    var sb = document.getElementById('sidebar');
    var ov = document.getElementById('sidebar-overlay');
    if (sb) sb.classList.toggle('active');
    if (ov) ov.classList.toggle('active');
}

async function switchPage(pageId, evt) {
    var adminOnlyPages = ['page-buat-ssh', 'page-buat-v2ray', 'page-set-ssh', 'page-set-v2ray', 'page-set-cfip', 'page-generator'];
    if (adminOnlyPages.indexOf(pageId) !== -1 && !adminToken) {
        alert("Akses Terkunci! Silakan Login Admin terlebih dahulu.");
        var loggedIn = await handleAdminAuthBtn();
        if (!loggedIn && !adminToken) return;
    }

    document.querySelectorAll('.page-section').forEach(function(page) {
        page.classList.remove('active');
    });
    var target = document.getElementById(pageId);
    if (target) target.classList.add('active');

    document.querySelectorAll('.menu-item').forEach(function(item) {
        item.classList.remove('active');
    });
    
    if (evt && evt.currentTarget) {
        evt.currentTarget.classList.add('active');
    }

    var sb = document.getElementById('sidebar');
    var ov = document.getElementById('sidebar-overlay');
    if (sb) sb.classList.remove('active');
    if (ov) ov.classList.remove('active');
}

function checkAdminUI() {
    var indicator = document.getElementById('admin-indicator'); 
    var indicatorV2 = document.getElementById('admin-indicator-v2ray');
    var loginBtn = document.getElementById('admin-login-btn');
    var changePassBtn = document.getElementById('btn-change-pass');
    if (!loginBtn) return;

    if (!isPassConfigured) {
        loginBtn.innerText = "SETUP PASS";
        loginBtn.style.background = "#f8fafc";
        loginBtn.style.color = "#334155";
        if (changePassBtn) changePassBtn.style.display = "none";
        document.querySelectorAll('.admin-only-menu').forEach(function(el) { el.style.display = "none"; });
    } else if (adminToken) {
        if (indicator) {
            indicator.innerText = "ADMIN ONLY";
            indicator.style.color = "#0284c7";
            indicator.style.background = "#f0f9ff";
        }
        if (indicatorV2) {
            indicatorV2.innerText = "ADMIN ONLY";
            indicatorV2.style.color = "#0284c7";
            indicatorV2.style.background = "#f0f9ff";
        }
        loginBtn.innerText = "LOGOUT";
        loginBtn.style.background = "#fef2f2";
        loginBtn.style.color = "#dc2626";
        if (changePassBtn) changePassBtn.style.display = "inline";
        document.querySelectorAll('.admin-only-menu').forEach(function(el) { el.style.display = "block"; });
        document.querySelectorAll('.btn-del').forEach(function(b) { b.style.display = "inline-block"; }); 
        document.querySelectorAll('.btn-info').forEach(function(b) { b.style.display = "inline-block"; });
    } else {
        if (indicator) {
            indicator.innerText = "LOCKED (ADMIN)";
            indicator.style.color = "#dc2626";
            indicator.style.background = "#fef2f2";
        }
        if (indicatorV2) {
            indicatorV2.innerText = "LOCKED (ADMIN)";
            indicatorV2.style.color = "#dc2626";
            indicatorV2.style.background = "#fef2f2";
        }
        loginBtn.innerText = "LOGIN ADMIN";
        loginBtn.style.background = "#f8fafc";
        loginBtn.style.color = "#334155";
        if (changePassBtn) changePassBtn.style.display = "none";
        document.querySelectorAll('.admin-only-menu').forEach(function(el) { el.style.display = "none"; });
        document.querySelectorAll('.btn-del').forEach(function(b) { b.style.display = "none"; }); 
        document.querySelectorAll('.btn-info').forEach(function(b) { b.style.display = "none"; });

        var currentActivePage = document.querySelector('.page-section.active');
        if (currentActivePage && currentActivePage.id !== 'page-dashboard') {
            document.querySelectorAll('.page-section').forEach(function(p) { p.classList.remove('active'); });
            document.getElementById('page-dashboard').classList.add('active');
        }
    }
}

function toggleDnsPlaceholder() { toggleCustomDnsInput(); }

function toggleCustomDnsInput() {
    var sel = document.getElementById('dnsDropdown');
    var inp = document.getElementById('customDnsInput');
    if (sel && inp) inp.style.display = (sel.value === 'custom') ? 'block' : 'none';
}

function toggleCustomWsPortInput() {
    var sel = document.getElementById('wsPortDropdown');
    var inp = document.getElementById('wsPortInput');
    if (sel && inp) inp.style.display = (sel.value === 'custom') ? 'block' : 'none';
}

function toggleCustomWsKeepInput() {
    var sel = document.getElementById('wsKeepDropdown');
    var inp = document.getElementById('wsKeepInput');
    if (sel && inp) inp.style.display = (sel.value === 'custom') ? 'block' : 'none';
}

function toggleCustomWsBufInput() {
    var sel = document.getElementById('wsBufDropdown');
    var inp = document.getElementById('wsBufInput');
    if (sel && inp) inp.style.display = (sel.value === 'custom') ? 'block' : 'none';
}

async function handleAdminAuthBtn() {
    if (!isPassConfigured) {
        var newP = prompt("KREASI PASSWORD ADMIN PERTAMA KALI:\nMasukkan Password Admin Baru (Min. 4 karakter):");
        if (!newP) return false;
        try {
            var res = await fetch('/api/setup-pass?pass=' + encodeURIComponent(newP));
            var data = await res.json();
            alert(data.message);
            if (data.status === "success") { 
                adminToken = newP; 
                localStorage.setItem("admin_session_token", adminToken); 
                isPassConfigured = true;
                checkAdminUI();
                updateStats(); 
                fetchAccounts();
                fetchV2rayAccounts();
                fetchServerInfo();
                return true;
            }
        } catch(e) { alert("Gagal membuat password!"); }
        return false;
    }

    if (adminToken) { 
        localStorage.removeItem("admin_session_token"); 
        adminToken = ""; 
        document.getElementById('uuidInput').value = "";
        checkAdminUI(); 
        fetchAccounts(); 
        fetchV2rayAccounts();
        return false; 
    }
    
    var pass = prompt("Masukkan Password Admin:");
    if (!pass) return false;
    try {
        var res2 = await fetch('/api/login?pass=' + encodeURIComponent(pass)); 
        var data2 = await res2.json();
        if (data2.status === "success") { 
            adminToken = data2.token; 
            localStorage.setItem("admin_session_token", adminToken); 
            checkAdminUI(); 
            fetchAccounts(); 
            fetchV2rayAccounts();
            fetchServerInfo();
            return true;
        } else { 
            alert(data2.message); 
        }
    } catch(e) { alert("Gagal terhubung ke server!"); }
    return false;
}

async function changeAdminPassUI() {
    if (!adminToken) return;
    var newP = prompt("GANTI PASSWORD ADMIN:\nMasukkan Password Admin Baru:");
    if (!newP) return;
    try {
        var res = await fetch('/api/setup-pass?old_pass=' + encodeURIComponent(adminToken) + '&pass=' + encodeURIComponent(newP));
        var data = await res.json();
        alert(data.message);
        if (data.status === "success") { 
            adminToken = newP; 
            localStorage.setItem("admin_session_token", adminToken); 
            checkAdminUI(); 
        }
    } catch(e) { alert("Gagal mengupdate password!"); }
}

async function saveDnsNetworkSetting() {
    if (!adminToken) {
        alert("Akses Ditolak! Anda harus Login Admin terlebih dahulu.");
        var loggedIn = await handleAdminAuthBtn();
        if (!loggedIn && !adminToken) return;
    }

    var dnsType = document.getElementById('dnsTypeSelect').value;
    var selDns = document.getElementById('dnsDropdown').value;
    var customDns = (selDns === 'custom') ? document.getElementById('customDnsInput').value.trim() : selDns;
    var engine = document.getElementById('engineSelect').value;

    if (!customDns) customDns = "1.1.1.1";

    try {
        var res = await fetch('/api/set-network?pass=' + encodeURIComponent(adminToken) + '&dns_type=' + dnsType + '&custom_dns=' + encodeURIComponent(customDns) + '&engine=' + engine);
        var data = await res.json();
        alert(data.message);
        if (data.status === "success") updateStats();
    } catch(e) { alert("Gagal menyimpan konfigurasi ke backend!"); }
}

async function saveWsProxySettingUI() {
    if (!adminToken) {
        alert("Akses Ditolak! Anda harus Login Admin terlebih dahulu.");
        var loggedIn = await handleAdminAuthBtn();
        if (!loggedIn && !adminToken) return;
    }

    var selPort = document.getElementById('wsPortDropdown').value;
    var port = (selPort === 'custom') ? document.getElementById('wsPortInput').value.trim() : selPort;

    var selKeep = document.getElementById('wsKeepDropdown').value;
    var keep = (selKeep === 'custom') ? document.getElementById('wsKeepInput').value.trim() : selKeep;

    var selBuf = document.getElementById('wsBufDropdown').value;
    var buf = (selBuf === 'custom') ? document.getElementById('wsBufInput').value.trim() : selBuf;

    var banner = document.getElementById('bannerInput').value.trim();
    var bbr = document.getElementById('bbrSelect').value;
    var udpgw = document.getElementById('udpgwPortSelect').value;

    if (!port) port = "22";
    if (!keep) keep = "15000";
    if (!buf) buf = "32768";

    try {
        var res1 = await fetch('/api/set-wsproxy?pass=' + encodeURIComponent(adminToken) + '&ssh_port=' + port + '&keep_alive=' + keep + '&max_buffer=' + buf);
        var data1 = await res1.json();

        var res2 = await fetch('/api/set-system?pass=' + encodeURIComponent(adminToken) + '&banner=' + encodeURIComponent(banner) + '&enable_bbr=' + bbr + '&udpgw_port=' + udpgw);
        var data2 = await res2.json();

        alert(data1.message + "\n" + data2.message);
        updateStats();
    } catch(e) { alert("Gagal memperbarui SSH Config!"); }
}

async function promptSingleTokenInput() {
    if (!adminToken) {
        alert("Akses Ditolak! Anda harus Login Admin terlebih dahulu.");
        var loggedIn = await handleAdminAuthBtn();
        if (!loggedIn && !adminToken) return;
    }

    var inputToken = prompt("MASUKKAN TOKEN CLOUDFLARE ARGO:\n\n(Kosongkan lalu klik OK jika ingin menghapus token tersimpan)");
    if (inputToken === null) return;

    try {
        var res = await fetch('/api/set-token?pass=' + encodeURIComponent(adminToken) + '&token=' + encodeURIComponent(inputToken.trim()));
        var data = await res.json();
        alert(data.message);
        updateStats();
    } catch(e) { alert("Gagal memperbarui token!"); }
}

async function promptCfipInput() {
    if (!adminToken) {
        alert("Akses Ditolak! Anda harus Login Admin terlebih dahulu.");
        var loggedIn = await handleAdminAuthBtn();
        if (!loggedIn && !adminToken) return;
    }

    var inputIp = prompt("MASUKKAN IP CLEAN CLOUDFLARE (CFIP):\nContoh: 104.17.3.81\n\n(Kosongkan untuk reset ke default)");
    if (inputIp === null) return;

    try {
        var res = await fetch('/api/set-cfip?pass=' + encodeURIComponent(adminToken) + '&ip=' + encodeURIComponent(inputIp.trim()));
        var data = await res.json();
        alert(data.message);
        updateStats();
    } catch(e) { alert("Gagal memperbarui CFIP!"); }
}

async function updateStats() {
    try {
        var res = await fetch('/api/stats'); 
        var data = await res.json();
        isPassConfigured = data.pass_configured;
        checkAdminUI();

        document.getElementById('cpu').innerText = data.cpu_model || "N/A"; 
        document.getElementById('ram').innerText = (data.ram_used || "0") + " / " + (data.ram_total || "0"); 
        document.getElementById('disk').innerText = data.disk_usage || "0%"; 
        document.getElementById('uptime').innerText = data.uptime || "0 Hours";
        var detailActiveList = data.user_list_details || "Semua user offline";
        document.getElementById('ssh').innerHTML = (data.ssh_online || "0") + " Active<br><span style='font-size:9px; font-weight:normal; color:#64748b; display:block; margin-top:2px; white-space:pre-line;'>" + detailActiveList + "</span>";
        document.getElementById('display-cfip').innerText = data.active_cfip || "Default";

        if (data.dns_type) {
            document.getElementById('dnsTypeSelect').value = data.dns_type;
            document.getElementById('display-dns').innerText = (data.dns_type + " (" + (data.custom_dns || "1.1.1.1") + ")").toUpperCase();
        }
        if (data.custom_dns) {
            var dropdown = document.getElementById('dnsDropdown');
            var found = Array.from(dropdown.options).some(function(opt) { return opt.value === data.custom_dns; });
            if (found) {
                dropdown.value = data.custom_dns;
            } else {
                dropdown.value = 'custom';
                document.getElementById('customDnsInput').value = data.custom_dns;
            }
            toggleCustomDnsInput();
        }
        if (data.engine_mode) {
            document.getElementById('engineSelect').value = data.engine_mode;
            document.getElementById('display-engine').innerText = data.engine_mode.toUpperCase();
        }
        if (data.ws_proxy_cfg) {
            var pDrop = document.getElementById('wsPortDropdown');
            var foundP = Array.from(pDrop.options).some(function(opt) { return opt.value == data.ws_proxy_cfg.sshPort; });
            if (foundP) { pDrop.value = data.ws_proxy_cfg.sshPort; } else { pDrop.value = 'custom'; document.getElementById('wsPortInput').value = data.ws_proxy_cfg.sshPort; }
            toggleCustomWsPortInput();

            var kDrop = document.getElementById('wsKeepDropdown');
            var foundK = Array.from(kDrop.options).some(function(opt) { return opt.value == data.ws_proxy_cfg.keepAlive; });
            if (foundK) { kDrop.value = data.ws_proxy_cfg.keepAlive; } else { kDrop.value = 'custom'; document.getElementById('wsKeepInput').value = data.ws_proxy_cfg.keepAlive; }
            toggleCustomWsKeepInput();

            var bDrop = document.getElementById('wsBufDropdown');
            var foundB = Array.from(bDrop.options).some(function(opt) { return opt.value == data.ws_proxy_cfg.maxBuffer; });
            if (foundB) { bDrop.value = data.ws_proxy_cfg.maxBuffer; } else { bDrop.value = 'custom'; document.getElementById('wsBufInput').value = data.ws_proxy_cfg.maxBuffer; }
            toggleCustomWsBufInput();

            document.getElementById('display-ws-port').innerText = data.ws_proxy_cfg.sshPort;
            document.getElementById('display-ws-keep').innerText = (data.ws_proxy_cfg.keepAlive || 15000) + "ms";
        }

        if (data.sys_settings) {
            if (data.sys_settings.banner) document.getElementById('bannerInput').value = data.sys_settings.banner;
            if (data.sys_settings.enable_bbr) document.getElementById('bbrSelect').value = data.sys_settings.enable_bbr;
            if (data.sys_settings.udpgw_port) document.getElementById('udpgwPortSelect').value = data.sys_settings.udpgw_port;

            document.getElementById('display-bbr').innerText = (data.sys_settings.enable_bbr === "true") ? "ON" : "OFF";
            document.getElementById('display-udpgw').innerText = data.sys_settings.udpgw_port || "7300";
        }

        var ztContainer = document.getElementById('zt-container');
        if (data.zt_domains && data.zt_domains.length > 1) {
            var dropdownHtml = '<select id="named-url" class="select-zt-mini" onmousedown="event.stopPropagation()">';
            data.zt_domains.forEach(function(item) { dropdownHtml += '<option value="' + item.domain + '">' + item.domain + ' (' + item.port + ')</option>'; });
            dropdownHtml += '</select>';
            ztContainer.innerHTML = dropdownHtml;
        } else if (data.zt_domains && data.zt_domains.length === 1) {
            ztContainer.innerHTML = '<div class="url-box" id="named-url">' + data.zt_domains[0].domain + '</div>';
        } else {
            ztContainer.innerHTML = '<div class="url-box" id="named-url">Menghubungkan...</div>';
        }

        var ztVmessContainer = document.getElementById('zt-vmess-container');
        if (data.zt_vmess_domains && data.zt_vmess_domains.length > 1) {
            var dropdownVmessHtml = '<select id="vmess-named-url" class="select-zt-mini" onmousedown="event.stopPropagation()">';
            data.zt_vmess_domains.forEach(function(item) { dropdownVmessHtml += '<option value="' + item.domain + '">' + item.domain + ' (' + item.port + ')</option>'; });
            dropdownVmessHtml += '</select>';
            ztVmessContainer.innerHTML = dropdownVmessHtml;
        } else if (data.zt_vmess_domains && data.zt_vmess_domains.length === 1) {
            ztVmessContainer.innerHTML = '<div class="url-box" id="vmess-named-url">' + data.zt_vmess_domains[0].domain + '</div>';
        } else {
            ztVmessContainer.innerHTML = '<div class="url-box" id="vmess-named-url">Menghubungkan...</div>';
        }

        railwayDomainStored = data.railway_public && data.railway_public !== "Tidak Aktif" ? data.railway_public : "";
        document.getElementById('railway-url').innerText = data.railway_public || "Tidak Aktif"; 
        document.getElementById('sni-url').innerText = data.railway_sni || "Tidak Aktif"; 
        document.getElementById('quick-url').innerText = data.quick_url || "Menunggu Quick Tunnel...";

        var currentHostDomain = window.location.hostname;
        var domainSelect = document.getElementById('domainSelect');
        var currentSelected = domainSelect.value;
        var optionsHtml = '';

        if (currentHostDomain) {
            optionsHtml += '<option value="' + currentHostDomain + '">Domain Utama: ' + currentHostDomain + '</option>';
        }
        if (railwayDomainStored && railwayDomainStored !== currentHostDomain) {
            optionsHtml += '<option value="' + railwayDomainStored + '">Railway Reality: ' + railwayDomainStored + '</option>';
        }
        if (data.quick_url && !data.quick_url.includes("Menunggu")) {
            optionsHtml += '<option value="' + data.quick_url + '">Quick Tunnel: ' + data.quick_url + '</option>';
        }
        if (data.zt_vmess_domains && data.zt_vmess_domains.length > 0) {
            data.zt_vmess_domains.forEach(function(d) {
                optionsHtml += '<option value="' + d.domain + '">Zero Argo: ' + d.domain + '</option>';
            });
        }
        if (!optionsHtml) {
            optionsHtml = '<option value="">-- Menunggu Domain --</option>';
        }

        domainSelect.innerHTML = optionsHtml;
        if (currentSelected) domainSelect.value = currentSelected;
    } catch(e) {
        console.error("Gagal memuat stats:", e);
    }
}

async function fetchAccounts() {
    var tbody = document.getElementById('ssh-table-body'); 
    if (!tbody) return;
    if (!adminToken) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#dc2626; font-weight:bold;">Login Admin untuk melihat & mengelola akun SSH</td></tr>';
        return;
    }

    try {
        var res = await fetch('/api/list?token=' + encodeURIComponent(adminToken)); 
        var data = await res.json(); 
        tbody.innerHTML = "";
        
        if (data.status === "success" && data.users.length > 0) {
            savedUsersData = data.users; 
            data.users.forEach(function(u) {
                var expBadge = u.exp_date || "Unlimited";
                tbody.innerHTML += '<tr><td style="font-weight:bold; color:#0f172a;">'+u.username+'</td><td style="color:#0284c7; font-size:11px; font-weight:600;">'+expBadge+'</td><td style="text-align: right;"><div class="btn-action-group"><button class="btn-info" onclick="showAccountDetails(\''+u.username+'\')">INFO</button><button class="btn-del" onclick="deleteAccount(\''+u.username+'\')">HAPUS</button></div></td></tr>';
            });
            checkAdminUI();
        } else { 
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#94a3b8;">Belum ada akun SSH kustom</td></tr>'; 
        }
    } catch(e) {}
}

function showAccountDetails(username) { 
    var userObj = savedUsersData.find(function(u) { return u.username === username; }); 
    if (userObj) { 
        alert("DATA AKUN SSH:\n===============================\nUsername   : " + userObj.username + "\nPassword   : " + userObj.password + "\nExpired    : " + (userObj.exp_date || "Unlimited") + "\nIP Address : " + userObj.ip); 
    } 
}

async function createAccount() {
    if (!adminToken) {
        alert("Akses Ditolak! Hanya Admin yang dapat membuat akun SSH.");
        var loggedIn = await handleAdminAuthBtn();
        if (!loggedIn && !adminToken) return;
    }

    var user = document.getElementById('ssh-user').value.trim(); 
    var pass = document.getElementById('ssh-pass').value.trim(); 
    var expEl = document.getElementById('ssh-exp');
    var exp = expEl ? expEl.value.trim() : "7";
    var msg = document.getElementById('ssh-msg'); 
    var resBox = document.getElementById('ssh-result'); 
    var copyBtn = document.getElementById('btn-copy-acc');

    if (!user || !pass) { 
        msg.style.color = "#dc2626"; 
        msg.innerText = "Isi username & password!"; 
        return; 
    }
    
    try {
        var res = await fetch('/api/add?user=' + encodeURIComponent(user) + '&pass=' + encodeURIComponent(pass) + '&exp=' + encodeURIComponent(exp || 7) + '&token=' + encodeURIComponent(adminToken)); 
        var data = await res.json();
        if (data.status === "success") { 
            msg.innerText = ""; 
            resBox.innerText = data.message; 
            resBox.style.display = "block"; 
            copyBtn.style.display = "block"; 
            document.getElementById('ssh-user').value = ""; 
            document.getElementById('ssh-pass').value = ""; 
            fetchAccounts(); 
        } else { 
            msg.style.color = "#dc2626"; 
            msg.innerText = data.message; 
            resBox.style.display = "none"; 
            copyBtn.style.display = "none"; 
        }
    } catch(e) { msg.innerText = "Gagal memproses API"; }
}

async function deleteAccount(username) {
    if (!adminToken) { alert("Aksi Ilegal! Login Admin dulu Bos!"); return; }
    if (confirm("Hapus akun SSH " + username + "?")) {
        try {
            var res = await fetch('/api/delete?user=' + encodeURIComponent(username) + '&token=' + encodeURIComponent(adminToken)); 
            var data = await res.json();
            if (data.status === "success") { fetchAccounts(); } else { alert(data.message); }
        } catch(e) {}
    }
}

async function fetchV2rayAccounts() {
    var tbody = document.getElementById('v2ray-table-body');
    if (!tbody) return;
    if (!adminToken) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#dc2626; font-weight:bold;">Login Admin untuk melihat & mengelola akun V2Ray</td></tr>';
        return;
    }

    try {
        var res = await fetch('/api/v2ray/list?token=' + encodeURIComponent(adminToken));
        var data = await res.json();
        tbody.innerHTML = "";

        if (data.status === "success" && data.users.length > 0) {
            savedV2rayUsersData = data.users;
            data.users.forEach(function(u) {
                var shortUuid = u.uuid.length > 12 ? u.uuid.substring(0, 8) + "..." : u.uuid;
                tbody.innerHTML += '<tr>' +
                    '<td style="font-weight:bold; color:#0f172a;">' + u.username + '</td>' +
                    '<td style="font-family:ui-monospace, monospace; font-size:10px; color:#475569;">' + shortUuid + '</td>' +
                    '<td style="color:#059669; font-size:11px; font-weight:600;">' + u.exp_date + '</td>' +
                    '<td style="text-align: right;"><div class="btn-action-group">' +
                    '<button class="btn-copy-mini" style="padding:3px 6px; font-size:9px;" onclick="useV2rayUuid(\'' + u.uuid + '\')">PAKAI UUID</button>' +
                    '<button class="btn-del" onclick="deleteV2rayAccount(\'' + u.username + '\')">HAPUS</button>' +
                    '</div></td></tr>';
            });
            checkAdminUI();
        } else {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Belum ada akun V2Ray tambahan</td></tr>';
        }
    } catch (e) {}
}

async function createV2rayAccount() {
    if (!adminToken) {
        alert("Akses Ditolak! Hanya Admin yang dapat membuat akun V2Ray.");
        var loggedIn = await handleAdminAuthBtn();
        if (!loggedIn && !adminToken) return;
    }

    var user = document.getElementById('v2ray-user').value.trim();
    var customUuid = document.getElementById('v2ray-uuid').value.trim();
    var exp = document.getElementById('v2ray-exp').value.trim() || "7";
    var msg = document.getElementById('v2ray-msg');
    var resBox = document.getElementById('v2ray-result');
    var copyBtn = document.getElementById('btn-copy-v2ray');

    if (!user) {
        msg.style.color = "#dc2626";
        msg.innerText = "Username V2Ray wajib diisi!";
        return;
    }

    try {
        var res = await fetch('/api/v2ray/add?user=' + encodeURIComponent(user) + '&uuid=' + encodeURIComponent(customUuid) + '&exp=' + encodeURIComponent(exp) + '&token=' + encodeURIComponent(adminToken));
        var data = await res.json();
        if (data.status === "success") {
            msg.innerText = "";
            resBox.innerText = data.message;
            resBox.style.display = "block";
            copyBtn.style.display = "block";
            document.getElementById('v2ray-user').value = "";
            document.getElementById('v2ray-uuid').value = "";
            document.getElementById('uuidInput').value = data.uuid;
            fetchV2rayAccounts();
        } else {
            msg.style.color = "#dc2626";
            msg.innerText = data.message;
            resBox.style.display = "none";
            copyBtn.style.display = "none";
        }
    } catch (e) {
        msg.innerText = "Gagal menghubungi API V2Ray";
    }
}

async function deleteV2rayAccount(username) {
    if (!adminToken) { alert("Aksi Ilegal! Login Admin dulu Bos!"); return; }
    if (confirm("Hapus akun V2Ray " + username + "?")) {
        try {
            var res = await fetch('/api/v2ray/delete?user=' + encodeURIComponent(username) + '&token=' + encodeURIComponent(adminToken));
            var data = await res.json();
            if (data.status === "success") {
                fetchV2rayAccounts();
            } else {
                alert(data.message);
            }
        } catch (e) {}
    }
}

function useV2rayUuid(selectedUuid) {
    document.getElementById('uuidInput').value = selectedUuid;
    document.querySelectorAll('.page-section').forEach(function(p) { p.classList.remove('active'); });
    document.getElementById('page-generator').classList.add('active');
}

function copyV2rayAccountText() {
    var txt = document.getElementById('v2ray-result').innerText;
    copyToClipboard(txt, function() {
        var btn = document.getElementById('btn-copy-v2ray');
        btn.innerText = "COPIED!";
        setTimeout(function() { btn.innerText = "COPY DETAIL AKUN"; }, 1500);
    });
}

function copyTxt(elementId, btnId) {
    var elem = document.getElementById(elementId);
    if (!elem) return;
    var urlText = elem.tagName === "SELECT" ? elem.value : elem.innerText;
    
    if (!urlText.includes("Menunggu") && !urlText.includes("Tidak Aktif") && !urlText.includes("Loading")) {
        copyToClipboard(urlText, function() {
            var btn = document.getElementById(btnId);
            btn.innerText = "Done"; 
            btn.style.background = "#e2e8f0"; 
            btn.style.color = "#0284c7";
            setTimeout(function() { 
                btn.innerText = "Copy"; 
                btn.style.background = "#ffffff"; 
                btn.style.color = "#334155"; 
            }, 1500);
        });
    }
}

function copyAccountText() { 
    var txt = document.getElementById('ssh-result').innerText; 
    copyToClipboard(txt, function() {
        var btn = document.getElementById('btn-copy-acc'); 
        btn.innerText = "COPIED!"; 
        setTimeout(function() { btn.innerText = "COPY DETAIL AKUN"; }, 1500);
    });
}

function copyOutConfig() {
    var txt = document.getElementById('configText').innerText;
    copyToClipboard(txt, function() {
        alert('Config Berhasil Disalin!');
    });
}

function generateClashProxyOnly(protocol, targetConnect, selectedPort, uuid, targetSni, targetWsHost, finalPath, remark) {
    var isTls = selectedPort === "443";
    var lines = ["proxies:"];
    lines.push('  - name: "' + remark + '"');
    lines.push('    type: ' + protocol);
    lines.push('    server: ' + targetConnect);
    lines.push('    port: ' + parseInt(selectedPort, 10));
    if (protocol === 'trojan') {
        lines.push('    password: ' + uuid);
        lines.push('    udp: true');
        lines.push('    sni: ' + targetSni);
    } else {
        lines.push('    uuid: ' + uuid);
        if (protocol === 'vmess') {
            lines.push('    alterId: 0');
            lines.push('    cipher: auto');
        }
        lines.push('    udp: true');
        lines.push('    tls: ' + isTls);
        lines.push('    servername: ' + targetSni);
    }
    lines.push('    skip-cert-verify: true');
    lines.push('    network: ws');
    lines.push('    ws-opts:');
    lines.push('      path: "' + finalPath + '"');
    lines.push('      headers:');
    lines.push('        Host: ' + targetWsHost);
    return lines.join('\n');
}

function generateClashMihomo(protocol, targetConnect, selectedPort, uuid, targetSni, targetWsHost, finalPath, remark) {
    var proxyYaml = generateClashProxyOnly(protocol, targetConnect, selectedPort, uuid, targetSni, targetWsHost, finalPath, remark);
    var head = [
        "mixed-port: 7890",
        "allow-lan: true",
        "mode: rule",
        "log-level: info",
        "ipv6: false",
        "",
        "dns:",
        "  enable: true",
        "  enhanced-mode: fake-ip",
        "  nameserver:",
        "    - 1.1.1.1",
        "    - 8.8.8.8",
        "",
        proxyYaml,
        "",
        "proxy-groups:",
        "  - name: PROXY",
        "    type: select",
        "    proxies:",
        '      - "' + remark + '"',
        "      - DIRECT",
        "",
        "rules:",
        "  - GEOIP,LAN,DIRECT",
        "  - MATCH,PROXY"
    ];
    return head.join('\n');
}

function generateSingBoxJson(protocol, targetConnect, selectedPort, uuid, targetSni, targetWsHost, finalPath, remark) {
    var isTls = selectedPort === "443";
    var outboundObj = {
        type: protocol,
        tag: remark,
        server: targetConnect,
        server_port: parseInt(selectedPort, 10),
        transport: {
            type: "ws",
            path: finalPath,
            headers: { Host: targetWsHost }
        }
    };

    if (protocol === 'vless' || protocol === 'vmess') {
        outboundObj.uuid = uuid;
    } else if (protocol === 'trojan') {
        outboundObj.password = uuid;
    }

    if (isTls) {
        outboundObj.tls = {
            enabled: true,
            server_name: targetSni,
            insecure: true
        };
    }

    var fullConfig = {
        log: { level: "info" },
        inbounds: [{ type: "mixed", tag: "mixed-in", listen: "127.0.0.1", listen_port: 2080 }],
        outbounds: [outboundObj, { type: "direct", tag: "direct" }],
        route: { auto_detect_interface: true }
    };

    return JSON.stringify(fullConfig, null, 2);
}

async function fetchServerInfo() {
    try {
        var response = await fetch('/__info?token=' + encodeURIComponent(adminToken));
        if (!response.ok) return;
        var data = await response.json();
        if (data.uuid) document.getElementById('uuidInput').value = data.uuid;
        window.serverActivePaths = data.paths;
    } catch (e) {}
}

function buildRealityConfig(protocol, evt) {
    if (!adminToken) { alert("Silakan Login Admin terlebih dahulu!"); return; }
    document.querySelectorAll('.btn-blue').forEach(function(b) { b.classList.remove('btn-active'); });
    if (evt && evt.target) evt.target.classList.add('btn-active');

    var uuid = document.getElementById('uuidInput').value.trim();
    if (!uuid || uuid === "Loading...") {
        alert("UUID masih kosong! Buat/pilih akun V2Ray terlebih dahulu.");
        return;
    }
    var targetHost = railwayDomainStored || document.getElementById('domainSelect').value.trim();
    targetHost = targetHost.replace(/^https?:\/\//, '').replace(/\/$/, '');
    var bugHost = document.getElementById('bugInput').value.trim() || 'v.whatsapp.net';
    
    var pathsMapping = window.serverActivePaths || { vless: '/vless-argo', vmess: '/vmess-argo', trojan: '/trojan-argo' };
    var basePath = pathsMapping[protocol] || '/' + protocol + '-argo';

    var area = document.getElementById('output-area');
    var label = document.getElementById('out-type');
    var txt = document.getElementById('configText');

    var protoLabel = (protocol === 'vless' ? 'VLESS' : (protocol === 'vmess' ? 'VMESS' : 'TROJAN'));
    var remark = 'REALITY-' + protoLabel + '-' + targetHost;

    var uriLink = '';
    if (protocol === 'vless') {
        uriLink = 'vless://' + uuid + '@' + targetHost + ':443?encryption=none&security=tls&sni=' + bugHost + '&fp=firefox&type=ws&host=' + targetHost + '&path=' + encodeURIComponent(basePath) + '#' + encodeURIComponent(remark);
    } else if (protocol === 'vmess') {
        var vmessObj = { v: "2", ps: remark, add: targetHost, port: "443", id: uuid, aid: "0", scy: "auto", net: "ws", type: "none", host: targetHost, path: basePath, tls: "tls", sni: bugHost, fp: "chrome" };
        uriLink = 'vmess://' + toBase64(JSON.stringify(vmessObj));
    } else {
        uriLink = 'trojan://' + uuid + '@' + targetHost + ':443?security=tls&sni=' + bugHost + '&type=ws&host=' + targetHost + '&path=' + encodeURIComponent(basePath) + '#' + encodeURIComponent(remark);
    }

    label.innerText = 'REALITY ' + protoLabel;
    txt.innerText = uriLink;
    area.style.display = 'block';
}

function buildConfig(protocol, type, evt) {
    if (!adminToken) { alert("Silakan Login Admin terlebih dahulu!"); return; }
    document.querySelectorAll('.btn-blue').forEach(function(b) { b.classList.remove('btn-active'); });
    if (evt && evt.target) evt.target.classList.add('btn-active');
    
    var uuid = document.getElementById('uuidInput').value.trim();
    if (!uuid || uuid === "Loading...") {
        alert("UUID masih kosong! Buat/pilih akun V2Ray terlebih dahulu.");
        return;
    }
    var hostSelect = document.getElementById('domainSelect');
    var host = hostSelect.value.trim().replace(/^https?:\/\//, '').replace(/\/$/, ''); 
    var bugHost = document.getElementById('bugInput').value.trim() || host; 
    var engine = document.getElementById('engineSelect').value;
    
    var selectedPort = document.getElementById('portSelect') ? document.getElementById('portSelect').value : "443";
    var selectedFormat = document.getElementById('formatSelect') ? document.getElementById('formatSelect').value : "standard";
    var isTls = selectedPort === "443";
    var securityMode = isTls ? "tls" : "none";
    var fpParam = isTls ? "&fp=chrome" : "";

    var area = document.getElementById('output-area');
    var label = document.getElementById('out-type');
    var txt = document.getElementById('configText');

    if (!host || host.includes("Menunggu")) {
        alert("Domain Tunnel belum siap / belum dipilih!");
        return;
    }

    var pathsMapping = window.serverActivePaths || { vless: '/vless-argo', vmess: '/vmess-argo', trojan: '/trojan-argo' };
    var basePath = pathsMapping[protocol] || '/' + protocol + '-argo';
    
    var remark = 'DDFATHU-' + protocol.toUpperCase() + '-' + type.toUpperCase() + '-' + selectedPort;
    var configResult = '';

    var netType = engine;
    var targetConnect = (type === 'sni') ? bugHost : host;
    var targetSni = (type === 'sni_reverse') ? bugHost : host;
    var targetWsHost = (type === 'sni_reverse') ? bugHost : host;
    var finalPath = (type === 'cdn') ? ('/' + bugHost + basePath) : basePath;

    if (selectedFormat === 'clash_proxy') {
        label.innerText = remark + ' (CLASH PROXY)';
        configResult = generateClashProxyOnly(protocol, targetConnect, selectedPort, uuid, targetSni, targetWsHost, finalPath, remark);
    } 
    else if (selectedFormat === 'clash_mihomo') {
        label.innerText = remark + ' (CLASH MIHOMO)';
        configResult = generateClashMihomo(protocol, targetConnect, selectedPort, uuid, targetSni, targetWsHost, finalPath, remark);
    } 
    else if (selectedFormat === 'singbox') {
        label.innerText = remark + ' (SINGBOX JSON)';
        configResult = generateSingBoxJson(protocol, targetConnect, selectedPort, uuid, targetSni, targetWsHost, finalPath, remark);
    } 
    else {
        label.innerText = remark;
        if (protocol === 'vless') {
            var q = '?encryption=none&security=' + securityMode;
            if (isTls) q += '&sni=' + targetSni + fpParam;
            q += '&type=' + netType;
            if (netType === 'ws') q += '&host=' + targetWsHost + '&path=' + encodeURIComponent(finalPath);
            
            configResult = 'vless://' + uuid + '@' + targetConnect + ':' + selectedPort + q + '#' + encodeURIComponent(remark);
        } 
        else if (protocol === 'vmess') {
            var jsonVmess = {
                v: "2", ps: remark, add: targetConnect, port: selectedPort, id: uuid, aid: "0",
                scy: "auto", net: netType, type: "none", host: targetWsHost, path: finalPath,
                tls: isTls ? "tls" : "", sni: isTls ? targetSni : "", fp: isTls ? "chrome" : ""
            };
            configResult = 'vmess://' + toBase64(JSON.stringify(jsonVmess));
        } 
        else if (protocol === 'trojan') {
            var q2 = '?security=' + securityMode;
            if (isTls) q2 += '&sni=' + targetSni + fpParam;
            q2 += '&type=' + netType;
            if (netType === 'ws') q2 += '&host=' + targetWsHost + '&path=' + encodeURIComponent(finalPath);
            
            configResult = 'trojan://' + uuid + '@' + targetConnect + ':' + selectedPort + q2 + '#' + encodeURIComponent(remark);
        }
    }

    txt.innerText = configResult;
    area.style.display = 'block';
}

setInterval(updateStats, 15000); 
updateStats(); 
fetchAccounts();
fetchV2rayAccounts();
fetchServerInfo();

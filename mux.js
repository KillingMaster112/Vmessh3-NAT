const net = require('net');

const PUBLIC_PORT = parseInt(process.env.MUX_PORT || '20682', 10); 
const SSL_TARGET = parseInt(process.env.SSL_TARGET_PORT || '2443', 10);
const WS_TARGET = parseInt(process.env.WS_TARGET_PORT || '8880', 10);

const server = net.createServer(function(clientConn) {
    clientConn.setNoDelay(true);
    clientConn.setKeepAlive(true, 15000);
    clientConn.readableHighWaterMark = 64 * 1024;
    clientConn.writableHighWaterMark = 64 * 1024;

    let backendConn = null;
    let isConnected = false;
    const earlyBuffer = [];

    const handleInitialData = function(buffer) {
        if (!buffer || buffer.length === 0) return;

        clientConn.removeListener('data', handleInitialData);

        // 0x16 = Handshake TLS/SSL -> Stunnel (2443), selain itu -> WS-Proxy (8880)
        const targetPort = (buffer[0] === 0x16) ? SSL_TARGET : WS_TARGET;

        backendConn = net.createConnection({ port: targetPort, host: '127.0.0.1' }, function() {
            isConnected = true;
            backendConn.setNoDelay(true);
            backendConn.setKeepAlive(true, 15000);

            backendConn.write(buffer);

            while (earlyBuffer.length > 0) {
                const chunk = earlyBuffer.shift();
                backendConn.write(chunk);
            }
        });

        clientConn.on('data', function(data) {
            if (isConnected && backendConn && backendConn.writable) {
                const flush = backendConn.write(data);
                if (!flush) clientConn.pause();
            } else {
                earlyBuffer.push(data);
            }
        });

        backendConn.on('data', function(data) {
            if (clientConn.writable) {
                const flush = clientConn.write(data);
                if (!flush) backendConn.pause();
            }
        });

        backendConn.on('drain', function() { clientConn.resume(); });
        clientConn.on('drain', function() { backendConn.resume(); });

        backendConn.on('error', function() { clientConn.destroy(); });
        clientConn.on('error', function() { if (backendConn) backendConn.destroy(); });
        backendConn.on('close', function() { clientConn.destroy(); });
        clientConn.on('close', function() { if (backendConn) backendConn.destroy(); });
    };

    clientConn.on('data', handleInitialData);
});

server.listen(PUBLIC_PORT, '0.0.0.0', function() {
    console.log('[Mux JS] Pure Traffic Splitter Active on Port ' + PUBLIC_PORT);
});
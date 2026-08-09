#!/bin/sh
mkdir -p /etc/nginx/certs

if [ ! -f /etc/nginx/certs/cert.pem ]; then
    echo "🔑 Generating 2048-bit self-signed TLS certificates for local HTTPS..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /etc/nginx/certs/key.pem \
        -out /etc/nginx/certs/cert.pem \
        -subj "/C=US/ST=State/L=City/O=LegalBot Enterprise/CN=localhost"
    echo "✅ Certificates created in /etc/nginx/certs/"
fi

exec nginx -g "daemon off;"

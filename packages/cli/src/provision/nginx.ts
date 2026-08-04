export const renderNginxBlock = (
  domain: string,
  port: number,
): string => `# Declared here, not globally: conf.d is inside http{}, and every
# project on the host shares one namespace — hence the port in the names.
map $http_upgrade $conn_upgrade_${port} {
    default upgrade;
    ''      "";
}

limit_req_zone $binary_remote_addr zone=perip_${port}:10m rate=30r/s;

limit_req_zone $binary_remote_addr zone=assets_${port}:10m rate=100r/s;

upstream app_${port} {
    server 127.0.0.1:${port};
    keepalive 16;
}

server {
    listen      80;
    listen      [::]:80;
    server_name ${domain};

    server_tokens off;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen      443 ssl http2;
    listen      [::]:443 ssl http2;
    server_name ${domain};

    server_tokens off;

    ssl_certificate     /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Any location that sets its own add_header drops all of these.
    # No includeSubDomains: a 3-label name can still be an apex (co.uk), and
    # guessing wrong pins the zone for two years. Add it by hand if it applies.
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Content-Type-Options    "nosniff"                         always;
    add_header X-Frame-Options           "SAMEORIGIN"                      always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy        "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()" always;
    add_header Cross-Origin-Opener-Policy        "same-origin-allow-popups" always;
    add_header Cross-Origin-Resource-Policy      "same-origin"              always;
    add_header X-Permitted-Cross-Domain-Policies "none"                     always;

    client_max_body_size 25m;

    # In server{}: on http{} level a second project would duplicate it.
    limit_req_status 429;

    proxy_connect_timeout 10s;
    proxy_send_timeout    60s;
    proxy_read_timeout    120s;

    proxy_http_version 1.1;
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection $conn_upgrade_${port};
    proxy_set_header Host            $host;
    proxy_set_header X-Real-IP       $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-Host  $host;

    access_log /var/log/nginx/${domain}.access.log;
    error_log  /var/log/nginx/${domain}.error.log warn;

    # Off so SSR streams; the asset locations below turn it back on.
    proxy_buffering off;

    location /_next/static/ {
        proxy_buffering on;
        # No add_header here — one would drop every header set above.
        proxy_pass http://app_${port};
    }

    # Sibling of /_next/static/, not a child — would otherwise hit location /.
    location /_next/image {
        limit_req zone=assets_${port} burst=100 nodelay;
        proxy_buffering on;
        proxy_pass http://app_${port};
    }

    location / {
        limit_req zone=perip_${port} burst=60 nodelay;
        proxy_pass http://app_${port};
    }
}
`;

/** Every `server_name` of a conf's first matching directive, comments stripped. */
export const extractServerNames = (conf: string): string[] =>
  conf
    .replace(/^\s*#.*$/gm, "")
    .match(/server_name\s+([^;]+);/)?.[1]
    ?.trim()
    .split(/\s+/)
    .filter((n) => n !== "_") ?? [];

/**
 * The single `server_name` of a conf, or undefined. Multi-name yields undefined
 * on purpose: this drives `certbot delete`, which must not act on a guess.
 */
export const extractServerName = (conf: string): string | undefined => {
  const names = extractServerNames(conf);
  return names.length === 1 ? names[0] : undefined;
};

/** The :80 block to serve certbot's webroot challenge before the cert exists. */
export const renderAcmeBootstrap = (domain: string): string => `server {
    listen      80;
    listen      [::]:80;
    server_name ${domain};

    server_tokens off;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 404;
    }
}
`;

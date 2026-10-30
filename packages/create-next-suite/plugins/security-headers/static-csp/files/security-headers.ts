const isDevelopment = process.env.NODE_ENV === "development";

const directives: Record<string, string[]> = {
  "default-src": [
    "'self'",
  ],
  "script-src": [
    "'self'",
    "'unsafe-inline'",
  ],
  "style-src": [
    "'self'",
    "'unsafe-inline'",
  ],
  "img-src": [
    "'self'",
    "blob:",
    "data:",
  ],
  "font-src": [
    "'self'",
  ],
  "object-src": [
    "'none'",
  ],
  "base-uri": [
    "'self'",
  ],
  "form-action": [
    "'self'",
  ],
  "frame-ancestors": [
    "'none'",
  ],
  "upgrade-insecure-requests": [
  ],
};

if (isDevelopment) {
  directives["script-src"]?.push("'unsafe-eval'");
}

const contentSecurityPolicy = Object.entries(directives)
  .map(([directive, sources]) => [directive, ...sources].join(" "))
  .join("; ");

export const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

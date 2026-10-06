export const getNginxConfPath = (name: string): string =>
  `/etc/nginx/conf.d/${name}.conf`;

export const getCertificateDirectory = (domain: string): string =>
  `/etc/letsencrypt/live/${domain}`;

export interface DeployTarget {
  name: string;
  user: string;
  path: string;
  host: string;
}

export const getDeployPath = (name: string): string => `/srv/www/${name}`;

export const resolveDeployTarget = (
  name: string,
  host: string,
): DeployTarget => ({
  name,
  user: name,
  path: getDeployPath(name),
  host,
});

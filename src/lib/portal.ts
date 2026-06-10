export type PortalKind = 'ednevnik' | 'ocjene' | 'ematica' | 'srednja' | 'fakulteti';
export type PortalAudience = 'staff' | 'student' | 'mixed';

export type PortalConfig = {
  kind: PortalKind;
  audience: PortalAudience;
  title: string;
  shortTitle: string;
  homePath: string;
};

const PORTAL_CONFIGS: Record<PortalKind, PortalConfig> = {
  ednevnik: {
    kind: 'ednevnik',
    audience: 'staff',
    title: 'e-Dnevnik',
    shortTitle: 'e-Dnevnik',
    homePath: '/',
  },
  ocjene: {
    kind: 'ocjene',
    audience: 'student',
    title: 'Ocjene',
    shortTitle: 'Ocjene',
    homePath: '/student/ocjene',
  },
  ematica: {
    kind: 'ematica',
    audience: 'staff',
    title: 'e-Matica',
    shortTitle: 'e-Matica',
    homePath: '/ematica',
  },
  srednja: {
    kind: 'srednja',
    audience: 'mixed',
    title: 'Upisi u srednje škole',
    shortTitle: 'Srednja',
    homePath: '/upisi/srednja',
  },
  fakulteti: {
    kind: 'fakulteti',
    audience: 'mixed',
    title: 'Upisi na fakultete',
    shortTitle: 'Fakulteti',
    homePath: '/upisi/fakulteti',
  },
};

function normalizeHost(hostname: string) {
  return String(hostname || '').trim().toLowerCase();
}

export function resolvePortalConfig(hostname?: string, envPortal?: string): PortalConfig {
  const host = normalizeHost(hostname ?? (typeof window !== 'undefined' ? window.location.hostname : ''));
  const env = String(envPortal ?? '').trim().toLowerCase();

  if (host.startsWith('e-matica.')) return PORTAL_CONFIGS.ematica;
  if (host.startsWith('srednja.')) return PORTAL_CONFIGS.srednja;
  if (host.startsWith('fakulteti.')) return PORTAL_CONFIGS.fakulteti;
  if (host.startsWith('ocjene.')) return PORTAL_CONFIGS.ocjene;
  if (host.startsWith('e-dnevnik.')) return PORTAL_CONFIGS.ednevnik;

  if (env === 'ematica') return PORTAL_CONFIGS.ematica;
  if (env === 'srednja') return PORTAL_CONFIGS.srednja;
  if (env === 'fakulteti') return PORTAL_CONFIGS.fakulteti;
  if (env === 'student' || env === 'ocjene') return PORTAL_CONFIGS.ocjene;
  if (env === 'staff' || env === 'ednevnik') return PORTAL_CONFIGS.ednevnik;

  return PORTAL_CONFIGS.ednevnik;
}

export function getPortalConfig(): PortalConfig {
  return resolvePortalConfig(
    typeof window !== 'undefined' ? window.location.hostname : '',
    import.meta.env.VITE_APP_PORTAL,
  );
}

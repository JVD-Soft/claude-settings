import { APP_CONFIG } from '@/config';

/**
 * schema.org builders.
 *
 * These are what turn a listing into a rich result — a plain `<title>` and
 * description never will. Every URL is absolute against `SITE_URL`, because a
 * relative one in JSON-LD is simply ignored.
 */

const absolute = (path: string) => `${APP_CONFIG.SITE_URL}${path}`;

export const organizationLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: APP_CONFIG.NAME,
  url: APP_CONFIG.SITE_URL,
  description: APP_CONFIG.DESCRIPTION,
  logo: absolute('/pwa-512x512.png'),
});

/**
 * Declares the site's search entry point, which is what makes a sitelinks
 * search box possible.
 *
 * PROJECT DECISION: `urlTemplate` must point at this project's real search
 * route and use its real query-parameter name. A template that does not
 * resolve is worse than no SearchAction at all — drop the whole
 * `potentialAction` if the project has no search page.
 */
export const webSiteLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: APP_CONFIG.NAME,
  url: APP_CONFIG.SITE_URL,
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${APP_CONFIG.SITE_URL}/?search={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
});

export const breadcrumbLd = (trail: { name: string; path: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: trail.map((crumb, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: crumb.name,
    item: absolute(crumb.path),
  })),
});

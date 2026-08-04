import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { APP_CONFIG } from '@/config';

interface MetaProps {
  title?: string;
  description?: string;
  /** Absolute URL. Falls back to the app icon, which is better than no card at all. */
  image?: string;
  /**
   * Keep the page out of the index. `Disallow` in robots.txt does **not** do
   * this — a disallowed URL can still be indexed from an external link, just
   * without its content. Only this tag removes it.
   */
  noindex?: boolean;
}

/**
 * Per-page document metadata.
 *
 * React 19 hoists `<title>`, `<meta>` and `<link>` into `<head>` from anywhere
 * in the tree, so this needs no provider and no library — react-helmet-async
 * was dropped because it never supported React 19.
 *
 * No `hreflang` alternates: both languages are served from the same URL, and
 * pointing an alternate at the URL it is an alternate of is worse than saying
 * nothing. That needs locale-addressed paths (`/uk/...`) first.
 */
export const Meta = ({ title, description, image, noindex }: MetaProps) => {
  const { i18n } = useTranslation();
  const { pathname } = useLocation();

  const fullTitle = title ? `${title} | ${APP_CONFIG.NAME}` : APP_CONFIG.NAME;
  const metaDescription = description ?? APP_CONFIG.DESCRIPTION;
  const canonical = `${APP_CONFIG.SITE_URL}${pathname}`;
  // Square rather than the 1.91:1 a social card wants, but it is the real mark
  // and every platform renders it. A proper 1200×630 card is a design task.
  const socialImage = image ?? `${APP_CONFIG.SITE_URL}/pwa-512x512.png`;

  return (
    <>
      <title>{fullTitle}</title>
      <meta name="description" content={metaDescription} />

      {noindex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <>
          {/* Any page that keeps state in the query string — filters, sorting,
              pagination — otherwise reads as a separate duplicate page. */}
          <link rel="canonical" href={canonical} />
          {/* `max-image-preview:large` is what allows a full-size thumbnail in
              results; the default is a postage stamp. */}
          <meta name="robots" content="index, follow, max-image-preview:large" />
        </>
      )}

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={APP_CONFIG.NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:url" content={canonical} />
      <meta property="og:locale" content={i18n.language} />
      <meta property="og:image" content={socialImage} />

      {/* Twitter cards key off `name`, not `property`. */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={socialImage} />
    </>
  );
};

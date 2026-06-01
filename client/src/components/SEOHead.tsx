import { Helmet } from 'react-helmet-async';

const SITE_NAME = 'MyfmJournal';
const DEFAULT_DESC = 'A professional-grade trading journal and signal analysis platform for Forex, Crypto, and Commodities traders. Log trades, track psychology, and unlock your edge with AI-powered analytics.';
const DEFAULT_IMAGE = 'https://myfmjournal.com/og-image.png';
const SITE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://myfmjournal.com';

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  canonical?: string;
  ogImage?: string;
  ogType?: 'website' | 'article';
  noindex?: boolean;
  jsonLd?: object | object[];
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
}

export default function SEOHead({
  title,
  description = DEFAULT_DESC,
  keywords,
  canonical,
  ogImage = DEFAULT_IMAGE,
  ogType = 'website',
  noindex = false,
  jsonLd,
  author,
  publishedTime,
  modifiedTime,
}: SEOHeadProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} – Professional Trading Journal`;
  const canonicalUrl = canonical ? `${SITE_URL}${canonical}` : (typeof window !== 'undefined' ? window.location.href : SITE_URL);

  const schemas = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      <link rel="canonical" href={canonicalUrl} />
      {noindex ? <meta name="robots" content="noindex,nofollow" /> : <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1" />}

      {/* Open Graph */}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />

      {/* Article meta */}
      {ogType === 'article' && author && <meta property="article:author" content={author} />}
      {ogType === 'article' && publishedTime && <meta property="article:published_time" content={publishedTime} />}
      {ogType === 'article' && modifiedTime && <meta property="article:modified_time" content={modifiedTime} />}

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@myfmjournal" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {/* JSON-LD */}
      {schemas.map((schema, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
}

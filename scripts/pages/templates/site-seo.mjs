// One public origin for every page, crawler endpoint and structured-data entity.
export const SITE_URL = 'https://chicagolakefronttrail.com';
export const SITE_NAME = 'Chicago Lakefront Trail';
export const siteUrl = route => new URL(route, SITE_URL).href;

const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

export function seoHead({title, description, route, type = 'WebPage', image = '/assets/og-map.jpg', imageAlt = 'Illustrated map of Chicago’s Lakefront Trail', breadcrumbs = [], entities = [], mainEntity}) {
  const url = siteUrl(route);
  const graph = [
    {
      '@type': 'WebSite', '@id': siteUrl('/#website'), url: siteUrl('/'),
      name: SITE_NAME, alternateName: 'Lakefront Trail', inLanguage: 'en-US',
      description: 'An independent illustrated map and guide to Chicago’s Lakefront Trail, beaches, parks, and attractions.'
    },
    {
      '@type': type, '@id': url + '#webpage', url, name: title, description,
      inLanguage: 'en-US', isPartOf: {'@id': siteUrl('/#website')},
      primaryImageOfPage: {'@type': 'ImageObject', url: siteUrl(image)},
      ...(breadcrumbs.length ? {breadcrumb: {'@id': url + '#breadcrumbs'}} : {}),
      ...(mainEntity ? {mainEntity: {'@id': mainEntity}} : {})
    },
    ...(breadcrumbs.length ? [{
      '@type': 'BreadcrumbList', '@id': url + '#breadcrumbs',
      itemListElement: breadcrumbs.map(({name, route}, index) => ({
        '@type': 'ListItem', position: index + 1, name, item: siteUrl(route)
      }))
    }] : []),
    ...entities
  ];
  return `<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<link rel="canonical" href="${url}">
<link rel="sitemap" type="application/xml" href="${siteUrl('/sitemap.xml')}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${siteUrl(image)}">
<meta property="og:image:alt" content="${escape(imageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(title)}">
<meta name="twitter:description" content="${escape(description)}">
<meta name="twitter:image" content="${siteUrl(image)}">
<meta name="twitter:image:alt" content="${escape(imageAlt)}">
<script type="application/ld+json">${JSON.stringify({'@context': 'https://schema.org', '@graph': graph}).replace(/</g, '\\u003c')}</script>
<script>window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};</script>
<script defer src="/_vercel/insights/script.js"></script>`;
}

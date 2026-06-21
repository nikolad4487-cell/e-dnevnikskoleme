import type { Plugin } from 'vite';

export function applicationMetadataPlugin(): Plugin {
  return {
    name: 'application-metadata',
    transformIndexHtml(html) {
      let result = html.replace('/manifest.json', '/application.json');

      if (!result.includes('href="/app-icon.svg"')) {
        result = result.replace(
          '<link rel="manifest" href="/application.json" />',
          '<link rel="icon" href="/app-icon.svg" type="image/svg+xml" />\n    <link rel="manifest" href="/application.json" />'
        );
      }

      return result;
    },
  };
}

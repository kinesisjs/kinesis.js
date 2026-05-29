import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Kinesis.js',
  description:
    'TypeScript-first, framework-agnostic vehicle interpolation engine for fleet tracking, telematics, and real-time location applications.',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ['meta', { name: 'theme-color', content: '#3b82f6' }],
    ['meta', { property: 'og:title', content: 'Kinesis.js' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'Framework-agnostic vehicle interpolation engine — smooth marker movement at 60fps.',
      },
    ],
  ],

  themeConfig: {
    siteTitle: 'Kinesis.js',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Concepts', link: '/concepts/architecture' },
      { text: 'Performance', link: '/benchmarks' },
      {
        text: 'v0.1.2',
        items: [
          {
            text: 'Migration notes',
            link: '/guide/migration',
          },
          {
            text: 'Changelog',
            link: 'https://github.com/kinesisjs/kinesis.js/blob/main/CHANGELOG.md',
          },
          {
            text: 'GitHub',
            link: 'https://github.com/kinesisjs/kinesis.js',
          },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting started',
          items: [
            { text: 'Overview', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'First map (Angular)', link: '/guide/first-map-angular' },
            { text: 'First map (Vanilla TS)', link: '/guide/first-map-vanilla' },
          ],
        },
        {
          text: 'Reference',
          items: [{ text: 'Migration', link: '/guide/migration' }],
        },
      ],
      '/concepts/': [
        {
          text: 'Concepts',
          items: [
            { text: 'Architecture', link: '/concepts/architecture' },
            { text: 'Interpolation', link: '/concepts/interpolation' },
            { text: 'Web Worker mode', link: '/concepts/web-worker' },
            { text: 'Limitations', link: '/concepts/limitations' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/kinesisjs/kinesis.js' }],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Muzaffer Aşkar',
    },

    editLink: {
      pattern: 'https://github.com/kinesisjs/kinesis.js/edit/main/documents/:path',
      text: 'Edit this page on GitHub',
    },

    search: { provider: 'local' },
  },

  ignoreDeadLinks: true,
});

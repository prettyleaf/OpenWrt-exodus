import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';
import starlightScrollToTop from 'starlight-scroll-to-top';
import rehypeBaseLinks from './src/plugins/rehype-base-links.mjs';

const repository = 'https://github.com/prettyleaf/openwrt-exodus';
// the path of GitHub Pages is case-sensitive and follows the name of the repository
const base = '/OpenWrt-exodus';
const site = 'https://prettyleaf.github.io';

export default defineConfig({
	// GitHub Pages of the repository: https://prettyleaf.github.io/OpenWrt-exodus/
	site,
	base,
	markdown: { processor: unified({ rehypePlugins: [[rehypeBaseLinks, { base }]] }) },
	integrations: [
		starlight({
			title: 'Exodus',
			description: 'Proxy with the Mihomo core for OpenWrt, Keenetic, Asuswrt-Merlin and MikroTik routers.',
			plugins: [starlightScrollToTop({ showTooltip: false, borderRadius: '10' })],
			customCss: ['./src/styles/custom.css'],
			favicon: '/favicon.svg',
			// Starlight gives the title and the description of the page, the preview image is one for all pages
			head: [
				{ tag: 'meta', attrs: { property: 'og:image', content: `${site}${base}/og.png` } },
				{ tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
				{ tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
				{ tag: 'meta', attrs: { property: 'og:image:alt', content: 'Exodus' } },
			],
			editLink: { baseUrl: `${repository}/edit/docs/` },
			social: [{ icon: 'github', label: 'GitHub', href: repository }],
			// Russian is the default language and lives at the root, English is under /en/.
			defaultLocale: 'root',
			locales: {
				root: { label: 'Русский', lang: 'ru' },
				en: { label: 'English', lang: 'en' },
			},
			components: {
				Header: './src/components/Header.astro',
				Hero: './src/components/Hero.astro',
				LanguageSelect: './src/components/LanguageSelect.astro',
				MobileMenuFooter: './src/components/MobileMenuFooter.astro',
				PageTitle: './src/components/PageTitle.astro',
				SiteTitle: './src/components/SiteTitle.astro',
				ThemeSelect: './src/components/ThemeSelect.astro',
			},
			sidebar: [
				{ label: 'Overview', translations: { ru: 'Обзор' }, slug: 'overview' },
				{
					label: 'Installation',
					translations: { ru: 'Установка' },
					items: [
						{ label: 'OpenWrt', slug: 'install/openwrt' },
						{ label: 'Keenetic / Netcraze', slug: 'install/keenetic' },
						{ label: 'Asus (Asuswrt-Merlin)', slug: 'install/asuswrt' },
						{ label: 'MikroTik', slug: 'install/mikrotik' },
						{ label: 'Installer options', translations: { ru: 'Параметры установщика' }, slug: 'install/options' },
						{ label: 'Migrating from another proxy', translations: { ru: 'Переход с другого прокси' }, slug: 'install/migration' },
					],
				},
				{
					label: 'Usage',
					translations: { ru: 'Использование' },
					items: [
						{ label: 'Web UI', translations: { ru: 'Веб-интерфейс' }, slug: 'usage/web-ui' },
						{ label: 'Settings', translations: { ru: 'Настройки' }, slug: 'usage/settings' },
						{ label: 'LuCI (OpenWrt)', slug: 'usage/luci' },
						{ label: 'Subscriptions and profiles', translations: { ru: 'Подписки и профили' }, slug: 'usage/subscriptions' },
						{ label: 'Overrides', translations: { ru: 'Оверрайды' }, slug: 'usage/overrides' },
						{ label: 'Command line and files', translations: { ru: 'Командная строка и файлы' }, slug: 'usage/cli' },
					],
				},
				{ label: 'Troubleshooting', translations: { ru: 'Решение проблем' }, slug: 'troubleshooting' },
				{ label: 'Development', translations: { ru: 'Разработка' }, slug: 'development' },
			],
			expressiveCode: {
				// plain blocks like the code of the web UI, long commands wrap instead of scrolling
				defaultProps: { frame: 'none', wrap: true },
				themes: ['github-dark-default', 'github-light-default'],
				styleOverrides: {
					borderRadius: 'calc(var(--ex-radius) + 4px)',
					borderColor: 'var(--ex-border)',
					codeBackground: 'var(--ex-card)',
					codeFontFamily: 'var(--ex-mono)',
					codeFontSize: '0.8125rem',
					uiFontFamily: 'var(--ex-font)',
					frames: {
						shadowColor: 'transparent',
						editorTabBarBackground: 'var(--ex-muted)',
						editorActiveTabBackground: 'var(--ex-card)',
						editorActiveTabIndicatorTopColor: 'transparent',
						editorTabBarBorderBottomColor: 'var(--ex-border)',
						terminalTitlebarBackground: 'var(--ex-muted)',
						terminalTitlebarBorderBottomColor: 'var(--ex-border)',
						terminalBackground: 'var(--ex-card)',
						inlineButtonBorder: 'var(--ex-border)',
						inlineButtonForeground: 'var(--ex-foreground)',
					},
				},
			},
		}),
	],
});

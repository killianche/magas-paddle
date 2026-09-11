// Обёртка HTML для веб-версии. Нужна, чтобы страницу можно было добавить
// на домашний экран телефона и она открывалась как приложение, без адресной строки.
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />

        <title>Magas Padel — запись на корт</title>
        <meta name="description" content="Запись на корты падел-центра Magas Padel в Магасе" />

        {/* Открывается как приложение, а не как вкладка браузера */}
        <link rel="manifest" href="/v1/manifest.webmanifest" />
        <meta name="theme-color" content="#020705" />
        <meta name="color-scheme" content="dark light" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Magas Padel" />
        <link rel="apple-touch-icon" href="/v1/apple-touch-icon.png" />
        <link rel="icon" href="/v1/favicon.png" />

        {/* Тестовая версия не должна попадать в поиск */}
        <meta name="robots" content="noindex,nofollow" />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `
          body { background-color: #020705; }
          /* Чтобы страница не «дёргалась» от оттягивания на iOS */
          html, body { overscroll-behavior-y: none; }
        `}} />
      </head>
      <body>{children}</body>
    </html>
  );
}

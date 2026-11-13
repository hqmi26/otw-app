import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/*
 * What the Android app needs that the website gets for free.
 *
 * The app carries its own pages and runs from https://localhost, so it has to be
 * told where the OTW server is. The website just uses its own address.
 * VITE_SERVER_URL points a test build somewhere else, such as a preview link.
 */

export const isNativeApp = Capacitor.isNativePlatform();

export const SERVER_URL: string = isNativeApp
  ? (import.meta.env.VITE_SERVER_URL ?? 'https://otw-app-eoz.pages.dev')
  : window.location.origin;

if (isNativeApp) {
  // Sends the app's /api calls to the server, so the code making them stays the same as on the website.
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const asked = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (asked.origin !== window.location.origin || !asked.pathname.startsWith('/api/')) return realFetch(input, init);
    const url = `${SERVER_URL}${asked.pathname}${asked.search}`;
    return realFetch(input instanceof Request ? new Request(url, input) : url, init);
  };

  // The phone's Back steps through OTW's screens, as it does in Chrome, and leaves from the first one.
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else App.minimizeApp();
  });
}

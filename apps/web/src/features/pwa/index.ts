/**
 * PWA (spec 10 §4). Nothing here is mounted by itself; the Wave 2 integrator wires it:
 *
 * main.tsx (module level, before render):
 *   void registerServiceWorker();   // no-op in dev/test/unsupported; registers `${BASE_URL}sw.js`, scope BASE_URL
 *   captureInstallPrompt();         // keeps `beforeinstallprompt` for the Settings button (no auto popup)
 *
 * App.tsx (inside ToastProvider; inside the router if you pass the pathname):
 *   <UpdateToast pathname={location.pathname} />   // "Đã có phiên bản mới — Tải lại"; reloads only on tap
 *   useEffect(() => onNotificationClicked(({ notificationId, url, navigated }) => {
 *     if (notificationId) markNotification(notificationId, 'clicked');
 *     if (!navigated) navigate(appPathFrom(url));  // SW could not navigate an uncontrolled window
 *   }), []);
 *
 * SettingsPage: <InstallAppSection />  // hidden when installed or no prompt is available
 *
 * Other exports: useSwUpdate() for custom UI, useInstallPrompt(), isBusyRoute(pathname).
 */
export { registerServiceWorker, type RegisterOptions } from './register';
export { useSwUpdate, type SwUpdate } from './useSwUpdate';
export { UpdateToast, type UpdateToastProps } from './UpdateToast';
export { captureInstallPrompt, useInstallPrompt, type InstallPrompt, type InstallStatus } from './useInstallPrompt';
export { InstallAppSection } from './InstallAppSection';
export { onNotificationClicked, type NotificationClick } from './notification-click';
export { isBusyRoute } from './busy-route';

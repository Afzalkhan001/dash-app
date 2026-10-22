// Close the keyboard before leaving a screen that holds a focused text field.
//
// Android: replacing or popping a screen while a TextInput inside its ScrollView still has focus, and
// the keyboard is still up, can close the app. The keyboard then hides mid-transition, the window
// resizes, and Android's ScrollView.onSizeChanged looks up the focused field. That field is already
// detached from the screen being removed, so Android throws "IllegalArgumentException: parameter must
// be a descendant of this view". The crash is native, so the root ErrorBoundary never sees it. The web
// build has no such keyboard, so the same flow works in the web preview.
//
// Use: `await closeKeyboard()` before router.replace / router.back from a form (see chat/new.tsx).

import { Keyboard, Platform } from 'react-native';

const isVisible = () => (typeof Keyboard.isVisible === 'function' ? Keyboard.isVisible() : false);

/**
 * Blurs the focused field and hides the keyboard. Resolves once the keyboard is down, or after `maxMs`
 * at most, so a missed event can never block navigation. Never throws.
 */
export function closeKeyboard(maxMs = 400): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  let up = false;
  try {
    up = isVisible();
    Keyboard.dismiss(); // also blurs the focused TextInput
  } catch {
    return Promise.resolve();
  }
  if (!up) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    let sub: { remove: () => void } | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub?.remove();
      // One more frame so the resize has been laid out before the screen changes.
      requestAnimationFrame(() => resolve());
    };
    const timer = setTimeout(finish, maxMs);
    try {
      sub = Keyboard.addListener('keyboardDidHide', finish);
    } catch {
      // the timeout still resolves
    }
    if (!isVisible()) finish();
  });
}

// themedStyles — StyleSheet.create for styles that use theme colours (light / dark).
//
// The token objects in src/theme/tokens.ts are live: switching the colour scheme swaps their values.
// A plain module-level StyleSheet.create would freeze whatever values existed when the file loaded, so
// every module-level stylesheet is declared through this helper instead:
//
//   const styles = themedStyles(() => ({ card: { backgroundColor: palette.surface } }));
//   <View style={styles.card} />          // used exactly like a StyleSheet
//
// The returned object rebuilds itself from the factory the first time it is read after a scheme change
// (cached per scheme), so `styles.card` always holds the current theme's values. The factory must only
// read tokens — it runs lazily, on first access.

import { StyleSheet } from 'react-native';

import { themeVersion } from '@/theme/tokens';

export function themedStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(factory: () => T & StyleSheet.NamedStyles<any>): T {
  let cache: T | null = null;
  let builtFor = -1;
  const current = (): T => {
    const v = themeVersion();
    if (cache === null || builtFor !== v) {
      cache = StyleSheet.create(factory());
      builtFor = v;
    }
    return cache;
  };
  return new Proxy({} as T, {
    get: (_target, key) => (current() as Record<string | symbol, unknown>)[key],
    has: (_target, key) => key in (current() as object),
    ownKeys: () => Reflect.ownKeys(current() as object),
    getOwnPropertyDescriptor: (_target, key) => {
      const desc = Object.getOwnPropertyDescriptor(current() as object, key);
      if (desc) desc.configurable = true;
      return desc;
    },
  });
}

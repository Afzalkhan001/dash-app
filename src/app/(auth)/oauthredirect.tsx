// Google's return address on phones: com.tamadamedia.dashmobile:/oauthredirect?code=… (googlesignin
// domain, features/signin/google.ts). expo-auth-session reads the code from the browser session itself;
// Expo Router also sees the same link and opens this route. It shows nothing and steps straight back
// to the sign-in screen underneath, so nobody lands on "page not found".

import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

export default function GoogleReturn() {
  const router = useRouter();
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/login');
  }, [router]);
  return <View />;
}

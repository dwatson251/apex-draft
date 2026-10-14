# Android port: assumptions and decisions log

Made while the owner was away; review and overrule anything here.

1. Branch `android-mobile` in this repo; nothing pushed, nothing tagged, no PR.
2. Capacitor 7 wraps the Vite web build (`out/web`). Saves stay in localStorage (persists in the WebView), so no Preferences plugin.
3. `window.apex` members are now optional so the Android shell can provide only `version` and `exportLine` (share sheet).
4. Landscape only, debug APK only (decided by the owner before leaving).
5. No JDK/Android SDK on this machine, so the APK itself is built by CI; here I can only verify the web build, typecheck, tests and `cap sync`.
6. Capacitor 7 needs JDK 21: CI uses Temurin 21. `minSdk 23` is Capacitor's default, kept.
7. The `INTERNET` permission stays (Capacitor's template; harmless, the game does no networking).
8. The Menu button moved to the top-left on touch/short screens (it collided with the bottom action bar at 667px wide);
   the standings/side panels sit below it.
9. Touch tap tool is a cycling button ("Tap: add → insert → delete") rather than separate buttons, to keep the bar to one row.
   Hold-a-point (500 ms) deletes it, with a small vibration.
10. Touch hit radius for points is 26 px (11 px for a mouse). In small views this is large; drop it if it grabs the wrong point.
11. Pinch/pan only work where the desktop wheel/drag already did (overview and follow camera). While drawing, the camera is
    auto-focused on the segment, as before, so there is no pinch there.
12. Hover tooltips are hidden on touch rather than replaced (the hint line and Settings already explain the controls). Open item.
13. `viewport` meta now has `user-scalable=no` and `viewport-fit=cover` (stops page zoom, uses the notch area).
14. DPR is capped at 2 for every platform (was uncapped); backdrop-filter/canvas blur are off on `pointer: coarse`.
15. Backgrounding the app (Capacitor `appStateChange`) opens the pause menu and suspends audio. Desktop/browser behaviour is unchanged.
16. App icon/splash are still Capacitor's default placeholders: no icon art exists yet.
17. Not done / unverified: the APK has never been built or run (no SDK here). `cap add android` and `cap sync` succeed; the
    web build, typecheck, 171 unit tests and the touch e2e (Windows Chrome with touch emulation, 844x390 and 667x375) pass.
    Pit-strategy panel, garage and results screens were not audited at phone size.
18. Nothing committed yet; changes are on branch `android-mobile` in the working tree.

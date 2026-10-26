# Running Infipet on iPhone

Infipet is an Expo / React Native project, so the simulation and pixel editor run on iOS and in a browser from the same TypeScript source. Windows can serve the app and request a cloud build. It cannot run Xcode or the iOS Simulator.

## Try the app

1. From the project folder, run `.\Start-Infipet.ps1 -Mode iphone`. Dependencies are already installed. On another computer with Node and pnpm, run `pnpm install` and `pnpm start` instead.
2. Install the version of Expo Go compatible with Expo SDK 57 on your iPhone. Scan the terminal QR code with Camera. Keep both devices on the same network. Use `npx expo start --tunnel` if the local network prevents the connection.
3. Choose **Design an Egg** or **Draw an Infant**. Open **Live**, then **Time** to scrub its life. Open **More → Needs Lab** to record need fulfillment at the selected developmental hour, rewind, and compare seeds under the same conditions. **More** also contains sharing and the widget preview, which uses the same generated pixels.

The Home Screen extension needs a development build; Expo Go does not include the native widget module. The app detects this and explains the requirement when you publish a widget. See [Expo's SDK 57 widget documentation](https://docs.expo.dev/versions/v57.0.0/sdk/widgets/).

## Install the real Home Screen widget

The extension is configured in `app.config.ts`, with app identifier `com.infipet.app`, widget identifier `com.infipet.app.widgets`, and shared App Group `group.com.infipet.app`. Change these identifiers to ones owned by your Apple developer team before signing. The widget supports the small and medium Home Screen sizes.

From Windows, use an [EAS iOS development build](https://docs.expo.dev/develop/development-builds/create-a-build/):

```powershell
npx eas-cli login
npx eas-cli build:configure
npx eas-cli device:create
npx eas-cli build --platform ios --profile development
npx expo start --dev-client --lan
```

EAS configuration and signing need your Expo account, Apple Developer Program membership, and a registered iPhone. Follow the EAS prompts and install the resulting build using its installation link. These account and signing steps have not been performed by this prototype.

Open the installed app, choose **More → Home Screen widget → Send to Home Screen**, then long-press the iPhone Home Screen and add **INFIPET.EXE** from the widget gallery. Launching the app and publishing once supplies the extension's initial layout and pet data. Changing native configuration requires a new build.

On a Mac with Xcode you can instead run `npx expo run:ios`. The `simulator` EAS profile creates a simulator build, but you still need a Mac to run that simulator. See [Expo's local iOS build instructions](https://docs.expo.dev/guides/local-app-development/).

## What updates while the app is closed

The widget bridge accepts the selected pet frame and optionally up to 24 future frames with explicit dates. It writes a WidgetKit timeline. Each frame is rendered as colored SwiftUI blocks; adjacent pixels of the same color are combined into horizontal runs. The growth engine stays in the app, and the extension receives only precomputed data.

The needs lab uses a controlled clock. Publishing sends the current care-conditioned frame, and the pet does not age or accumulate unmet needs while the app is closed. Its snapshot remains until the app publishes again. Continuous motion runs inside the app. iOS controls widget refresh timing; the extension does not run the simulation. The bridge can accept explicit future frames for later features, but this revision does not schedule future aging. See [Apple's explanation of widget timelines and refresh budgets](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date).

## Verification boundary

TypeScript, the deterministic engine, and browser behavior can be checked on Windows. A signed iOS binary, the SwiftUI extension's appearance, device memory use, and WidgetKit scheduling must be checked on an iPhone or a Mac simulator. Native integration is provided here, but no iOS build or device test is claimed.

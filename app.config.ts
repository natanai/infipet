import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "INFIPET.EXE",
  slug: "infipet",
  version: "0.10.0",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  scheme: "infipet",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.infipet.app",
  },
  android: {
    package: "com.infipet.app",
  },
  web: {
    bundler: "metro",
    output: "single",
    name: "INFIPET.EXE",
    shortName: "INFIPET.EXE",
    themeColor: "#000000",
    backgroundColor: "#000000",
  },
  plugins: [
    ["expo-font", { fonts: ["./assets/fonts/DOS.ttf"] }],
    [
      "expo-widgets",
      {
        bundleIdentifier: "com.infipet.app.widgets",
        groupIdentifier: "group.com.infipet.app",
        widgets: [
          {
            name: "InfipetWidget",
            displayName: "INFIPET.EXE",
            description: "A little window into your pet's changing life.",
            ios: {
              supportedFamilies: ["systemSmall", "systemMedium"],
            },
          },
        ],
      },
    ],
  ],
};

export default config;

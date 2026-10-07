// Sentry's Metro config adds debug IDs to the bundle so crash reports can be
// mapped back to the original source files and lines (the map is uploaded
// by the Sentry Expo plugin during EAS builds).
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

module.exports = getSentryExpoConfig(__dirname);

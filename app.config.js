// Expo reads app.json first and hands it to this function as `config`.
// google-services.json (Firebase project dash-d38fa) is not committed: EAS builds get it from the
// GOOGLE_SERVICES_JSON file variable on expo.dev; a local build uses ./google-services.json.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
});

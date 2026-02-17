export default {
  paths: ["features/**/*.feature"],
  import: ["features/step_definitions/**/*.js", "features/support/**/*.js"],
  format: ["progress-bar", "html:reports/cucumber.html"],
};

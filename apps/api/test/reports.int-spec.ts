// The report suite is also kept under src so its end-to-end execution contributes
// to the unit coverage gate. Importing it here runs the same contract tests under
// the integration configuration as well.
import '../src/modules/reports/reports.spec.js';

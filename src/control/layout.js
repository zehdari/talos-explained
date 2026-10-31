// Control part: its equation macros and the sections whose maths is collected in its appendix.
import { setup as baseSetup, renderMath, wrapTables } from '../layout.js';

export const SRC = 'https://github.com/osu-uwrt/riptide_control/blob/mpc/riptide_mpc';

const APPENDIX = {
  'model.html': { eom: 'model', integration: 'model' },
  'thrusters.html': { matrix: 'thrusters' },
  'reference.html': { scurve: 'reference', paths: 'reference', governor: 'reference' },
  'mpc.html': { problem: 'problem', errors: 'problem', feedforward: 'problem' },
  'solver.html': { manifold: 'solver', jacobians: 'solver', condensing: 'solver' },
  'estimation.html': { why: 'estimation', offsetfree: 'estimation', trust: 'estimation' },
  'identify.html': { premise: 'identification', statics: 'identification', inertia: 'identification' },
};

export const MACROS = {
  '\\R': '\\mathbb{R}',
  '\\bnu': '\\boldsymbol{\\nu}',
  '\\bEta': '\\boldsymbol{\\eta}',
  '\\btau': '\\boldsymbol{\\tau}',
  '\\M': '\\mathbf{M}',
  '\\T': '\\mathbf{T}',
};

export function setup() {
  baseSetup({ macros: MACROS, appendix: APPENDIX });
}

export { renderMath, wrapTables };

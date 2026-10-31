// Perception part: its equation macros and the sections whose maths is collected in its appendix.
import { setup as baseSetup, renderMath, wrapTables } from '../layout.js';

export const REPO = 'https://github.com/osu-uwrt/riptide_perception/tree/mapping-estimator';
export const SRC = 'https://github.com/osu-uwrt/riptide_perception/blob/mapping-estimator';

const APPENDIX = {
  'calibration.html': { pinhole: 'calibration', distortion: 'calibration', stereo: 'calibration' },
  'pose.html': { backproject: 'pose', gate: 'pose', plane: 'pose' },
  'composites.html': { torpedo: 'composites' },
  'noise.html': { model: 'noise', inflation: 'noise' },
  'tracking.html': { update: 'tracking', gating: 'tracking', agreement: 'tracking' },
  'map.html': { model: 'map', solve: 'map', robust: 'map' },
};

export const MACROS = {
  '\\R': '\\mathbb{R}',
  '\\bx': '\\mathbf{x}',
  '\\bz': '\\mathbf{z}',
  '\\bp': '\\mathbf{p}',
  '\\bo': '\\mathbf{o}',
  '\\bd': '\\mathbf{d}',
  '\\bn': '\\mathbf{n}',
  '\\P': '\\mathbf{P}',
  '\\Rm': '\\mathbf{R}',
  '\\Q': '\\mathbf{Q}',
  '\\K': '\\mathbf{K}',
};

export function setup() {
  baseSetup({ macros: MACROS, appendix: APPENDIX });
}

export { renderMath, wrapTables };

export type PlaneLabel = 'Axial' | 'Sagittal' | 'Coronal' | 'Oblique'

export interface EdgeLabels {
  top: string
  bottom: string
  left: string
  right: string
}

type Vec3 = [number, number, number]

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/** DICOM's patient-based coordinate system is LPS: +X toward patient Left,
 *  +Y toward patient Posterior, +Z toward patient Superior (Head). Each axis
 *  has a positive-direction label and a negative-direction label. */
const AXIS_LABELS: [string, string][] = [
  ['L', 'R'], // +X = Left, -X = Right
  ['P', 'A'], // +Y = Posterior, -Y = Anterior
  ['H', 'F'], // +Z = Head (Superior), -Z = Foot (Inferior)
]

/** Finds which patient axis a direction vector points closest to, and its label. */
function nearestAxisLabel(v: Vec3): string {
  const abs = v.map(Math.abs)
  const axis = abs.indexOf(Math.max(...abs)) as 0 | 1 | 2
  const [positive, negative] = AXIS_LABELS[axis]
  return v[axis] >= 0 ? positive : negative
}

/** How dominant the largest component of a normalized vector is (1 = perfectly
 *  axis-aligned, ~0.577 = equally split across all three axes). Used to decide
 *  whether a slice is "really" Axial/Sagittal/Coronal or genuinely Oblique. */
function dominance(v: Vec3): number {
  return Math.max(...v.map(Math.abs))
}

const OBLIQUE_THRESHOLD = 0.85

/** ImageOrientationPatient is 6 numbers: [rowX, rowY, rowZ, colX, colY, colZ] —
 *  the direction cosines of the first row and first column of the image,
 *  expressed in the patient LPS coordinate system. */
export function parseImageOrientation(iop?: number[] | string[]): { row: Vec3; col: Vec3 } | null {
  if (!iop || iop.length < 6) return null
  const nums = iop.map(Number)
  if (nums.some((n) => Number.isNaN(n))) return null
  return {
    row: [nums[0], nums[1], nums[2]],
    col: [nums[3], nums[4], nums[5]],
  }
}

export function getPlaneLabel(iop?: number[] | string[]): PlaneLabel | null {
  const parsed = parseImageOrientation(iop)
  if (!parsed) return null
  const normal = normalize(cross(parsed.row, parsed.col))
  if (dominance(normal) < OBLIQUE_THRESHOLD) return 'Oblique'
  const abs = normal.map(Math.abs)
  const axis = abs.indexOf(Math.max(...abs))
  // The slice's plane is perpendicular to its normal: a normal dominant on
  // the Head/Foot axis means the slice itself lies in the Axial plane, etc.
  if (axis === 2) return 'Axial'
  if (axis === 0) return 'Sagittal'
  return 'Coronal'
}

/** Screen-edge anatomical labels: the row vector points left-to-right on
 *  screen, so its direction is the Right-edge label (and its opposite is the
 *  Left-edge label); the column vector points top-to-bottom, giving Bottom
 *  and (opposite) Top. This ignores in-plane rotation from pan/zoom, which
 *  is standard for PACS edge markers — they reflect the acquired image data,
 *  not the current on-screen transform. */
export function getEdgeLabels(iop?: number[] | string[]): EdgeLabels | null {
  const parsed = parseImageOrientation(iop)
  if (!parsed) return null
  const row = normalize(parsed.row)
  const col = normalize(parsed.col)
  const negRow: Vec3 = [-row[0], -row[1], -row[2]]
  const negCol: Vec3 = [-col[0], -col[1], -col[2]]
  return {
    right: nearestAxisLabel(row),
    left: nearestAxisLabel(negRow),
    bottom: nearestAxisLabel(col),
    top: nearestAxisLabel(negCol),
  }
}

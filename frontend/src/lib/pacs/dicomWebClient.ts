/**
 * A functional DICOMweb client (QIDO-RS for querying, WADO-RS for retrieval)
 * for talking to a real PACS/VNA — Orthanc, dcm4chee, Google Healthcare API,
 * AWS HealthImaging, etc. all speak this standard.
 *
 * This module is NOT wired into the worklist/viewer UI yet — see
 * PACS_MIGRATION.md at the project root for how to do that. It's included
 * now, fully working, so the swap later is a matter of wiring, not writing
 * this layer from scratch.
 */
import { utilities as metadataUtilities } from '@cornerstonejs/metadata'

export interface PacsConfig {
  /** e.g. "https://your-pacs.example.com/dicom-web" (no trailing slash). */
  baseUrl: string
  /** Optional bearer token or other Authorization header value. */
  authorization?: string
  /** Extra headers some PACS/proxies require (API keys, tenant ids, etc). */
  extraHeaders?: Record<string, string>
}

function headers(config: PacsConfig, accept: string): HeadersInit {
  const h: HeadersInit = { Accept: accept, ...(config.extraHeaders ?? {}) }
  if (config.authorization) h['Authorization'] = config.authorization
  return h
}

// ---------------------------------------------------------------------------
// QIDO-RS — querying (this is what would replace the worklist's IndexedDB read)
// ---------------------------------------------------------------------------

export interface QidoStudyResult {
  studyInstanceUID: string
  patientName: string
  patientId: string
  studyDate?: string
  studyDescription: string
  accessionNumber?: string
  modalitiesInStudy: string[]
  numberOfStudyRelatedSeries?: number
  numberOfStudyRelatedInstances?: number
}

/** DICOM JSON responses key each attribute by its tag ("00100010") with a
 *  { vr, Value } shape. This pulls a single string/number value out safely. */
function dicomJsonValue(entry: Record<string, unknown> | undefined): string | undefined {
  if (!entry) return undefined
  const value = (entry as { Value?: unknown[] }).Value
  if (!Array.isArray(value) || value.length === 0) return undefined
  const first = value[0]
  if (typeof first === 'string' || typeof first === 'number') return String(first)
  if (typeof first === 'object' && first !== null && 'Alphabetic' in first) {
    return (first as { Alphabetic?: string }).Alphabetic
  }
  return undefined
}

/** QIDO-RS: GET {baseUrl}/studies?<query params> — the worklist search. */
export async function queryStudies(
  config: PacsConfig,
  params: { patientName?: string; patientId?: string; studyDate?: string; modality?: string } = {}
): Promise<QidoStudyResult[]> {
  const search = new URLSearchParams()
  if (params.patientName) search.set('PatientName', params.patientName)
  if (params.patientId) search.set('PatientID', params.patientId)
  if (params.studyDate) search.set('StudyDate', params.studyDate)
  if (params.modality) search.set('ModalitiesInStudy', params.modality)

  const res = await fetch(`${config.baseUrl}/studies?${search.toString()}`, {
    headers: headers(config, 'application/dicom+json'),
  })
  if (!res.ok) throw new Error(`QIDO-RS studies query failed: ${res.status} ${res.statusText}`)
  const rows = (await res.json()) as Record<string, Record<string, unknown>>[]

  return rows.map((row) => ({
    studyInstanceUID: dicomJsonValue(row['0020000D']) ?? '',
    patientName: dicomJsonValue(row['00100010']) ?? 'Unknown',
    patientId: dicomJsonValue(row['00100020']) ?? 'Unknown',
    studyDate: dicomJsonValue(row['00080020']),
    studyDescription: dicomJsonValue(row['00081030']) ?? 'Unnamed study',
    accessionNumber: dicomJsonValue(row['00080050']),
    modalitiesInStudy: (dicomJsonValue(row['00080061']) ?? '').split('\\').filter(Boolean),
    numberOfStudyRelatedSeries: Number(dicomJsonValue(row['00201206'])) || undefined,
    numberOfStudyRelatedInstances: Number(dicomJsonValue(row['00201208'])) || undefined,
  }))
}

export interface QidoSeriesResult {
  seriesInstanceUID: string
  seriesNumber: number
  seriesDescription: string
  modality: string
  numberOfSeriesRelatedInstances?: number
}

/** QIDO-RS: GET {baseUrl}/studies/{studyUID}/series */
export async function querySeries(config: PacsConfig, studyInstanceUID: string): Promise<QidoSeriesResult[]> {
  const res = await fetch(`${config.baseUrl}/studies/${studyInstanceUID}/series`, {
    headers: headers(config, 'application/dicom+json'),
  })
  if (!res.ok) throw new Error(`QIDO-RS series query failed: ${res.status} ${res.statusText}`)
  const rows = (await res.json()) as Record<string, Record<string, unknown>>[]

  return rows.map((row) => ({
    seriesInstanceUID: dicomJsonValue(row['0020000E']) ?? '',
    seriesNumber: Number(dicomJsonValue(row['00200011'])) || 0,
    seriesDescription: dicomJsonValue(row['0008103E']) ?? 'Series',
    modality: dicomJsonValue(row['00080060']) ?? 'OT',
    numberOfSeriesRelatedInstances: Number(dicomJsonValue(row['00201209'])) || undefined,
  }))
}

export interface QidoInstanceResult {
  sopInstanceUID: string
  instanceNumber: number
  numberOfFrames: number
}

/** QIDO-RS: GET {baseUrl}/studies/{studyUID}/series/{seriesUID}/instances */
export async function queryInstances(
  config: PacsConfig,
  studyInstanceUID: string,
  seriesInstanceUID: string
): Promise<QidoInstanceResult[]> {
  const res = await fetch(
    `${config.baseUrl}/studies/${studyInstanceUID}/series/${seriesInstanceUID}/instances`,
    { headers: headers(config, 'application/dicom+json') }
  )
  if (!res.ok) throw new Error(`QIDO-RS instance query failed: ${res.status} ${res.statusText}`)
  const rows = (await res.json()) as Record<string, Record<string, unknown>>[]

  return rows.map((row) => ({
    sopInstanceUID: dicomJsonValue(row['00080018']) ?? '',
    instanceNumber: Number(dicomJsonValue(row['00200013'])) || 0,
    numberOfFrames: Number(dicomJsonValue(row['00280008'])) || 1,
  }))
}

// ---------------------------------------------------------------------------
// WADO-RS — retrieval (this is what would replace registerFileAsImageId)
// ---------------------------------------------------------------------------

/** Builds the Cornerstone imageId for one frame of a WADO-RS instance. The
 *  wadors loader is already registered by cornerstoneSetup.ts's
 *  ensureCornerstoneInitialized() — no further loader setup is needed. */
export function buildWadoRsImageId(
  config: PacsConfig,
  studyInstanceUID: string,
  seriesInstanceUID: string,
  sopInstanceUID: string,
  frameNumber = 1
): string {
  return `wadors:${config.baseUrl}/studies/${studyInstanceUID}/series/${seriesInstanceUID}/instances/${sopInstanceUID}/frames/${frameNumber}`
}

/**
 * Registers an instance's DICOMweb JSON metadata with Cornerstone so the
 * wadors loader can build the image without a separate metadata fetch per
 * frame. Fetch this once per instance (e.g. via WADO-RS metadata endpoint or
 * folded into your QIDO-RS instance query) before creating its imageIds.
 */
export async function registerWadoRsMetadata(
  config: PacsConfig,
  studyInstanceUID: string,
  seriesInstanceUID: string,
  sopInstanceUID: string,
  frameNumber = 1
): Promise<void> {
  const res = await fetch(
    `${config.baseUrl}/studies/${studyInstanceUID}/series/${seriesInstanceUID}/instances/${sopInstanceUID}/metadata`,
    { headers: headers(config, 'application/dicom+json') }
  )
  if (!res.ok) {
    throw new Error(`WADO-RS metadata fetch failed: ${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as Record<string, unknown>[]
  const instanceMetadata = Array.isArray(json) ? json[0] : json
  const imageId = buildWadoRsImageId(config, studyInstanceUID, seriesInstanceUID, sopInstanceUID, frameNumber)
  metadataUtilities.addDicomWebInstance(imageId, instanceMetadata)
}

import { APP_CONFIG } from '../../config'
import type { InstanceRecord, SeriesRecord, StudyRecord } from '../../types/dicom'
import { clearSession, errorMessage, getAccessToken, invalidateAccessToken } from '../auth/session'

export interface ApiStudySummary {
  id: number
  patientId: number
  studyInstanceUid: string
  patientIdValue?: string
  patientName: string
  studyDate?: string
  studyTime?: string
  accessionNumber?: string
  studyDescription?: string
  institutionName?: string
  seriesCount: number
  instanceCount: number
}

export interface ApiSeriesSummary {
  id: number
  studyId: number
  seriesInstanceUid: string
  modality?: string
  seriesNumber?: string
  seriesDescription?: string
  bodyPartExamined?: string
  instanceCount: number
}

export interface ApiInstance {
  id: number
  seriesId: number
  sopInstanceUid: string
  sopClassUid?: string
  instanceNumber?: number
  rows?: number
  columns?: number
  transferSyntaxUid?: string
  storageKey: string
  fileSizeBytes: number
}

export interface PagedResult<T> {
  items: T[]
  page: number
  pageSize: number
  totalCount: number
}

/**
 * fetch() with the bearer token attached. On a 401 the access token is treated as stale: it is refreshed
 * and the request is retried once. A second 401 means the session is gone, so it is cleared.
 */
async function authorizedFetch(path: string, init: RequestInit = {}, isRetry = false): Promise<Response> {
  const token = await getAccessToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${APP_CONFIG.apiBaseUrl}${path}`, { ...init, headers })
  if (response.status === 401) {
    if (!isRetry) {
      invalidateAccessToken()
      return authorizedFetch(path, init, true)
    }
    clearSession()
  }
  return response
}

async function ensureOk(response: Response): Promise<void> {
  if (response.ok) return
  if (response.status === 401) throw new Error('Your session has expired. Please sign in again.')
  if (response.status === 403) throw new Error('Your account does not have permission to do that.')
  throw new Error(await errorMessage(response))
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authorizedFetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  await ensureOk(response)
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function mapStudy(study: ApiStudySummary): StudyRecord {
  return {
    studyInstanceUID: study.studyInstanceUid,
    patientName: study.patientName || 'Unknown',
    patientId: study.patientIdValue || 'Unknown',
    studyDate: study.studyDate,
    studyTime: study.studyTime,
    studyDescription: study.studyDescription || 'Unnamed study',
    accessionNumber: study.accessionNumber,
    institutionName: study.institutionName,
    modalities: [],
    series: [],
    seriesCount: study.seriesCount,
    instanceCount: study.instanceCount,
    importedAt: Date.now(),
  }
}

function mapSeries(series: ApiSeriesSummary, studyInstanceUID: string): SeriesRecord {
  return {
    studyInstanceUID,
    seriesInstanceUID: series.seriesInstanceUid,
    seriesNumber: Number(series.seriesNumber) || 0,
    seriesDescription: series.seriesDescription || 'Series',
    modality: series.modality || 'OT',
    bodyPartExamined: series.bodyPartExamined,
    instances: [],
    instanceCount: series.instanceCount,
  }
}

function mapInstance(instance: ApiInstance): InstanceRecord {
  return {
    sopInstanceUID: instance.sopInstanceUid,
    instanceNumber: instance.instanceNumber ?? 0,
    fileName: instance.storageKey.split(/[\\/]/).pop() ?? instance.sopInstanceUid,
    rows: instance.rows,
    columns: instance.columns,
  }
}

export async function searchStudies(params: {
  patientId?: string
  patientName?: string
  studyDateFrom?: string
  studyDateTo?: string
  modality?: string
  page?: number
  pageSize?: number
} = {}): Promise<PagedResult<StudyRecord>> {
  const query = new URLSearchParams()
  if (params.patientId) query.set('patientId', params.patientId)
  if (params.patientName) query.set('patientName', params.patientName)
  if (params.studyDateFrom) query.set('studyDateFrom', params.studyDateFrom)
  if (params.studyDateTo) query.set('studyDateTo', params.studyDateTo)
  if (params.modality) query.set('modality', params.modality)
  query.set('page', String(params.page ?? 1))
  query.set('pageSize', String(params.pageSize ?? 200))

  const result = await request<PagedResult<ApiStudySummary>>(`/api/studies?${query}`)
  return {
    ...result,
    items: result.items.map(mapStudy),
  }
}

export async function getStudy(studyInstanceUID: string): Promise<StudyRecord> {
  const study = await request<ApiStudySummary>(
    `/api/studies/${encodeURIComponent(studyInstanceUID)}`,
  )
  return mapStudy(study)
}

export async function getSeries(studyInstanceUID: string): Promise<SeriesRecord[]> {
  const result = await request<ApiSeriesSummary[]>(
    `/api/studies/${encodeURIComponent(studyInstanceUID)}/series`,
  )
  return result.map((series) => mapSeries(series, studyInstanceUID))
}

export async function getInstances(
  studyInstanceUID: string,
  seriesInstanceUID: string,
): Promise<InstanceRecord[]> {
  const result = await request<ApiInstance[]>(
    `/api/studies/${encodeURIComponent(studyInstanceUID)}/series/${encodeURIComponent(seriesInstanceUID)}/instances`,
  )
  return result
    .map(mapInstance)
    .sort((a, b) => a.instanceNumber - b.instanceNumber)
}

export async function uploadDicomFiles(files: File[]): Promise<{
  imported: number
  failedCount: number
  failures: string[]
}> {
  const formData = new FormData()
  for (const file of files) {
    formData.append('files', file, file.name)
  }

  const response = await authorizedFetch('/dicomweb/studies', {
    method: 'POST',
    body: formData,
  })

  await ensureOk(response)
  return response.json() as Promise<{
    imported: number
    failedCount: number
    failures: string[]
  }>
}

export async function deleteStudy(studyInstanceUID: string): Promise<void> {
  await request<void>(
    `/api/studies/${encodeURIComponent(studyInstanceUID)}`,
    { method: 'DELETE' },
  )
}

export function buildWadoUriImageId(
  studyInstanceUID: string,
  seriesInstanceUID: string,
  sopInstanceUID: string,
): string {
  const query = new URLSearchParams({
    requestType: 'WADO',
    studyUID: studyInstanceUID,
    seriesUID: seriesInstanceUID,
    objectUID: sopInstanceUID,
    contentType: 'application/dicom',
  })

  return `wadouri:${APP_CONFIG.apiBaseUrl}/dicomweb/wado?${query.toString()}`
}

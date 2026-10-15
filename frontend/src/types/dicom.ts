export interface InstanceRecord {
  sopInstanceUID: string
  instanceNumber: number
  fileName: string
  rows?: number
  columns?: number
}

export interface SeriesRecord {
  studyInstanceUID?: string
  seriesInstanceUID: string
  seriesNumber: number
  seriesDescription: string
  modality: string
  bodyPartExamined?: string
  imageOrientationPatient?: number[]
  instances: InstanceRecord[]
  /** Server-side count before the instance list is lazily loaded. */
  instanceCount?: number
}


export interface StudyRecord {
  studyInstanceUID: string
  patientName: string
  patientId: string
  patientSex?: string
  patientBirthDate?: string
  studyDate?: string
  studyTime?: string
  studyDescription: string
  accessionNumber?: string
  institutionName?: string
  modalities: string[]
  series: SeriesRecord[]
  /** Server-side summary counts. Present when the study comes from the backend. */
  seriesCount?: number
  instanceCount?: number
  /** When this study was ingested into this browser, for sorting recency. */
  importedAt: number
}

/** A single parsed DICOM file, before it's merged into a StudyRecord. */
export interface ParsedInstance {
  studyInstanceUID: string
  seriesInstanceUID: string
  sopInstanceUID: string
  patientName: string
  patientId: string
  patientSex?: string
  patientBirthDate?: string
  studyDate?: string
  studyTime?: string
  studyDescription: string
  accessionNumber?: string
  institutionName?: string
  seriesNumber: number
  seriesDescription: string
  instanceNumber: number
  modality: string
  bodyPartExamined?: string
  rows?: number
  columns?: number
  imageOrientationPatient?: number[]
  fileName: string
  data: ArrayBuffer
}

export interface IngestProgress {
  total: number
  processed: number
  skipped: number
  currentFileName?: string
}

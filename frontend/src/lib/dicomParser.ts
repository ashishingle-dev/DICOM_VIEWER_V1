import { data as dcmjsData } from 'dcmjs'
import type { ParsedInstance, StudyRecord, IngestProgress } from '../types/dicom'
import { formatPersonName } from './formatters'

const { DicomMessage, DicomMetaDictionary } = dcmjsData

/**
 * Parses a single File as DICOM. Returns null (instead of throwing) for files
 * that aren't valid DICOM P10 — folder uploads routinely include DICOMDIR,
 * thumbnails, or unrelated files mixed in, and we want to skip those quietly
 * rather than abort the whole batch.
 */
async function parseFile(file: File): Promise<ParsedInstance | null> {
  const buffer = await file.arrayBuffer()
  try {
    const dicomDict = DicomMessage.readFile(buffer, {
      ignoreErrors: true,
    })
    const naturalized = DicomMetaDictionary.naturalizeDataset(dicomDict.dict) as Record<string, unknown>

    const studyInstanceUID = naturalized.StudyInstanceUID as string | undefined
    const seriesInstanceUID = naturalized.SeriesInstanceUID as string | undefined
    const sopInstanceUID = naturalized.SOPInstanceUID as string | undefined
    if (!studyInstanceUID || !seriesInstanceUID || !sopInstanceUID) {
      return null
    }

    return {
      studyInstanceUID,
      seriesInstanceUID,
      sopInstanceUID,
      patientName: formatPersonName(naturalized.PatientName),
      patientId: (naturalized.PatientID as string) || 'Unknown',
      patientSex: naturalized.PatientSex as string | undefined,
      patientBirthDate: naturalized.PatientBirthDate as string | undefined,
      studyDate: naturalized.StudyDate as string | undefined,
      studyTime: naturalized.StudyTime as string | undefined,
      studyDescription: (naturalized.StudyDescription as string) || 'Unnamed study',
      accessionNumber: naturalized.AccessionNumber as string | undefined,
      institutionName: naturalized.InstitutionName as string | undefined,
      seriesNumber: Number(naturalized.SeriesNumber) || 0,
      seriesDescription: (naturalized.SeriesDescription as string) || 'Series',
      instanceNumber: Number(naturalized.InstanceNumber) || 0,
      modality: (naturalized.Modality as string) || 'OT',
      bodyPartExamined: naturalized.BodyPartExamined as string | undefined,
      rows: naturalized.Rows as number | undefined,
      columns: naturalized.Columns as number | undefined,
      imageOrientationPatient: Array.isArray(naturalized.ImageOrientationPatient)
        ? (naturalized.ImageOrientationPatient as (string | number)[]).map(Number)
        : undefined,
      fileName: file.name,
      data: buffer,
    }
  } catch {
    return null
  }
}

/** Runs `parseFile` across a FileList with bounded concurrency, reporting progress. */
export async function parseFiles(
  files: File[],
  concurrency: number,
  onProgress?: (progress: IngestProgress) => void
): Promise<ParsedInstance[]> {
  const results: ParsedInstance[] = []
  let processed = 0
  let skipped = 0
  let cursor = 0

  async function worker() {
    while (cursor < files.length) {
      const index = cursor++
      const file = files[index]
      onProgress?.({ total: files.length, processed, skipped, currentFileName: file.name })
      const parsed = await parseFile(file)
      if (parsed) {
        results.push(parsed)
      } else {
        skipped++
      }
      processed++
      onProgress?.({ total: files.length, processed, skipped, currentFileName: file.name })
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, files.length) }, () => worker())
  await Promise.all(workers)
  return results
}

/** Merges freshly parsed instances into a map of StudyRecords keyed by StudyInstanceUID,
 *  combining with any studies already present (e.g. re-uploading more series for a study). */
export function mergeInstancesIntoStudies(
  instances: ParsedInstance[],
  existing: Map<string, StudyRecord>
): Map<string, StudyRecord> {
  const studies = new Map(existing)

  for (const inst of instances) {
    let study = studies.get(inst.studyInstanceUID)
    if (!study) {
      study = {
        studyInstanceUID: inst.studyInstanceUID,
        patientName: inst.patientName,
        patientId: inst.patientId,
        patientSex: inst.patientSex,
        patientBirthDate: inst.patientBirthDate,
        studyDate: inst.studyDate,
        studyTime: inst.studyTime,
        studyDescription: inst.studyDescription,
        accessionNumber: inst.accessionNumber,
        institutionName: inst.institutionName,
        modalities: [],
        series: [],
        importedAt: Date.now(),
      }
      studies.set(inst.studyInstanceUID, study)
    }

    let series = study.series.find((s) => s.seriesInstanceUID === inst.seriesInstanceUID)
    if (!series) {
      series = {
        seriesInstanceUID: inst.seriesInstanceUID,
        seriesNumber: inst.seriesNumber,
        seriesDescription: inst.seriesDescription,
        modality: inst.modality,
        bodyPartExamined: inst.bodyPartExamined,
        imageOrientationPatient: inst.imageOrientationPatient,
        instances: [],
      }
      study.series.push(series)
      study.series.sort((a, b) => a.seriesNumber - b.seriesNumber)
    }

    if (!series.instances.some((i) => i.sopInstanceUID === inst.sopInstanceUID)) {
      series.instances.push({
        sopInstanceUID: inst.sopInstanceUID,
        instanceNumber: inst.instanceNumber,
        fileName: inst.fileName,
        rows: inst.rows,
        columns: inst.columns,
      })
      series.instances.sort((a, b) => a.instanceNumber - b.instanceNumber)
    }

    if (!study.modalities.includes(inst.modality)) {
      study.modalities.push(inst.modality)
    }
  }

  return studies
}

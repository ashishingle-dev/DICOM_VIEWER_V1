import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { StudyRecord } from '../types/dicom'

interface StoredFile {
  sopInstanceUID: string
  studyInstanceUID: string
  fileName: string
  data: ArrayBuffer
}

interface DicomViewerDB extends DBSchema {
  studies: {
    key: string
    value: StudyRecord
  }
  files: {
    key: string
    value: StoredFile
    indexes: { studyInstanceUID: string }
  }
}

const DB_NAME = 'dicom-viewer-db'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<DicomViewerDB>> | null = null

// The DB connection is opened lazily and cached: every window/tab that loads
// this module (worklist tab, viewer tab) gets its own connection to the same
// underlying IndexedDB database on disk, which is how metadata and pixel
// data survive being uploaded in one tab and read from another.
function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<DicomViewerDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('studies')) {
          db.createObjectStore('studies', { keyPath: 'studyInstanceUID' })
        }
        if (!db.objectStoreNames.contains('files')) {
          const store = db.createObjectStore('files', { keyPath: 'sopInstanceUID' })
          store.createIndex('studyInstanceUID', 'studyInstanceUID')
        }
      },
    })
  }
  return dbPromise
}

export async function saveStudy(study: StudyRecord): Promise<void> {
  const db = await getDb()
  await db.put('studies', study)
}

export async function getAllStudies(): Promise<StudyRecord[]> {
  const db = await getDb()
  const studies = await db.getAll('studies')
  return studies.sort((a, b) => b.importedAt - a.importedAt)
}

export async function getStudy(studyInstanceUID: string): Promise<StudyRecord | undefined> {
  const db = await getDb()
  return db.get('studies', studyInstanceUID)
}

export async function deleteStudy(studyInstanceUID: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['studies', 'files'], 'readwrite')
  await tx.objectStore('studies').delete(studyInstanceUID)
  const fileIndex = tx.objectStore('files').index('studyInstanceUID')
  let cursor = await fileIndex.openCursor(IDBKeyRange.only(studyInstanceUID))
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

export async function saveFile(file: StoredFile): Promise<void> {
  const db = await getDb()
  await db.put('files', file)
}

export async function getFile(sopInstanceUID: string): Promise<StoredFile | undefined> {
  const db = await getDb()
  return db.get('files', sopInstanceUID)
}

export async function clearAll(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['studies', 'files'], 'readwrite')
  await tx.objectStore('studies').clear()
  await tx.objectStore('files').clear()
  await tx.done
}

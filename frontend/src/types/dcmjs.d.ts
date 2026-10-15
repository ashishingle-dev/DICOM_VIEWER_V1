declare module 'dcmjs' {
  export const data: {
    DicomMessage: {
      readFile: (
        buffer: ArrayBuffer,
        options?: { ignoreErrors?: boolean; untilTag?: string | null; includeUntilTagValue?: boolean; noCopy?: boolean; forceStoreRaw?: boolean }
      ) => { dict: Record<string, unknown>; meta: Record<string, unknown> }
    }
    DicomMetaDictionary: {
      naturalizeDataset: (dict: Record<string, unknown>) => Record<string, unknown>
    }
  }
}

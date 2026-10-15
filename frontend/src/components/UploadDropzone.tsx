import { useCallback, useRef, useState } from 'react'
import { UploadCloud, FolderOpen, FileUp } from 'lucide-react'

interface UploadDropzoneProps {
  onFilesSelected: (files: File[]) => void
  disabled?: boolean
}

/** Recursively walks a dropped folder's DataTransferItem tree to collect File objects. */
async function collectFilesFromDataTransfer(items: DataTransferItemList): Promise<File[]> {
  const files: File[] = []

  async function walk(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject)
      )
      files.push(file)
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject)
      )
      await Promise.all(entries.map(walk))
    }
  }

  const entries: FileSystemEntry[] = []
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry?.()
    if (entry) entries.push(entry)
  }
  await Promise.all(entries.map(walk))
  return files
}

export default function UploadDropzone({ onFilesSelected, disabled }: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      if (disabled) return
      if (e.dataTransfer.items?.length) {
        const files = await collectFilesFromDataTransfer(e.dataTransfer.items)
        if (files.length) onFilesSelected(files)
      } else if (e.dataTransfer.files?.length) {
        onFilesSelected(Array.from(e.dataTransfer.files))
      }
    },
    [disabled, onFilesSelected]
  )

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
        isDragging
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-dim)]'
          : 'border-[var(--color-border-strong)] bg-[var(--color-surface)]'
      } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      <UploadCloud className="h-8 w-8 text-[var(--color-accent)]" strokeWidth={1.5} />
      <div>
        <p className="text-sm font-medium text-[var(--color-text)]">
          Drop DICOM files or a study folder here
        </p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Files are uploaded to the DICOM backend and indexed server-side
        </p>
      </div>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
        >
          <FileUp className="h-3.5 w-3.5" /> Choose files
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => folderInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
        >
          <FolderOpen className="h-3.5 w-3.5" /> Choose folder
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFilesSelected(Array.from(e.target.files))
          e.target.value = ''
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error non-standard but supported attributes for folder picking
        webkitdirectory="true"
        directory="true"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFilesSelected(Array.from(e.target.files))
          e.target.value = ''
        }}
      />
    </div>
  )
}
/** DICOM PN (Person Name) values arrive either as a plain string "Last^First^Middle"
 * or, after dcmjs naturalization, as an object like { Alphabetic: "Last^First" }. */
export function formatPersonName(raw: unknown): string {
  if (!raw) {
    return 'Unknown';
  }

  // Handle PatientName array: [{ Alphabetic: "DOE^JOHN" }]
  if (Array.isArray(raw)) {
    raw = raw[0];
  }

  let value: string | undefined;

  if (typeof raw === 'string') {
    value = raw;
  } else if (
    typeof raw === 'object' &&
    raw !== null &&
    'Alphabetic' in raw
  ) {
    const personName = raw as { Alphabetic?: unknown };

    if (typeof personName.Alphabetic === 'string') {
      value = personName.Alphabetic;
    }
  }

  if (!value?.trim()) {
    return 'Unknown';
  }

  const parts = value
    .split('^')
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return 'Unknown';
  }

  const [family, given, middle] = parts;

  return [given, middle, family]
    .filter(Boolean)
    .join(' ') || 'Unknown';
}

/** DICOM DA value representation: "YYYYMMDD" -> "DD Mon YYYY". */
export function formatDicomDate(raw?: string): string {
  if (!raw || raw.length < 8) return '—'
  const year = raw.slice(0, 4)
  const month = raw.slice(4, 6)
  const day = raw.slice(6, 8)
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (Number.isNaN(date.getTime())) return raw
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

/** DICOM TM value representation: "HHMMSS.FFFFFF" -> "HH:MM:SS". */
export function formatDicomTime(raw?: string): string {
  if (!raw || raw.length < 6) return ''
  const h = raw.slice(0, 2)
  const m = raw.slice(2, 4)
  const s = raw.slice(4, 6)
  return `${h}:${m}:${s}`
}

/** Shortens a long DICOM UID for compact display, keeping the tail (most distinguishing part). */
export function shortenUid(uid: string, keep = 8): string {
  if (uid.length <= keep + 3) return uid
  return `…${uid.slice(-keep)}`
}

export function formatAge(birthDate?: string, referenceDate?: string): string {
  if (!birthDate || birthDate.length < 8) return ''
  const b = new Date(Number(birthDate.slice(0, 4)), Number(birthDate.slice(4, 6)) - 1, Number(birthDate.slice(6, 8)))
  const ref = referenceDate && referenceDate.length >= 8
    ? new Date(Number(referenceDate.slice(0, 4)), Number(referenceDate.slice(4, 6)) - 1, Number(referenceDate.slice(6, 8)))
    : new Date()
  if (Number.isNaN(b.getTime())) return ''
  let age = ref.getFullYear() - b.getFullYear()
  const monthDiff = ref.getMonth() - b.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < b.getDate())) age--
  return age >= 0 ? `${age}Y` : ''
}

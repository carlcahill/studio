export interface SowScopeAmendment {
  id: string
  note: string
  created_at: string
  created_by_name: string | null
}

export const SCOPE_AMENDMENT_NOTE_MIN = 10
export const SCOPE_AMENDMENT_NOTE_MAX = 500

/** A scope note is required so an approved SoW records what the client already agreed. */
export function scopeAmendmentNoteError(note: string): string | null {
  const trimmed = note.trim()
  if (trimmed.length < SCOPE_AMENDMENT_NOTE_MIN) {
    return 'Describe what changed in a short note'
  }
  if (trimmed.length > SCOPE_AMENDMENT_NOTE_MAX) {
    return 'Keep the scope note under 500 characters'
  }
  return null
}

export function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String((error as { code?: unknown }).code ?? '') : ''
  const message = 'message' in error ? String((error as { message?: unknown }).message ?? '') : ''
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  )
}

type AmendmentRow = {
  id: string
  sow_id: string
  note: string
  created_by: string | null
  created_at: string
}

/**
 * Newest first, grouped by SoW. A missing table returns an empty map so the app
 * still loads before the migration is applied.
 */
export async function loadSowScopeAmendments(
  supabase: { from: (table: string) => any },
  sowIds: string[],
  options?: { includeNames?: boolean }
): Promise<Map<string, SowScopeAmendment[]>> {
  const grouped = new Map<string, SowScopeAmendment[]>()
  if (sowIds.length === 0) return grouped

  const { data, error } = await supabase
    .from('sow_scope_amendments')
    .select('id, sow_id, note, created_by, created_at')
    .in('sow_id', sowIds)
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingRelationError(error)) return grouped
    throw error
  }

  const rows = (data || []) as AmendmentRow[]
  const names = new Map<string, string | null>()
  if (options?.includeNames) {
    const userIds = [...new Set(rows.map((row) => row.created_by).filter(Boolean))] as string[]
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, full_name').in('id', userIds)
      for (const user of users || []) {
        names.set(user.id, user.full_name ?? null)
      }
    }
  }

  for (const row of rows) {
    const amendment: SowScopeAmendment = {
      id: row.id,
      note: row.note,
      created_at: row.created_at,
      created_by_name: row.created_by ? names.get(row.created_by) ?? null : null,
    }
    const list = grouped.get(row.sow_id) ?? []
    list.push(amendment)
    grouped.set(row.sow_id, list)
  }

  return grouped
}

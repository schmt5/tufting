/**
 * Client für die Tally-API. Kennt keine Workshop-Semantik — das Deuten der
 * Hidden Fields passiert in workshops.ts.
 *
 * Doku: https://developers.tally.so/api-reference/endpoint/forms/list
 *       https://developers.tally.so/api-reference/endpoint/forms/questions
 */

const API = 'https://api.tally.so'

/** Dokumentiertes Maximum von GET /forms. */
const MAX_LIMIT = 500

export type FormStatus = 'BLANK' | 'DRAFT' | 'PUBLISHED'

export interface TallyForm {
  id: string
  name: string
  workspaceId: string
  status: FormStatus
  numberOfSubmissions: number
  isClosed: boolean
  createdAt: string
  updatedAt: string
}

export interface TallyQuestionField {
  uuid: string
  type: string
  blockGroupUuid: string
  title: string | null
}

export interface TallyQuestion {
  id: string
  type: string
  title: string | null
  formId: string
  isDeleted: boolean
  numberOfResponses: number
  fields: TallyQuestionField[]
}

interface FormsResponse {
  items: TallyForm[]
  page: number
  limit: number
  total: number
  hasMore: boolean
}

interface QuestionsResponse {
  questions: TallyQuestion[]
  hasResponses: boolean
}

async function get<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    throw new Error(`Tally GET ${path} → ${res.status} ${res.statusText}: ${await res.text()}`)
  }

  return (await res.json()) as T
}

export async function listForms(token: string): Promise<TallyForm[]> {
  const body = await get<FormsResponse>(token, `/forms?limit=${MAX_LIMIT}`)

  if (body.hasMore) {
    console.warn(
      `Tally: mehr als ${MAX_LIMIT} Formulare vorhanden (total=${body.total}), die Liste ist abgeschnitten`,
    )
  }

  return body.items
}

export async function getFormQuestions(token: string, formId: string): Promise<TallyQuestion[]> {
  const body = await get<QuestionsResponse>(token, `/forms/${formId}/questions`)
  return body.questions
}

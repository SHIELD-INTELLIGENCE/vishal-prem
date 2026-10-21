import { staffDirectoryForActor } from '../../functions/src/backend/directory'
import { parseInput, staffDirectoryInputSchema } from '../../functions/src/backend/validation'
import { handleTrustedEndpoint } from '../../functions/src/netlify/http'

export default async function handler(request: Request): Promise<Response> {
  return handleTrustedEndpoint(request, {
    parse: (body) => parseInput(staffDirectoryInputSchema, body),
    run: (profile, input) => staffDirectoryForActor(profile, input),
  })
}

export const config = { method: ['POST', 'OPTIONS'] as const }

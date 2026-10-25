import { labelOperationForActor } from '../../functions/src/backend/labels'
import { labelOperationInputSchema, parseInput } from '../../functions/src/backend/validation'
import { handleTrustedEndpoint } from '../../functions/src/netlify/http'

export default async function handler(request: Request): Promise<Response> {
  return handleTrustedEndpoint(request, {
    parse: (body) => parseInput(labelOperationInputSchema, body),
    run: (profile, input) => labelOperationForActor(profile, input),
  })
}

export const config = { method: ['POST', 'OPTIONS'] as const }

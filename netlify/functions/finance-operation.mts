import { financeOperationForActor } from '../../functions/src/backend/finance'
import { financeOperationInputSchema, parseInput } from '../../functions/src/backend/validation'
import { handleTrustedEndpoint } from '../../functions/src/netlify/http'

export default async function handler(request: Request): Promise<Response> {
  return handleTrustedEndpoint(request, {
    parse: (body) => parseInput(financeOperationInputSchema, body),
    run: (profile, input) => financeOperationForActor(profile, input),
  })
}

export const config = { method: ['POST', 'OPTIONS'] as const }

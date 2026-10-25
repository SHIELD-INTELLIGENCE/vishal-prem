import { purchaseOperationForActor } from '../../functions/src/backend/purchases'
import { parseInput, purchaseOperationInputSchema } from '../../functions/src/backend/validation'
import { handleTrustedEndpoint } from '../../functions/src/netlify/http'

export default async function handler(request: Request): Promise<Response> {
  return handleTrustedEndpoint(request, {
    parse: (body) => parseInput(purchaseOperationInputSchema, body),
    run: (profile, input) => purchaseOperationForActor(profile, input),
  })
}

export const config = { method: ['POST', 'OPTIONS'] as const }

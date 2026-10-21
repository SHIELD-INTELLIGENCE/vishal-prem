import { inventoryOperationForActor } from '../../functions/src/backend/inventory'
import { inventoryOperationInputSchema, parseInput } from '../../functions/src/backend/validation'
import { handleTrustedEndpoint } from '../../functions/src/netlify/http'

export default async function handler(request: Request): Promise<Response> {
  return handleTrustedEndpoint(request, {
    parse: (body) => parseInput(inventoryOperationInputSchema, body),
    run: (profile, input) => inventoryOperationForActor(profile, input),
  })
}

export const config = { method: ['POST', 'OPTIONS'] as const }

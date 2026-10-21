import { deliveryOperationForActor } from '../../functions/src/backend/delivery'
import { deliveryOperationInputSchema, parseInput } from '../../functions/src/backend/validation'
import { handleTrustedEndpoint } from '../../functions/src/netlify/http'

export default async function handler(request: Request): Promise<Response> {
  return handleTrustedEndpoint(request, {
    parse: (body) => parseInput(deliveryOperationInputSchema, body),
    run: (profile, input) => deliveryOperationForActor(profile, input),
  })
}

export const config = { method: ['POST', 'OPTIONS'] as const }

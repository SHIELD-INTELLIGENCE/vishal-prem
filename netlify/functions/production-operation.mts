import { productionOperationForActor } from '../../functions/src/backend/production'
import { parseInput, productionOperationInputSchema } from '../../functions/src/backend/validation'
import { handleTrustedEndpoint } from '../../functions/src/netlify/http'

export default async function handler(request: Request): Promise<Response> {
  return handleTrustedEndpoint(request, {
    parse: (body) => parseInput(productionOperationInputSchema, body),
    run: (profile, input) => productionOperationForActor(profile, input),
  })
}

export const config = { method: ['POST', 'OPTIONS'] as const }

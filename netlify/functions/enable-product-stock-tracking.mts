import { enableProductStockTrackingForActor } from '../../functions/src/backend/products'
import {
  enableProductStockTrackingInputSchema,
  parseInput,
} from '../../functions/src/backend/validation'
import { handleTrustedEndpoint } from '../../functions/src/netlify/http'

export default async function handler(request: Request): Promise<Response> {
  return handleTrustedEndpoint(request, {
    parse: (body) => parseInput(enableProductStockTrackingInputSchema, body),
    run: (profile, input) => enableProductStockTrackingForActor(profile, input),
  })
}

export const config = {
  method: ['POST', 'OPTIONS'] as const,
}

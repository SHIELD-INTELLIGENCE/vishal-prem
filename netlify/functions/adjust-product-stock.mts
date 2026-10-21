import { adjustProductStockForActor } from '../../functions/src/backend/products'
import {
  adjustProductStockInputSchema,
  parseInput,
} from '../../functions/src/backend/validation'
import { handleTrustedEndpoint } from '../../functions/src/netlify/http'

export default async function handler(request: Request): Promise<Response> {
  return handleTrustedEndpoint(request, {
    parse: (body) => parseInput(adjustProductStockInputSchema, body),
    run: (profile, input) => adjustProductStockForActor(profile, input),
  })
}

export const config = {
  method: ['POST', 'OPTIONS'] as const,
}

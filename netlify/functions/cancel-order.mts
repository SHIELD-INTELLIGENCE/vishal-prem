import { cancelOrderForActor } from '../../functions/src/backend/orders'
import {
  cancelOrderInputSchema,
  parseInput,
} from '../../functions/src/backend/validation'
import { handleTrustedEndpoint } from '../../functions/src/netlify/http'

export default async function handler(request: Request): Promise<Response> {
  return handleTrustedEndpoint(request, {
    parse: (body) => parseInput(cancelOrderInputSchema, body),
    run: (profile, input) => cancelOrderForActor(profile, input),
  })
}

export const config = {
  method: ['POST', 'OPTIONS'] as const,
}

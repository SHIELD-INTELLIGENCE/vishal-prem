import { createOrderForActor } from '../../functions/src/backend/orders'
import {
  createOrderInputSchema,
  parseInput,
} from '../../functions/src/backend/validation'
import { handleTrustedEndpoint } from '../../functions/src/netlify/http'

export default async function handler(request: Request): Promise<Response> {
  return handleTrustedEndpoint(request, {
    parse: (body) => parseInput(createOrderInputSchema, body),
    run: (profile, input) => createOrderForActor(profile, input),
  })
}

export const config = {
  method: ['POST', 'OPTIONS'] as const,
}

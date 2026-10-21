import { recordOrderPaymentForActor } from '../../functions/src/backend/payments'
import {
  parseInput,
  recordOrderPaymentInputSchema,
} from '../../functions/src/backend/validation'
import { handleTrustedEndpoint } from '../../functions/src/netlify/http'

export default async function handler(request: Request): Promise<Response> {
  return handleTrustedEndpoint(request, {
    parse: (body) => parseInput(recordOrderPaymentInputSchema, body),
    run: (profile, input) => recordOrderPaymentForActor(profile, input),
  })
}

export const config = {
  method: ['POST', 'OPTIONS'] as const,
}

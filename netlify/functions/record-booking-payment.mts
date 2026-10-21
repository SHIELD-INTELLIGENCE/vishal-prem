import { recordBookingPaymentForActor } from '../../functions/src/backend/payments'
import {
  parseInput,
  recordBookingPaymentInputSchema,
} from '../../functions/src/backend/validation'
import { handleTrustedEndpoint } from '../../functions/src/netlify/http'

export default async function handler(request: Request): Promise<Response> {
  return handleTrustedEndpoint(request, {
    parse: (body) => parseInput(recordBookingPaymentInputSchema, body),
    run: (profile, input) => recordBookingPaymentForActor(profile, input),
  })
}

export const config = {
  method: ['POST', 'OPTIONS'] as const,
}

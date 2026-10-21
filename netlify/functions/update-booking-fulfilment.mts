import { updateBookingFulfilmentForActor } from '../../functions/src/backend/bookings'
import { parseInput, updateBookingFulfilmentInputSchema } from '../../functions/src/backend/validation'
import { handleTrustedEndpoint } from '../../functions/src/netlify/http'

export default async function handler(request: Request): Promise<Response> {
  return handleTrustedEndpoint(request, {
    parse: (body) => parseInput(updateBookingFulfilmentInputSchema, body),
    run: (profile, input) => updateBookingFulfilmentForActor(profile, input),
  })
}

export const config = { method: ['POST', 'OPTIONS'] as const }

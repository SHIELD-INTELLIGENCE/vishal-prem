import { createBookingForActor } from '../../functions/src/backend/bookings'
import { createBookingInputSchema, parseInput } from '../../functions/src/backend/validation'
import { handleTrustedEndpoint } from '../../functions/src/netlify/http'

export default async function handler(request: Request): Promise<Response> {
  return handleTrustedEndpoint(request, {
    parse: (body) => parseInput(createBookingInputSchema, body),
    run: (profile, input) => createBookingForActor(profile, input),
  })
}

export const config = { method: ['POST', 'OPTIONS'] as const }

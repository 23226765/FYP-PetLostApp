export interface ContactActions {
  dialNumber: string
  whatsappNumber: string
  callHref: string
  whatsappHref: string
}

const ALLOWED_PHONE_CHARACTERS = /^\+?[\d\s().-]+$/
const E164_DIGITS = /^[1-9]\d{7,14}$/

/**
 * Builds safe call and WhatsApp links from an owner-supplied phone number.
 * Local eight-digit numbers default to Hong Kong's +852 country code.
 */
export function createContactActions(
  value: string | null | undefined,
  message: string,
): ContactActions | null {
  const raw = value?.trim()
  if (!raw || !ALLOWED_PHONE_CHARACTERS.test(raw)) return null

  const digits = raw.replace(/\D/g, '')
  let internationalNumber = ''

  if (raw.startsWith('+')) {
    internationalNumber = digits
  } else if (raw.startsWith('00')) {
    internationalNumber = digits.slice(2)
  } else if (digits.startsWith('852') && digits.length === 11) {
    internationalNumber = digits
  } else if (digits.length === 8) {
    internationalNumber = `852${digits}`
  }

  if (!E164_DIGITS.test(internationalNumber)) return null

  const dialNumber = `+${internationalNumber}`
  return {
    dialNumber,
    whatsappNumber: internationalNumber,
    callHref: `tel:${dialNumber}`,
    whatsappHref: `https://wa.me/${internationalNumber}?text=${encodeURIComponent(message)}`,
  }
}

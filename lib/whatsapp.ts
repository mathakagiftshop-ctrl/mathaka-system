// Click-to-chat links. They open WhatsApp with a message ready to send; nothing
// is sent automatically and no WhatsApp server is needed.

/** Keep digits only; convert a local Sri Lankan 07x number to 947x. */
export function phoneDigits(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.length === 10 && digits.startsWith("07")) return `94${digits.slice(1)}`;
  return digits;
}

export function whatsappLink(phone: string, message: string) {
  const digits = phoneDigits(phone);
  const text = encodeURIComponent(message);
  return digits.length >= 8 ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
}

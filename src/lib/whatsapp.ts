export function whatsappLink(phone: string, text?: string) {
  const digits = phone.replace(/[^0-9]/g, '');
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${q}`;
}

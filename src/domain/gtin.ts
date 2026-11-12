// Código de barras GTIN (EAN-13) con su dígito de control (RF-003 RN2).
export function isValidGtin(code: string): boolean {
  const digits = Array.from(code, Number);
  const checkDigit = digits.pop();
  // Desde la derecha, sin el dígito de control, los pesos alternan 3 y 1.
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === checkDigit;
}

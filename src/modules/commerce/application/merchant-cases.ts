// D2 y D3 del grill comercial (#208): los casos que decide el moderador sobre un comercio.
// denuncia: «este comercio no es de quien dice». disputa: otra cuenta, estando en la tienda, intentó
// registrarla y ya tenía dueño. Solo la clave seudónima de quien lo abre (EC-08).
export interface MerchantCase {
  id: string;
  establishmentId: string;
  kind: 'denuncia' | 'disputa';
  reporterKey: string;
  reason: string;
  createdAt: Date;
}

// Puerto hacia el esquema commerce.
export interface MerchantCaseRepository {
  // Si esa clave ya tiene un caso abierto sobre esa tienda.
  hasOpen(establishmentId: string, reporterKey: string): Promise<boolean>;
  open(merchantCase: MerchantCase): Promise<void>;
}

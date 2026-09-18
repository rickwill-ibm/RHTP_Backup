/**
 * Financial Clearance — superseded by the Golden Thread order-to-cash surface.
 *
 * The previous standalone financial-clearance screen has been replaced by the
 * end-to-end Golden Thread (eligibility → medical necessity → prior auth →
 * patient estimation → claim → 835 → reconciliation → governed recovery),
 * unified by the shared Evidence Record. This route redirects there so any
 * existing links (CMS hub, work queue) continue to resolve.
 */
import { redirect } from 'next/navigation';

export default function FinancialClearancePage(): never {
  redirect('/golden-thread');
}

/**
 * Copies the public player-card URL (app/card/[address]/page.tsx) to the
 * clipboard. Deliberately just a link, not a downloadable image — that's a
 * real image-generation feature on its own (see Valor's dedicated
 * /card/[wallet]/download route), scoped out for this first pass.
 */
export async function shareCardUrl(address: string): Promise<boolean> {
  const url = `${window.location.origin}/card/${address}`;
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

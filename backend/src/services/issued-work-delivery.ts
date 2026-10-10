/** Invoke only after the issuing transaction commits. The callback wakes the
 * durable dispatcher; it does not perform provider delivery in the transaction. */
export async function notifyIssuedWorkCommitted(wake?: () => void | Promise<void>): Promise<void> {
  try {
    await wake?.();
  } catch {
    // The intent is already durable and the background poll can recover it.
    console.error("Vendor access delivery wake failed; background processing will retry.");
  }
}

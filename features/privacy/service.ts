export async function requestDataDeletionStub(_userId: string): Promise<{ requested: boolean }> {
  return { requested: true };
}

import type { ArtifactContract } from "./types";

export class ArtifactContractRegistry {
  private readonly contracts = new Map<string, ArtifactContract>();

  register(contract: ArtifactContract) {
    if (this.contracts.has(contract.id)) {
      throw new Error(`Artifact contract "${contract.id}" is already registered`);
    }

    this.contracts.set(contract.id, contract);
  }

  get(id: string) {
    const contract = this.contracts.get(id);
    if (!contract) {
      throw new Error(`Artifact contract "${id}" is not registered`);
    }

    return contract;
  }

  has(id: string) {
    return this.contracts.has(id);
  }

  list() {
    return Array.from(this.contracts.values());
  }
}

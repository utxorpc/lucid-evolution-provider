import { Address } from "@anastasia-labs/cardano-multiplatform-lib-nodejs";
import {
  Address as LucidAddress,
  Assets,
  Credential,
  Datum,
  DatumHash,
  Delegation,
  EvalRedeemer,
  OutRef,
  ProtocolParameters,
  Provider,
  RewardAddress,
  Script,
  Transaction,
  TxHash,
  TxOutput,
  Unit,
  UTxO,
} from "@lucid-evolution/core-types";

import { CardanoQueryClient, CardanoSubmitClient } from "@utxorpc/sdk";
import type * as spec from "@utxorpc/spec";

export class U5C implements Provider {
  private queryClient: CardanoQueryClient;
  private submitClient: CardanoSubmitClient;

  constructor({
    url,
    headers,
  }: {
    url: string;
    headers?: Record<string, string>;
  }) {
    this.queryClient = new CardanoQueryClient({
      uri: url,
      headers,
    });

    this.submitClient = new CardanoSubmitClient({
      uri: url,
      headers,
    });
  }
  evaluateTx(
    tx: Transaction,
    additionalUTxOs?: UTxO[]
  ): Promise<EvalRedeemer[]> {
    throw new Error("Method not implemented.");
  }

  async getProtocolParameters(): Promise<ProtocolParameters> {
    const rpcPParams = await this.queryClient.readParams();
    if (rpcPParams === undefined || rpcPParams === null) {
      throw new Error(`Error fetching protocol parameters`);
    }
    return this._rpcPParamsToCorePParams(rpcPParams);
  }

  async getUtxos(
    addressOrCredential: LucidAddress | Credential
  ): Promise<UTxO[]> {
    let addressBytes: Uint8Array;

    if (typeof addressOrCredential === "string") {
      const address = Address.from_bech32(addressOrCredential);
      addressBytes = address.to_raw_bytes();
    } else if (addressOrCredential instanceof Credential) {
      throw new Error("Credential to bytes conversion not implemented");
    } else {
      throw new Error("Invalid address or credential type");
    }

    let utxoSearchResult =
      await this.queryClient.searchUtxosByAddress(addressBytes);

      return utxoSearchResult.map((result: any) => this._mapToUTxO(result));
  }

  async getUtxosWithUnit(
    addressOrCredential: LucidAddress | Credential,
    unit: Unit
  ): Promise<UTxO[]> {
    let addressBytes: Uint8Array;

    if (typeof addressOrCredential === "string") {
      const address = Address.from_bech32(addressOrCredential);
      addressBytes = address.to_raw_bytes();
    } else {
      throw new Error(`Method not implemented.`);
    }

    const unitBytes = new Uint8Array(Buffer.from(unit, "hex"));
    let utxoSearchResult = await this.queryClient.searchUtxosByAddressWithAsset(
      addressBytes,
      undefined,
      unitBytes
    );

    return utxoSearchResult.map((result: any) => this._mapToUTxO(result));
  }

  async getUtxoByUnit(unit: Unit): Promise<UTxO> {
    const unitBytes = new Uint8Array(Buffer.from(unit, "hex"));

    const utxoSearchResult = await this.queryClient.searchUtxosByAsset(
      undefined,
      unitBytes
    );

    if (utxoSearchResult.length === 0) {
      throw new Error("No UTxO found for the given unit.");
    }

    return this._mapToUTxO(utxoSearchResult[0]);
  }

  async submitTx(tx: Transaction): Promise<TxHash> {
    const txBytes = Buffer.from(tx, "hex");
    const hash = await this.submitClient.submitTx(new Uint8Array(txBytes));
    return Buffer.from(hash).toString("hex");
  }

  //TODO: implement this method
  async getUtxosByOutRef(outRefs: Array<OutRef>): Promise<UTxO[]> {
    throw new Error("Method not implemented.");
  }

  //TODO: implement this method
  async getDelegation(rewardAddress: RewardAddress): Promise<Delegation> {
    throw new Error("Method not implemented.");
  }

  //TODO: implement this method
  async getDatum(datumHash: DatumHash): Promise<Datum> {
    throw new Error("Method not implemented.");
  }

  //TODO: implement this method
  async awaitTx(txHash: TxHash, checkInterval?: number): Promise<boolean> {
    throw new Error("Method not implemented.");
  }

  private _mapToUTxO(result: any): UTxO {
    const txHash = result.txoRef.hash
      ? Buffer.from(result.txoRef.hash).toString("hex")
      : "";
    const outputIndex =
      typeof result.txoRef.index === "number" ? result.txoRef.index : 0;
    const address = result.parsedValued.address
      ? Buffer.from(result.parsedValued.address).toString("hex")
      : "";
    const assets = Array.isArray(result.parsedValued.assets)
      ? result.parsedValued.assets.reduce((acc: Assets, asset: any) => {
          if (asset && asset.policyId && asset.assets) {
            const policyId = Buffer.from(asset.policyId).toString("hex");
            asset.assets.forEach((subAsset: any) => {
              if (subAsset && subAsset.name && subAsset.outputCoin) {
                const assetName = Buffer.from(subAsset.name).toString("hex");
                const unit = `"${policyId}${assetName}"`;
                acc[unit] = BigInt(subAsset.outputCoin);
              }
            });
          }
          return acc;
        }, {})
      : {};

    if (
      typeof result.parsedValued.coin === "string" ||
      typeof result.parsedValued.coin === "number"
    ) {
      assets[""] = BigInt(result.parsedValued.coin);
    } else {
      assets[""] = BigInt(0);
    }
    let datumHash: DatumHash | null = null;
    let datum: Datum | null = null;
    if (result.parsedValued.datum) {
      if (result.parsedValued.datum.hash) {
        datumHash = Buffer.from(result.parsedValued.datum.hash).toString("hex");
      }
      if (result.parsedValued.datum.data) {
        datum = Buffer.from(result.parsedValued.datum.data).toString("hex");
      }
    }
    const scriptRef: Script | null = null; 
    const outRef: OutRef = { txHash, outputIndex };
    const txOutput: TxOutput = {
      address,
      assets,
      datumHash,
      datum,
      scriptRef,
    };
    // Combine them into UTxO
    return {
      ...outRef,
      ...txOutput,
    };
  }

  private _rpcPParamsToCorePParams(
    rpcPParams: spec.cardano.PParams
  ): ProtocolParameters {
    return {
      minFeeA: Number(rpcPParams.minFeeCoefficient),
      minFeeB: Number(rpcPParams.minFeeConstant),
      maxTxSize: Number(rpcPParams.maxTxSize),
      maxValSize: Number(rpcPParams.maxValueSize),
      keyDeposit: BigInt(rpcPParams.stakeKeyDeposit),
      poolDeposit: BigInt(rpcPParams.poolDeposit),
      drepDeposit: BigInt(0), // TODO: find values
      govActionDeposit: BigInt(0), // TODO: find values
      priceMem: Number(rpcPParams.prices?.memory),
      priceStep: Number(rpcPParams.prices?.steps),
      maxTxExMem: BigInt(
        rpcPParams.maxExecutionUnitsPerTransaction?.memory || 0
      ),
      maxTxExSteps: BigInt(
        rpcPParams.maxExecutionUnitsPerTransaction?.steps || 0
      ),
      coinsPerUtxoByte: BigInt(rpcPParams.coinsPerUtxoByte),
      collateralPercentage: Number(rpcPParams.collateralPercentage),
      maxCollateralInputs: Number(rpcPParams.maxCollateralInputs),
      minFeeRefScriptCostPerByte: 0, // TODO: find values
      // TODO: find values
      costModels: {
        PlutusV1:
          rpcPParams.costModels?.plutusV1?.values.reduce(
            (model: Record<string, number>, value: any, index: number) => {
              model[index.toString()] = Number(value.toString());
              return model;
            },
            {}
          ) ?? {},

        PlutusV2:
          rpcPParams.costModels?.plutusV2?.values.reduce(
            (model: Record<string, number>, value: any, index: number) => {
              model[index.toString()] = Number(value.toString());
              return model;
            },
            {}
          ) ?? {},

        PlutusV3:
          rpcPParams.costModels?.plutusV3?.values.reduce(
            (model: Record<string, number>, value: any, index: number) => {
              model[index.toString()] = Number(value.toString());
              return model;
            },
            {}
          ) ?? {},
      },
    };
  }
}

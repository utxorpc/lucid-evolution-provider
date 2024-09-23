import { Address } from "@anastasia-labs/cardano-multiplatform-lib-nodejs";
import {
  Credential,
  Address as LucidAddress,
  Assets,
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
import { fromHex, toHex } from "@lucid-evolution/core-utils";
import { addressFromHexOrBech32 } from "@lucid-evolution/utils";

import { CardanoQueryClient, CardanoSubmitClient } from "@utxorpc/sdk";
import type * as spec from "@utxorpc/spec";
import { submit } from "@utxorpc/spec";

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
    if (typeof addressOrCredential === "string") {
      const address = Address.from_bech32(addressOrCredential);
      const addressBytes = address.to_raw_bytes();
      const utxoSearchResult =
        await this.queryClient.searchUtxosByAddress(addressBytes);
      return utxoSearchResult.map((result: any) => this._mapToUTxO(result));
    } else if (addressOrCredential instanceof Credential) {
      // TODO: Implement Credential handling
      throw new Error("Credential handling is not yet implemented");
    } else {
      throw new Error("Invalid address or credential type");
    }
  }

  async getUtxosWithUnit(
    addressOrCredential: LucidAddress | Credential,
    unit: Unit
  ): Promise<UTxO[]> {
    if (typeof addressOrCredential === "string") {
      const address = addressFromHexOrBech32(addressOrCredential);
      // const address = Address.from_bech32(addressOrCredential);
      const addressBytes = address.to_raw_bytes();
      const unitBytes = fromHex(unit);
      const utxoSearchResult =
        await this.queryClient.searchUtxosByAddressWithAsset(
          addressBytes,
          undefined,
          unitBytes
        );
      return utxoSearchResult.map((result: any) => this._mapToUTxO(result));
    } else if (addressOrCredential instanceof Credential) {
      // TODO: Implement Credential handling
      throw new Error("Credential handling is not yet implemented");
    } else {
      throw new Error("Invalid address or credential type");
    }
  }

  async getUtxoByUnit(unit: Unit): Promise<UTxO> {
    const unitBytes = fromHex(unit);

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
    const txBytes = fromHex(tx);
    const hash = await this.submitClient.submitTx(txBytes);
    return toHex(hash);
  }

  async getUtxosByOutRef(outRefs: Array<OutRef>): Promise<UTxO[]> {
    const references = outRefs.map((outRef) => {
      const txHashBytes = fromHex(outRef.txHash.toString());
      return {
        txHash: txHashBytes,
        outputIndex: Number(outRef.outputIndex.toString()),
      };
    });

    const utxoSearchResult =
      await this.queryClient.readUtxosByOutputRef(references);
    
    return utxoSearchResult.map((result: any) => this._mapToUTxO(result));
  }

  async getDelegation(rewardAddress: RewardAddress): Promise<Delegation> {
    throw new Error("Method not implemented.");
  }

  async getDatum(datumHash: DatumHash): Promise<Datum> {
    throw new Error("Method not implemented.");
  }

  async awaitTx(
    txHash: TxHash,
    checkInterval: number = 100
  ): Promise<boolean> {
    const timeout = checkInterval * 10;

    const onConfirmed = (async () => {
      const updates = this.submitClient.waitForTx(fromHex(txHash.toString()));
     
      for await (const stage of updates) {
        if (stage === submit.Stage.CONFIRMED) {
          return true;
        }
      }

      return false;
    })();

    const onTimeout: Promise<boolean> = new Promise((resolve) =>
      setTimeout(() => resolve(false), timeout)
    );

    return Promise.race([onConfirmed, onTimeout]);
  }

  private _mapToUTxO(result: any): UTxO {
    const txHash = result.txoRef.hash ? toHex(result.txoRef.hash) : "";
    const outputIndex =
      typeof result.txoRef.index === "number" ? result.txoRef.index : 0;
    const address = result.parsedValued.address
      ? toHex(result.parsedValued.address)
      : "";
    const assets = Array.isArray(result.parsedValued.assets)
      ? result.parsedValued.assets.reduce((acc: Assets, asset: any) => {
          if (asset && asset.policyId && asset.assets) {
            const policyId = toHex(asset.policyId);
            asset.assets.forEach((subAsset: any) => {
              if (subAsset && subAsset.name && subAsset.outputCoin) {
                const assetName = toHex(subAsset.name);
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
        datumHash = toHex(result.parsedValued.datum.hash);
      }
      if (result.parsedValued.datum.data) {
        datum = toHex(result.parsedValued.datum.data);
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
      drepDeposit: BigInt(500000000), // TODO: expose in UTxORPC node sdk, currently hardcoded
      govActionDeposit: BigInt(100000000000), // TODO: expose in UTxORPC node sdk, currently hardcoded
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
      minFeeRefScriptCostPerByte: Number(15), // TODO: expose in UTxORPC node sdk, currently hardcoded
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

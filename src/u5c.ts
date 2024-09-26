import { Address } from "@anastasia-labs/cardano-multiplatform-lib-nodejs";
import {
  Credential as LucidCredential,
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
  Unit,
  UTxO,
} from "@lucid-evolution/core-types";
import { fromHex, toHex } from "@lucid-evolution/core-utils";

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
    addressOrCredential: LucidAddress | LucidCredential
  ): Promise<UTxO[]> {
    if (typeof addressOrCredential === "string") {
      const address = Address.from_bech32(addressOrCredential);
      const addressBytes = address.to_raw_bytes();
      const utxoSearchResult =
        await this.queryClient.searchUtxosByAddress(addressBytes);
      return utxoSearchResult.map((result: any) => this._mapToUTxO(result));
    } else if (
      addressOrCredential &&
      (addressOrCredential.type === "Key" ||
        addressOrCredential.type === "Script") &&
      typeof addressOrCredential.hash === "string"
    ) {
      let credentialBytes: Uint8Array;

      if (addressOrCredential.type === "Key") {
        credentialBytes = fromHex(addressOrCredential.hash);
      } else if (addressOrCredential.type === "Script") {
        credentialBytes = fromHex(addressOrCredential.hash);
      } else {
        throw new Error("Invalid credential type");
      }

      const utxoSearchResultPayment =
        await this.queryClient.searchUtxosByPaymentPart(credentialBytes);
      const utxoSearchResultDelegation =
        await this.queryClient.searchUtxosByDelegationPart(credentialBytes);
      const combinedResults = [
        ...utxoSearchResultPayment,
        ...utxoSearchResultDelegation,
      ];

      const uniqueUtxos = new Map<string, any>();

      for (const utxo of combinedResults) {
        const key = `${utxo.txoRef.hash}-${utxo.txoRef.index}`;
        if (!uniqueUtxos.has(key)) {
          uniqueUtxos.set(key, utxo);
        }
      }

      return Array.from(uniqueUtxos.values()).map((result: any) =>
        this._mapToUTxO(result)
      );
    } else {
      throw new Error("Invalid address or credential type");
    }
  }

  async getUtxosWithUnit(
    addressOrCredential: LucidAddress | LucidCredential,
    unit: Unit
  ): Promise<UTxO[]> {
    if (typeof addressOrCredential === "string") {
      const address = Address.from_bech32(addressOrCredential);
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

  async awaitTx(txHash: TxHash, checkInterval: number = 100): Promise<boolean> {
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
    if (!result.txoRef?.hash) {
      throw new Error("Invalid UTxO: Missing transaction hash (txHash).");
    }
    const txHash = toHex(result.txoRef.hash);

    if (typeof result.txoRef.index !== "number") {
      throw new Error("Invalid UTxO: Missing or invalid output index.");
    }
    const outputIndex = result.txoRef.index;

    if (!result.parsedValued?.address) {
      throw new Error("Invalid UTxO: Missing address.");
    }
    const addressObject = Address.from_hex(toHex(result.parsedValued.address));
    const address = addressObject.to_bech32();

    const assets: Assets = {};
    assets["lovelace"] = BigInt(result.parsedValued.coin);

    if (Array.isArray(result.parsedValued.assets)) {
      result.parsedValued.assets.forEach((asset: any) => {
        if (asset && asset.policyId && Array.isArray(asset.assets)) {
          const policyId = toHex(asset.policyId);
          asset.assets.forEach((subAsset: any) => {
            if (subAsset && subAsset.name && subAsset.outputCoin) {
              const assetName = toHex(subAsset.name);
              const unit = `${policyId}${assetName}`;
              assets[unit] = BigInt(subAsset.outputCoin);
            }
          });
        }
      });
    }

    let datumHash: DatumHash | undefined;
    let datum: Datum | undefined;
    if (result.parsedValued.datum != undefined) {
      if (
        result.parsedValued.datum?.originalCbor &&
        result.parsedValued.datum.originalCbor.length > 0
      ) {
        datum = toHex(result.parsedValued.datum.originalCbor);
      } else if (
        result.parsedValued.datum?.hash &&
        result.parsedValued.datum.hash.length > 0
      ) {
        datumHash = toHex(result.parsedValued.datum.hash);
      }
    }

    let scriptRef: Script | undefined;
    if (result.parsedValued.script?.script) {
      const scriptCase = result.parsedValued.script.script.case;
      const scriptValue = result.parsedValued.script.script.value;

      switch (scriptCase) {
        case "native":
          scriptRef = {
            type: "Native",
            script: toHex(scriptValue),
          };
          break;
        case "plutusV1":
          scriptRef = {
            type: "PlutusV1",
            script: toHex(scriptValue),
          };
          break;
        case "plutusV2":
          scriptRef = {
            type: "PlutusV2",
            script: toHex(scriptValue),
          };
          break;
        case "plutusV3":
          scriptRef = {
            type: "PlutusV3",
            script: toHex(scriptValue),
          };
          break;
        default:
          throw new Error(`Unsupported script case: ${scriptCase}`);
      }
    }

    return {
      txHash,
      outputIndex,
      address,
      assets,
      datumHash,
      datum,
      scriptRef,
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
      priceMem: 0.0000721,
      priceStep: 0.0577,
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

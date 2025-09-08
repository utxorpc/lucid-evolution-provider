import {
  Address,
  Transaction as CoreTransaction,
  TransactionInput,
  TransactionOutput,
} from "@anastasia-labs/cardano-multiplatform-lib-nodejs";
import {
  Address as LucidAddress,
  Assets,
  Credential as LucidCredential,
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
import {
  utxoToTransactionInput,
  utxoToTransactionOutput,
} from "@lucid-evolution/lucid";

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

  async evaluateTx(
    tx: Transaction,
    additionalUTxOs?: UTxO[]
  ): Promise<EvalRedeemer[]> {
    const coreTx = CoreTransaction.from_cbor_hex(tx);
    additionalUTxOs?.forEach((utxo) => {
      const inputCbor = utxoToTransactionInput(utxo).to_cbor_hex();
      const outputCbor = utxoToTransactionOutput(utxo).to_canonical_cbor_hex();
      coreTx.body().inputs().add(TransactionInput.from_cbor_hex(inputCbor));
      coreTx.body().outputs().add(TransactionOutput.from_cbor_hex(outputCbor));
    });

    const report = await this.submitClient.evalTx(
      fromHex(coreTx.to_cbor_hex())
    );
    const evalResult = report.report[0].chain.value?.redeemers!;
    let evalRedeemers: EvalRedeemer[] = [];
    for (let i = 0; i < evalResult.length; i++) {
      const evalRedeemer: EvalRedeemer = {
        ex_units: {
          mem: Number(evalResult[i].exUnits?.memory!),
          steps: Number(evalResult[i].exUnits?.steps!),
        },
        redeemer_index: evalResult[i].index,
        redeemer_tag:
          evalResult[i].purpose === 0
            ? "spend"
            : evalResult[i].purpose === 1
              ? "mint"
              : evalResult[i].purpose === 2
                ? "publish"
                : evalResult[i].purpose === 3
                  ? "withdraw"
                  : evalResult[i].purpose === 4
                    ? "vote"
                    : "propose",
      };
      evalRedeemers.push(evalRedeemer);
    }

    evalRedeemers.forEach((evalRedeemer) => {
      console.log(evalRedeemer);
    });
    return evalRedeemers;
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
        await this.queryClient.searchUtxosByAddress(new Uint8Array(addressBytes));
      return utxoSearchResult.map((result: any) => this._mapToUTxO(result));
    } else if (
      addressOrCredential &&
      (addressOrCredential.type === "Key" ||
        addressOrCredential.type === "Script") &&
      typeof addressOrCredential.hash === "string"
    ) {
      let credentialBytes: Uint8Array;
      credentialBytes = fromHex(addressOrCredential.hash);

      const utxoSearchResultPayment =
        await this.queryClient.searchUtxosByPaymentPart(new Uint8Array(credentialBytes));
      const utxoSearchResultDelegation =
        await this.queryClient.searchUtxosByDelegationPart(new Uint8Array(credentialBytes));
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
    const unitBytes = fromHex(unit);

    if (typeof addressOrCredential === "string") {
      const address = Address.from_bech32(addressOrCredential);
      const addressBytes = address.to_raw_bytes();
      const utxoSearchResult =
        await this.queryClient.searchUtxosByAddressWithAsset(
          new Uint8Array(addressBytes),
          undefined,
          new Uint8Array(unitBytes)
        );
      return utxoSearchResult.map((result: any) => this._mapToUTxO(result));
    } else if (
      addressOrCredential &&
      (addressOrCredential.type === "Key" ||
        addressOrCredential.type === "Script") &&
      typeof addressOrCredential.hash === "string"
    ) {
      let credentialBytes: Uint8Array;
      credentialBytes = fromHex(addressOrCredential.hash);

      const utxoSearchResultPayment =
        await this.queryClient.searchUtxosByPaymentPartWithAsset(
          new Uint8Array(credentialBytes),
          undefined,
          new Uint8Array(unitBytes)
        );
      const utxoSearchResultDelegation =
        await this.queryClient.searchUtxosByDelegationPartWithAsset(
          new Uint8Array(credentialBytes),
          undefined,
          new Uint8Array(unitBytes)
        );
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

  async getUtxoByUnit(unit: Unit): Promise<UTxO> {
    const unitBytes = fromHex(unit);

    const utxoSearchResult = await this.queryClient.searchUtxosByAsset(
      undefined,
      new Uint8Array(unitBytes)
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
        txHash: new Uint8Array(txHashBytes),
        outputIndex: Number(outRef.outputIndex.toString()),
      };
    });

    const utxoSearchResult =
      await this.queryClient.readUtxosByOutputRef(references);

    return utxoSearchResult.map((result: any) => this._mapToUTxO(result));
  }

  async getDelegation(rewardAddress: RewardAddress): Promise<Delegation> {
    // TODO: implement getDelegation
    throw new Error("Method not implemented.");
  }

  async getDatum(datumHash: DatumHash): Promise<Datum> {
    // TODO: implement getDatum
    throw new Error("Method not implemented.");
  }

  async awaitTx(
    txHash: TxHash,
    checkInterval: number = 1000
  ): Promise<boolean> {
    const updates = this.submitClient.waitForTx(fromHex(txHash));

    for await (const stage of updates) {
      if (stage === submit.Stage.CONFIRMED) {
        return true;
      }
    }

    return false;
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
    const addressObject = Address.from_raw_bytes(result.parsedValued.address);
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

  private async _rpcPParamsToCorePParams(
    rpcPParams: spec.cardano.PParams
  ): Promise<ProtocolParameters> {
    return {
      minFeeA: Number(rpcPParams.minFeeCoefficient),
      minFeeB: Number(rpcPParams.minFeeConstant),
      maxTxSize: Number(rpcPParams.maxTxSize),
      maxValSize: Number(rpcPParams.maxValueSize),
      keyDeposit: rpcPParams.stakeKeyDeposit,
      poolDeposit: rpcPParams.poolDeposit,
      drepDeposit: rpcPParams.drepDeposit,
      govActionDeposit: rpcPParams.governanceActionDeposit,
      priceMem: Number(
        rpcPParams.prices?.memory?.numerator! /
          rpcPParams.prices?.memory?.denominator!
      ),
      priceStep: Number(
        rpcPParams.prices?.steps?.numerator! /
          rpcPParams.prices?.steps?.denominator!
      ),
      maxTxExMem: rpcPParams.maxExecutionUnitsPerTransaction?.memory!,
      maxTxExSteps: rpcPParams.maxExecutionUnitsPerTransaction?.steps!,
      coinsPerUtxoByte: rpcPParams.coinsPerUtxoByte,
      collateralPercentage: Number(rpcPParams.collateralPercentage),
      maxCollateralInputs: Number(rpcPParams.maxCollateralInputs),
      minFeeRefScriptCostPerByte:
        rpcPParams.minFeeScriptRefCostPerByte?.numerator! /
        rpcPParams.minFeeScriptRefCostPerByte?.denominator!,
      costModels: {
        PlutusV1: this._mapCostModel(rpcPParams.costModels?.plutusV1?.values!),
        PlutusV2: this._mapCostModel(rpcPParams.costModels?.plutusV2?.values!),
        PlutusV3: this._mapCostModel(rpcPParams.costModels?.plutusV3?.values!),
      },
    };
  }
  private _mapCostModel(costModel: bigint[]): Record<string, number> {
    const costModelMap: Record<string, number> = {};
    for (let i = 0; i < costModel.length; i++) {
      costModelMap[i.toString()] = Number(costModel[i]);
    }
    return costModelMap;
  }
}

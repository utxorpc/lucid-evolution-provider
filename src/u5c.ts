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

  // TODO: expose in UTxORPC node sdk, currently hardcoded
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
      credentialBytes = fromHex(addressOrCredential.hash);
      
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

  async awaitTx(txHash: TxHash, checkInterval: number = 1000): Promise<boolean> {
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

  // @TODO: use the rpc response and map to core types instead of hardcoded values
  private async _rpcPParamsToCorePParams(
    rpcPParams: spec.cardano.PParams
  ): Promise<ProtocolParameters> {
    return {
      minFeeA: Number(rpcPParams.minFeeCoefficient),
      minFeeB: Number(rpcPParams.minFeeConstant),
      maxTxSize: Number(rpcPParams.maxTxSize), 
      maxValSize: Number(rpcPParams.maxValueSize),
      coinsPerUtxoByte: BigInt(rpcPParams.coinsPerUtxoByte ?? 0),
      collateralPercentage: Number(rpcPParams.collateralPercentage ?? 0),
      maxCollateralInputs: Number(rpcPParams.maxCollateralInputs ?? 0),
      minFeeRefScriptCostPerByte: Number(15),
      keyDeposit: BigInt(rpcPParams.stakeKeyDeposit),
      poolDeposit: BigInt(rpcPParams.poolDeposit),
      drepDeposit: BigInt(0),
      govActionDeposit: BigInt(0),
      priceMem: Number(rpcPParams.prices?.memory ?? 0.0577),
      priceStep: Number(rpcPParams.prices?.steps ?? 0.0000721),
      maxTxExMem: BigInt(rpcPParams.maxExecutionUnitsPerTransaction?.memory ?? 14000000),
      maxTxExSteps: BigInt(rpcPParams.maxExecutionUnitsPerTransaction?.steps ?? 10000000000),
      costModels: {
        PlutusV1: this._mapCostModel(rpcPParams.costModels?.plutusV1),
        PlutusV2: this._mapCostModel(rpcPParams.costModels?.plutusV2),
        PlutusV3: this._mapCostModel(rpcPParams.costModels?.plutusV3),
      },
    };
  }

  private _mapCostModel(costModel: any): Record<string, number> {
    if (!costModel || !Array.isArray(costModel.values)) return {};
    
    const costModelNames = [
      "addInteger-cpu-arguments-intercept", "addInteger-cpu-arguments-slope",
      "addInteger-memory-arguments-intercept", "addInteger-memory-arguments-slope",
      "appendByteString-cpu-arguments-intercept", "appendByteString-cpu-arguments-slope",
      "appendByteString-memory-arguments-intercept", "appendByteString-memory-arguments-slope",
      "appendString-cpu-arguments-intercept", "appendString-cpu-arguments-slope",
      "appendString-memory-arguments-intercept", "appendString-memory-arguments-slope",
      "bData-cpu-arguments", "bData-memory-arguments",
      "blake2b_256-cpu-arguments-intercept", "blake2b_256-cpu-arguments-slope",
      "blake2b_256-memory-arguments", "cekApplyCost-exBudgetCPU",
      "cekApplyCost-exBudgetMemory", "cekBuiltinCost-exBudgetCPU",
      "cekBuiltinCost-exBudgetMemory", "cekConstCost-exBudgetCPU",
      "cekConstCost-exBudgetMemory", "cekDelayCost-exBudgetCPU",
      "cekDelayCost-exBudgetMemory", "cekForceCost-exBudgetCPU",
      "cekForceCost-exBudgetMemory", "cekLamCost-exBudgetCPU",
      "cekLamCost-exBudgetMemory", "cekStartupCost-exBudgetCPU",
      "cekStartupCost-exBudgetMemory", "cekVarCost-exBudgetCPU",
      "cekVarCost-exBudgetMemory", "chooseData-cpu-arguments",
      "chooseData-memory-arguments", "chooseList-cpu-arguments",
      "chooseList-memory-arguments", "chooseUnit-cpu-arguments",
      "chooseUnit-memory-arguments", "consByteString-cpu-arguments-intercept",
      "consByteString-cpu-arguments-slope", "consByteString-memory-arguments-intercept",
      "consByteString-memory-arguments-slope", "constrData-cpu-arguments",
      "constrData-memory-arguments", "decodeUtf8-cpu-arguments-intercept",
      "decodeUtf8-cpu-arguments-slope", "decodeUtf8-memory-arguments-intercept",
      "decodeUtf8-memory-arguments-slope", "divideInteger-cpu-arguments-constant",
      "divideInteger-cpu-arguments-model-arguments-intercept", "divideInteger-cpu-arguments-model-arguments-slope",
      "divideInteger-memory-arguments-intercept", "divideInteger-memory-arguments-minimum",
      "divideInteger-memory-arguments-slope", "encodeUtf8-cpu-arguments-intercept",
      "encodeUtf8-cpu-arguments-slope", "encodeUtf8-memory-arguments-intercept",
      "encodeUtf8-memory-arguments-slope", "equalsByteString-cpu-arguments-constant",
      "equalsByteString-cpu-arguments-intercept", "equalsByteString-cpu-arguments-slope",
      "equalsByteString-memory-arguments", "equalsData-cpu-arguments-intercept",
      "equalsData-cpu-arguments-slope", "equalsData-memory-arguments",
      "equalsInteger-cpu-arguments-intercept", "equalsInteger-cpu-arguments-slope",
      "equalsInteger-memory-arguments", "equalsString-cpu-arguments-constant",
      "equalsString-cpu-arguments-intercept", "equalsString-cpu-arguments-slope",
      "equalsString-memory-arguments", "fstPair-cpu-arguments",
      "fstPair-memory-arguments", "headList-cpu-arguments",
      "headList-memory-arguments", "iData-cpu-arguments",
      "iData-memory-arguments", "ifThenElse-cpu-arguments",
      "ifThenElse-memory-arguments", "indexByteString-cpu-arguments",
      "indexByteString-memory-arguments", "lengthOfByteString-cpu-arguments",
      "lengthOfByteString-memory-arguments", "lessThanByteString-cpu-arguments-intercept",
      "lessThanByteString-cpu-arguments-slope", "lessThanByteString-memory-arguments",
      "lessThanEqualsByteString-cpu-arguments-intercept", "lessThanEqualsByteString-cpu-arguments-slope",
      "lessThanEqualsByteString-memory-arguments", "lessThanEqualsInteger-cpu-arguments-intercept",
      "lessThanEqualsInteger-cpu-arguments-slope", "lessThanEqualsInteger-memory-arguments",
      "lessThanInteger-cpu-arguments-intercept", "lessThanInteger-cpu-arguments-slope",
      "lessThanInteger-memory-arguments", "listData-cpu-arguments",
      "listData-memory-arguments", "mapData-cpu-arguments",
      "mapData-memory-arguments", "mkCons-cpu-arguments",
      "mkCons-memory-arguments", "mkNilData-cpu-arguments",
      "mkNilData-memory-arguments", "mkNilPairData-cpu-arguments",
      "mkNilPairData-memory-arguments", "mkPairData-cpu-arguments",
      "mkPairData-memory-arguments", "modInteger-cpu-arguments-constant",
      "modInteger-cpu-arguments-model-arguments-intercept", "modInteger-cpu-arguments-model-arguments-slope",
      "modInteger-memory-arguments-intercept", "modInteger-memory-arguments-slope",
      "multiplyInteger-cpu-arguments-intercept", "multiplyInteger-cpu-arguments-slope",
      "multiplyInteger-memory-arguments-intercept", "multiplyInteger-memory-arguments-slope",
      "nullList-cpu-arguments", "nullList-memory-arguments",
      "quotientInteger-cpu-arguments-constant", "quotientInteger-cpu-arguments-model-arguments-intercept",
      "quotientInteger-cpu-arguments-model-arguments-slope", "quotientInteger-memory-arguments-intercept",
      "quotientInteger-memory-arguments-slope", "remainderInteger-cpu-arguments-constant",
      "remainderInteger-cpu-arguments-model-arguments-intercept", "remainderInteger-cpu-arguments-model-arguments-slope",
      "remainderInteger-memory-arguments-intercept", "remainderInteger-memory-arguments-slope",
      "serialiseData-cpu-arguments-intercept", "serialiseData-cpu-arguments-slope",
      "serialiseData-memory-arguments-intercept", "serialiseData-memory-arguments-slope",
      "sha2_256-cpu-arguments-intercept", "sha2_256-cpu-arguments-slope",
      "sha2_256-memory-arguments", "sha3_256-cpu-arguments-intercept",
      "sha3_256-cpu-arguments-slope", "sha3_256-memory-arguments",
      "sliceByteString-cpu-arguments-intercept", "sliceByteString-cpu-arguments-slope",
      "sliceByteString-memory-arguments-intercept", "sliceByteString-memory-arguments-slope",
      "sndPair-cpu-arguments", "sndPair-memory-arguments",
      "subtractInteger-cpu-arguments-intercept", "subtractInteger-cpu-arguments-slope",
      "subtractInteger-memory-arguments-intercept", "subtractInteger-memory-arguments-slope",
      "tailList-cpu-arguments", "tailList-memory-arguments",
      "trace-cpu-arguments", "trace-memory-arguments",
      "unBData-cpu-arguments", "unBData-memory-arguments",
      "unConstrData-cpu-arguments", "unConstrData-memory-arguments",
      "unIData-cpu-arguments", "unIData-memory-arguments",
      "unListData-cpu-arguments", "unListData-memory-arguments",
      "unMapData-cpu-arguments", "unMapData-memory-arguments",
      "verifyEcdsaSecp256k1Signature-cpu-arguments", "verifyEcdsaSecp256k1Signature-memory-arguments",
      "verifyEd25519Signature-cpu-arguments-intercept", "verifyEd25519Signature-cpu-arguments-slope",
      "verifyEd25519Signature-memory-arguments", "verifySchnorrSecp256k1Signature-cpu-arguments-intercept",
      "verifySchnorrSecp256k1Signature-cpu-arguments-slope", "verifySchnorrSecp256k1Signature-memory-arguments"
    ];

    const mappedModel: Record<string, number> = {};
    costModel.values.forEach((value: string, index: number) => {
      const name = costModelNames[index];
      if (name) {
        mappedModel[name] = Number(value);
      }
    });

    return mappedModel;
  }
}




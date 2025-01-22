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
    additionalUTxOs?: UTxO[],
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

  // TODO: expose in UTxORPC node sdk, currently hardcoded
  async getProtocolParameters(): Promise<ProtocolParameters> {
    const rpcPParams = await this.queryClient.readParams();
    if (rpcPParams === undefined || rpcPParams === null) {
      throw new Error(`Error fetching protocol parameters`);
    }
    return this._rpcPParamsToCorePParams(rpcPParams);
  }

  async getUtxos(
    addressOrCredential: LucidAddress | LucidCredential,
  ): Promise<UTxO[]> {
    if (typeof addressOrCredential === "string") {
      const address = Address.from_bech32(addressOrCredential);
      const addressBytes = address.to_raw_bytes();
      const utxoSearchResult = await this.queryClient.searchUtxosByAddress(
        addressBytes,
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
    unit: Unit,
  ): Promise<UTxO[]> {
    const unitBytes = fromHex(unit);

    if (typeof addressOrCredential === "string") {
      const address = Address.from_bech32(addressOrCredential);
      const addressBytes = address.to_raw_bytes();
      const utxoSearchResult = await this.queryClient
        .searchUtxosByAddressWithAsset(
          addressBytes,
          undefined,
          unitBytes,
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

      const utxoSearchResultPayment = await this.queryClient
        .searchUtxosByPaymentPartWithAsset(
          credentialBytes,
          undefined,
          unitBytes,
        );
      const utxoSearchResultDelegation = await this.queryClient
        .searchUtxosByDelegationPartWithAsset(
          credentialBytes,
          undefined,
          unitBytes,
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
      unitBytes,
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

    const utxoSearchResult = await this.queryClient.readUtxosByOutputRef(
      references,
    );

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

  // @TODO: use the rpc response and map to core types instead of hardcoded values
  private async _rpcPParamsToCorePParams(
    rpcPParams: spec.cardano.PParams
  ): Promise<ProtocolParameters> {

    return {
      minFeeA: Number(rpcPParams.minFeeCoefficient),
      minFeeB: Number(rpcPParams.minFeeConstant),
      maxTxSize: Number(rpcPParams.maxTxSize),
      maxValSize: Number(rpcPParams.maxValueSize),
      keyDeposit: BigInt(rpcPParams.stakeKeyDeposit),
      poolDeposit: BigInt(rpcPParams.poolDeposit),
      drepDeposit: BigInt(500000000), // Fallback if not provided
      govActionDeposit: BigInt(100000000000), // Fallback if not provided
      priceMem: Number(
        rpcPParams.prices?.memory?.numerator! /
          rpcPParams.prices?.memory?.denominator!
      ) || 0.0577 ,
      priceStep: Number(
        rpcPParams.prices?.steps?.numerator! /
          rpcPParams.prices?.steps?.denominator!
      ) || 0.0000721,
      maxTxExMem: BigInt(
        rpcPParams.maxExecutionUnitsPerTransaction?.memory ?? 14000000
      ),
      maxTxExSteps: BigInt(
        rpcPParams.maxExecutionUnitsPerTransaction?.steps ?? 10000000000
      ),
      coinsPerUtxoByte: BigInt(4310) , //TODO: get correct value from rpc when implemented
      collateralPercentage: Number(rpcPParams.collateralPercentage ?? 150),
      maxCollateralInputs: Number(rpcPParams.maxCollateralInputs ?? 3),
      minFeeRefScriptCostPerByte: Number(
        rpcPParams.minFeeScriptRefCostPerByte?.numerator! /
          rpcPParams.minFeeScriptRefCostPerByte?.denominator!
      ) || 15, //
      costModels: {
        PlutusV1: this._mapCostModel(rpcPParams.costModels?.plutusV1, 1),
        PlutusV2: this._mapCostModel(rpcPParams.costModels?.plutusV2, 2),
        PlutusV3: this._mapCostModel(rpcPParams.costModels?.plutusV3, 3),
      },
    };
  }
  private _mapCostModel(
    costModel: any,
    PlutusVersion: number
  ): Record<string, number> {
    if (!costModel || !Array.isArray(costModel.values)) return {};
    let costModelNames: string[] = [
      "addInteger-cpu-arguments-intercept",
      "addInteger-cpu-arguments-slope",
      "addInteger-memory-arguments-intercept",
      "addInteger-memory-arguments-slope",
      "appendByteString-cpu-arguments-intercept",
      "appendByteString-cpu-arguments-slope",
      "appendByteString-memory-arguments-intercept",
      "appendByteString-memory-arguments-slope",
      "appendString-cpu-arguments-intercept",
      "appendString-cpu-arguments-slope",
      "appendString-memory-arguments-intercept",
      "appendString-memory-arguments-slope",
      "bData-cpu-arguments",
      "bData-memory-arguments",
      "blake2b_256-cpu-arguments-intercept",
      "blake2b_256-cpu-arguments-slope",
      "blake2b_256-memory-arguments",
      "cekApplyCost-exBudgetCPU",
      "cekApplyCost-exBudgetMemory",
      "cekBuiltinCost-exBudgetCPU",
      "cekBuiltinCost-exBudgetMemory",
      "cekConstCost-exBudgetCPU",
      "cekConstCost-exBudgetMemory",
      "cekDelayCost-exBudgetCPU",
      "cekDelayCost-exBudgetMemory",
      "cekForceCost-exBudgetCPU",
      "cekForceCost-exBudgetMemory",
      "cekLamCost-exBudgetCPU",
      "cekLamCost-exBudgetMemory",
      "cekStartupCost-exBudgetCPU",
      "cekStartupCost-exBudgetMemory",
      "cekVarCost-exBudgetCPU",
      "cekVarCost-exBudgetMemory",
      "chooseData-cpu-arguments",
      "chooseData-memory-arguments",
      "chooseList-cpu-arguments",
      "chooseList-memory-arguments",
      "chooseUnit-cpu-arguments",
      "chooseUnit-memory-arguments",
      "consByteString-cpu-arguments-intercept",
      "consByteString-cpu-arguments-slope",
      "consByteString-memory-arguments-intercept",
      "consByteString-memory-arguments-slope",
      "constrData-cpu-arguments",
      "constrData-memory-arguments",
      "decodeUtf8-cpu-arguments-intercept",
      "decodeUtf8-cpu-arguments-slope",
      "decodeUtf8-memory-arguments-intercept",
      "decodeUtf8-memory-arguments-slope",
      "divideInteger-cpu-arguments-constant",
      "divideInteger-cpu-arguments-model-arguments-intercept",
      "divideInteger-cpu-arguments-model-arguments-slope",
      "divideInteger-memory-arguments-intercept",
      "divideInteger-memory-arguments-minimum",
      "divideInteger-memory-arguments-slope",
      "encodeUtf8-cpu-arguments-intercept",
      "encodeUtf8-cpu-arguments-slope",
      "encodeUtf8-memory-arguments-intercept",
      "encodeUtf8-memory-arguments-slope",
      "equalsByteString-cpu-arguments-constant",
      "equalsByteString-cpu-arguments-intercept",
      "equalsByteString-cpu-arguments-slope",
      "equalsByteString-memory-arguments",
      "equalsData-cpu-arguments-intercept",
      "equalsData-cpu-arguments-slope",
      "equalsData-memory-arguments",
      "equalsInteger-cpu-arguments-intercept",
      "equalsInteger-cpu-arguments-slope",
      "equalsInteger-memory-arguments",
      "equalsString-cpu-arguments-constant",
      "equalsString-cpu-arguments-intercept",
      "equalsString-cpu-arguments-slope",
      "equalsString-memory-arguments",
      "fstPair-cpu-arguments",
      "fstPair-memory-arguments",
      "headList-cpu-arguments",
      "headList-memory-arguments",
      "iData-cpu-arguments",
      "iData-memory-arguments",
      "ifThenElse-cpu-arguments",
      "ifThenElse-memory-arguments",
      "indexByteString-cpu-arguments",
      "indexByteString-memory-arguments",
      "lengthOfByteString-cpu-arguments",
      "lengthOfByteString-memory-arguments",
      "lessThanByteString-cpu-arguments-intercept",
      "lessThanByteString-cpu-arguments-slope",
      "lessThanByteString-memory-arguments",
      "lessThanEqualsByteString-cpu-arguments-intercept",
      "lessThanEqualsByteString-cpu-arguments-slope",
      "lessThanEqualsByteString-memory-arguments",
      "lessThanEqualsInteger-cpu-arguments-intercept",
      "lessThanEqualsInteger-cpu-arguments-slope",
      "lessThanEqualsInteger-memory-arguments",
      "lessThanInteger-cpu-arguments-intercept",
      "lessThanInteger-cpu-arguments-slope",
      "lessThanInteger-memory-arguments",
      "listData-cpu-arguments",
      "listData-memory-arguments",
      "mapData-cpu-arguments",
      "mapData-memory-arguments",
      "mkCons-cpu-arguments",
      "mkCons-memory-arguments",
      "mkNilData-cpu-arguments",
      "mkNilData-memory-arguments",
      "mkNilPairData-cpu-arguments",
      "mkNilPairData-memory-arguments",
      "mkPairData-cpu-arguments",
      "mkPairData-memory-arguments",
      "modInteger-cpu-arguments-constant",
      "modInteger-cpu-arguments-model-arguments-intercept",
      "modInteger-cpu-arguments-model-arguments-slope",
      "modInteger-memory-arguments-intercept",
      "modInteger-memory-arguments-minimum",
      "modInteger-memory-arguments-slope",
      "multiplyInteger-cpu-arguments-intercept",
      "multiplyInteger-cpu-arguments-slope",
      "multiplyInteger-memory-arguments-intercept",
      "multiplyInteger-memory-arguments-slope",
      "nullList-cpu-arguments",
      "nullList-memory-arguments",
      "quotientInteger-cpu-arguments-constant",
      "quotientInteger-cpu-arguments-model-arguments-intercept",
      "quotientInteger-cpu-arguments-model-arguments-slope",
      "quotientInteger-memory-arguments-intercept",
      "quotientInteger-memory-arguments-minimum",
      "quotientInteger-memory-arguments-slope",
      "remainderInteger-cpu-arguments-constant",
      "remainderInteger-cpu-arguments-model-arguments-intercept",
      "remainderInteger-cpu-arguments-model-arguments-slope",
      "remainderInteger-memory-arguments-intercept",
      "remainderInteger-memory-arguments-minimum",
      "remainderInteger-memory-arguments-slope",
    ];
    switch (PlutusVersion) {
      case 1:
        costModelNames.push(
          ...[
            "sha2_256-cpu-arguments-intercept",
            "sha2_256-cpu-arguments-slope",
            "sha2_256-memory-arguments",
            "sha3_256-cpu-arguments-intercept",
            "sha3_256-cpu-arguments-slope",
            "sha3_256-memory-arguments",
            "sliceByteString-cpu-arguments-intercept",
            "sliceByteString-cpu-arguments-slope",
            "sliceByteString-memory-arguments-intercept",
            "sliceByteString-memory-arguments-slope",
            "sndPair-cpu-arguments",
            "sndPair-memory-arguments",
            "subtractInteger-cpu-arguments-intercept",
            "subtractInteger-cpu-arguments-slope",
            "subtractInteger-memory-arguments-intercept",
            "subtractInteger-memory-arguments-slope",
            "tailList-cpu-arguments",
            "tailList-memory-arguments",
            "trace-cpu-arguments",
            "trace-memory-arguments",
            "unBData-cpu-arguments",
            "unBData-memory-arguments",
            "unConstrData-cpu-arguments",
            "unConstrData-memory-arguments",
            "unIData-cpu-arguments",
            "unIData-memory-arguments",
            "unListData-cpu-arguments",
            "unListData-memory-arguments",
            "unMapData-cpu-arguments",
            "unMapData-memory-arguments",
            "verifyEd25519Signature-cpu-arguments-intercept",
            "verifyEd25519Signature-cpu-arguments-slope",
            "verifyEd25519Signature-memory-arguments",
            "verifySchnorrSecp256k1Signature-cpu-arguments-intercept",
          ]
        );
        break;
      case 2:
        costModelNames.push(
          ...[
            "serialiseData-cpu-arguments-intercept",
            "serialiseData-cpu-arguments-slope",
            "serialiseData-memory-arguments-intercept",
            "serialiseData-memory-arguments-slope",
            "sha2_256-cpu-arguments-intercept",
            "sha2_256-cpu-arguments-slope",
            "sha2_256-memory-arguments",
            "sha3_256-cpu-arguments-intercept",
            "sha3_256-cpu-arguments-slope",
            "sha3_256-memory-arguments",
            "sliceByteString-cpu-arguments-intercept",
            "sliceByteString-cpu-arguments-slope",
            "sliceByteString-memory-arguments-intercept",
            "sliceByteString-memory-arguments-slope",
            "sndPair-cpu-arguments",
            "sndPair-memory-arguments",
            "subtractInteger-cpu-arguments-intercept",
            "subtractInteger-cpu-arguments-slope",
            "subtractInteger-memory-arguments-intercept",
            "subtractInteger-memory-arguments-slope",
            "tailList-cpu-arguments",
            "tailList-memory-arguments",
            "trace-cpu-arguments",
            "trace-memory-arguments",
            "unBData-cpu-arguments",
            "unBData-memory-arguments",
            "unConstrData-cpu-arguments",
            "unConstrData-memory-arguments",
            "unIData-cpu-arguments",
            "unIData-memory-arguments",
            "unListData-cpu-arguments",
            "unListData-memory-arguments",
            "unMapData-cpu-arguments",
            "unMapData-memory-arguments",
            "verifyEcdsaSecp256k1Signature-cpu-arguments",
            "verifyEcdsaSecp256k1Signature-memory-arguments",
            "verifyEd25519Signature-cpu-arguments-intercept",
            "verifyEd25519Signature-cpu-arguments-slope",
            "verifyEd25519Signature-memory-arguments",
            "verifySchnorrSecp256k1Signature-cpu-arguments-intercept",
            "verifySchnorrSecp256k1Signature-cpu-arguments-slope",
            "verifySchnorrSecp256k1Signature-memory-arguments",
          ]
        );
        break;
      case 3:
        return {
          "addInteger-cpu-arguments-intercept": 100788,
          "addInteger-cpu-arguments-slope": 420,
          "addInteger-memory-arguments-intercept": 1,
          "addInteger-memory-arguments-slope": 1,
          "appendByteString-cpu-arguments-intercept": 1000,
          "appendByteString-cpu-arguments-slope": 173,
          "appendByteString-memory-arguments-intercept": 0,
          "appendByteString-memory-arguments-slope": 1,
          "appendString-cpu-arguments-intercept": 1000,
          "appendString-cpu-arguments-slope": 59957,
          "appendString-memory-arguments-intercept": 4,
          "appendString-memory-arguments-slope": 1,
          "bData-cpu-arguments": 11183,
          "bData-memory-arguments": 32,
          "blake2b_256-cpu-arguments-intercept": 201305,
          "blake2b_256-cpu-arguments-slope": 8356,
          "blake2b_256-memory-arguments": 4,
          "cekApplyCost-exBudgetCPU": 16000,
          "cekApplyCost-exBudgetMemory": 100,
          "cekBuiltinCost-exBudgetCPU": 16000,
          "cekBuiltinCost-exBudgetMemory": 100,
          "cekConstCost-exBudgetCPU": 16000,
          "cekConstCost-exBudgetMemory": 100,
          "cekDelayCost-exBudgetCPU": 16000,
          "cekDelayCost-exBudgetMemory": 100,
          "cekForceCost-exBudgetCPU": 16000,
          "cekForceCost-exBudgetMemory": 100,
          "cekLamCost-exBudgetCPU": 16000,
          "cekLamCost-exBudgetMemory": 100,
          "cekStartupCost-exBudgetCPU": 100,
          "cekStartupCost-exBudgetMemory": 100,
          "cekVarCost-exBudgetCPU": 16000,
          "cekVarCost-exBudgetMemory": 100,
          "chooseData-cpu-arguments": 94375,
          "chooseData-memory-arguments": 32,
          "chooseList-cpu-arguments": 132994,
          "chooseList-memory-arguments": 32,
          "chooseUnit-cpu-arguments": 61462,
          "chooseUnit-memory-arguments": 4,
          "consByteString-cpu-arguments-intercept": 72010,
          "consByteString-cpu-arguments-slope": 178,
          "consByteString-memory-arguments-intercept": 0,
          "consByteString-memory-arguments-slope": 1,
          "constrData-cpu-arguments": 22151,
          "constrData-memory-arguments": 32,
          "decodeUtf8-cpu-arguments-intercept": 91189,
          "decodeUtf8-cpu-arguments-slope": 769,
          "decodeUtf8-memory-arguments-intercept": 4,
          "decodeUtf8-memory-arguments-slope": 2,
          "divideInteger-cpu-arguments-constant": 85848,
          "divideInteger-cpu-arguments-model-arguments-c00": 123203,
          "divideInteger-cpu-arguments-model-arguments-c01": 7305,
          "divideInteger-cpu-arguments-model-arguments-c02": -900,
          "divideInteger-cpu-arguments-model-arguments-c10": 1716,
          "divideInteger-cpu-arguments-model-arguments-c11": 549,
          "divideInteger-cpu-arguments-model-arguments-c20": 57,
          "divideInteger-cpu-arguments-model-arguments-minimum": 85848,
          "divideInteger-memory-arguments-intercept": 0,
          "divideInteger-memory-arguments-minimum": 1,
          "divideInteger-memory-arguments-slope": 1,
          "encodeUtf8-cpu-arguments-intercept": 1000,
          "encodeUtf8-cpu-arguments-slope": 42921,
          "encodeUtf8-memory-arguments-intercept": 4,
          "encodeUtf8-memory-arguments-slope": 2,
          "equalsByteString-cpu-arguments-constant": 24548,
          "equalsByteString-cpu-arguments-intercept": 29498,
          "equalsByteString-cpu-arguments-slope": 38,
          "equalsByteString-memory-arguments": 1,
          "equalsData-cpu-arguments-intercept": 898148,
          "equalsData-cpu-arguments-slope": 27279,
          "equalsData-memory-arguments": 1,
          "equalsInteger-cpu-arguments-intercept": 51775,
          "equalsInteger-cpu-arguments-slope": 558,
          "equalsInteger-memory-arguments": 1,
          "equalsString-cpu-arguments-constant": 39184,
          "equalsString-cpu-arguments-intercept": 1000,
          "equalsString-cpu-arguments-slope": 60594,
          "equalsString-memory-arguments": 1,
          "fstPair-cpu-arguments": 141895,
          "fstPair-memory-arguments": 32,
          "headList-cpu-arguments": 83150,
          "headList-memory-arguments": 32,
          "iData-cpu-arguments": 15299,
          "iData-memory-arguments": 32,
          "ifThenElse-cpu-arguments": 76049,
          "ifThenElse-memory-arguments": 1,
          "indexByteString-cpu-arguments": 13169,
          "indexByteString-memory-arguments": 4,
          "lengthOfByteString-cpu-arguments": 22100,
          "lengthOfByteString-memory-arguments": 10,
          "lessThanByteString-cpu-arguments-intercept": 28999,
          "lessThanByteString-cpu-arguments-slope": 74,
          "lessThanByteString-memory-arguments": 1,
          "lessThanEqualsByteString-cpu-arguments-intercept": 28999,
          "lessThanEqualsByteString-cpu-arguments-slope": 74,
          "lessThanEqualsByteString-memory-arguments": 1,
          "lessThanEqualsInteger-cpu-arguments-intercept": 43285,
          "lessThanEqualsInteger-cpu-arguments-slope": 552,
          "lessThanEqualsInteger-memory-arguments": 1,
          "lessThanInteger-cpu-arguments-intercept": 44749,
          "lessThanInteger-cpu-arguments-slope": 541,
          "lessThanInteger-memory-arguments": 1,
          "listData-cpu-arguments": 33852,
          "listData-memory-arguments": 32,
          "mapData-cpu-arguments": 68246,
          "mapData-memory-arguments": 32,
          "mkCons-cpu-arguments": 72362,
          "mkCons-memory-arguments": 32,
          "mkNilData-cpu-arguments": 7243,
          "mkNilData-memory-arguments": 32,
          "mkNilPairData-cpu-arguments": 7391,
          "mkNilPairData-memory-arguments": 32,
          "mkPairData-cpu-arguments": 11546,
          "mkPairData-memory-arguments": 32,
          "modInteger-cpu-arguments-constant": 85848,
          "modInteger-cpu-arguments-model-arguments-c00": 123203,
          "modInteger-cpu-arguments-model-arguments-c01": 7305,
          "modInteger-cpu-arguments-model-arguments-c02": -900,
          "modInteger-cpu-arguments-model-arguments-c10": 1716,
          "modInteger-cpu-arguments-model-arguments-c11": 549,
          "modInteger-cpu-arguments-model-arguments-c20": 57,
          "modInteger-cpu-arguments-model-arguments-minimum": 85848,
          "modInteger-memory-arguments-intercept": 0,
          "modInteger-memory-arguments-slope": 1,
          "multiplyInteger-cpu-arguments-intercept": 90434,
          "multiplyInteger-cpu-arguments-slope": 519,
          "multiplyInteger-memory-arguments-intercept": 0,
          "multiplyInteger-memory-arguments-slope": 1,
          "nullList-cpu-arguments": 74433,
          "nullList-memory-arguments": 32,
          "quotientInteger-cpu-arguments-constant": 85848,
          "quotientInteger-cpu-arguments-model-arguments-c00": 123203,
          "quotientInteger-cpu-arguments-model-arguments-c01": 7305,
          "quotientInteger-cpu-arguments-model-arguments-c02": -900,
          "quotientInteger-cpu-arguments-model-arguments-c10": 1716,
          "quotientInteger-cpu-arguments-model-arguments-c11": 549,
          "quotientInteger-cpu-arguments-model-arguments-c20": 57,
          "quotientInteger-cpu-arguments-model-arguments-minimum": 85848,
          "quotientInteger-memory-arguments-intercept": 0,
          "quotientInteger-memory-arguments-slope": 1,
          "remainderInteger-cpu-arguments-constant": 1,
          "remainderInteger-cpu-arguments-model-arguments-c00": 85848,
          "remainderInteger-cpu-arguments-model-arguments-c01": 123203,
          "remainderInteger-cpu-arguments-model-arguments-c02": 7305,
          "remainderInteger-cpu-arguments-model-arguments-c10": -900,
          "remainderInteger-cpu-arguments-model-arguments-c11": 1716,
          "remainderInteger-cpu-arguments-model-arguments-c20": 549,
          "remainderInteger-cpu-arguments-model-arguments-minimum": 57,
          "remainderInteger-memory-arguments-intercept": 85848,
          "remainderInteger-memory-arguments-minimum": 0,
          "remainderInteger-memory-arguments-slope": 1,
          "serialiseData-cpu-arguments-intercept": 955506,
          "serialiseData-cpu-arguments-slope": 213312,
          "serialiseData-memory-arguments-intercept": 0,
          "serialiseData-memory-arguments-slope": 2,
          "sha2_256-cpu-arguments-intercept": 270652,
          "sha2_256-cpu-arguments-slope": 22588,
          "sha2_256-memory-arguments": 4,
          "sha3_256-cpu-arguments-intercept": 1457325,
          "sha3_256-cpu-arguments-slope": 64566,
          "sha3_256-memory-arguments": 4,
          "sliceByteString-cpu-arguments-intercept": 20467,
          "sliceByteString-cpu-arguments-slope": 1,
          "sliceByteString-memory-arguments-intercept": 4,
          "sliceByteString-memory-arguments-slope": 0,
          "sndPair-cpu-arguments": 141992,
          "sndPair-memory-arguments": 32,
          "subtractInteger-cpu-arguments-intercept": 100788,
          "subtractInteger-cpu-arguments-slope": 420,
          "subtractInteger-memory-arguments-intercept": 1,
          "subtractInteger-memory-arguments-slope": 1,
          "tailList-cpu-arguments": 81663,
          "tailList-memory-arguments": 32,
          "trace-cpu-arguments": 59498,
          "trace-memory-arguments": 32,
          "unBData-cpu-arguments": 20142,
          "unBData-memory-arguments": 32,
          "unConstrData-cpu-arguments": 24588,
          "unConstrData-memory-arguments": 32,
          "unIData-cpu-arguments": 20744,
          "unIData-memory-arguments": 32,
          "unListData-cpu-arguments": 25933,
          "unListData-memory-arguments": 32,
          "unMapData-cpu-arguments": 24623,
          "unMapData-memory-arguments": 32,
          "verifyEcdsaSecp256k1Signature-cpu-arguments": 43053543,
          "verifyEcdsaSecp256k1Signature-memory-arguments": 10,
          "verifyEd25519Signature-cpu-arguments-intercept": 53384111,
          "verifyEd25519Signature-cpu-arguments-slope": 14333,
          "verifyEd25519Signature-memory-arguments": 10,
          "verifySchnorrSecp256k1Signature-cpu-arguments-intercept": 43574283,
          "verifySchnorrSecp256k1Signature-cpu-arguments-slope": 26308,
          "verifySchnorrSecp256k1Signature-memory-arguments": 10,
          "cekConstrCost-exBudgetCPU": 16000,
          "cekConstrCost-exBudgetMemory": 100,
          "cekCaseCost-exBudgetCPU": 16000,
          "cekCaseCost-exBudgetMemory": 100,
          "bls12_381_G1_add-cpu-arguments": 962335,
          "bls12_381_G1_add-memory-arguments": 18,
          "bls12_381_G1_compress-cpu-arguments": 2780678,
          "bls12_381_G1_compress-memory-arguments": 6,
          "bls12_381_G1_equal-cpu-arguments": 442008,
          "bls12_381_G1_equal-memory-arguments": 1,
          "bls12_381_G1_hashToGroup-cpu-arguments-intercept": 52538055,
          "bls12_381_G1_hashToGroup-cpu-arguments-slope": 3756,
          "bls12_381_G1_hashToGroup-memory-arguments": 18,
          "bls12_381_G1_neg-cpu-arguments": 267929,
          "bls12_381_G1_neg-memory-arguments": 18,
          "bls12_381_G1_scalarMul-cpu-arguments-intercept": 76433006,
          "bls12_381_G1_scalarMul-cpu-arguments-slope": 8868,
          "bls12_381_G1_scalarMul-memory-arguments": 18,
          "bls12_381_G1_uncompress-cpu-arguments": 52948122,
          "bls12_381_G1_uncompress-memory-arguments": 18,
          "bls12_381_G2_add-cpu-arguments": 1995836,
          "bls12_381_G2_add-memory-arguments": 36,
          "bls12_381_G2_compress-cpu-arguments": 3227919,
          "bls12_381_G2_compress-memory-arguments": 12,
          "bls12_381_G2_equal-cpu-arguments": 901022,
          "bls12_381_G2_equal-memory-arguments": 1,
          "bls12_381_G2_hashToGroup-cpu-arguments-intercept": 166917843,
          "bls12_381_G2_hashToGroup-cpu-arguments-slope": 4307,
          "bls12_381_G2_hashToGroup-memory-arguments": 36,
          "bls12_381_G2_neg-cpu-arguments": 284546,
          "bls12_381_G2_neg-memory-arguments": 36,
          "bls12_381_G2_scalarMul-cpu-arguments-intercept": 158221314,
          "bls12_381_G2_scalarMul-cpu-arguments-slope": 26549,
          "bls12_381_G2_scalarMul-memory-arguments": 36,
          "bls12_381_G2_uncompress-cpu-arguments": 74698472,
          "bls12_381_G2_uncompress-memory-arguments": 36,
          "bls12_381_finalVerify-cpu-arguments": 333849714,
          "bls12_381_finalVerify-memory-arguments": 1,
          "bls12_381_millerLoop-cpu-arguments": 254006273,
          "bls12_381_millerLoop-memory-arguments": 72,
          "bls12_381_mulMlResult-cpu-arguments": 2174038,
          "bls12_381_mulMlResult-memory-arguments": 72,
          "keccak_256-cpu-arguments-intercept": 2261318,
          "keccak_256-cpu-arguments-slope": 64571,
          "keccak_256-memory-arguments": 4,
          "blake2b_224-cpu-arguments-intercept": 207616,
          "blake2b_224-cpu-arguments-slope": 8310,
          "blake2b_224-memory-arguments": 4,
          "integerToByteString-cpu-arguments-c0": 1293828,
          "integerToByteString-cpu-arguments-c1": 28716,
          "integerToByteString-cpu-arguments-c2": 63,
          "integerToByteString-memory-arguments-intercept": 0,
          "integerToByteString-memory-arguments-slope": 1,
          "byteStringToInteger-cpu-arguments-c0": 1006041,
          "byteStringToInteger-cpu-arguments-c1": 43623,
          "byteStringToInteger-cpu-arguments-c2": 251,
          "byteStringToInteger-memory-arguments-intercept": 0,
          "byteStringToInteger-memory-arguments-slope": 1,
          "andByteString-cpu-arguments-intercept": 100181,
          "andByteString-cpu-arguments-slope1": 726,
          "andByteString-cpu-arguments-slope2": 719,
          "andByteString-memory-arguments-intercept": 0,
          "andByteString-memory-arguments-slope": 1,
          "orByteString-cpu-arguments-intercept": 100181,
          "orByteString-cpu-arguments-slope1": 726,
          "orByteString-cpu-arguments-slope2": 719,
          "orByteString-memory-arguments-intercept": 0,
          "orByteString-memory-arguments-slope": 1,
          "xorByteString-cpu-arguments-intercept": 100181,
          "xorByteString-cpu-arguments-slope1": 726,
          "xorByteString-cpu-arguments-slope2": 719,
          "xorByteString-memory-arguments-intercept": 0,
          "xorByteString-memory-arguments-slope": 1,
          "complementByteString-cpu-arguments-intercept": 107878,
          "complementByteString-cpu-arguments-slope": 680,
          "complementByteString-memory-arguments-intercept": 0,
          "complementByteString-memory-arguments-slope": 1,
          "readBit-cpu-arguments": 95336,
          "readBit-memory-arguments": 1,
          "writeBits-cpu-arguments-intercept": 281145,
          "writeBits-cpu-arguments-slope": 18848,
          "writeBits-memory-arguments-intercept": 0,
          "writeBits-memory-arguments-slope": 1,
          "replicateByte-cpu-arguments-intercept": 180194,
          "replicateByte-cpu-arguments-slope": 159,
          "replicateByte-memory-arguments-intercept": 1,
          "replicateByte-memory-arguments-slope": 1,
          "shiftByteString-cpu-arguments-intercept": 158519,
          "shiftByteString-cpu-arguments-slope": 8942,
          "shiftByteString-memory-arguments-intercept": 0,
          "shiftByteString-memory-arguments-slope": 1,
          "rotateByteString-cpu-arguments-intercept": 159378,
          "rotateByteString-cpu-arguments-slope": 8813,
          "rotateByteString-memory-arguments-intercept": 0,
          "rotateByteString-memory-arguments-slope": 1,
          "countSetBits-cpu-arguments-intercept": 107490,
          "countSetBits-cpu-arguments-slope": 3298,
          "countSetBits-memory-arguments": 1,
          "findFirstSetBit-cpu-arguments-intercept": 106057,
          "findFirstSetBit-cpu-arguments-slope": 655,
          "findFirstSetBit-memory-arguments": 1,
          "ripemd_160-cpu-arguments-intercept": 1964219,
          "ripemd_160-cpu-arguments-slope": 24520,
          "ripemd_160-memory-arguments": 3,
        };
        costModelNames = [
          "addInteger-cpu-arguments-intercept",
          "addInteger-cpu-arguments-slope",
          "addInteger-memory-arguments-intercept",
          "addInteger-memory-arguments-slope",
          "appendByteString-cpu-arguments-intercept",
          "appendByteString-cpu-arguments-slope",
          "appendByteString-memory-arguments-intercept",
          "appendByteString-memory-arguments-slope",
          "appendString-cpu-arguments-intercept",
          "appendString-cpu-arguments-slope",
          "appendString-memory-arguments-intercept",
          "appendString-memory-arguments-slope",
          "bData-cpu-arguments",
          "bData-memory-arguments",
          "blake2b_256-cpu-arguments-intercept",
          "blake2b_256-cpu-arguments-slope",
          "blake2b_256-memory-arguments",
          "cekApplyCost-exBudgetCPU",
          "cekApplyCost-exBudgetMemory",
          "cekBuiltinCost-exBudgetCPU",
          "cekBuiltinCost-exBudgetMemory",
          "cekConstCost-exBudgetCPU",
          "cekConstCost-exBudgetMemory",
          "cekDelayCost-exBudgetCPU",
          "cekDelayCost-exBudgetMemory",
          "cekForceCost-exBudgetCPU",
          "cekForceCost-exBudgetMemory",
          "cekLamCost-exBudgetCPU",
          "cekLamCost-exBudgetMemory",
          "cekStartupCost-exBudgetCPU",
          "cekStartupCost-exBudgetMemory",
          "cekVarCost-exBudgetCPU",
          "cekVarCost-exBudgetMemory",
          "chooseData-cpu-arguments",
          "chooseData-memory-arguments",
          "chooseList-cpu-arguments",
          "chooseList-memory-arguments",
          "chooseUnit-cpu-arguments",
          "chooseUnit-memory-arguments",
          "consByteString-cpu-arguments-intercept",
          "consByteString-cpu-arguments-slope",
          "consByteString-memory-arguments-intercept",
          "consByteString-memory-arguments-slope",
          "constrData-cpu-arguments",
          "constrData-memory-arguments",
          "decodeUtf8-cpu-arguments-intercept",
          "decodeUtf8-cpu-arguments-slope",
          "decodeUtf8-memory-arguments-intercept",
          "decodeUtf8-memory-arguments-slope",
          "divideInteger-cpu-arguments-constant",
          "divideInteger-cpu-arguments-model-arguments-c00",
          "divideInteger-cpu-arguments-model-arguments-c01",
          "divideInteger-cpu-arguments-model-arguments-c02",
          "divideInteger-cpu-arguments-model-arguments-c10",
          "divideInteger-cpu-arguments-model-arguments-c11",
          "divideInteger-cpu-arguments-model-arguments-c20",
          "divideInteger-cpu-arguments-model-arguments-minimum",
          "divideInteger-memory-arguments-intercept",
          "divideInteger-memory-arguments-minimum",
          "divideInteger-memory-arguments-slope",
          "encodeUtf8-cpu-arguments-intercept",
          "encodeUtf8-cpu-arguments-slope",
          "encodeUtf8-memory-arguments-intercept",
          "encodeUtf8-memory-arguments-slope",
          "equalsByteString-cpu-arguments-constant",
          "equalsByteString-cpu-arguments-intercept",
          "equalsByteString-cpu-arguments-slope",
          "equalsByteString-memory-arguments",
          "equalsData-cpu-arguments-intercept",
          "equalsData-cpu-arguments-slope",
          "equalsData-memory-arguments",
          "equalsInteger-cpu-arguments-intercept",
          "equalsInteger-cpu-arguments-slope",
          "equalsInteger-memory-arguments",
          "equalsString-cpu-arguments-constant",
          "equalsString-cpu-arguments-intercept",
          "equalsString-cpu-arguments-slope",
          "equalsString-memory-arguments",
          "fstPair-cpu-arguments",
          "fstPair-memory-arguments",
          "headList-cpu-arguments",
          "headList-memory-arguments",
          "iData-cpu-arguments",
          "iData-memory-arguments",
          "ifThenElse-cpu-arguments",
          "ifThenElse-memory-arguments",
          "indexByteString-cpu-arguments",
          "indexByteString-memory-arguments",
          "lengthOfByteString-cpu-arguments",
          "lengthOfByteString-memory-arguments",
          "lessThanByteString-cpu-arguments-intercept",
          "lessThanByteString-cpu-arguments-slope",
          "lessThanByteString-memory-arguments",
          "lessThanEqualsByteString-cpu-arguments-intercept",
          "lessThanEqualsByteString-cpu-arguments-slope",
          "lessThanEqualsByteString-memory-arguments",
          "lessThanEqualsInteger-cpu-arguments-intercept",
          "lessThanEqualsInteger-cpu-arguments-slope",
          "lessThanEqualsInteger-memory-arguments",
          "lessThanInteger-cpu-arguments-intercept",
          "lessThanInteger-cpu-arguments-slope",
          "lessThanInteger-memory-arguments",
          "listData-cpu-arguments",
          "listData-memory-arguments",
          "mapData-cpu-arguments",
          "mapData-memory-arguments",
          "mkCons-cpu-arguments",
          "mkCons-memory-arguments",
          "mkNilData-cpu-arguments",
          "mkNilData-memory-arguments",
          "mkNilPairData-cpu-arguments",
          "mkNilPairData-memory-arguments",
          "mkPairData-cpu-arguments",
          "mkPairData-memory-arguments",
          "modInteger-cpu-arguments-constant",
          "modInteger-cpu-arguments-model-arguments-c00",
          "modInteger-cpu-arguments-model-arguments-c01",
          "modInteger-cpu-arguments-model-arguments-c02",
          "modInteger-cpu-arguments-model-arguments-c10",
          "modInteger-cpu-arguments-model-arguments-c11",
          "modInteger-cpu-arguments-model-arguments-c20",
          "modInteger-cpu-arguments-model-arguments-minimum",
          "modInteger-memory-arguments-intercept",
          "modInteger-memory-arguments-slope",
          "multiplyInteger-cpu-arguments-intercept",
          "multiplyInteger-cpu-arguments-slope",
          "multiplyInteger-memory-arguments-intercept",
          "multiplyInteger-memory-arguments-slope",
          "nullList-cpu-arguments",
          "nullList-memory-arguments",
          "quotientInteger-cpu-arguments-constant",
          "quotientInteger-cpu-arguments-model-arguments-c00",
          "quotientInteger-cpu-arguments-model-arguments-c01",
          "quotientInteger-cpu-arguments-model-arguments-c02",
          "quotientInteger-cpu-arguments-model-arguments-c10",
          "quotientInteger-cpu-arguments-model-arguments-c11",
          "quotientInteger-cpu-arguments-model-arguments-c20",
          "quotientInteger-cpu-arguments-model-arguments-minimum",
          "quotientInteger-memory-arguments-intercept",
          "quotientInteger-memory-arguments-slope",
          "remainderInteger-cpu-arguments-constant",
          "remainderInteger-cpu-arguments-model-arguments-c00",
          "remainderInteger-cpu-arguments-model-arguments-c01",
          "remainderInteger-cpu-arguments-model-arguments-c02",
          "remainderInteger-cpu-arguments-model-arguments-c10",
          "remainderInteger-cpu-arguments-model-arguments-c11",
          "remainderInteger-cpu-arguments-model-arguments-c20",
          "remainderInteger-cpu-arguments-model-arguments-minimum",
          "remainderInteger-memory-arguments-intercept",
          "remainderInteger-memory-arguments-minimum",
          "remainderInteger-memory-arguments-slope",
          "serialiseData-cpu-arguments-intercept",
          "serialiseData-cpu-arguments-slope",
          "serialiseData-memory-arguments-intercept",
          "serialiseData-memory-arguments-slope",
          "sha2_256-cpu-arguments-intercept",
          "sha2_256-cpu-arguments-slope",
          "sha2_256-memory-arguments",
          "sha3_256-cpu-arguments-intercept",
          "sha3_256-cpu-arguments-slope",
          "sha3_256-memory-arguments",
          "sliceByteString-cpu-arguments-intercept",
          "sliceByteString-cpu-arguments-slope",
          "sliceByteString-memory-arguments-intercept",
          "sliceByteString-memory-arguments-slope",
          "sndPair-cpu-arguments",
          "sndPair-memory-arguments",
          "subtractInteger-cpu-arguments-intercept",
          "subtractInteger-cpu-arguments-slope",
          "subtractInteger-memory-arguments-intercept",
          "subtractInteger-memory-arguments-slope",
          "tailList-cpu-arguments",
          "tailList-memory-arguments",
          "trace-cpu-arguments",
          "trace-memory-arguments",
          "unBData-cpu-arguments",
          "unBData-memory-arguments",
          "unConstrData-cpu-arguments",
          "unConstrData-memory-arguments",
          "unIData-cpu-arguments",
          "unIData-memory-arguments",
          "unListData-cpu-arguments",
          "unListData-memory-arguments",
          "unMapData-cpu-arguments",
          "unMapData-memory-arguments",
          "verifyEcdsaSecp256k1Signature-cpu-arguments",
          "verifyEcdsaSecp256k1Signature-memory-arguments",
          "verifyEd25519Signature-cpu-arguments-intercept",
          "verifyEd25519Signature-cpu-arguments-slope",
          "verifyEd25519Signature-memory-arguments",
          "verifySchnorrSecp256k1Signature-cpu-arguments-intercept",
          "verifySchnorrSecp256k1Signature-cpu-arguments-slope",
          "verifySchnorrSecp256k1Signature-memory-arguments",
          "cekConstrCost-exBudgetCPU",
          "cekConstrCost-exBudgetMemory",
          "cekCaseCost-exBudgetCPU",
          "cekCaseCost-exBudgetMemory",
          "bls12_381_G1_add-cpu-arguments",
          "bls12_381_G1_add-memory-arguments",
          "bls12_381_G1_compress-cpu-arguments",
          "bls12_381_G1_compress-memory-arguments",
          "bls12_381_G1_equal-cpu-arguments",
          "bls12_381_G1_equal-memory-arguments",
          "bls12_381_G1_hashToGroup-cpu-arguments-intercept",
          "bls12_381_G1_hashToGroup-cpu-arguments-slope",
          "bls12_381_G1_hashToGroup-memory-arguments",
          "bls12_381_G1_neg-cpu-arguments",
          "bls12_381_G1_neg-memory-arguments",
          "bls12_381_G1_scalarMul-cpu-arguments-intercept",
          "bls12_381_G1_scalarMul-cpu-arguments-slope",
          "bls12_381_G1_scalarMul-memory-arguments",
          "bls12_381_G1_uncompress-cpu-arguments",
          "bls12_381_G1_uncompress-memory-arguments",
          "bls12_381_G2_add-cpu-arguments",
          "bls12_381_G2_add-memory-arguments",
          "bls12_381_G2_compress-cpu-arguments",
          "bls12_381_G2_compress-memory-arguments",
          "bls12_381_G2_equal-cpu-arguments",
          "bls12_381_G2_equal-memory-arguments",
          "bls12_381_G2_hashToGroup-cpu-arguments-intercept",
          "bls12_381_G2_hashToGroup-cpu-arguments-slope",
          "bls12_381_G2_hashToGroup-memory-arguments",
          "bls12_381_G2_neg-cpu-arguments",
          "bls12_381_G2_neg-memory-arguments",
          "bls12_381_G2_scalarMul-cpu-arguments-intercept",
          "bls12_381_G2_scalarMul-cpu-arguments-slope",
          "bls12_381_G2_scalarMul-memory-arguments",
          "bls12_381_G2_uncompress-cpu-arguments",
          "bls12_381_G2_uncompress-memory-arguments",
          "bls12_381_finalVerify-cpu-arguments",
          "bls12_381_finalVerify-memory-arguments",
          "bls12_381_millerLoop-cpu-arguments",
          "bls12_381_millerLoop-memory-arguments",
          "bls12_381_mulMlResult-cpu-arguments",
          "bls12_381_mulMlResult-memory-arguments",
          "keccak_256-cpu-arguments-intercept",
          "keccak_256-cpu-arguments-slope",
          "keccak_256-memory-arguments",
          "blake2b_224-cpu-arguments-intercept",
          "blake2b_224-cpu-arguments-slope",
          "blake2b_224-memory-arguments",
          "integerToByteString-cpu-arguments-c0",
          "integerToByteString-cpu-arguments-c1",
          "integerToByteString-cpu-arguments-c2",
          "integerToByteString-memory-arguments-intercept",
          "integerToByteString-memory-arguments-slope",
          "byteStringToInteger-cpu-arguments-c0",
          "byteStringToInteger-cpu-arguments-c1",
          "byteStringToInteger-cpu-arguments-c2",
          "byteStringToInteger-memory-arguments-intercept",
          "byteStringToInteger-memory-arguments-slope",
          "andByteString-cpu-arguments-intercept",
          "andByteString-cpu-arguments-slope1",
          "andByteString-cpu-arguments-slope2",
          "andByteString-memory-arguments-intercept",
          "andByteString-memory-arguments-slope",
          "orByteString-cpu-arguments-intercept",
          "orByteString-cpu-arguments-slope1",
          "orByteString-cpu-arguments-slope2",
          "orByteString-memory-arguments-intercept",
          "orByteString-memory-arguments-slope",
          "xorByteString-cpu-arguments-intercept",
          "xorByteString-cpu-arguments-slope1",
          "xorByteString-cpu-arguments-slope2",
          "xorByteString-memory-arguments-intercept",
          "xorByteString-memory-arguments-slope",
          "complementByteString-cpu-arguments-intercept",
          "complementByteString-cpu-arguments-slope",
          "complementByteString-memory-arguments-intercept",
          "complementByteString-memory-arguments-slope",
          "readBit-cpu-arguments",
          "readBit-memory-arguments",
          "writeBits-cpu-arguments-intercept",
          "writeBits-cpu-arguments-slope",
          "writeBits-memory-arguments-intercept",
          "writeBits-memory-arguments-slope",
          "replicateByte-cpu-arguments-intercept",
          "replicateByte-cpu-arguments-slope",
          "replicateByte-memory-arguments-intercept",
          "replicateByte-memory-arguments-slope",
          "shiftByteString-cpu-arguments-intercept",
          "shiftByteString-cpu-arguments-slope",
          "shiftByteString-memory-arguments-intercept",
          "shiftByteString-memory-arguments-slope",
          "rotateByteString-cpu-arguments-intercept",
          "rotateByteString-cpu-arguments-slope",
          "rotateByteString-memory-arguments-intercept",
          "rotateByteString-memory-arguments-slope",
          "countSetBits-cpu-arguments-intercept",
          "countSetBits-cpu-arguments-slope",
          "countSetBits-memory-arguments",
          "findFirstSetBit-cpu-arguments-intercept",
          "findFirstSetBit-cpu-arguments-slope",
          "findFirstSetBit-memory-arguments",
          "ripemd_160-cpu-arguments-intercept",
          "ripemd_160-cpu-arguments-slope",
          "ripemd_160-memory-arguments",
        ];
        break;
    }

    let mappedModel: Record<string, number> = {};
    costModel.values.forEach((value: string, index: number) => {
      const name = costModelNames[index];
      if (name) {
        mappedModel[name] = Number(value);
      }
    });

    if (PlutusVersion === 3) {
      const extraModel = {
        "andByteString-cpu-arguments-intercept": 100181,
        "andByteString-cpu-arguments-slope1": 726,
        "andByteString-cpu-arguments-slope2": 719,
        "andByteString-memory-arguments-intercept": 0,
        "andByteString-memory-arguments-slope": 1,
        "complementByteString-cpu-arguments-intercept": 107878,
        "complementByteString-cpu-arguments-slope": 680,
        "complementByteString-memory-arguments-intercept": 0,
        "complementByteString-memory-arguments-slope": 1,
        "countSetBits-cpu-arguments-intercept": 107490,
        "countSetBits-cpu-arguments-slope": 3298,
        "countSetBits-memory-arguments": 1,
        "orByteString-cpu-arguments-intercept": 100181,
        "orByteString-cpu-arguments-slope1": 726,
        "orByteString-cpu-arguments-slope2": 719,
        "orByteString-memory-arguments-intercept": 0,
        "orByteString-memory-arguments-slope": 1,
        "readBit-cpu-arguments": 95336,
        "readBit-memory-arguments": 1,
        "replicateByte-cpu-arguments-intercept": 180194,
        "replicateByte-cpu-arguments-slope": 159,
        "replicateByte-memory-arguments-intercept": 1,
        "replicateByte-memory-arguments-slope": 1,
        "ripemd_160-cpu-arguments-intercept": 1964219,
        "ripemd_160-cpu-arguments-slope": 24520,
        "ripemd_160-memory-arguments": 3,
        "rotateByteString-cpu-arguments-intercept": 159378,
        "rotateByteString-cpu-arguments-slope": 8813,
        "rotateByteString-memory-arguments-intercept": 0,
        "rotateByteString-memory-arguments-slope": 1,
        "shiftByteString-cpu-arguments-intercept": 158519,
        "shiftByteString-cpu-arguments-slope": 8942,
        "shiftByteString-memory-arguments-intercept": 0,
        "shiftByteString-memory-arguments-slope": 1,
        "writeBits-cpu-arguments-intercept": 281145,
        "writeBits-cpu-arguments-slope": 18848,
        "writeBits-memory-arguments-intercept": 0,
        "writeBits-memory-arguments-slope": 1,
        "xorByteString-cpu-arguments-intercept": 100181,
        "xorByteString-cpu-arguments-slope1": 726,
        "xorByteString-cpu-arguments-slope2": 719,
        "xorByteString-memory-arguments-intercept": 0,
        "xorByteString-memory-arguments-slope": 1,
        "findFirstSetBit-cpu-arguments-intercept": 106057,
        "findFirstSetBit-cpu-arguments-slope": 655,
        "findFirstSetBit-memory-arguments": 1,
      };
      mappedModel = { ...mappedModel, ...extraModel };
    }

    return mappedModel;
  }
}

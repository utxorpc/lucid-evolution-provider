import { UTxO } from "@lucid-evolution/core-types";
import { U5C } from "../u5c";
import { describe, it } from "node:test";
import assert from "assert";
import fs from "fs";

const snapshots = JSON.parse(fs.readFileSync("u5cSnapshot.json", "utf-8"), (key, value) => {
  if (typeof value === "string" && !isNaN(Number(value))) {
    return BigInt(value);
  }
  return value;
});

describe("U5C Provider", () => {
  const provider = new U5C({
    url: "http://localhost:50051",
    headers: {
      "api-key": "",
    },
  })


  const sampleAddress =
    "addr_test1qzdnkrpd5pqux2ctyrwj8rmzztcft92c79lj4k97dra74vhx8qcgyj7m7ge3sv5rrz4kvzkyfz9htrmttvuj4r5jau0qwl8umu";
  const sampleAsset =
    "5627f577d31b920c26cb69d07edf8b21327d4b485108805b9e68ace4436c61794e6174696f6e35";
  const sampleTx =
    "84a300d901028182582053d94c9a479f67a74620606d32c72a5e0f6b0388bd905dfc7f6c54604682f16f01018282581d60916c769efc6e2a3339594818a1d0c3998c29e3a6303d8711de8567591a004c4b4082581d60916c769efc6e2a3339594818a1d0c3998c29e3a6303d8711de8567591b00000002536e1b66021a0002990da100d9010281825820526fa19e3694cda4f3c0d2fb2d2bb8768925eccc49a89d5f12b1972644ac7698584086e3f1505249d44b56ba83e8119bb05080c5c117002ae25c124b0ba2dcc91cf1b338e715b451d8024d80da54cdcea4be07625d778bb7ab7b2803162aafc6e60ff5f6";
  const sampleSubmittedtx = 
    "53d94c9a479f67a74620606d32c72a5e0f6b0388bd905dfc7f6c54604682f16f";
  const sampleOutRef = 
    [
      {
        txHash:
          "40a3296355d4a7ee4654b52685a9b07958ab4a0dd3a1c6aec80bfb8393306c9e",
        outputIndex: 1,
      },
    ];

  describe("getUtxoByUnit", () => {
    it("should fetch UTxO by unit", async () => {
      const utxos: UTxO = await provider.getUtxoByUnit(sampleAsset);
      assert.deepStrictEqual(utxos, snapshots.getUtxoByUnit.result);
    });
  });

  describe("getUtxosWithUnit", () => {
    it("should fetch UTxOs with asset", async () => {
      const utxos: UTxO[] = await provider.getUtxosWithUnit(
        sampleAddress,
        sampleAsset
      );
      assert.deepStrictEqual(utxos, snapshots.getUtxosWithUnit.result);
    });
  });

  describe("getUtxos", () => {
    it("should fetch UTxOs without asset", async () => {
      const utxos: UTxO[] = await provider.getUtxos(sampleAddress);
      assert.deepStrictEqual(utxos, snapshots.getUtxosWithUnit.result);
    });
  });

  describe("getProtocolParameters", () => {
    it("should fetch protocol parameters", async () => {
      const protocolParams = await provider.getProtocolParameters();
      assert.deepStrictEqual(protocolParams, snapshots.getProtocolParameters.result);
    });
  });

  describe("submitTx", () => {
    it("should submit transaction", async () => {
      const txHash: string = await provider.submitTx(sampleTx);
      assert.strictEqual(txHash, snapshots.submitTx.result);
    });
  });

  describe("awaitTx", () => {
    it("should await transaction", async () => {
      const result: boolean = await provider.awaitTx(sampleSubmittedtx);
      assert.strictEqual(result, snapshots.awaitTx.result);
    });
  });

  describe("getUtxosByOutRef", () => {
    it("should fetch UTxOs by OutRef", async () => {
      const utxos: UTxO[] = await provider.getUtxosByOutRef(sampleOutRef);
      assert.deepStrictEqual(utxos, snapshots.getUtxosByOutRef.result);
    });
  });
});
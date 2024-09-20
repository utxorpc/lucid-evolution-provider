import { UTxO } from "@lucid-evolution/core-types";
import { U5C } from "../../src/u5c";
import { describe, it } from "node:test";

describe("U5C Provider", () => {
  const provider = new U5C({
    url: "https://preview.utxorpc-v0.demeter.run",
    headers: {
      "dmtr-api-key": "dmtr_utxorpc1vc0m93rynmltysttwm7ns9m3n5cklws6",
    },
  });

  const sampleAddress =
    "addr_test1qzdnkrpd5pqux2ctyrwj8rmzztcft92c79lj4k97dra74vhx8qcgyj7m7ge3sv5rrz4kvzkyfz9htrmttvuj4r5jau0qwl8umu";
  const sampleAsset =
    "5627f577d31b920c26cb69d07edf8b21327d4b485108805b9e68ace4436c61794e6174696f6e35";
  const sampleTx =
    "84a300d90102818258203dc5d9977e7b3d51acaea81031d2f461404536b2828549b73876a5980295f81b00018282581d60916c769efc6e2a3339594818a1d0c3998c29e3a6303d8711de8567591a004c4b4082581d60916c769efc6e2a3339594818a1d0c3998c29e3a6303d8711de8567591b0000000253bcffb3021a0002990da100d9010281825820526fa19e3694cda4f3c0d2fb2d2bb8768925eccc49a89d5f12b1972644ac769858403d6d6599193b17e67827cd9f48aaf35ac762c6fb0c5402c52724f307b69ff96f3f7e6c3fb107670c28679c148bf510f479c01a34b9d95d0dbb7e4ff6f3cb560af5f6";

  describe("getUtxoByUnit", () => {
    it("should fetch UTxO by unit", async () => {
      try {
        const utxos: UTxO = await provider.getUtxoByUnit(sampleAsset);
        console.log(utxos);
      } catch (error) {
        console.error("Error fetching UTxOs with asset:", error);
      }
    });
  });

  describe("getUtxosWithUnit", () => {
    it("should fetch UTxOs with asset", async () => {
      try {
        const utxos: UTxO[] = await provider.getUtxosWithUnit(
          sampleAddress,
          sampleAsset
        );
        console.log(utxos);
      } catch (error) {
        console.error("Error fetching UTxOs with asset:", error);
      }
    });
  });

  describe("getUtxos", () => {
    it("should fetch UTxOs without asset", async () => {
      try {
        const utxos: UTxO[] = await provider.getUtxos(sampleAddress);
        console.log(utxos);
      } catch (error) {
        console.error("Error fetching UTxOs without asset:", error);
      }
    });
  });

  describe("getProtocolParameters", () => {
    it("should fetch protocol parameters", async () => {
      try {
        const protocolParams = await provider.getProtocolParameters();
        console.log(protocolParams);
      } catch (error) {
        console.error("Error fetching protocol parameters:", error.message);
      }
    });
  });

  describe("submitTx", () => {
    it("should submit transaction", async () => {
      try {
        const txHash: string = await provider.submitTx(sampleTx);
        console.log("Submitted Transaction, Hash:", txHash);
      } catch (error) {
        console.error("Error submitting transaction:", error.message);
      }
    });
  });
});

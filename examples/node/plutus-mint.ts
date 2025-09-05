import { U5C } from "../../lib/index.mjs";
import { Lucid, Data, Constr } from "@lucid-evolution/lucid";
import { toHex } from "@lucid-evolution/core-utils";
import { getAddressDetails, mintingPolicyToId } from "@lucid-evolution/utils";

async function main() {
  // Step #1: Create U5C provider
  const provider = new U5C({
    url: "http://localhost:50051",
  });

  // Step #2: Initialize Lucid with the U5C provider and network
  const lucid = await Lucid(provider, "Preview");

  // Step #3: Select wallet from seed
  const mnemonic = "end link visit estate sock hurt crucial forum eagle earn idle laptop wheat rookie when hard suffer duty kingdom clerk glide mechanic debris jar";
  lucid.selectWallet.fromSeed(mnemonic);

  console.log("Wallet address:", await lucid.wallet().address());
  
  // Get wallet UTxOs to check balance
  const utxos = await lucid.wallet().getUtxos();
  const totalLovelace = utxos.reduce((sum, utxo) => sum + utxo.assets.lovelace, 0n);
  console.log("Wallet balance:", Number(totalLovelace) / 1_000_000, "ADA");

  // Step #4: Define a Plutus V3 script for minting
  // This is an example compiled Aiken script that validates signature-based minting
  const plutusScriptCbor = "59018a01010029800aba2aba1aba0aab9faab9eaab9dab9a488888896600264653001300800198041804800cc0200092225980099b8748000c01cdd500144c96600266e1d2000300837540091323259800980780145660026466446600400400244b30010018a508acc004cdc79bae30110010038a518998010011809000a018403c6eb0c03cc040c040c040c040c040c040c040c040c030dd50029bae300e300b375400d1337109000194c00400664b30013370e900118061baa0018a5eb7bdb18226eacc040c034dd5000a0163233001001375660206022602260226022601a6ea8018896600200314c103d87a8000899192cc004cdc8804000c56600266e3c020006266e9520003301230100024bd7045300103d87a80004039133004004301400340386eb8c038004c04400500f520004004444b30010028800c4ca600200930130039919b80003375a60200046eb8c0380050041808801201e8a5040251640306eb8c034004c024dd50024590071bae300b3008375400514a08030601000260066ea802229344d9590011";

  // Create Plutus V3 script object
  const plutusScript = {
    type: "PlutusV3" as const,
    script: plutusScriptCbor,
  };

  // Get the policy ID from the Plutus script
  const policyId = mintingPolicyToId(plutusScript);
  console.log("Policy ID:", policyId);

  // Step #5: Define the assets to mint
  const assetName = "PlutusToken";
  const assetNameHex = toHex(new TextEncoder().encode(assetName));
  const unit = policyId + assetNameHex;
  const mintAmount = 1000n;

  console.log("Asset Name:", assetName);
  console.log("Asset Name (hex):", assetNameHex);
  console.log("Unit:", unit);
  console.log("Minting amount:", mintAmount.toString());

  // Step #6: Create redeemer data for the Plutus script
  // This script expects: Mint { owner: ByteArray }
  const paymentKeyHash = getAddressDetails(await lucid.wallet().address()).paymentCredential?.hash;
  
  if (!paymentKeyHash) {
    throw new Error("Could not extract payment key hash");
  }

  console.log("Payment Key Hash:", paymentKeyHash);

  // Create redeemer data for Aiken script using the correct Constr class
  // The script expects: Mint { owner: ByteArray } which is constructor 0 with owner field
  const redeemerData = Data.to(new Constr(0, [paymentKeyHash]));

  // Step #7: Define recipient address
  const recipientAddress = "addr_test1qrnrqg4s73skqfyyj69mzr7clpe8s7ux9t8z6l55x2f2xuqra34p9pswlrq86nq63hna7p4vkrcrxznqslkta9eqs2nsmlqvnk";

  try {
    console.log("Building Plutus minting transaction...");

    // Step #8: Build the transaction with Plutus script minting
    const tx = await lucid
      .newTx()
      // Mint the tokens with redeemer
      .mintAssets({
        [unit]: mintAmount
      }, redeemerData)
      // Attach the Plutus minting policy
      .attach.MintingPolicy(plutusScript)
      // Add wallet as required signer (for extra_signatories validation)
      .addSigner(await lucid.wallet().address())
      // Send some ADA to recipient
      .pay.ToAddress(recipientAddress, { lovelace: 2_000_000n })
      // Send some of the freshly minted tokens to recipient (500 tokens)
      .pay.ToAddress(recipientAddress, { 
        lovelace: 2_000_000n, // Minimum ADA required with native tokens
        [unit]: 500n 
      })
      .complete();

    console.log("Transaction built successfully");
    console.log("Transaction CBOR:", tx.toCBOR());

    // Step #9: Sign the transaction
    const signedTx = await tx.sign.withWallet().complete();
    console.log("Transaction signed");

    // Step #10: Submit the transaction
    const txHash = await signedTx.submit();
    console.log("🎉 Plutus minting transaction submitted successfully!");
    console.log("Transaction Hash:", txHash);
    console.log("✅ Minted:", mintAmount, "PlutusTokens using Plutus V3 script");
    console.log("✅ Sent 500 PlutusTokens + 4 ADA to recipient");
    console.log("✅ Kept 500 PlutusTokens in wallet");

  } catch (error) {
    console.error("❌ Plutus minting transaction failed:", error);
    
    console.log("\nThis might be because:");
    console.log("1. The UTxO RPC node doesn't support Plutus V3 script execution");
    console.log("2. The script compilation/CBOR is invalid");
    console.log("3. The redeemer data format doesn't match the script's expectations");
    console.log("4. Missing protocol parameters for Plutus execution");
    console.log("5. Insufficient execution units/fees for Plutus script");
  }
}

main().catch(console.error);
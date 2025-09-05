import { U5C } from "../../lib/index.mjs";
import { Lucid } from "@lucid-evolution/lucid";
import { toHex } from "@lucid-evolution/core-utils";
import { getAddressDetails, scriptFromNative, mintingPolicyToId } from "@lucid-evolution/utils";

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
  console.log("Wallet balance:", totalLovelace, "lovelace");

  // Step #4: Create a native script (signature-based)
  // Get the payment key hash from the wallet
  const paymentKeyHash = getAddressDetails(await lucid.wallet().address()).paymentCredential?.hash;
  
  if (!paymentKeyHash) {
    throw new Error("Could not extract payment key hash from wallet address");
  }

  console.log("Payment Key Hash:", paymentKeyHash);

  // Create a native script that requires our signature
  const nativeScript = scriptFromNative({
    type: "sig",
    keyHash: paymentKeyHash,
  });

  // Get the policy ID from the native script
  const policyId = mintingPolicyToId(nativeScript);
  console.log("Policy ID:", policyId);

  // Step #5: Define the assets to mint
  const assetName = "SimpleToken";
  const assetNameHex = toHex(new TextEncoder().encode(assetName));
  const unit = policyId + assetNameHex;
  const mintAmount = 1000n;

  console.log("Asset Name:", assetName);
  console.log("Asset Name (hex):", assetNameHex);
  console.log("Unit:", unit);
  console.log("Minting amount:", mintAmount.toString());

  // Step #6: Define recipient address for sending some minted assets
  const recipientAddress = "addr_test1qrnrqg4s73skqfyyj69mzr7clpe8s7ux9t8z6l55x2f2xuqra34p9pswlrq86nq63hna7p4vkrcrxznqslkta9eqs2nsmlqvnk";

  try {
    // Step #7: Build the transaction that mints and sends assets
    console.log("Building mint and send transaction...");
    
    const tx = await lucid
      .newTx()
      // Mint the tokens
      .mintAssets({
        [unit]: mintAmount
      })
      // Attach the minting policy (native script)
      .attach.MintingPolicy(nativeScript)
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

    // Step #8: Sign the transaction
    const signedTx = await tx.sign.withWallet().complete();
    console.log("Transaction signed");

    // Step #9: Submit the transaction
    const txHash = await signedTx.submit();
    console.log("🎉 Transaction submitted successfully!");
    console.log("Transaction Hash:", txHash);
    console.log("✅ Minted:", mintAmount, assetName);
    console.log("✅ Sent 500", assetName, "+ 4 ADA to recipient");
    console.log("✅ Kept 500", assetName, "in wallet");

  } catch (error) {
    console.error("❌ Full transaction failed:", error);
    
    // Try a simpler version - just mint without sending to recipient
    console.log("\n🔄 Trying simpler mint-only transaction...");
    
    try {
      const simpleTx = await lucid
        .newTx()
        .mintAssets({
          [unit]: mintAmount
        })
        .attach.MintingPolicy(nativeScript)
        .complete();

      console.log("Simple mint transaction built successfully");
      
      const signedSimpleTx = await simpleTx.sign.withWallet().complete();
      const simpleTxHash = await signedSimpleTx.submit();
      
      console.log("🎉 Simple mint transaction successful!");
      console.log("Transaction Hash:", simpleTxHash);
      console.log("✅ Minted:", mintAmount, assetName);
      
    } catch (simpleError) {
      console.error("❌ Simple mint also failed:", simpleError);
      
      // Try the most basic transaction - just send ADA
      console.log("\n🔄 Trying basic ADA-only transaction...");
      try {
        const basicTx = await lucid
          .newTx()
          .pay.ToAddress(await lucid.wallet().address(), { lovelace: 1_000_000n })
          .complete();
          
        const signedBasicTx = await basicTx.sign.withWallet().complete();
        const basicTxHash = await signedBasicTx.submit();
        
        console.log("🎉 Basic ADA transaction successful!");
        console.log("Transaction Hash:", basicTxHash);
        console.log("✅ Sent 1 ADA to self");
        
      } catch (basicError) {
        console.error("❌ Even basic transaction failed:", basicError);
      }
    }
  }
}

main().catch(console.error);
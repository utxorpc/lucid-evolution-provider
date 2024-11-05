<div align="center">
  <h1 style="font-size: 3em;">Lucid UTxO RPC Provider 🚀</h1>
  <h4>A gRPC interface for UTxO Blockchains with Lucid Evolution</h4>
</div>
<div align="center">

  ![Forks](https://img.shields.io/github/forks/utxorpc/lucid-evolution-provider.svg?style=social) 
  ![Stars](https://img.shields.io/github/stars/utxorpc/lucid-evolution-provider.svg?style=social) 
  ![Contributors](https://img.shields.io/github/contributors/utxorpc/lucid-evolution-provider.svg) 
  ![Issues](https://img.shields.io/github/issues/utxorpc/lucid-evolution-provider.svg) 
  ![Issues Closed](https://img.shields.io/github/issues-closed/utxorpc/lucid-evolution-provider.svg) 
  <a href="https://www.npmjs.com/package/@utxorpc/lucid-evolution-provider">
    <img src="https://img.shields.io/npm/v/@utxorpc/lucid-evolution-provider.svg" alt="npm">
  </a>
</div>

The **Lucid UTxO RPC Provider** offers a JavaScript/TypeScript interface for interacting with UTxO-based blockchains using Lucid Evolution. By leveraging gRPC and UTxO RPC, it allows developers to seamlessly integrate Cardano blockchain interactions into their decentralized applications (dApps).

## 🌟 Features

- 🔗 **Seamless Integration with Lucid**: Works with the Lucid Evolution framework, providing a high-level API to build and sign Cardano transactions.
- ⚡️ **Efficient gRPC Communication**: Uses gRPC for fast and efficient communication with UTxO blockchains.
- 🛠 **Flexible Provider Options**: Can be used with a local node, hosted services, or any UTxO RPC-compliant provider.
- 🔒 **Secure Wallet Integration**: Easily integrate wallets and securely sign transactions.
- 🏗 **Transaction Building**: Create and sign complex transactions with the Lucid framework.

## 📦 Installation

To install the Lucid UTxO RPC Provider, use npm:

```bash
npm i @utxorpc/lucid-evolution-provider
```

You'll also need to install **Lucid Evolution** if you haven't already:

```bash
npm i @lucid-evolution/lucid
```

## 💡 Basic Usage

Here’s a simple example demonstrating how to use the Lucid UTxO RPC Provider with the Lucid SDK to interact with a Cardano blockchain:

```javascript
import { U5C } from "@utxorpc/lucid-evolution-provider";
import { Lucid } from "@lucid-evolution/lucid";

async function main() {
    // Step #1: Set up the U5C provider with your server URL and API key
    const provider = new U5C({
        url: "http://localhost:50051", // Use your local or hosted UTxO RPC service
    });

    // Step #2: Initialize Lucid with the U5C provider and network (for now we'll use Preview network)
    const lucid = await Lucid(provider, "Preview");

    // Step #3: Select a wallet using a seed phrase (here's a sample working wallet)
    lucid.selectWallet.fromSeed("end link visit estate sock hurt crucial forum eagle earn idle laptop wheat rookie when hard suffer duty kingdom clerk glide mechanic debris jar");

    // Step #4: Get UTxOs from the wallet (Optional)
    const utxos = await lucid.wallet().getUtxos();
    console.log("UTxOs: ", utxos);

    // Step #5: Build and sign a transaction
    const tx = await lucid
        .newTx()
        .pay.ToAddress(await lucid.wallet().address(), { lovelace: 5000000n })
        .complete();

    const signedTx = await tx.sign.withWallet().complete();

    // Step #6: Submit the transaction to the blockchain
    const txHash = await signedTx.submit();
    console.log("Transaction Submitted: ", txHash);
}

main().catch(console.error);
```

## 📜 License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.

## 👥 Join the Conversation
If you want to discuss UTxO RPC or get involved in the community, join the **TxPipe Discord**! There's a dedicated channel for UTxO RPC where you can connect with other developers, share ideas, and get support. You an also learn more about the **Lucid Evolution** communitiy with the link below!

👉 [Join the TxPipe Discord here!](https://discord.gg/nbkJdPnKHm) 💬

👉 [Join the Lucid Discord](https://discord.gg/s89P9gpEff) 💬

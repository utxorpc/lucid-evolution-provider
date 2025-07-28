import { U5C } from "../../lib/index.mjs";
import { Lucid } from "@lucid-evolution/lucid";

async function main() {

  const provider = new U5C({
    url: "http://localhost:50051",
  })

  const lucid = await Lucid(provider,
    "Preview"
  );

  lucid.selectWallet.fromSeed(("end link visit estate sock hurt crucial forum eagle earn idle laptop wheat rookie when hard suffer duty kingdom clerk glide mechanic debris jar"));
  const utxos = await lucid.wallet().getUtxos();

  const tx = await lucid
    .newTx()
    .pay.ToAddress(await lucid.wallet().address(), { lovelace: 5000000n })
    .complete();

  const signedTx = await tx.sign.withWallet().complete();

  const txHash = await signedTx.submit();
  console.log("TxSubmitted: ", txHash);
}

main().catch(console.error);


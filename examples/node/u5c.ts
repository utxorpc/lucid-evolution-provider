import { U5C } from "../../src/u5c";
import { Lucid } from "@lucid-evolution/lucid";

async function main() {

  const provider = new U5C({
    url: "http://localhost:50051",
  })

  const lucid = await Lucid(provider,
    "Preview"
  );

  const params = await provider.getProtocolParameters();
  console.log(params);
  lucid.selectWallet.fromSeed(("end link visit estate sock hurt crucial forum eagle earn idle laptop wheat rookie when hard suffer duty kingdom clerk glide mechanic debris jar"));
  const utxos = await lucid.wallet().getUtxos();
  console.log(utxos);
  const tx = await lucid
    .newTx()
    .pay.ToAddress("addr_test1qrnrqg4s73skqfyyj69mzr7clpe8s7ux9t8z6l55x2f2xuqra34p9pswlrq86nq63hna7p4vkrcrxznqslkta9eqs2nsmlqvnk", { lovelace: 5000000n })
    .complete();

  const signedTx = await tx.sign.withWallet().complete();

  const txHash = await signedTx.submit();
  console.log(txHash);
}

main().catch(console.error);


import { U5C } from "../../src/u5c";
import { Lucid} from "@lucid-evolution/lucid";
 
async function main() {
  const lucid = await Lucid(
    new U5C({
      url: "https://preview.utxorpc-v0.demeter.run",
      headers: {
        "dmtr-api-key": "dmtr_utxorpc1vc0m93rynmltysttwm7ns9m3n5cklws6",
      },
    }),
    "Preview"
  );
  
  lucid.selectWallet.fromSeed(("end link visit estate sock hurt crucial forum eagle earn idle laptop wheat rookie when hard suffer duty kingdom clerk glide mechanic debris jar"));
   
  const tx = await lucid
    .newTx()
    .pay.ToAddress("addr_testa...", { lovelace: 5000000n })
    .complete();
   
  const signedTx = await tx.sign.withWallet().complete();
   
  const txHash = await signedTx.submit();
  console.log(txHash);
}

main().catch(console.error);

  
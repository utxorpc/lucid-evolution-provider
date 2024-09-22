import { U5C } from "../../src/u5c";
import { Lucid} from "@lucid-evolution/lucid";
 
async function main() {
  const lucid = await Lucid(
    new U5C({
      url: "http://localhost:50051",
      headers: {
        "api-key": "",
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

  